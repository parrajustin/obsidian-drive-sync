import type { FirebaseStoredData } from "../sync/firebase_cache";

export enum RootSyncType {
    ROOT_SYNCER = "root",
    FOLDER_TO_ROOT = "nested"
}

export interface SyncerConfigV1 {
    type: RootSyncType;
    /** The name of the vault, to connect remote syncers. */
    vaultName: string;
    /** Sync config identifier. */
    syncerId: string;
    /** Max syncs per file update. */
    maxUpdatePerSyncer: number;
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
    /** Query where not to write file ids. */
    fileIdFileQuery: string;
    /** Firebase cache. */
    storedFirebaseCache: FirebaseStoredData;
}

/** Supports enable/disable of the file id writing. */
export interface SyncerConfigV2 extends SyncerConfigV1 {
    version: "v2";
    /** Enables the file id writing. */
    enableFileIdWriting: boolean;
}

/** Adds nested root path. */
export interface SyncerConfigV3 extends Omit<SyncerConfigV2, "version"> {
    version: "v3";
    /** 'nested' syncer type root path for the nested vault. */
    nestedRootPath: string;
}

export type SyncerConfig = SyncerConfigV3;

export function UpdateSchemaV1ToV2(v1Schema: SyncerConfigV1): SyncerConfigV2 {
    return { ...v1Schema, version: "v2", enableFileIdWriting: false };
}

export function UpdateSchemaV2ToV3(v2Schema: SyncerConfigV2): SyncerConfigV3 {
    return { ...v2Schema, version: "v3", nestedRootPath: "" };
}
