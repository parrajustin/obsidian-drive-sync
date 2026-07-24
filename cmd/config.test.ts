/** @jest-environment node */
import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

import { BuildSettings, GenerateExampleConfig, LoadConfig } from "./config";
import { IsAcceptablePath, IsLocalFileRaw, IsObsidianFile } from "../src/sync/query_util";
import type { FilePathType } from "../src/filesystem/file_node";

const asPath = (p: string): FilePathType => p as FilePathType;

describe("cmd/config", () => {
    let tmpDir: string;
    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "drive-sync-cfg-"));
    });
    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    const writeConfig = async (yaml: string): Promise<string> => {
        const p = nodePath.join(tmpDir, "sync.yaml");
        await fs.writeFile(p, yaml);
        return p;
    };

    describe("GenerateExampleConfig", () => {
        test("is valid YAML that loads into settings", async () => {
            const p = await writeConfig(GenerateExampleConfig());
            const result = await LoadConfig(p);
            expect(result.ok).toBe(true);
            const loaded = result.unsafeUnwrap();
            expect(loaded.settings.syncers).toHaveLength(1);
            expect(loaded.settings.syncers[0]!.vaultName).toBe("my-vault");
            expect(loaded.email).toBe("you@example.com");
        });
    });

    describe("LoadConfig", () => {
        test("loads a minimal valid config", async () => {
            const p = await writeConfig(`directory: ${tmpDir}\nvaultName: v1\n`);
            const result = await LoadConfig(p);
            expect(result.ok).toBe(true);
            const loaded = result.unsafeUnwrap();
            expect(loaded.directory).toBe(nodePath.resolve(tmpDir));
            expect(loaded.settings.syncers[0]!.vaultName).toBe("v1");
            // Password is never sourced from the file.
            expect(loaded.settings.password).toBeUndefined();
        });

        test("errors on missing required fields", async () => {
            const p = await writeConfig(`vaultName: v1\n`);
            const result = await LoadConfig(p);
            expect(result.err).toBe(true);
            expect(result.val.toString()).toContain("directory");
        });

        test("errors on an invalid email", async () => {
            const p = await writeConfig(
                `directory: ${tmpDir}\nvaultName: v1\nemail: not-an-email\n`
            );
            const result = await LoadConfig(p);
            expect(result.err).toBe(true);
            expect(result.val.toString()).toContain("email");
        });

        test("errors on unknown keys (strict schema)", async () => {
            const p = await writeConfig(`directory: ${tmpDir}\nvaultName: v1\nbogus: 1\n`);
            const result = await LoadConfig(p);
            expect(result.err).toBe(true);
        });

        test("errors on malformed YAML", async () => {
            const p = await writeConfig(`directory: [unclosed\n`);
            const result = await LoadConfig(p);
            expect(result.err).toBe(true);
        });

        test("errors when the file does not exist", async () => {
            const result = await LoadConfig(nodePath.join(tmpDir, "nope.yaml"));
            expect(result.err).toBe(true);
        });
    });

    describe("BuildSettings routing", () => {
        const settings = BuildSettings({ directory: "/x", vaultName: "v1" });
        const syncer = settings.syncers[0]!;

        test("routes every file through the raw path, never obsidian", () => {
            for (const path of ["a.md", ".obsidian/app.json", "deep/nested/file.txt"]) {
                expect(IsLocalFileRaw(asPath(path), syncer)).toBe(true);
                expect(IsObsidianFile(asPath(path), syncer)).toBe(false);
            }
        });

        test("accepts normal files but excludes the cache file", () => {
            expect(IsAcceptablePath(asPath("notes/a.md"), syncer)).toBe(true);
            expect(IsAcceptablePath(asPath(syncer.firebaseCachePath), syncer)).toBe(false);
        });

        test("carries encryption + limits through", () => {
            const s = BuildSettings({
                directory: "/x",
                vaultName: "v1",
                maxUpdatesPerCycle: 7,
                encryption: { enabled: true, password: "pw" }
            }).syncers[0]!;
            expect(s.maxUpdatePerSyncer).toBe(7);
            expect(s.dataStorageEncrypted).toBe(true);
            expect(s.encryptionPassword).toBe("pw");
        });

        test("honors a user syncQuery while still excluding the cache", () => {
            const s = BuildSettings({
                directory: "/x",
                vaultName: "v1",
                syncQuery: "f:\\.md$"
            }).syncers[0]!;
            expect(IsAcceptablePath(asPath("keep.md"), s)).toBe(true);
            expect(IsAcceptablePath(asPath("skip.txt"), s)).toBe(false);
            expect(IsAcceptablePath(asPath(s.firebaseCachePath), s)).toBe(false);
        });
    });
});
