import type { EventRef, TAbstractFile } from "obsidian";
import type FirestoreSyncPlugin from "../main";
import { WatchRootSettingsFolder } from "./file_util";
import { LogError } from "../log";
import type { StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";

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
    public error: Option<StatusError> = None;
    private _eventRefs: EventRef[] = [];

    constructor(
        private _plugin: FirestoreSyncPlugin,
        private _config: SyncerConfig
    ) {
        void this._plugin.loggedIn.then(async () => {
            const watchRootResult = await WatchRootSettingsFolder(
                this._plugin.app.vault,
                this.rootSettingsFileListener
            );
            if (watchRootResult.err) {
                this.error = Some(watchRootResult.val);
                LogError(watchRootResult.val);
                return;
            }
            void this.listenForFileChanges();
        });
    }

    public async teardown() {
        for (const ref of this._eventRefs) {
            ref.e.off(ref.name, ref.fn);
        }
    }

    private async listenForFileChanges() {
        this._plugin.app.workspace.onLayoutReady(() => {
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
        });
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
