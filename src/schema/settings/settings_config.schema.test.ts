import { describe, expect, test } from "@jest/globals";
import type { StatusError } from "standard-ts-lib/src/status_error";
import {
    SETTINGS_CONFIG_SCHEMA_MANAGER,
    type LatestSettingsConfigVersion
} from "./settings_config.schema";

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function CreateValidSyncerConfig() {
    return {
        type: "root" as const,
        vaultName: "my-vault",
        syncerId: "syncer-1",
        maxUpdatePerSyncer: 50,
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian",
        obsidianFileSyncQuery: "-f:^.obsidian",
        fileIdFileQuery: "-f:template",
        enableFileIdWriting: false,
        nestedRootPath: "",
        sharedSettings: { pathToFolder: "" },
        firebaseCachePath: ".obsidian-drive-sync-firebase-cache.json.gz",
        version: 0 as const
    };
}

function CreateValidSettingsConfig(): LatestSettingsConfigVersion {
    return {
        clientId: "client-1",
        email: "user@example.com",
        password: "hunter2",
        syncers: [CreateValidSyncerConfig()],
        version: 0
    };
}

describe("SETTINGS_CONFIG_SCHEMA_MANAGER", () => {
    test("getDefault returns a valid version 0 config", () => {
        const defaultConfig = SETTINGS_CONFIG_SCHEMA_MANAGER.getDefault();
        expect(defaultConfig.ok).toBe(true);
        const config = defaultConfig.unsafeUnwrap();
        expect(config.version).toBe(0);
        expect(config.syncers).toEqual([]);
        expect(config.clientId).toMatch(UUID_V7_REGEX);
        expect(config.email).toBeUndefined();
        expect(config.password).toBeUndefined();
    });

    test("getDefault generates a unique client id each time", () => {
        const first = SETTINGS_CONFIG_SCHEMA_MANAGER.getDefault().unsafeUnwrap();
        const second = SETTINGS_CONFIG_SCHEMA_MANAGER.getDefault().unsafeUnwrap();
        expect(first.clientId).not.toBe(second.clientId);
    });

    test("updateSchema accepts a full valid config", () => {
        const config = CreateValidSettingsConfig();
        const result = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(config);
        expect(result.unsafeUnwrap()).toEqual(config);
    });

    test("updateSchema accepts a config without optional credentials", () => {
        const config: LatestSettingsConfigVersion = {
            clientId: "client-1",
            syncers: [],
            version: 0
        };
        const result = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(config);
        expect(result.unsafeUnwrap()).toEqual(config);
    });

    test("updateSchema rejects a config missing clientId", () => {
        const config: Record<string, unknown> = { ...CreateValidSettingsConfig() };
        delete config.clientId;
        const result = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(config as never);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain(
            "Schema validation failed for Settings version 0"
        );
    });

    test("updateSchema rejects an invalid syncer entry", () => {
        const config = {
            ...CreateValidSettingsConfig(),
            syncers: [{ type: "root" }]
        };
        const result = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(config as never);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain("Schema validation failed");
    });

    test("updateSchema rejects an unknown version", () => {
        const config = { ...CreateValidSettingsConfig(), version: 3 };
        const result = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(config as never);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain(
            'Failed to get a valid verison number found "3"'
        );
    });

    test("updateSchema rejects undefined input", () => {
        const result = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(undefined);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain(
            "Input data either null | undefined"
        );
    });
});
