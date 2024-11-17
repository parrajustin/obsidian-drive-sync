/**
 * Root file stateful syncer. This watches the files and keeps track of the interal state of file
 * nodes.
 */

import type FirestoreSyncPlugin from "../main";
import { InternalError, UnimplementedError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { FileMapOfNodes } from "./file_node_util";
import {
    ConvertArrayOfNodesToMap,
    FlattenFileNodes,
    GetFileMapOfNodes,
    UpdateLocalFileMapWithLocalChanges
} from "./file_node_util";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { FirebaseSyncer } from "./firebase_syncer";
import type { UserCredential } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";
import { GetOrCreateSyncProgressView } from "../progressView";
import { LogError } from "../log";
import { CleanUpLeftOverLocalFiles } from "./syncer_update_util";
import type { UnsubFunc } from "../watcher";
import { AddWatchHandler } from "../watcher";
import type { FilePathType, LocalNode } from "./file_node";
import type { ConvergenceUpdate, NullUpdate } from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import { uuidv7 } from "../lib/uuid";
import { RootSyncType, type SyncerConfig } from "../settings/syncer_config_data";
import { FirebaseHistory } from "../history/firebase_hist";

/** A root syncer synces everything under it. Multiple root syncers can be nested. */
export class FileSyncer {
    /** firebase syncer if one has been created. */
    private _firebaseSyncer: Option<FirebaseSyncer> = None;
    /** firebase syncer if one has been created. */
    private _firebaseHistory: Option<FirebaseHistory> = None;
    /** Identified file changes to check for changes. */
    private _touchedFilepaths = new Set<FilePathType>();
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
        private _mapOfFileNodes: FileMapOfNodes<LocalNode>
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

        // TODO: revisit file id writing.
        // view.setSyncerStatus(config.syncerId, "Writing file uids...");
        // // First I'm gonna make sure all markdown files have a fileId
        // const fileUidWrite = await WriteUidToAllFilesIfNecessary(plugin.app, config);
        // if (fileUidWrite.err) {
        //     return fileUidWrite;
        // }

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

    public getId(): string {
        return this._config.syncerId;
    }

    /** Initialize the file syncer. */
    public async init(): Promise<StatusResult<StatusError>> {
        return await this._plugin.loggedIn.then<StatusResult<StatusError>>(
            async (creds: UserCredential) => {
                const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);

                view.setSyncerStatus(this._config.syncerId, "setting up obsidian watcher");
                // Also setup the internal files watched now.
                this.listenForFileChanges();

                view.setSyncerStatus(this._config.syncerId, "building firebase history");
                const buildFirebaseHistory = await FirebaseHistory.buildFirebaseHistory(
                    this._plugin,
                    this._firebaseApp,
                    this._config,
                    creds,
                    this._mapOfFileNodes
                );
                if (buildFirebaseHistory.err) {
                    return buildFirebaseHistory;
                }
                this._firebaseHistory = Some(buildFirebaseHistory.safeUnwrap());
                this._firebaseHistory.safeValue().initailizeRealTimeUpdates();
                this._firebaseHistory.safeValue().updateMapOfLocalNodes(this._mapOfFileNodes);
                view.setSyncerHistory(this._config, buildFirebaseHistory.safeUnwrap());

                // Save the cache for firebase.
                await this._plugin.saveSettings(/*startupSyncer=*/ false);

                view.setSyncerStatus(this._config.syncerId, "building firebase syncer");
                // Build the firebase syncer and init it.
                const buildFirebaseSyncer = await FirebaseSyncer.buildFirebaseSyncer(
                    this,
                    this._firebaseApp,
                    this._config,
                    creds
                );
                if (buildFirebaseSyncer.err) {
                    return buildFirebaseSyncer;
                }
                // Save the cache for firebase.
                await this._plugin.saveSettings(/*startupSyncer=*/ false);

                // Now initalize firebase.
                const firebaseSyncer = buildFirebaseSyncer.safeUnwrap();
                this._firebaseSyncer = Some(firebaseSyncer);
                view.setSyncerStatus(this._config.syncerId, "firebase building realtime sync");
                firebaseSyncer.initailizeRealTimeUpdates();

                view.setSyncerStatus(this._config.syncerId, "running first tick");
                if (this._config.type !== RootSyncType.ROOT_SYNCER) {
                    return Err(UnimplementedError(`Type "${this._config.type}" not implemented`));
                }
                // Start the file syncer repeating tick.
                await this.fileSyncerTick();

                view.setSyncerStatus(this._config.syncerId, "good", "green");
                return Ok();
            }
        );
    }

    public teardown() {
        void (async () => {
            const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
            view.setSyncerStatus(this._config.syncerId, "TearDown!", "red");
        });
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

    private listenForFileChanges() {
        this._unsubWatchHandler = Some(
            AddWatchHandler(
                this._plugin.app,
                (type, path: FilePathType, oldPath: FilePathType | undefined, _info) => {
                    // Skip file paths outside nested root path.
                    if (
                        this._config.type === RootSyncType.FOLDER_TO_ROOT &&
                        !path.startsWith(this._config.nestedRootPath)
                    ) {
                        return;
                    }

                    switch (type) {
                        case "folder-created":
                            break;
                        case "file-created":
                            this._touchedFilepaths.add(path);
                            break;
                        case "modified":
                            this._touchedFilepaths.add(path);
                            break;
                        case "file-removed":
                            this._touchedFilepaths.add(path);
                            break;
                        case "renamed":
                            this._touchedFilepaths.add(path);
                            if (oldPath !== undefined) {
                                this._touchedFilepaths.add(oldPath);
                            }
                            break;
                        case "closed":
                            this._touchedFilepaths.add(path);
                            break;
                        case "raw":
                            this._touchedFilepaths.add(path);
                            break;
                    }
                    return;
                }
            )
        );
    }

    /** Execute a filesyncer tick. */
    private async fileSyncerTick() {
        if (this._isDead) {
            const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
            view.setSyncerStatus(this._config.syncerId, "TearDown!", "red");
            return;
        }
        const tickResult = await this.fileSyncerTickLogic();
        if (tickResult.err) {
            LogError(tickResult.val);
            const view = await GetOrCreateSyncProgressView(this._plugin.app);
            view.publishSyncerError(this._config.syncerId, tickResult.val);
            view.setSyncerStatus(this._config.syncerId, "Tick Crash!", "red");
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (this._isDead) {
            const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
            view.setSyncerStatus(this._config.syncerId, "TearDown!", "red");
            return;
        }
        this._timeoutId = Some(
            window.setTimeout(
                () => {
                    if (!this._isDead) {
                        void this.fileSyncerTick();
                    } else {
                        void GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false).then(
                            (view) => {
                                view.setSyncerStatus(this._config.syncerId, "TearDown!", "red");
                            }
                        );
                    }
                },
                Math.max(1000 - tickResult.safeUnwrap(), 0)
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
        const mergeResult = await UpdateLocalFileMapWithLocalChanges(
            this._plugin.app,
            this._config,
            this._mapOfFileNodes,
            touchedFilePaths
        );
        if (mergeResult.err) {
            return mergeResult;
        }
        this._mapOfFileNodes = mergeResult.safeUnwrap();
        if (this._firebaseHistory.some) {
            this._firebaseHistory.safeValue().updateMapOfLocalNodes(this._mapOfFileNodes);
        }

        // Get the updates necessary.
        const convergenceUpdates = this._firebaseSyncer
            .safeValue()
            .getConvergenceUpdates(this._mapOfFileNodes);
        if (convergenceUpdates.err) {
            return convergenceUpdates;
        }

        // TODO: Remove this to enable nested syncers.
        if (this._config.type === RootSyncType.FOLDER_TO_ROOT) {
            return Err(UnimplementedError("Nested syncers are not enabled yet."));
        }

        // Filter out and resolve the null updates.
        const [filteredUpdates, nullUpdates] = this.resolveNullUpdates(
            convergenceUpdates.safeUnwrap()
        );
        if (filteredUpdates.length === 0) {
            return Ok(0);
        }

        // Only do a set number of updates per cycle.
        const limitUpdates = filteredUpdates.slice(0, this._config.maxUpdatePerSyncer);
        console.log("limitUpdates", limitUpdates);

        // Build the operations necessary to sync.
        const buildConvergenceOperations = this._firebaseSyncer
            .safeValue()
            .resolveConvergenceUpdates(
                {
                    syncerId: this._config.syncerId,
                    cycleId,
                    clientId: this._plugin.settings.clientId,
                    vaultName: this._config.vaultName
                },
                this._plugin.app,
                this._config,
                limitUpdates
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

        // First filter out all the local nodes with updates.
        const allFlatFiles = FlattenFileNodes(this._mapOfFileNodes);

        // First filter out the files that have been modified. Filter out all local state files.
        const finalFiles: LocalNode[] = [];
        const filteredLocalFiles = new Set<LocalNode>();
        for (const update of [...limitUpdates, ...nullUpdates]) {
            switch (update.action) {
                case ConvergenceAction.USE_CLOUD:
                case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                    if (update.localState.some) {
                        filteredLocalFiles.add(update.localState.safeValue());
                    }
                    if (update.newLocalFile !== undefined) {
                        finalFiles.push(update.newLocalFile);
                    }
                    break;
                case ConvergenceAction.USE_LOCAL:
                case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
                case ConvergenceAction.NULL_UPDATE:
                    filteredLocalFiles.add(update.localState.safeValue());
                    if (update.newLocalFile !== undefined) {
                        finalFiles.push(update.newLocalFile);
                    }
                    break;
            }
        }
        for (const file of allFlatFiles) {
            if (!filteredLocalFiles.has(file)) {
                finalFiles.push(file);
            }
        }
        // ALso clean up local files.

        const resultOfMap = ConvertArrayOfNodesToMap(finalFiles);
        if (resultOfMap.err) {
            return resultOfMap;
        }
        this._mapOfFileNodes = resultOfMap.safeUnwrap();

        // Clean up local files
        const cleanUpResult = await CleanUpLeftOverLocalFiles(
            this._plugin.app,
            this._config,
            limitUpdates
        );
        if (cleanUpResult.err) {
            return cleanUpResult;
        }

        const endTime = window.performance.now();
        view.publishSyncerCycleDone(
            this._config.syncerId,
            limitUpdates.length,
            /*leftOverUpdates=*/ filteredUpdates.length - limitUpdates.length,
            endTime - startTime
        );
        return Ok(endTime - startTime);
    }

    /** Resolve the logic for null updates removing them. */
    private resolveNullUpdates(
        updates: ConvergenceUpdate[]
    ): [Exclude<ConvergenceUpdate, NullUpdate>[], NullUpdate[]] {
        const results: Exclude<ConvergenceUpdate, NullUpdate>[] = [];
        const nulls: NullUpdate[] = [];
        for (const update of updates) {
            switch (update.action) {
                case ConvergenceAction.USE_CLOUD:
                case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                case ConvergenceAction.USE_LOCAL:
                case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
                    results.push(update);
                    break;
                case ConvergenceAction.NULL_UPDATE:
                    if (
                        !update.localState
                            .safeValue()
                            .metadataAreEqual(update.cloudState.safeValue())
                    ) {
                        update.newLocalFile = update.localState
                            .safeValue()
                            .overwriteMetadataWithCloudNode(update.cloudState.safeValue());
                        nulls.push(update);
                    }
                    break;
            }
        }
        return [results, nulls];
    }
}
