import type { SyncerConfigV1, SyncerConfigV2 } from "./syncer_config_data";
import { UpdateSchemaV1ToV2 as UpdateSyncerSchemaV1ToV2 } from "./syncer_config_data";

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

/** Syncer config supports enable/disable of file id writing. */
export interface SettingSchemaV3 {
    version: "v3";
    /** Unique client id for each device. */
    clientId: string;
    /** Firestore email. */
    email?: string;
    /** Firestore password. */
    password?: string;
    /** Individual syncer configs. */
    syncers: SyncerConfigV2[];
}

export type AllSettingSchemas = SettingSchemaV2 | SettingSchemaV3;
export type Settings = SettingSchemaV3;

/** Updates v1 setting schema to v2. */
export function UpdateSchemaV1ToV2(v1Schema: SettingSchemaV1): SettingSchemaV2 {
    return { ...v1Schema, version: "v2" };
}

export function UpdateSchemaV2ToV3(v2Schema: SettingSchemaV2): SettingSchemaV3 {
    const { clientId, email, password, syncers } = v2Schema;
    return {
        version: "v3",
        clientId,
        email,
        password,
        syncers: syncers.map(UpdateSyncerSchemaV1ToV2)
    };
}

/** Updates setting schema getting the most up to date version. */
export function UpdateSettingsSchema(settings: AllSettingSchemas | SettingSchemaV1): Settings {
    if (!Object.keys(settings).contains("version")) {
        return UpdateSettingsSchema(UpdateSchemaV1ToV2(settings));
    }
    const restOfSchema = settings as AllSettingSchemas;
    switch (restOfSchema.version) {
        case "v2":
            return UpdateSettingsSchema(UpdateSchemaV2ToV3(restOfSchema));
        case "v3":
            break;
    }
    return restOfSchema;
}
