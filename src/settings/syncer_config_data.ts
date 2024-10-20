import type { FirebaseStoredData } from "../sync/firebase_cache";
import type { RootSyncType } from "../sync/syncer";

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
export interface SyncerConfigV2 {
    version: "v2";
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
    /** Enables the file id writing. */
    enableFileIdWriting: boolean;
    /** Query where not to write file ids. */
    fileIdFileQuery: string;
    /** Firebase cache. */
    storedFirebaseCache: FirebaseStoredData;
}

export type SyncerConfig = SyncerConfigV2;

/** Updates v1 syncer config schema to v2. */
export function UpdateSchemaV1ToV2(v1Schema: SyncerConfigV1): SyncerConfigV2 {
    return { ...v1Schema, version: "v2", enableFileIdWriting: false };
}
