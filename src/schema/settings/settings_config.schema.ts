import { uuidv7 } from "../../lib/uuid";
import type { VersionedSchema } from "../schema";
import { SchemaManager } from "../schema";
import type { AnyVerionSyncConfig } from "./syncer_config.schema";

export interface SettingConfigV1 {
    /** Unique client id for each device. */
    clientId: string;
    /** Firestore email. */
    email?: string;
    /** Firestore password. */
    password?: string;
    /** Individual syncer configs. */
    syncers: AnyVerionSyncConfig[];
}

export type Version0SettingsConfig = VersionedSchema<SettingConfigV1, 0>;

export type AnyVerionSettingsConfig = Version0SettingsConfig;

export type LatestSettingsConfigVersion = Version0SettingsConfig;

export const SETTINGS_CONFIG_SCHEMA_MANAGER = new SchemaManager<[Version0SettingsConfig], 0>(
    [],
    () => {
        return {
            clientId: uuidv7(),
            syncers: [],
            version: 0
        };
    }
);
