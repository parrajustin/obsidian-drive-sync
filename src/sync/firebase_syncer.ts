/**
 * This is the stateful firebase syncer that handles maintaing the state of the firebase files.
 */

import type { FirebaseApp } from "firebase/app";
import type { CloudNode, FirestoreNodes, LocalNode } from "./file_node";
import {
    ConvertArrayOfNodesToMap,
    FilterFileNodes,
    FlattenFileNodes,
    MapByFileId,
    type FileMapOfNodes
} from "./file_node_util";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import type { Result } from "../lib/result";
import { Err, Ok, type StatusResult } from "../lib/result";
import { ErrorCode, InternalError, StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { FileDbModel } from "./firestore_schema";
import { GetFileSchemaConverter } from "./firestore_schema";
import { WrapPromise } from "../lib/wrap_promise";
import type {
    CloudConvergenceUpdate,
    CloudDeleteLocalConvergenceUpdate,
    ConvergenceUpdate,
    LocalConvergenceUpdate,
    LocalDeleteCloudConvergenceUpdate,
    NullUpdate
} from "./converge_file_models";
import { ConvergeMapsToUpdateStates, ConvergenceAction } from "./converge_file_models";
import type { App } from "obsidian";
import type { Identifiers } from "./syncer_update_util";
import { CreateOperationsToUpdateCloud, CreateOperationsToUpdateLocal } from "./syncer_update_util";
import { LogError } from "../log";
import type { SyncerConfig } from "../settings/syncer_config_data";
import { ConvertCloudNodesToCache, GetCloudNodesFromCache } from "./firebase_cache";
import type FirestoreSyncPlugin from "../main";
import { ConvertToUnknownError } from "../util";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import { GetFirestore } from "../firestore/get_firestore";

/**
 * Syncer that maintains the firebase file map state.
 */
export class FirebaseSyncer {
    /** Unsub function to stop real time updates. */
    private _unsubscribe: Option<Unsubscribe> = None;
    /** If this firebase syncer is ready to get updates. */
    private _isValid = false;
    /** If there is a save setting microtask already running. */
    private _savingSettings = false;

    private constructor(
        private _plugin: FirestoreSyncPlugin,
        private _config: SyncerConfig,
        private _creds: UserCredential,
        private _db: Firestore,
        private _cloudNodes: FileMapOfNodes<CloudNode>
    ) {}

    /** Build the firebase syncer. */
    public static async buildFirebaseSyncer(
        plugin: FirestoreSyncPlugin,
        firebaseApp: FirebaseApp,
        config: SyncerConfig,
        creds: UserCredential
    ): Promise<Result<FirebaseSyncer, StatusError>> {
        const db = GetFirestore(firebaseApp);

        // Get the file metadata from firestore.
        const queryOfFiles = query(
            collection(db, GetFileCollectionPath(creds)),
            where("userId", "==", creds.user.uid),
            where("vaultName", "==", config.vaultName),
            where("entryTime", ">=", config.storedFirebaseCache.lastUpdate)
        ).withConverter<FirestoreNodes, FileDbModel>(GetFileSchemaConverter());
        const querySnapshotResult = await WrapPromise(
            getDocs(queryOfFiles),
            /*textForUnknown=*/ `failed queryOfFiles getDocs Firebase syncer`
        );
        if (querySnapshotResult.err) {
            return querySnapshotResult;
        }

        // Get cached data.
        const cachedNodes = await GetCloudNodesFromCache(config.storedFirebaseCache);
        if (cachedNodes.err) {
            return cachedNodes;
        }
        const mapFileIdToNode = MapByFileId(cachedNodes.safeUnwrap());
        // Convert the docs to `FileNode` and combine with the cached data.
        querySnapshotResult.safeUnwrap().forEach((document) => {
            const node = document.data() as CloudNode;
            mapFileIdToNode.set(node.metadata.fileId.safeValue(), node);
        });

        const fileMap = ConvertArrayOfNodesToMap(
            FilterFileNodes(
                config,
                [...mapFileIdToNode.entries()].map((n) => n[1])
            )
        );
        if (fileMap.err) {
            return fileMap;
        }

        // Updates the stored firebase cache.
        const cacheResult = await ConvertCloudNodesToCache(fileMap.safeUnwrap());
        if (cacheResult.err) {
            return cacheResult;
        }
        config.storedFirebaseCache = cacheResult.safeUnwrap();
        return Ok(new FirebaseSyncer(plugin, config, creds, db, fileMap.safeUnwrap()));
    }

    /** Initializes the real time subscription on firestore data. */
    public initailizeRealTimeUpdates() {
        const queryOfFiles = query(
            collection(this._db, GetFileCollectionPath(this._creds)),
            where("userId", "==", this._creds.user.uid),
            where("vaultName", "==", this._config.vaultName)
        ).withConverter<FirestoreNodes, FileDbModel>(GetFileSchemaConverter());

        this._unsubscribe = Some(
            onSnapshot(
                queryOfFiles,
                { includeMetadataChanges: true, source: "default" },
                (querySnapshot) => {
                    const flatFiles = FlattenFileNodes(this._cloudNodes);
                    const mapOfFiles = MapByFileId(flatFiles);
                    let hasChanges = false;
                    querySnapshot.docChanges().forEach((doc) => {
                        hasChanges = true;
                        const node = doc.doc.data() as CloudNode;
                        mapOfFiles.set(node.metadata.fileId.safeValue(), node);
                    });
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (!hasChanges) {
                        return;
                    }
                    const convertToNodesResult = ConvertArrayOfNodesToMap(
                        FilterFileNodes(
                            this._config,
                            [...mapOfFiles.entries()].map((n) => n[1])
                        )
                    );
                    if (convertToNodesResult.err) {
                        LogError(convertToNodesResult.val);
                        this._isValid = false;
                        return;
                    }
                    this._cloudNodes = convertToNodesResult.safeUnwrap();
                    if (!this._savingSettings) {
                        this._savingSettings = true;
                        queueMicrotask(() => {
                            void (async () => {
                                this._savingSettings = false;
                                // Updates the stored firebase cache.
                                const convertToCacheResult = await ConvertCloudNodesToCache(
                                    this._cloudNodes
                                );
                                if (convertToCacheResult.err) {
                                    LogError(convertToCacheResult.val);
                                    return;
                                }
                                this._config.storedFirebaseCache =
                                    convertToCacheResult.safeUnwrap();
                                this._plugin
                                    .saveSettings(/*startupSyncer=*/ false)
                                    .catch((e: unknown) => {
                                        const error = ConvertToUnknownError("Saving settings")(e);
                                        LogError(error);
                                    });
                            })();
                        });
                    }
                },
                (e) => {
                    const outputError = new StatusError(
                        ErrorCode.UNKNOWN,
                        `Firebase Syncer real time updates [${e.message}]`,
                        e
                    );
                    outputError.setPayload("error", e);
                    LogError(outputError);
                }
            )
        );

        this._isValid = true;
    }

    /** Bring down the firebase syncer. */
    public teardown() {
        if (this._unsubscribe.some) {
            this._unsubscribe.safeValue()();
        }
    }

    /** Gets the convergence updates necessary to sync states. */
    public getConvergenceUpdates(
        localNodes: FileMapOfNodes<LocalNode>
    ): Result<ConvergenceUpdate[], StatusError> {
        if (!this._isValid) {
            return Err(InternalError(`Firebase syncer not in valid state.`));
        }
        return ConvergeMapsToUpdateStates({
            localMapRep: localNodes,
            cloudMapRep: this._cloudNodes
        });
    }

    /**
     * Converges the convergence updates into actual operations to sync the states. Note: Does not
     * clean up from cloud -> local updates when the local file is at a different location.
     * @param app obsidian app
     * @param updates convergence updates to turn to operations
     * @returns the operation async funcs
     */
    public resolveConvergenceUpdates(
        ids: Identifiers,
        app: App,
        syncConfig: SyncerConfig,
        updates: Exclude<ConvergenceUpdate, NullUpdate>[]
    ): Result<Promise<StatusResult<StatusError>>[], StatusError> {
        if (!this._isValid) {
            return Err(InternalError(`Firebase syncer not in valid state.`));
        }
        const localUpdates: (LocalConvergenceUpdate | LocalDeleteCloudConvergenceUpdate)[] = [];
        const cloudUpdates: (CloudConvergenceUpdate | CloudDeleteLocalConvergenceUpdate)[] = [];
        for (const update of updates) {
            switch (update.action) {
                case ConvergenceAction.USE_CLOUD:
                case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                    cloudUpdates.push(update);
                    break;
                case ConvergenceAction.USE_LOCAL:
                case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
                    localUpdates.push(update);
                    break;
            }
        }
        return Ok([
            ...CreateOperationsToUpdateLocal(
                this._db,
                ids,
                cloudUpdates,
                app,
                syncConfig,
                this._creds
            ),
            ...CreateOperationsToUpdateCloud(
                ids,
                this._db,
                localUpdates,
                app,
                syncConfig,
                this._creds
            )
        ]);
    }
}
