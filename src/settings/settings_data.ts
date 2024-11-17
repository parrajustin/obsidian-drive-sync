import type {
    SyncerConfigV1,
    SyncerConfigV2,
    SyncerConfigV3,
    SyncerConfigV4,
    SyncerConfigV5
} from "./syncer_config_data";
import {
    UpdateSchemaV1ToV2 as UpdateSyncerSchemaV1ToV2,
    UpdateSchemaV2ToV3 as UpdateSyncerSchemaV2ToV3,
    UpdateSchemaV3ToV4 as UpdateSyncerSchemaV3ToV4,
    UpdateSchemaV4ToV5 as UpdateSyncerSchemaV4ToV5
} from "./syncer_config_data";

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
export interface SettingSchemaV2 extends SettingSchemaV1 {
    version: "v2";
}

/** Syncer config supports enable/disable of file id writing. */
export interface SettingSchemaV3 extends Omit<SettingSchemaV2, "version" | "syncers"> {
    version: "v3";
    /** Individual syncer configs. */
    syncers: SyncerConfigV2[];
}

/** Nested syncers support nested root path. */
export interface SettingSchemaV4 extends Omit<SettingSchemaV3, "version" | "syncers"> {
    version: "v4";
    /** Individual syncer configs. */
    syncers: SyncerConfigV3[];
}

/** Syncer support for historic changes. */
export interface SettingSchemaV5 extends Omit<SettingSchemaV4, "version" | "syncers"> {
    version: "v5";
    /** Individual syncer configs. */
    syncers: SyncerConfigV4[];
}

/** Syncer support for shared syncers. */
export interface SettingSchemaV6 extends Omit<SettingSchemaV4, "version" | "syncers"> {
    version: "v6";
    /** Individual syncer configs. */
    syncers: SyncerConfigV5[];
}

export type AllSettingSchemas =
    | SettingSchemaV2
    | SettingSchemaV3
    | SettingSchemaV4
    | SettingSchemaV5
    | SettingSchemaV6;
export type Settings = SettingSchemaV6;

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

export function UpdateSchemaV3ToV4(prevSchema: SettingSchemaV3): SettingSchemaV4 {
    return {
        ...prevSchema,
        version: "v4",
        syncers: prevSchema.syncers.map(UpdateSyncerSchemaV2ToV3)
    };
}

export function UpdateSchemaV4ToV5(prevSchema: SettingSchemaV4): SettingSchemaV5 {
    return {
        ...prevSchema,
        version: "v5",
        syncers: prevSchema.syncers.map(UpdateSyncerSchemaV3ToV4)
    };
}

export function UpdateSchemaV5ToV6(prevSchema: SettingSchemaV5): SettingSchemaV6 {
    return {
        ...prevSchema,
        version: "v6",
        syncers: prevSchema.syncers.map(UpdateSyncerSchemaV4ToV5)
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
            return UpdateSettingsSchema(UpdateSchemaV3ToV4(restOfSchema));
        case "v4":
            return UpdateSettingsSchema(UpdateSchemaV4ToV5(restOfSchema));
        case "v5":
            return UpdateSettingsSchema(UpdateSchemaV5ToV6(restOfSchema));
        case "v6":
    }
    return restOfSchema;
}
