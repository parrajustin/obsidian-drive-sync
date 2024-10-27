import type { FirebaseApp } from "firebase/app";
import type { Unsubscribe, UserCredential } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import {
    getFirestore,
    query,
    collection,
    where,
    getDocs,
    onSnapshot,
    writeBatch,
    doc
} from "firebase/firestore";
import type { Option } from "../lib/option";
import { Some, WrapOptional } from "../lib/option";
import { None } from "../lib/option";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import type FirestoreSyncPlugin from "../main";
import type { SyncerConfig } from "../settings/syncer_config_data";
import type { FileNode } from "../sync/file_node";
import { ConvertFlatFileNodesToCache, ConvertCacheToFileNode } from "../sync/firebase_cache";
import { LogError } from "../log";
import { ConvertToUnknownError } from "../util";
import type { HistoryProgressView } from "./history_view";
import { GetOrCreateHistoryProgressView } from "./history_view";
import type { HistoryFileNodeExtra } from "./history_schema";
import { GetHistorySchemaConverter } from "./history_schema";
import { FlattenFileNodes, MapByFileId, type FileMapOfNodes } from "../sync/file_node_util";
import { debounce } from "remeda";

const MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT = 20;

async function GetHistoryData(
    db: Firestore,
    creds: UserCredential,
    config: SyncerConfig,
    startTimestamp = 0
): Promise<Result<Map<string, FileNode<Some<string>, HistoryFileNodeExtra>>, StatusError>> {
    // Get the file metadata from firestore.
    const queryOfFiles = query(
        collection(db, "hist"),
        where("userId", "==", creds.user.uid),
        where("vaultName", "==", config.vaultName),
        where("mTime", ">=", startTimestamp)
    ).withConverter(GetHistorySchemaConverter());
    const querySnapshotResult = await WrapPromise(
        getDocs(queryOfFiles),
        /*textForUnknown=*/ `failed queryOfFiles getDocs Firebase histroy syncer`
    );
    if (querySnapshotResult.err) {
        return querySnapshotResult;
    }
    const cachedNodes = new Map<string, FileNode<Some<string>, HistoryFileNodeExtra>>();
    // Convert the docs to `FileNode` and combine with the cached data.
    querySnapshotResult.safeUnwrap().forEach((document) => {
        const node = document.data() as FileNode<Some<string>, HistoryFileNodeExtra>;
        cachedNodes.set(node.extraData.historyDocId, node);
    });
    return Ok(cachedNodes);
}

export class FirebaseHistory {
    public activeHistoryView: Option<HistoryProgressView> = None;
    /** Unsub function to stop real time updates. */
    private _unsubscribe: Option<Unsubscribe> = None;
    /** If this firebase syncer is ready to get updates. */
    private _isValid = false;
    /** If there is a save setting microtask already running. */
    private _savingSettings = false;
    /** Debouncer function for attempting to remove historic changes. */
    private _debounceCleanUpHistory = debounce(
        () => {
            void (async () => {
                await this.cleanUpOldHistoryEvents();
            })();
        },
        { timing: "leading", waitMs: 1000 }
    );

    private constructor(
        private _plugin: FirestoreSyncPlugin,
        private _config: SyncerConfig,
        private _creds: UserCredential,
        private _db: Firestore,
        private _historicChanges: Map<string, FileNode<Some<string>, HistoryFileNodeExtra>>,
        private _mapOfLocalFile: Map<string, FileNode>
    ) {
        this.registerSaveSettingsTask();
    }

    /** Build the firebase history viewer. */
    public static async buildFirebaseHistory(
        plugin: FirestoreSyncPlugin,
        firebaseApp: FirebaseApp,
        config: SyncerConfig,
        creds: UserCredential,
        mapOfNodes: FileMapOfNodes
    ): Promise<Result<FirebaseHistory, StatusError>> {
        const db = getFirestore(firebaseApp);

        const fetchedHistory = await GetHistoryData(
            db,
            creds,
            config,
            config.storedFirebaseHistory.lastUpdate
        );
        if (fetchedHistory.err) {
            return fetchedHistory;
        }

        // Get cached data.
        const cachedNodes = new Map<string, FileNode<Some<string>, HistoryFileNodeExtra>>();
        for (const node of config.storedFirebaseHistory.cache) {
            if (node.extraData === undefined) {
                continue;
            }
            cachedNodes.set(
                node.extraData.historyDocId,
                ConvertCacheToFileNode<HistoryFileNodeExtra>(node)
            );
        }
        // Convert the docs to `FileNode` and combine with the cached data.
        fetchedHistory.safeUnwrap().forEach((document) => {
            cachedNodes.set(document.extraData.historyDocId, document);
        });

        return Ok(
            new FirebaseHistory(
                plugin,
                config,
                creds,
                db,
                cachedNodes,
                MapByFileId(FlattenFileNodes(mapOfNodes))
            )
        );
    }

    public isValid() {
        return this._isValid;
    }

