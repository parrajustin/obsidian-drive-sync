import type { FirebaseApp } from "firebase/app";
import type { Unsubscribe, UserCredential } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { query, collection, where, getDocs, onSnapshot, writeBatch, doc } from "firebase/firestore";
import type { Option } from "../lib/option";
import { Some, WrapOptional } from "../lib/option";
import { None } from "../lib/option";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import type FirestoreSyncPlugin from "../main";
import type { SyncerConfig } from "../settings/syncer_config_data";
import type { FilePathType, LocalNode } from "../sync/file_node";
import { LogError } from "../log";
import { ConvertToUnknownError } from "../util";
import type { HistoryProgressView } from "./history_view";
import { GetOrCreateHistoryProgressView } from "./history_view";
import { GetHistorySchemaConverter } from "./history_schema";
import { FlattenFileNodes, MapByFilePath, type FileMapOfNodes } from "../sync/file_node_util";
import { debounce } from "remeda";
import type { HistoricFileNode } from "./history_file_node";
import { ConvertHistoricNodesToCache } from "./history_cache";
import { GetFirestore } from "../firestore/get_firestore";

const MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT = 20;

/** Get all history data from a starting timestamp. */
async function GetHistoryData(
    db: Firestore,
    creds: UserCredential,
    config: SyncerConfig
): Promise<Result<Map<string, HistoricFileNode>, StatusError>> {
    // Get the file metadata from firestore.
    const queryOfFiles = query(
        collection(db, "hist"),
        where("file.userId", "==", creds.user.uid),
        where("file.vaultName", "==", config.vaultName)
    ).withConverter(GetHistorySchemaConverter());
    const querySnapshotResult = await WrapPromise(
        getDocs(queryOfFiles),
        /*textForUnknown=*/ `failed queryOfFiles getDocs Firebase history syncer`
    );
    if (querySnapshotResult.err) {
        return querySnapshotResult;
    }
    const cachedNodes = new Map<string, HistoricFileNode>();
    // Convert the docs to `FileNode` and combine with the cached data.
    querySnapshotResult.safeUnwrap().forEach((document) => {
        const node = document.data() as HistoricFileNode;
        cachedNodes.set(node.extra.historyDocId, node);
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
        public creds: UserCredential,
        public db: Firestore,
        private _historicChanges: Map<string, HistoricFileNode>,
        private _mapOfLocalFile: Map<FilePathType, LocalNode>
    ) {
        this.registerSaveSettingsTask();
    }

    /** Build the firebase history viewer. */
    public static async buildFirebaseHistory(
        plugin: FirestoreSyncPlugin,
        firebaseApp: FirebaseApp,
        config: SyncerConfig,
        creds: UserCredential,
        mapOfNodes: FileMapOfNodes<LocalNode>
    ): Promise<Result<FirebaseHistory, StatusError>> {
        const db = GetFirestore(firebaseApp);

        const fetchedHistory = await GetHistoryData(db, creds, config);
        if (fetchedHistory.err) {
            return fetchedHistory;
        }

        // TODO: Enable local history cache.
        // Get cached data.
        // const getCacheResult = await GetHistoricNodesFromCache(config.storedFirebaseHistory);
        // if (getCacheResult.err) {
        //     return getCacheResult;
        // }
        const cachedNodes = new Map<string, HistoricFileNode>();
        // for (const node of getCacheResult.safeUnwrap()) {
        //     cachedNodes.set(node.extra.historyDocId, node);
        // }
        // Convert the docs to `FileNode` and combine with the cached data.
        fetchedHistory.safeUnwrap().forEach((document) => {
            cachedNodes.set(document.extra.historyDocId, document);
        });

        return Ok(
            new FirebaseHistory(
                plugin,
                config,
                creds,
                db,
                cachedNodes,
                MapByFilePath(FlattenFileNodes(mapOfNodes))
            )
        );
    }

    public isValid() {
        return this._isValid;
    }

    /** Initializes the real time subscription on firestore data. */
    public initailizeRealTimeUpdates() {
        const queryOfFiles = query(
            collection(this.db, "hist"),
            where("file.userId", "==", this.creds.user.uid),
            where("file.vaultName", "==", this._config.vaultName)
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
                    const node = snapshotDoc.data() as HistoricFileNode;
                    this._historicChanges.set(node.extra.historyDocId, node);
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

    /** Get the local nodes file path from a given file path, if there is one. */
    public getLocalFileNodeFromFilePath(filePath: FilePathType): Option<LocalNode> {
        return WrapOptional(this._mapOfLocalFile.get(filePath));
    }

    /** Updates the history entry of file nodes. */
    public updateMapOfLocalNodes(mapOfNodes: FileMapOfNodes<LocalNode>) {
        this._mapOfLocalFile = MapByFilePath(FlattenFileNodes(mapOfNodes));
        if (this.activeHistoryView.some) {
            this.activeHistoryView.safeValue().updateView();
        }
    }

    private registerSaveSettingsTask() {
        if (!this._savingSettings) {
            this._savingSettings = true;
            queueMicrotask(() => {
                this._savingSettings = false;
                void (async () => {
                    // Updates the stored firebase cache.
                    const compressionResult = await ConvertHistoricNodesToCache(
                        [...this._historicChanges.entries()].map((n) => n[1])
                    );
                    if (compressionResult.err) {
                        LogError(compressionResult.val);
                        return;
                    }
                    this._config.storedFirebaseHistory = compressionResult.safeUnwrap();
                    this._plugin.saveSettings(/*startupSyncer=*/ false).catch((e: unknown) => {
                        const error = ConvertToUnknownError("Saving settings")(e);
                        LogError(error);
                    });
                })();
            });
        }
    }

    private async resetHistoryData() {
        const newNodes = await GetHistoryData(this.db, this.creds, this._config);
        if (newNodes.err) {
            LogError(newNodes.val);
            return;
        }
        this._historicChanges = newNodes.safeUnwrap();
        this.registerSaveSettingsTask();
    }

    /** Cleans up the historical events that are old or too many for a single file id. */
    private async cleanUpOldHistoryEvents() {
        const historyByFileId = new Map<string, HistoricFileNode[]>();
        // First group up all the historic changes by file id.
        for (const [_, entry] of this._historicChanges) {
            let fileNodes = historyByFileId.get(entry.metadata.fileId.safeValue());
            if (fileNodes === undefined) {
                fileNodes = [];
                historyByFileId.set(entry.metadata.fileId.safeValue(), fileNodes);
            }
            fileNodes.push(entry);
        }

        let hasChange = false;
        const batcher = writeBatch(this.db);
        const keptHistoricChanges = new Map<string, HistoricFileNode>();
        // Now for the ones that have > max number of entries sort them and delete the old ones.
        for (const [_, changes] of historyByFileId) {
            // If no changes exit.
            if (changes.length === 0) {
                continue;
            }
            // If there are less than max number add each change to the keep map.
            if (changes.length < MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT) {
                for (const change of changes) {
                    keptHistoricChanges.set(change.extra.historyDocId, change);
                }
                continue;
            }
            // Used to denote there was a batch deletion.
            hasChange = true;
            // Sort the changes.
            changes.sort((a, b) => b.data.mTime - a.data.mTime);
            // Move the kept changes to the new array.
            for (const change of changes.slice(0, MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT)) {
                keptHistoricChanges.set(change.extra.historyDocId, change);
            }
            // Delete old changes.
            for (const deleteEntry of changes.slice(MAX_NUMBER_OF_HISTORY_ENTRIES_KEPT)) {
                batcher.delete(doc(this.db, "hist", deleteEntry.extra.historyDocId));
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
