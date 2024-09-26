/**
 * Root file stateful syncer. This watches the files and keeps track of the interal state of file
 * nodes.
 */

import type { EventRef, TAbstractFile } from "obsidian";
import type FirestoreSyncPlugin from "../main";
import { WatchRootSettingsFolder } from "./file_util";
import { InternalError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { FileMapOfNodes } from "./file_node_util";
import { ConvertArrayOfNodesToMap, FlattenFileNodes, GetFileMapOfNodes } from "./file_node_util";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { FirebaseSyncer } from "./firebase_syncer";
import type { UserCredential } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";
import { GetOrCreateSyncProgressView } from "../progressView";
import { WriteUidToAllFilesIfNecessary } from "./file_id_util";
import { LogError } from "../log";
import { CleanUpLeftOverLocalFiles } from "./syncer_update_util";

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
    public isValid = false;
    private _eventRefs: EventRef[] = [];
    private _firebaseSyncer: Option<FirebaseSyncer> = None;

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
        // Wait till the workspace loads to reduce watcher noise.
        await new Promise<void>((onLayoutResolve) => {
            plugin.app.workspace.onLayoutReady(() => {
                onLayoutResolve();
            });
        });

        // First I'm gonna make sure all markdown files have a fileId
        const fileUidWrite = await WriteUidToAllFilesIfNecessary(plugin.app);
        if (fileUidWrite.err) {
            return fileUidWrite;
        }

        // Get the file map of the filesystem.
        const buildMapOfNodesResult = await GetFileMapOfNodes(plugin.app, config);
        if (buildMapOfNodesResult.err) {
            return buildMapOfNodesResult;
        }
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
        return await this._plugin.loggedIn
            .then<StatusResult<StatusError>>(async (creds: UserCredential) => {
                console.log("init");
                // Now make the root settings folders are being watched by the listener.
                const watchRootResult = await WatchRootSettingsFolder(
                    this._plugin.app.vault,
                    this.rootSettingsFileListener
                );
                if (watchRootResult.err) {
                    return watchRootResult;
                }
                // Also setup the internal files watched now.
                await this.listenForFileChanges();
                // Build the firebase syncer and init it.
                const buildFirebaseSyncer = await FirebaseSyncer.buildFirebaseSyncer(
                    this._firebaseApp,
                    creds
                );
                if (buildFirebaseSyncer.err) {
                    return buildFirebaseSyncer;
                }
                // Now initalize firebase.
                const firebaseSyncer = buildFirebaseSyncer.safeUnwrap();
                this._firebaseSyncer = Some(firebaseSyncer);
                await firebaseSyncer.initailizeRealTimeUpdates();
                // Start the file syncer repeating tick.
                await this.fileSyncerTick();
                return Ok();
            })
            .then<StatusResult<StatusError>>((result) => {
                if (result.ok) {
                    this.isValid = true;
                } else {
                    this.isValid = false;
                }
                return result;
            });
    }

    public async teardown() {
        for (const ref of this._eventRefs) {
            ref.e.off(ref.name, ref.fn);
        }
        if (this._firebaseSyncer.some) {
            this._firebaseSyncer.safeValue().teardown();
        }
    }

    private async listenForFileChanges() {
        const eventRefs: EventRef[] = [];
        eventRefs.push(
            this._plugin.app.vault.on("create", (file) => {
                void this.createFileListener(file);
            })
        );
        eventRefs.push(
            this._plugin.app.vault.on("delete", (file) => {
                void this.deleteFileListener(file);
            })
        );
        eventRefs.push(
            this._plugin.app.vault.on("rename", (file, oldPath: string) => {
                void this.renameFileListener(file, oldPath);
            })
        );
        eventRefs.push(
            this._plugin.app.vault.on("modify", (file) => {
                void this.modifyFileListener(file);
            })
        );
        this._eventRefs.push(...eventRefs);
        for (const ref of eventRefs) {
            this._plugin.registerEvent(ref);
        }
    }

    private async rootSettingsFileListener(event: string, fileName: string, path: string) {
        console.log("root folder", event, fileName, path);
    }

    private async modifyFileListener(file: TAbstractFile) {
        console.log("modify", file);
    }
    private async createFileListener(file: TAbstractFile) {
        console.log("create", file);
    }
    private async renameFileListener(file: TAbstractFile, oldPath: string) {
        console.log("rename", file, oldPath);
    }
    private async deleteFileListener(file: TAbstractFile) {
        console.log("delete", file);
    }

    /** Execute a filesyncer tick. */
    private async fileSyncerTick() {
        const tickResult = await this.fileSyncerTickLogic();
        if (tickResult.err) {
            LogError(tickResult.val);
            const view = await GetOrCreateSyncProgressView(this._plugin.app);
            view.publishSyncerError(tickResult.val);
            return;
        }
        setTimeout(() => {
            void this.fileSyncerTick();
        }, 500);
    }

    /** The logic that runs for the file syncer very tick. */
    private async fileSyncerTickLogic(): Promise<StatusResult<StatusError>> {
        const startTime = window.performance.now();
        if (this._firebaseSyncer.none) {
            return Err(InternalError(`Firebase syncer hasn't been initialized!`));
        }
        // Setup the progress view.
        const view = await GetOrCreateSyncProgressView(this._plugin.app);
        view.newSyncerCycle();

        // Get the updates necessary.
        const convergenceUpdates = this._firebaseSyncer
            .safeValue()
            .getConvergenceUpdates(this._mapOfFileNodes);
        if (convergenceUpdates.err) {
            return convergenceUpdates;
        }
        if (convergenceUpdates.safeUnwrap().length === 0) {
            return Ok();
        }

        // Build the operations necessary to sync.
        const buildConvergenceOperations = this._firebaseSyncer
            .safeValue()
            .resolveConvergenceUpdates(
                this._plugin.app,
                this._config,
                convergenceUpdates.safeUnwrap()
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
            convergenceUpdates.safeUnwrap(),
            this._mapOfFileNodes
        );
        if (cleanUpResult.err) {
            return cleanUpResult;
        }

        const endTime = window.performance.now();
        view.publishSyncerCycleDone(convergenceUpdates.safeUnwrap().length, endTime - startTime);
        return Ok();
    }
}
