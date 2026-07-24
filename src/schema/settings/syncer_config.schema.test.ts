import { afterAll, beforeAll, describe, expect, test } from "@jest/globals";
import type { StatusError } from "standard-ts-lib/src/status_error";
import {
    rootSyncTypeEnum,
    rootSyncTypeSchema,
    SYNCER_CONFIG_SCHEMA_MANAGER,
    version0SyncConfigZodSchema,
    type LatestSyncConfigVersion
} from "./syncer_config.schema";

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function CreateValidSyncerConfig(): LatestSyncConfigVersion {
    return {
        type: rootSyncTypeEnum.root,
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
        version: 0
    };
}

describe("rootSyncTypeSchema", () => {
    test("accepts all enum values", () => {
        expect(rootSyncTypeSchema.safeParse("root").success).toBe(true);
        expect(rootSyncTypeSchema.safeParse("nested").success).toBe(true);
        expect(rootSyncTypeSchema.safeParse("shared").success).toBe(true);
    });

    test("rejects unknown values", () => {
        expect(rootSyncTypeSchema.safeParse("other").success).toBe(false);
        expect(rootSyncTypeSchema.safeParse(1).success).toBe(false);
    });

    test("enum object maps names to values", () => {
        expect(rootSyncTypeEnum.root).toBe("root");
        expect(rootSyncTypeEnum.nested).toBe("nested");
        expect(rootSyncTypeEnum.shared).toBe("shared");
    });
});

describe("SYNCER_CONFIG_SCHEMA_MANAGER", () => {
    beforeAll(() => {
        (window as any).app = {
            vault: {
                getName: () => "test-vault"
            }
        };
    });

    afterAll(() => {
        delete (window as any).app;
    });

    test("getDefault returns a valid version 0 config", () => {
        const defaultConfig = SYNCER_CONFIG_SCHEMA_MANAGER.getDefault();
        expect(defaultConfig.ok).toBe(true);
        const config = defaultConfig.unsafeUnwrap();
        expect(config.version).toBe(0);
        expect(config.type).toBe(rootSyncTypeEnum.root);
        expect(config.vaultName).toBe("test-vault");
        expect(config.syncerId).toMatch(UUID_V7_REGEX);
        expect(config.maxUpdatePerSyncer).toBe(50);
        expect(config.dataStorageEncrypted).toBe(false);
        expect(config.enableFileIdWriting).toBe(false);
        expect(config.sharedSettings).toEqual({ pathToFolder: "" });
        expect(version0SyncConfigZodSchema.safeParse(config).success).toBe(true);
    });

    test("getDefault generates a unique syncer id each time", () => {
        const first = SYNCER_CONFIG_SCHEMA_MANAGER.getDefault().unsafeUnwrap();
        const second = SYNCER_CONFIG_SCHEMA_MANAGER.getDefault().unsafeUnwrap();
        expect(first.syncerId).not.toBe(second.syncerId);
    });

    test("updateSchema accepts a valid version 0 config", () => {
        const config = CreateValidSyncerConfig();
        const result = SYNCER_CONFIG_SCHEMA_MANAGER.updateSchema(config);
        expect(result.unsafeUnwrap()).toEqual(config);
    });

    test("updateSchema accepts an optional encryption password", () => {
        const config = { ...CreateValidSyncerConfig(), encryptionPassword: "secret" };
        const result = SYNCER_CONFIG_SCHEMA_MANAGER.updateSchema(config);
        expect(result.unsafeUnwrap().encryptionPassword).toBe("secret");
    });

    test("updateSchema rejects an invalid sync type", () => {
        const config = { ...CreateValidSyncerConfig(), type: "bad-type" };
        const result = SYNCER_CONFIG_SCHEMA_MANAGER.updateSchema(config as never);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain(
            "Schema validation failed for Syncer Config version 0"
        );
    });

    test("updateSchema rejects a config missing required fields", () => {
        const config: Record<string, unknown> = { ...CreateValidSyncerConfig() };
        delete config.vaultName;
        const result = SYNCER_CONFIG_SCHEMA_MANAGER.updateSchema(config as never);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain("Schema validation failed");
    });

    test("updateSchema rejects an unknown version", () => {
        const config = { ...CreateValidSyncerConfig(), version: 2 };
        const result = SYNCER_CONFIG_SCHEMA_MANAGER.updateSchema(config as never);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain(
            'Failed to get a valid verison number found "2"'
        );
    });

    test("updateSchema rejects null input", () => {
        const result = SYNCER_CONFIG_SCHEMA_MANAGER.updateSchema(null);
        expect(result.err).toBe(true);
        expect((result.val as StatusError).toString()).toContain(
            "Input data either null | undefined"
        );
    });

    test("latest version is 0", () => {
        expect(SYNCER_CONFIG_SCHEMA_MANAGER.getLatestVersion()).toBe(0);
        expect(SYNCER_CONFIG_SCHEMA_MANAGER.getSchemas()).toHaveLength(1);
    });
});
