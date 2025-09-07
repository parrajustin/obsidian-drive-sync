import type { App } from "obsidian";
import { z } from "zod";
import { uuidv7 } from "../../lib/uuid";
import { SchemaManager, type VersionedSchema } from "../schema";

export const RootSyncTypeSchema = z.enum([
    "root",
    "nested",
    "shared"
]);
export type RootSyncType = z.infer<typeof RootSyncTypeSchema>;
export const RootSyncTypeEnum = RootSyncTypeSchema.enum;

const SharedSyncerSettingsSchema = z.object({
    /** Root folder to the shared data. */
    pathToFolder: z.string(),
});

const SyncerConfigDataModelSchema = z.object({
    type: RootSyncTypeSchema,
    /** The name of the vault, to connect remote syncers. */
    vaultName: z.string(),
    /** Sync config identifier. */
    syncerId: z.string(),
    /** Max syncs per file update. */
    maxUpdatePerSyncer: z.number(),
    /** If data storage encryption is enabled. Only encrypts the data. */
    dataStorageEncrypted: z.boolean(),
    /** The password for encryption, all locations must have the same. */
    encryptionPassword: z.string().optional(),
    /** Filter for files. */
    syncQuery: z.string(),
    /** Query to denote raw files to add to syncing. */
    rawFileSyncQuery: z.string(),
    /** Query to denote obsidian files to add to syncing. */
    obsidianFileSyncQuery: z.string(),
    /** Query where not to write file ids. */
    fileIdFileQuery: z.string(),
    /** Enables the file id writing. */
    enableFileIdWriting: z.boolean(),
    /** 'nested' syncer type root path for the nested vault. */
    nestedRootPath: z.string(),
    sharedSettings: SharedSyncerSettingsSchema,
    /** The firebase cloud data cache path */
    firebaseCachePath: z.string(),
    /** Stored firebase cache, this is not synced. */
    storedFirebaseCache: z.any(),
    /** Stored firebase history, this is not synced. */
    storedFirebaseHistory: z.any(),
});

type SyncerConfigDataModel = z.infer<typeof SyncerConfigDataModelSchema>;

export type Version0SyncConfig = VersionedSchema<SyncerConfigDataModel, 0>;

const Version0SyncConfigZodSchema = SyncerConfigDataModelSchema.extend({
    version: z.literal(0),
});

export type AnyVerionSyncConfig = Version0SyncConfig;

export type LatestSyncConfigVersion = Version0SyncConfig;

export const SYNCER_CONFIG_SCHEMA_MANAGER = new SchemaManager<[Version0SyncConfig], 0>(
    "Syncer Config",
    [Version0SyncConfigZodSchema],
    [],
    () => {
        return {
            type: RootSyncTypeEnum.root,
            syncerId: uuidv7(),
            dataStorageEncrypted: false,
            syncQuery: "*",
            rawFileSyncQuery: "f:^.obsidian.*.(json)$ -f:.*obsidian-firebase-sync/data.json",
            obsidianFileSyncQuery: "-f:^.obsidian",
            enableFileIdWriting: false,
            fileIdFileQuery: "-f:template -f:templator",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            vaultName: (((window as any).app as App).vault as any).getName() as string,
            maxUpdatePerSyncer: 50,
            storedFirebaseCache: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
            nestedRootPath: "",
            storedFirebaseHistory: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
            sharedSettings: { pathToFolder: "" },
            firebaseCachePath: ".obsidian-drive-sync-firebase-cache.json.gz",
            version: 0
        };
    }
);

export function SyncerConfigRemoveCache(
    config: LatestSyncConfigVersion
): Omit<LatestSyncConfigVersion, "storedFirebaseHistory" | "storedFirebaseCache"> {
    const copy = structuredClone(config) as unknown as Record<string, unknown>;
    delete copy.storedFirebaseCache;
    delete copy.storedFirebaseHistory;
    return copy as Omit<LatestSyncConfigVersion, "storedFirebaseHistory" | "storedFirebaseCache">;
}
