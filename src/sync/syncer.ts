/**
 * Root file stateful syncer. This watches the files and keeps track of the interal state of file
 * nodes.
 */

import type FirestoreSyncPlugin from "../main";
import { InternalError, UnimplementedError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some, WrapOptional } from "../lib/option";
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
import { GetOrCreateSyncProgressView } from "../sidepanel/progressView";
import { LogError } from "../logging/log";
import { CleanUpLeftOverLocalFiles } from "./syncer_update_util";
import type { UnsubFunc } from "../watcher";
import { AddWatchHandler } from "../watcher";
import type { ConvergenceUpdate, NullUpdate } from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import { uuidv7 } from "../lib/uuid";
import { FirebaseHistory } from "../history/firebase_hist";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { RootSyncType } from "../schema/settings/syncer_config.schema";
import { Span } from "../logging/tracing/span.decorator";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR, SYNCER_ID_SPAN_ATTR } from "../constants";
import { SetSpanStatusFromResult } from "../logging/tracing/set-span-status";
import { FileAccess } from "../filesystem/file_access";
import { FileMapUtil, MapOfFileNodes } from "../filesystem/file_map_util";
import {
    RemoteOnlyNode,
    FilePathType,
    AllExistingFileNodeTypes,
    FileNodeType
} from "../filesystem/file_node";
import { FirebaseCache } from "./firebase_cache";
import { App } from "obsidian";
import type { LatestSettingsConfigVersion } from "../schema/settings/settings_config.schema";
import { LatestNotesSchema } from "../schema/notes/notes.schema";
import { CreateLogger } from "../logging/logger";
import { MsFromEpoch } from "../types";
import { ConvergenceUtil } from "./convergence_util";

const LOGGER = CreateLogger("drive_syncer");

/** A root syncer synces everything under it. Multiple root syncers can be nested. */
export class FileSyncer {
    /** firebase syncer if one has been created. */
    private _firebaseSyncer: Option<FirebaseSyncer> = None;
    /** firebase syncer if one has been created. */
    // private _firebaseHistory: Option<FirebaseHistory> = None;
    /** Identified file changes to check for changes. */
    private _touchedFilepaths = new Map<FilePathType, MsFromEpoch>();
    /** Function to handle unsubing the watch func. */
    private _unsubWatchHandler: Option<UnsubFunc> = None;
    /** timeid to kill the tick function. */
    private _timeoutId: Option<number> = None;
    /** Syncer should die. */
    private _isDead = false;

    private constructor(
        private _app: App,
        private _plugin: FirestoreSyncPlugin,
        private _firebaseApp: FirebaseApp,
        private _config: LatestSyncConfigVersion,
        private _mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>
    ) {}

    /** Constructs the file syncer. */
    @Span()
    public static async constructFileSyncer(
        app: App,
        plugin: FirestoreSyncPlugin,
        config: LatestSyncConfigVersion
    ): Promise<Result<FileSyncer, StatusError>> {
        setAttributeOnActiveSpan(SYNCER_ID_SPAN_ATTR, config.syncerId);
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

        view.setSyncerStatus(config.syncerId, "checking firebase app");
        // Make sure firebase is not none.
        const firebaseApp = plugin.firebaseApp;
        if (firebaseApp.none) {
            const error = Err(InternalError("No firebase app defined"));
            SetSpanStatusFromResult(error);
            return error;
        }
        // Build the file syncer
        return Ok(new FileSyncer(app, plugin, firebaseApp.safeValue(), config, new Map()));
    }

    @Span()
    public getId(): string {
        return this._config.syncerId;
    }

    /** Initialize the file syncer. */
    @Span()
    public async init(): Promise<StatusResult<StatusError>> {
        const creds = await this._plugin.loggedIn;
        const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);

        // Also setup the internal files watched now.
        view.setSyncerStatus(this._config.syncerId, "Setting up obsidian watcher");
        this.listenForFileChanges();

        // Get the file map of the filesystem.
        view.setSyncerStatus(this._config.syncerId, "Getting file nodes");
        const fileNodes = await FileAccess.getAllFileNodes(this._app, this._config);
        if (fileNodes.err) {
            SetSpanStatusFromResult(fileNodes);
            return fileNodes;
        }
        this._mapOfFileNodes = FileMapUtil.convertNodeToMap(fileNodes.safeUnwrap());

        // Load cache of firebase nodes and assign them to filenodes.
        view.setSyncerStatus(this._config.syncerId, "Loading cached firebase information");
        const cache = await FirebaseCache.readFirebaseCache(this._app, this._config);
        if (cache.err) {
            return cache;
        }
        for (const cachedCloudData of cache.safeUnwrap().cache) {
            const loadedFileNode = WrapOptional(
                this._mapOfFileNodes.get(cachedCloudData.data.path as FilePathType)
            );
            if (loadedFileNode.some) {
                loadedFileNode.safeValue().firebaseData = Some(cachedCloudData);
            } else {
                // FileNode not found, so it doesn't exist.
                const newNode: RemoteOnlyNode = {
                    localTime: cachedCloudData.data.entryTime,
                    fileData: { fullPath: cachedCloudData.data.path as FilePathType },
                    firebaseData: cachedCloudData,
                    type: FileNodeType.REMOTE_ONLY
                };
                this._mapOfFileNodes.set(cachedCloudData.data.path as FilePathType, newNode);
            }
        }

