import type FirestoreSyncPlugin from "../main";

export enum RootSyncType {
    ROOT_SYNCER = "root",
    FOLDER_TO_ROOT = "folder_to_root"
}

/** A root syncer synces everything under it. Multiple root syncers can be nested. */
export class RootSyncer {
    constructor(
        private _plugin: FirestoreSyncPlugin,
        private _type: RootSyncType
    ) {}
}