    /** Initializes the real time subscription on firestore data. */
    public initailizeRealTimeUpdates() {
        const queryOfFiles = query(
            collection(this._db, "hist"),
            where("userId", "==", this._creds.user.uid),
            where("vaultName", "==", this._config.vaultName),
            where("mTime", ">=", this._config.storedFirebaseHistory.lastUpdate)
        ).withConverter(GetHistorySchemaConverter());

        this._unsubscribe = Some(
            onSnapshot(queryOfFiles, (querySnapshot) => {
                if (querySnapshot.empty) {
                    return;
                }
                querySnapshot.forEach((snapshotDoc) => {
                    if (!snapshotDoc.exists()) {
                        return;
                    }
                    const node = snapshotDoc.data() as FileNode<Some<string>, HistoryFileNodeExtra>;
                    this._historicChanges.set(node.extraData.historyDocId, node);
                });
                this._debounceCleanUpHistory.call();
                this.registerSaveSettingsTask();
                if (this.activeHistoryView.some) {
                    this.activeHistoryView.safeValue().updateView();
                }
            })
        );

        this._isValid = true;
        this._debounceCleanUpHistory.call();
    }

    /** Bring down the firebase syncer. */
    public teardown() {
        if (this._unsubscribe.some) {
            this._unsubscribe.safeValue()();
        }
        this._isValid = false;
        if (this.activeHistoryView.some) {
            this.activeHistoryView.safeValue().clearHistory();
            this.activeHistoryView = None;
        }
    }

    public async openPanel() {
        const view = await GetOrCreateHistoryProgressView(this._plugin.app, /*reveal=*/ true);
        view.setHistory(this);
    }

    public getHistoricNodes() {
        return this._historicChanges;
    }

    public getVaultName() {
        return this._config.vaultName;
    }

    /** Get the local nodes file path from a given id, if there is one. */
    public getLocalFileNodeFromId(fileId: string): Option<FileNode> {
        return WrapOptional(this._mapOfLocalFile.get(fileId));
    }

    /** Updates the history entry of file nodes. */
    public updateMapOfLocalNodes(mapOfNodes: FileMapOfNodes) {
        this._mapOfLocalFile = MapByFileId(FlattenFileNodes(mapOfNodes));
        if (this.activeHistoryView.some) {
            this.activeHistoryView.safeValue().updateView();
        }
    }

    private registerSaveSettingsTask() {
        if (!this._savingSettings) {
            this._savingSettings = true;
            queueMicrotask(() => {
                this._savingSettings = false;
                // Updates the stored firebase cache.
                this._config.storedFirebaseHistory = ConvertFlatFileNodesToCache(
                    [...this._historicChanges.entries()].map((n) => n[1])
                );
                this._plugin.saveSettings(/*startupSyncer=*/ false).catch((e: unknown) => {
                    const error = ConvertToUnknownError("Saving settings")(e);
                    LogError(error);
                });
            });
        }
    }

    private async resetHistoryData() {
        const newNodes = await GetHistoryData(
            this._db,
            this._creds,
            this._config,
            /*startTimestamp=*/ 0
        );
        if (newNodes.err) {
            LogError(newNodes.val);
            return;
        }
        this._historicChanges = newNodes.safeUnwrap();
        this.registerSaveSettingsTask();
    }

    /** Cleans up the historical events that are old or too many for a single file id. */
    private async cleanUpOldHistoryEvents() {
        const historyByFileId = new Map<string, FileNode<Some<string>, HistoryFileNodeExtra>[]>();
        // First group up all the historic changes by file id.
        for (const [_, entry] of this._historicChanges) {
            let fileNodes = historyByFileId.get(entry.data.fileId.safeValue());
            if (fileNodes === undefined) {
                fileNodes = [];
                historyByFileId.set(entry.data.fileId.safeValue(), fileNodes);
            }
            fileNodes.push(entry);
        }

        let hasChange = false;
        const batcher = writeBatch(this._db);
        const keptHistoricChanges = new Map<string, FileNode<Some<string>, HistoryFileNodeExtra>>();
        // Now for the ones that have > max number of entries sort them and delete the old ones.
        for (const [_, changes] of historyByFileId) {
            // If no changes exit.
            if (changes.length === 0) {
                continue;
            }
            // If there are less than max number add each change to the keep map.
            if (changes.length < MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT) {
                for (const change of changes) {
                    keptHistoricChanges.set(change.extraData.historyDocId, change);
                }
                continue;
            }
            // Used to denote there was a batch deletion.
            hasChange = true;
            // Sort the changes.
            changes.sort((a, b) => b.data.mtime - a.data.mtime);
            // Move the kept changes to the new array.
            for (const change of changes.slice(0, MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT)) {
                keptHistoricChanges.set(change.extraData.historyDocId, change);
            }
            // Delete old changes.
            for (const deleteEntry of changes.slice(MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT)) {
                console.log("attemting to remove", deleteEntry.extraData.historyDocId);
                batcher.delete(doc(this._db, "hist", deleteEntry.extraData.historyDocId));
            }
        }
        if (hasChange) {
            const batcherResult = await WrapPromise(
                batcher.commit(),
                /*textForUnknown=*/ "Failed to clean up old historic events"
            );
            if (batcherResult.err) {
                LogError(batcherResult.val);
                setTimeout(() => {
                    void (async () => {
                        await this.resetHistoryData();
                    })();
                }, 0);
            } else {
                this._historicChanges = keptHistoricChanges;
            }
        }
        // Save the history nodes.
        this.registerSaveSettingsTask();
        if (this.activeHistoryView.some) {
            this.activeHistoryView.safeValue().updateView();
        }
    }
}
