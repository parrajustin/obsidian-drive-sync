/**
 * Root file stateful syncer. This watches the files and keeps track of the interal state of file
 * nodes.
 */

import type FirestoreSyncPlugin from "../main";
import { InternalError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { FileMapOfNodes } from "./file_node_util";
import {
    ConvertArrayOfNodesToMap,
    FlattenFileNodes,
    GetFileMapOfNodes,
    GetNonDeletedByFilePath,
    UpdateFileMapWithChanges
} from "./file_node_util";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { FirebaseSyncer } from "./firebase_syncer";
import type { UserCredential } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";
import { GetOrCreateSyncProgressView } from "../progressView";
import { WriteUidToAllFilesIfNecessary } from "./file_id_util";
import { LogError } from "../log";
import { CleanUpLeftOverLocalFiles } from "./syncer_update_util";
import type { UnsubFunc } from "../watcher";
import { AddWatchHandler } from "../watcher";
import type { FileNode } from "./file_node";
import type { ConvergenceUpdate, NullUpdate } from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import { uuidv7 } from "../lib/uuid";

export enum RootSyncType {
    ROOT_SYNCER = "root",
    FOLDER_TO_ROOT = "nested"
}

export interface SyncerConfig {
    type: RootSyncType;
    /** Sync config identifier. */
    syncerId: string;
    /** If data storage encryption is enabled. Only encrypts the data. */
    dataStorageEncrypted: boolean;
    /** The password for encryption, all locations must have the same. */
    encryptionPassword?: string;
    /** Filter for files. */
    syncQuery: string;
    /** Query to denote raw files to add to syncing. */
    rawFileSyncQuery: string;
    /** Query to denote obsidian files to add to syncing. */
    obsidianFileSyncQuery: string;
}

/** A root syncer synces everything under it. Multiple root syncers can be nested. */
export class FileSyncer {
    /** firebase syncer if one has been created. */
    private _firebaseSyncer: Option<FirebaseSyncer> = None;
    /** Identified file changes to check for changes. */
    private _touchedFilepaths = new Set<string>();
    /** Files that have been changed in some way. */
    private _touchedFileNodes = new Set<FileNode>();
    /** Function to handle unsubing the watch func. */
    private _unsubWatchHandler: Option<UnsubFunc> = None;
    /** timeid to kill the tick function. */
    private _timeoutId: Option<number> = None;
    /** Syncer should die. */
    private _isDead = false;

    private constructor(
        private _plugin: FirestoreSyncPlugin,
        private _firebaseApp: FirebaseApp,
        private _config: SyncerConfig,
        private _mapOfFileNodes: FileMapOfNodes
    ) {}

    /** Constructs the file syncer. */
    public static async constructFileSyncer(
        plugin: FirestoreSyncPlugin,
        config: SyncerConfig
    ): Promise<Result<FileSyncer, StatusError>> {
        const view = await GetOrCreateSyncProgressView(plugin.app, /*reveal=*/ false);
        view.setSyncerStatus(config.syncerId, "Waiting for layout...");
        // Wait till the workspace loads to reduce watcher noise.
        await new Promise<void>((onLayoutResolve) => {
            plugin.app.workspace.onLayoutReady(() => {
                onLayoutResolve();
            });
        });

        view.setSyncerStatus(config.syncerId, "Writing file uids...");
        // First I'm gonna make sure all markdown files have a fileId
        const fileUidWrite = await WriteUidToAllFilesIfNecessary(plugin.app);
        if (fileUidWrite.err) {
            return fileUidWrite;
        }

        view.setSyncerStatus(config.syncerId, "Getting file nodes");
        // Get the file map of the filesystem.
        const buildMapOfNodesResult = await GetFileMapOfNodes(plugin.app, config);
        if (buildMapOfNodesResult.err) {
            return buildMapOfNodesResult;
        }

        view.setSyncerStatus(config.syncerId, "checking firebase app");
        // Make sure firebase is not none.
        const firebaseApp = plugin.firebaseApp;
        if (firebaseApp.none) {
            return Err(InternalError("No firebase app defined"));
        }
        // Build the file syncer
        return Ok(
            new FileSyncer(
                plugin,
                firebaseApp.safeValue(),
                config,
                buildMapOfNodesResult.safeUnwrap()
            )
        );
    }

    /** Initialize the file syncer. */
    public async init(): Promise<StatusResult<StatusError>> {
        // eslint-disable-next-line @typescript-eslint/return-await
        return await this._plugin.loggedIn.then<StatusResult<StatusError>>(
            async (creds: UserCredential) => {
                const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);

                view.setSyncerStatus(this._config.syncerId, "setting up obsidian watcher");
                // Also setup the internal files watched now.
                await this.listenForFileChanges();

                view.setSyncerStatus(this._config.syncerId, "building firebase syncer");
                // Build the firebase syncer and init it.
                const buildFirebaseSyncer = await FirebaseSyncer.buildFirebaseSyncer(
                    this._firebaseApp,
                    this._config,
                    creds
                );
                if (buildFirebaseSyncer.err) {
                    return buildFirebaseSyncer;
                }
                // Now initalize firebase.
                const firebaseSyncer = buildFirebaseSyncer.safeUnwrap();
                this._firebaseSyncer = Some(firebaseSyncer);
                view.setSyncerStatus(this._config.syncerId, "firebase building realtime sync");
                await firebaseSyncer.initailizeRealTimeUpdates();

                view.setSyncerStatus(this._config.syncerId, "running first tick");
                // Start the file syncer repeating tick.
                await this.fileSyncerTick();

                view.setSyncerStatus(this._config.syncerId, "good", "green");
                return Ok();
            }
        );
    }

    public async teardown() {
        this._isDead = true;
        if (this._firebaseSyncer.some) {
            this._firebaseSyncer.safeValue().teardown();
        }
        if (this._unsubWatchHandler.some) {
            this._unsubWatchHandler.safeValue()();
        }
        if (this._timeoutId.some) {
            clearTimeout(this._timeoutId.safeValue());
        }
    }

    private async listenForFileChanges() {
        this._unsubWatchHandler = Some(
            AddWatchHandler(this._plugin.app, (type, path, oldPath, _info) => {
                switch (type) {
                    case "folder-created":
                        break;
                    case "file-created":
                        this._touchedFilepaths.add(path);
                        break;
                    case "modified":
                        return this.handleModification(path);
                    case "file-removed":
                        return this.handleRemoval(path);
                    case "renamed":
                        return this.handleRename(path, oldPath);
                    case "closed":
                        this._touchedFilepaths.add(path);
                        break;
                    case "raw":
                        this._touchedFilepaths.add(path);
                        break;
                }
                return;
            })
        );
    }

    /** Handle the modification of a file. */
    private async handleModification(path: string) {
        const nonDeleteNode = GetNonDeletedByFilePath(this._mapOfFileNodes, path);
        if (nonDeleteNode.err) {
            LogError(nonDeleteNode.val);
            this._touchedFilepaths.add(path);
            return;
        }
        const optNode = nonDeleteNode.safeUnwrap();
        if (optNode.none) {
            this._touchedFilepaths.add(path);
            return;
        }
        this._touchedFileNodes.add(optNode.safeValue());
    }

    /** Handle the removal of a file. */
    private async handleRemoval(path: string) {
        const nonDeleteNode = GetNonDeletedByFilePath(this._mapOfFileNodes, path);
        if (nonDeleteNode.err) {
            LogError(nonDeleteNode.val);
            this._touchedFilepaths.add(path);
            return;
        }
        const optNode = nonDeleteNode.safeUnwrap();
        if (optNode.none) {
            this._touchedFilepaths.add(path);
            return;
        }
        optNode.safeValue().deleted = true;
    }

    /** Handle the renaming of files. */
    private async handleRename(path: string, oldPath?: string) {
        if (path === "") {
            return;
        }
        if (oldPath === undefined) {
            this._touchedFilepaths.add(path);
            return;
        }
        const nonDeleteNode = GetNonDeletedByFilePath(this._mapOfFileNodes, oldPath);
        if (nonDeleteNode.err) {
            LogError(nonDeleteNode.val);
            this._touchedFilepaths.add(oldPath);
            this._touchedFilepaths.add(path);
            return;
        }
        const optNode = nonDeleteNode.safeUnwrap();
        if (optNode.none) {
            this._touchedFilepaths.add(oldPath);
            this._touchedFilepaths.add(path);
            return;
        }
        const node = optNode.safeValue();
        this._touchedFileNodes.add(optNode.safeValue());

        const pathSplit = path.split("/");
        const fileName = pathSplit.pop() as string;
        const [baseName, extension] = fileName.split(".") as [string, string | undefined];
        node.baseName = baseName;
        node.extension = extension ?? "";
        node.fullPath = path;
    }

    /** Execute a filesyncer tick. */
    private async fileSyncerTick() {
        const tickResult = await this.fileSyncerTickLogic();
        if (tickResult.err) {
            LogError(tickResult.val);
            const view = await GetOrCreateSyncProgressView(this._plugin.app);
            view.publishSyncerError(this._config.syncerId, tickResult.val);
            view.setSyncerStatus(this._config.syncerId, "Tick Crash!", "red");
            return;
        }

        if (this._isDead) {
            return;
        }
        this._timeoutId = Some(
            window.setTimeout(
                () => {
                    if (!this._isDead) {
                        void this.fileSyncerTick();
                    }
                },
                Math.max(500 - tickResult.safeUnwrap(), 0)
            )
        );
    }

    /** The logic that runs for the file syncer very tick. Returns ms it took to do the update. */
    private async fileSyncerTickLogic(): Promise<Result<number, StatusError>> {
        if (this._firebaseSyncer.none) {
            return Err(InternalError(`Firebase syncer hasn't been initialized!`));
        }

        // Id for the cycle.
        const cycleId = uuidv7();
        // Setup the progress view.
        const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
        view.newSyncerCycle(this._config.syncerId, cycleId);

        const startTime = window.performance.now();
        // First converge the file updates.
        const touchedFilePaths = this._touchedFilepaths;
        this._touchedFilepaths = new Set();
        const touchedFileNode = this._touchedFileNodes;
        this._touchedFileNodes = new Set();
        const mergeResult = await UpdateFileMapWithChanges(
            this._plugin.app,
            this._config,
            this._mapOfFileNodes,
            touchedFileNode,
            touchedFilePaths
        );
        if (mergeResult.err) {
            return mergeResult;
        }
        this._mapOfFileNodes = mergeResult.safeUnwrap();

        // Get the updates necessary.
        const convergenceUpdates = this._firebaseSyncer
            .safeValue()
            .getConvergenceUpdates(this._mapOfFileNodes);
        if (convergenceUpdates.err) {
            return convergenceUpdates;
        }

        // Filter out and resolve the null updates.
        const filteredUpdates = this.resolveNullUpdates(convergenceUpdates.safeUnwrap());
        if (filteredUpdates.length === 0) {
            return Ok(0);
        }

        // Build the operations necessary to sync.
        const buildConvergenceOperations = this._firebaseSyncer
            .safeValue()
            .resolveConvergenceUpdates(
                { syncerId: this._config.syncerId, cycleId },
                this._plugin.app,
                this._config,
                filteredUpdates
            );
        if (buildConvergenceOperations.err) {
            return buildConvergenceOperations;
        }

        // Now wait for all the operations to execute.
        const running = Promise.all(buildConvergenceOperations.safeUnwrap());
        for (const result of await running) {
            if (result.err) {
                return result;
            }
        }

        // Fix the local file map representation.
        const flatFiles = FlattenFileNodes(this._mapOfFileNodes);
        const resultOfMap = ConvertArrayOfNodesToMap(flatFiles);
        if (resultOfMap.err) {
            return resultOfMap;
        }
        this._mapOfFileNodes = resultOfMap.safeUnwrap();

        // Clean up local files
        const cleanUpResult = await CleanUpLeftOverLocalFiles(
            this._plugin.app,
            this._config,
            filteredUpdates,
            this._mapOfFileNodes
        );
        if (cleanUpResult.err) {
            return cleanUpResult;
        }

        const endTime = window.performance.now();
        view.publishSyncerCycleDone(
            this._config.syncerId,
            filteredUpdates.length,
            endTime - startTime
        );
        return Ok(endTime - startTime);
    }

    /** Resolve the logic for null updates removing them. */
    private resolveNullUpdates(
        updates: ConvergenceUpdate[]
    ): Exclude<ConvergenceUpdate, NullUpdate>[] {
        const results: Exclude<ConvergenceUpdate, NullUpdate>[] = [];
        for (const update of updates) {
            switch (update.action) {
                case ConvergenceAction.USE_CLOUD:
                case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                case ConvergenceAction.USE_LOCAL:
                case ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID:
                case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
                    results.push(update);
                    break;
                case ConvergenceAction.NULL_UPDATE:
                    update.localState.safeValue().fileId = update.cloudState.safeValue().fileId;
                    update.localState.safeValue().userId = update.cloudState.safeValue().userId;
            }
        }
        return results;
    }
}
