/**
 * Root file stateful syncer. This watches the files and keeps track of the interal state of file
 * nodes.
 */

import type { MainAppType } from "../main_app";
import { InternalError, UnimplementedError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { FirebaseSyncer } from "./firebase_syncer";
import type { FirebaseApp } from "firebase/app";
import { GetOrCreateSyncProgressView, SyncProgressView } from "../sidepanel/progressView";
import { LogError } from "../logging/log";
import type { UnsubFunc } from "../watcher";
import { AddWatchHandler } from "../watcher";
import { uuidv7 } from "../lib/uuid";
import {
    rootSyncTypeEnum,
    type LatestSyncConfigVersion
} from "../schema/settings/syncer_config.schema";
import { Span } from "../logging/tracing/span.decorator";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR, SYNCER_ID_SPAN_ATTR } from "../constants";
import { SetSpanStatusFromResult } from "../logging/tracing/set-span-status";
import { FileAccess } from "../filesystem/file_access";
import { FileMapUtil, MapOfFileNodes } from "../filesystem/file_map_util";
import { FilePathType, AllExistingFileNodeTypes } from "../filesystem/file_node";
import { FirebaseCache } from "./firebase_cache";
import { App } from "obsidian";
import { CreateLogger } from "../logging/logger";
import { MsFromEpoch } from "../types";
import { ConvergenceUtil } from "./convergence_util";
import { RealTimeClock } from "../clock";
import type { Clock } from "../clock";
import { SyncerUpdateUtil } from "./syncer_update_util";
import { GetFirestore } from "../firestore/get_firestore";
import { UserCredential } from "firebase/auth";

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
    private _creds: UserCredential;
    private constructor(
        private _app: App,
        private _plugin: MainAppType,
        private _firebaseApp: FirebaseApp,
        private _config: LatestSyncConfigVersion,
        private _mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>,
        private _view: SyncProgressView,
        private _clock: Clock = new RealTimeClock()
    ) {}

    /** Constructs the file syncer. */
    @Span()
    public static async constructFileSyncer(
        app: App,
        plugin: MainAppType,
        config: LatestSyncConfigVersion,
        clock: Clock = new RealTimeClock()
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

        view.setSyncerStatus(config.syncerId, "checking firebase app");
        // Make sure firebase is not none.
        const firebaseApp = plugin.firebaseApp;
        if (firebaseApp.none) {
            const error = Err(InternalError("No firebase app defined"));
            SetSpanStatusFromResult(error);
            return error;
        }
        // Build the file syncer
        return Ok(
            new FileSyncer(app, plugin, firebaseApp.safeValue(), config, new Map(), view, clock)
        );
    }

    @Span()
    public getId(): string {
        return this._config.syncerId;
    }

    /** Initialize the file syncer. */
    @Span()
    public async init(): Promise<StatusResult<StatusError>> {
        this._creds = await this._plugin.loggedIn;

        //
        // Setup the internal files watched first.
        //
        this._view.setSyncerStatus(
            this._config.syncerId,
            /*status=*/ "Setting up obsidian watcher"
        );
        this.listenForFileChanges();

        //
        // Get the file map of the filesystem.
        //
        this._view.setSyncerStatus(this._config.syncerId, /*status=*/ "Getting file nodes");
        const fileNodes = await FileAccess.getAllFileNodes(this._app, this._config);
        if (fileNodes.err) {
            SetSpanStatusFromResult(fileNodes);
            return fileNodes;
        }
        this._mapOfFileNodes = FileMapUtil.convertNodeToMap(fileNodes.safeUnwrap());

        //
        // Load cache of firebase nodes and assign them to filenodes.
        //
        this._view.setSyncerStatus(
            this._config.syncerId,
            /*status=*/ "Loading cached firebase information"
        );
        // Read cached data from json.
        const cache = await FirebaseCache.readFirebaseCache(this._app, this._config);
        if (cache.err) {
            return cache;
        }

        // TODO: build firebase history here.
        this._view.setSyncerStatus(this._config.syncerId, /*status=*/ "building firebase syncer");

        //
        // Build the firebase syncer and init it.
        //
        const buildFirebaseSyncer = await FirebaseSyncer.buildFirebaseSyncer(
            this._app,
            this,
            this._firebaseApp,
            this._config,
            this._creds,
            cache.safeUnwrap()
        );
        if (buildFirebaseSyncer.err) {
            return buildFirebaseSyncer;
        }
        // Now initalize firebase.
        const firebaseSyncer = buildFirebaseSyncer.safeUnwrap();
        this._firebaseSyncer = Some(firebaseSyncer);
        this._view.setSyncerStatus(
            this._config.syncerId,
            /*status=*/ "firebase building realtime sync"
        );
        const rtuResult = firebaseSyncer.initailizeRealTimeUpdates();
        if (rtuResult.err) {
            return rtuResult;
        }
        this._view.setSyncerStatus(this._config.syncerId, /*status=*/ "running first tick");
        if (this._config.type !== rootSyncTypeEnum.root) {
            return Err(UnimplementedError(`Type "${this._config.type}" not implemented`));
        }
        this._view.setSyncerStatus(this._config.syncerId, /*status=*/ "good", /*color=*/ "green");
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
        this._view.setSyncerStatus(
            this._config.syncerId,
            /*status=*/ "TearDown!",
            /*color=*/ "red"
        );
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
                        this._config.type === rootSyncTypeEnum.nested &&
                        !path.startsWith(this._config.nestedRootPath)
                    ) {
                        return;
                    }
                    switch (type) {
                        case "folder-created":
                            break;
                        case "file-created":
                            this._touchedFilepaths.set(path, this._clock.now());
                            break;
                        case "modified":
                            this._touchedFilepaths.set(path, this._clock.now());
                            break;
                        case "file-removed":
                            this._touchedFilepaths.set(path, this._clock.now());
                            break;
                        case "renamed":
                            this._touchedFilepaths.set(path, this._clock.now());
                            if (oldPath !== undefined) {
                                this._touchedFilepaths.set(oldPath, this._clock.now());
                            }
                            break;
                        case "closed":
                            this._touchedFilepaths.set(path, this._clock.now());
                            break;
                        case "raw":
                            this._touchedFilepaths.set(path, this._clock.now());
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
            this._view.setSyncerStatus(
                this._config.syncerId,
                /*status=*/ "TearDown!",
                /*color=*/ "red"
            );
            LOGGER.error(`Syncer is dead!`, {
                [SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR]: this._config.syncerId
            });
            return;
        }
        const tickResult = await this.fileSyncerTickLogic();
        if (tickResult.err) {
            LogError(LOGGER, tickResult.val);
            this._view.publishSyncerError(this._config.syncerId, tickResult.val);
            this._view.setSyncerStatus(this._config.syncerId, "Tick Crash!", "red");
            this._isDead = true;
            return;
        }
        this._timeoutId = Some(
            window.setTimeout(
                () => {
                    void this.fileSyncerTick();
                },
                Math.max(1000 - tickResult.safeUnwrap(), 50)
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
        LOGGER.info(`Starting new sync cycle`, {
            [SYNCER_ID_SPAN_ATTR]: this._config.syncerId,
            [SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR]: cycleId
        });

        this._view.newSyncerCycle(this._config.syncerId, cycleId);
        const startTime = window.performance.now();

        // First converge the file updates.
        const touchedFilePaths = this._touchedFilepaths;
        const cloudNodes = this._firebaseSyncer.safeValue().cloudNodes;
        const convergenceResult = await ConvergenceUtil.createStateConvergenceActions(
            this._app,
            this._config,
            this._mapOfFileNodes,
            touchedFilePaths,
            cloudNodes
        );
        if (convergenceResult.err) {
            return convergenceResult;
        }

        // Now execute a limited number of convergence updates.
        const db = GetFirestore(this._firebaseApp);
        const executedConvergence = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            this._app,
            db,
            this._plugin.settings.clientId,
            this._config,
            convergenceResult.safeUnwrap(),
            this._creds
        );
        if (executedConvergence.err) {
            return executedConvergence;
        }
        // Finally update the map state of the file nodes.
        this._mapOfFileNodes = executedConvergence.safeUnwrap().mapOfFileNodes;

        const endTime = window.performance.now();
        this._view.publishSyncerCycleDone(
            this._config.syncerId,
            executedConvergence.safeUnwrap().numberOfActions,
            /*leftOverUpdates=*/ convergenceResult.safeUnwrap().actions.length -
                executedConvergence.safeUnwrap().numberOfActions,
            endTime - startTime
        );
        return Ok(endTime - startTime);
    }
}
