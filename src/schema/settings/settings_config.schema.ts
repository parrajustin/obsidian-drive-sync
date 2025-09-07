import { z } from "zod";
import { uuidv7 } from "../../lib/uuid";
import { SchemaManager, type VersionedSchema } from "../schema";
import { version0SyncConfigZodSchema } from "./syncer_config.schema";

const settingsConfigDataModelSchema = z.object({
    /** Unique client id for each device. */
    clientId: z.string(),
    /** Firestore email. */
    email: z.string().optional(),
    /** Firestore password. */
    password: z.string().optional(),
    /** Individual syncer configs. */
    syncers: z.array(version0SyncConfigZodSchema)
});

type SettingsConfigDataModel = z.infer<typeof settingsConfigDataModelSchema>;

export type Version0SettingsConfig = VersionedSchema<SettingsConfigDataModel, 0>;

const version0SettingsConfigZodSchema = settingsConfigDataModelSchema.extend({
    version: z.literal(0)
});

export type AnyVerionSettingsConfig = Version0SettingsConfig;

export type LatestSettingsConfigVersion = Version0SettingsConfig;

export const SETTINGS_CONFIG_SCHEMA_MANAGER = new SchemaManager<[Version0SettingsConfig], 0>(
    "Settings",
    [version0SettingsConfigZodSchema],
    [],
    () => {
        return {
            clientId: uuidv7(),
            syncers: [],
            version: 0
        };
    }
);
