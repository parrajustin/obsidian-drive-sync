import type { App } from "obsidian";
import { uuidv7 } from "../../lib/uuid";
import type { VersionedSchema } from "../schema";
import { SchemaManager } from "../schema";
import type { FirebaseStoredData } from "../../sync/firebase_cache";

export enum RootSyncType {
    ROOT_SYNCER = "root",
    FOLDER_TO_ROOT = "nested",
    // When the syncer is shared with other users.
    SHARED = "shared"
}

interface SharedSyncerSettings {
    /** Root folder to the shared data. */
    pathToFolder: string;
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
    /** Firebase cached data. */
    storedFirebaseCache: FirebaseStoredData;
    /** Enables the file id writing. */
    enableFileIdWriting: boolean;
    /** 'nested' syncer type root path for the nested vault. */
    nestedRootPath: string;
    /** Firebase history cached data. */
    storedFirebaseHistory: FirebaseStoredData;
    sharedSettings: SharedSyncerSettings;
}

export type Version0SyncConfig = VersionedSchema<SyncerConfigV1, 0>;

export type AnyVerionSyncConfig = Version0SyncConfig;

export type LatestSyncConfigVersion = Version0SyncConfig;

export const SYNCER_CONFIG_SCHEMA_MANAGER = new SchemaManager<[Version0SyncConfig], 0>([], () => {
    return {
        type: RootSyncType.ROOT_SYNCER,
        syncerId: uuidv7(),
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian.*.(json)$ -f:.*obsidian-firebase-sync/data.json",
        obsidianFileSyncQuery: "-f:^.obsidian",
        enableFileIdWriting: false,
        fileIdFileQuery: "-f:template -f:templator",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        vaultName: ((window as any).app as App).vault.getName(),
        maxUpdatePerSyncer: 50,
        storedFirebaseCache: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
        nestedRootPath: "",
        storedFirebaseHistory: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
        sharedSettings: { pathToFolder: "" },
        version: 0
    };
});