        // TODO: Enable history again.
        // view.setSyncerStatus(this._config.syncerId, "building firebase history");
        // const buildFirebaseHistory = await FirebaseHistory.buildFirebaseHistory(
        //     this._plugin,
        //     this._firebaseApp,
        //     this._config,
        //     creds,
        //     this._mapOfFileNodes
        // );
        // if (buildFirebaseHistory.err) {
        //     buildFirebaseHistory.val.with(
        //         InjectStatusMsg(`Failed to init file syncer's firebase history module.`, {
        //             [LOGGING_SYNCER_CONFIG_ATTR]: JSON.stringify(
        //                 SyncerConfigRemoveCache(this._config)
        //             )
        //         })
        //     );
        //     return buildFirebaseHistory;
        // // }
        // this._firebaseHistory = Some(buildFirebaseHistory.safeUnwrap());
        // this._firebaseHistory.safeValue().initailizeRealTimeUpdates();
        // this._firebaseHistory.safeValue().updateMapOfLocalNodes(this._mapOfFileNodes);
        // view.setSyncerHistory(this._config, buildFirebaseHistory.safeUnwrap());

        view.setSyncerStatus(this._config.syncerId, "building firebase syncer");
        // Build the firebase syncer and init it.
        const buildFirebaseSyncer = await FirebaseSyncer.buildFirebaseSyncer(
            this._app,
            this,
            this._firebaseApp,
            this._config,
            creds,
            cache.safeUnwrap()
        );
        if (buildFirebaseSyncer.err) {
            return buildFirebaseSyncer;
        }

        // Now initalize firebase.
        const firebaseSyncer = buildFirebaseSyncer.safeUnwrap();
        this._firebaseSyncer = Some(firebaseSyncer);
        view.setSyncerStatus(this._config.syncerId, "firebase building realtime sync");
        const rtuResult = firebaseSyncer.initailizeRealTimeUpdates();
        if (rtuResult.err) {
            return rtuResult;
        }

        view.setSyncerStatus(this._config.syncerId, "running first tick");
        if (this._config.type !== RootSyncType.ROOT_SYNCER) {
            return Err(UnimplementedError(`Type "${this._config.type}" not implemented`));
        }
        view.setSyncerStatus(this._config.syncerId, "good", "green");

        // Start the file syncer repeating tick.
        await this.fileSyncerTick();

        return Ok();
    }

    @Span()
    public teardown() {
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
        void (async () => {
            const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
            view.setSyncerStatus(this._config.syncerId, "TearDown!", "red");
        });
    }

    @Span()
    private listenForFileChanges() {
        if (this._unsubWatchHandler.some) {
            return;
        }

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
                            this._touchedFilepaths.set(path, Date.now());
                            break;
                        case "modified":
                            this._touchedFilepaths.set(path, Date.now());
                            break;
                        case "file-removed":
                            this._touchedFilepaths.set(path, Date.now());
                            break;
                        case "renamed":
                            this._touchedFilepaths.set(path, Date.now());
                            if (oldPath !== undefined) {
                                this._touchedFilepaths.set(oldPath, Date.now());
                            }
                            break;
                        case "closed":
                            this._touchedFilepaths.set(path, Date.now());
                            break;
                        case "raw":
                            this._touchedFilepaths.set(path, Date.now());
                            break;
                    }
                    return;
                }
            )
        );
    }

    /** Execute a filesyncer tick. */
    @Span({ newContext: true })
    private async fileSyncerTick() {
        setAttributeOnActiveSpan(SYNCER_ID_SPAN_ATTR, this._config.syncerId);
        if (this._isDead) {
            const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
            view.setSyncerStatus(this._config.syncerId, "TearDown!", "red");
            LOGGER.error(`Syncer is dead!`, {
                [SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR]: this._config.syncerId
            });
            return;
        }
        const tickResult = await this.fileSyncerTickLogic();
        if (tickResult.err) {
            LogError(LOGGER, tickResult.val);
            const view = await GetOrCreateSyncProgressView(this._plugin.app);
            view.publishSyncerError(this._config.syncerId, tickResult.val);
            view.setSyncerStatus(this._config.syncerId, "Tick Crash!", "red");
            this._isDead = true;
            return;
        }
        this._timeoutId = Some(
            window.setTimeout(
                () => {
                    void this.fileSyncerTick();
                },
                Math.max(1000 - tickResult.safeUnwrap(), 0)
            )
        );
    }

    /** The logic that runs for the file syncer very tick. Returns ms it took to do the update. */
    @Span()
    private async fileSyncerTickLogic(): Promise<Result<number, StatusError>> {
        if (this._firebaseSyncer.none) {
            return Err(InternalError(`Firebase syncer hasn't been initialized!`));
        }

        // Id for the cycle.
        const cycleId = uuidv7();
        setAttributeOnActiveSpan(SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR, cycleId);
        // Setup the progress view.
        const view = await GetOrCreateSyncProgressView(this._plugin.app, /*reveal=*/ false);
        view.newSyncerCycle(this._config.syncerId, cycleId);

        const startTime = window.performance.now();

        // Get the current state of firebase information in cloud nodes.
        const cloudData = this._firebaseSyncer.safeValue().cloudNodes;
        // Given the current state of files and the firebase cloud nodes create the actions
        // needed to converge them.
        const convergenceData = await ConvergenceUtil.createStateConvergenceActions(
            this._app,
            this._config,
            this._mapOfFileNodes,
            this._touchedFilepaths,
            cloudData
        );
        if (convergenceData.err) {
            return convergenceData;
        }

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
            .GetConvergenceUpdates(this._mapOfFileNodes);
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
            .ResolveConvergenceUpdates(
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
}
