import { TypeGuard } from "../lib/type_guard";
import type { SyncerConfigV1 } from "./syncer_config_data";

export interface SettingSchemaV1 {
    /** Unique client id for each device. */
    clientId: string;
    /** Firestore email. */
    email?: string;
    /** Firestore password. */
    password?: string;
    /** Individual syncer configs. */
    syncers: SyncerConfigV1[];
}

/** The start of updatable setting schema. */
export interface SettingSchemaV2 {
    version: "v2";
    /** Unique client id for each device. */
    clientId: string;
    /** Firestore email. */
    email?: string;
    /** Firestore password. */
    password?: string;
    /** Individual syncer configs. */
    syncers: SyncerConfigV1[];
}

export type AllSettingSchemas = SettingSchemaV1 | SettingSchemaV2;
export type Settings = SettingSchemaV2;

/** Updates v1 setting schema to v2. */
export function UpdateSchemaV1ToV2(v1Schema: SettingSchemaV1): SettingSchemaV2 {
    return { ...v1Schema, version: "v2" };
}

/** Updates setting schema getting the most up to date version. */
export function UpdateSettingsSchema(settings: AllSettingSchemas): Settings {
    if (TypeGuard<SettingSchemaV1>(settings, !Object.keys(settings).contains("version"))) {
        return UpdateSettingsSchema(UpdateSchemaV1ToV2(settings));
    }
    return settings;
}
