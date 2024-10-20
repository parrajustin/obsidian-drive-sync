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

export type SyncerConfig = SyncerConfigV1;
