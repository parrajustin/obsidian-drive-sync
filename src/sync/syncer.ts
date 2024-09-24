import type { EventRef, TAbstractFile } from "obsidian";
import type FirestoreSyncPlugin from "../main";
import { WatchRootSettingsFolder } from "./file_util";
import { InternalError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { FileMapOfNodes } from "./file_node";
import { GetFileMapOfNodes } from "./file_node";
import { SearchString } from "../lib/search_string_parser";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import { FirebaseSyncer } from "./firebase_syncer";
import type { UserCredential } from "firebase/auth";
import type { FirebaseApp } from "firebase/app";
import { GetOrCreateSyncProgressView } from "../progressView";
import { WriteUidToAllFilesIfNecessary } from "./file_id_util";

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

        const searchString = SearchString.parse(config.syncQuery);
        // Get the file map of the filesystem.
        const buildMapOfNodesResult = await GetFileMapOfNodes(plugin.app, searchString);
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
        console.log("init");
        // eslint-disable-next-line @typescript-eslint/return-await
        return await this._plugin.loggedIn
            .then<StatusResult<StatusError>>(async (creds: UserCredential) => {
                console.log("3");
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
                console.log("4");
                const firebaseSyncer = buildFirebaseSyncer.safeUnwrap();
                this._firebaseSyncer = Some(firebaseSyncer);
                const convergenceUpdates = firebaseSyncer.getConvergenceUpdates(
                    this._mapOfFileNodes
                );
                if (convergenceUpdates.err) {
                    return convergenceUpdates;
                }
                // const localResolverResult =
                //     await firebaseSyncer.resolveUsingLocalConvergenceUpdates(
                //         this._plugin.app,
                //         convergenceUpdates.safeUnwrap()
                //     );
                // console.log("localResolverResult", localResolverResult);
                // if (localResolverResult.err) {
                //     return localResolverResult;
                // }
                const view = await GetOrCreateSyncProgressView(this._plugin.app);
                view.addDetectedChanges(convergenceUpdates.safeUnwrap());
                console.log("convergenceUpdates", convergenceUpdates);

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
}
