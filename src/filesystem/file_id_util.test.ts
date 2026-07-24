/**
 * Tests for the frontmatter file id utils (src/filesystem/file_id_util.ts).
 */
import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import type { App, TFolder, Vault, Stat } from "obsidian";
import { TFile } from "obsidian";

jest.mock(
    "obsidian",
    () => ({
        TFile: class TFile {
            public path: string;
            public stat: Stat;
            public basename: string;
            public extension: string;
            public vault: Vault;
            public name: string;
            public parent: TFolder | null;
        },

        TFolder: class {},
        normalizePath: (path: string) => path
    }),
    { virtual: true }
);

import {
    FILE_ID_FRONTMATTER_KEY,
    GetFileUidFromFrontmatter,
    WriteUidToAllFilesIfNecessary,
    WriteUidToFile
} from "./file_id_util";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { rootSyncTypeEnum } from "../schema/settings/syncer_config.schema";

// In-memory frontmatter store keyed by file path.
const frontmatters = new Map<string, Record<string, unknown>>();
let failNextProcessFrontmatter: Error | undefined = undefined;

const mockApp = {
    fileManager: {
        processFrontMatter: jest.fn(
            async (
                file: TFile,
                fn: (frontmatter: Record<string, unknown>) => void,
                _options?: unknown
            ): Promise<void> => {
                if (failNextProcessFrontmatter !== undefined) {
                    const error = failNextProcessFrontmatter;
                    failNextProcessFrontmatter = undefined;
                    return Promise.reject(error);
                }
                const frontmatter = frontmatters.get(file.path) ?? {};
                fn(frontmatter);
                frontmatters.set(file.path, frontmatter);
                return Promise.resolve();
            }
        )
    },
    vault: {
        fileMap: {} as Record<string, unknown>
    }
} as unknown as App;

const makeConfig = (overrides?: Partial<LatestSyncConfigVersion>): LatestSyncConfigVersion =>
    ({
        version: 0,
        type: rootSyncTypeEnum.root,
        syncerId: "test-syncer",
        maxUpdatePerSyncer: 10,
        vaultName: "test-vault",
        dataStorageEncrypted: false,
        syncQuery: "",
        rawFileSyncQuery: "",
        obsidianFileSyncQuery: "f:.md$",
        // Only markdown files get file ids.
        fileIdFileQuery: "f:.md$",
        enableFileIdWriting: true,
        nestedRootPath: "",
        sharedSettings: { pathToFolder: "" },
        firebaseCachePath: "",
        ...overrides
    }) as LatestSyncConfigVersion;

const makeFile = (path: string): TFile => {
    const file = new TFile();
    file.path = path;
    return file;
};

const addFileToVault = (path: string, frontmatter?: Record<string, unknown>): TFile => {
    const file = makeFile(path);
    (mockApp.vault as unknown as { fileMap: Record<string, unknown> }).fileMap[path] = file;
    if (frontmatter !== undefined) {
        frontmatters.set(path, { ...frontmatter });
    }
    return file;
};

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("file_id_util", () => {
    beforeEach(() => {
        frontmatters.clear();
        failNextProcessFrontmatter = undefined;
        (mockApp.vault as unknown as { fileMap: Record<string, unknown> }).fileMap = {};
    });

    describe("GetFileUidFromFrontmatter", () => {
        test("returns the id stored in frontmatter", async () => {
            const file = addFileToVault("note.md", { [FILE_ID_FRONTMATTER_KEY]: "id-123" });
            const result = await GetFileUidFromFrontmatter(mockApp, makeConfig(), file);

            expect(result.ok).toBe(true);
            const optional = result.unsafeUnwrap();
            expect(optional.some).toBe(true);
            expect(optional.valueOr(undefined)).toBe("id-123");
        });

        test("returns None when the frontmatter has no file id", async () => {
            const file = addFileToVault("note.md", { title: "untracked" });
            const result = await GetFileUidFromFrontmatter(mockApp, makeConfig(), file);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().none).toBe(true);
        });

        test("returns None when the file has no frontmatter at all", async () => {
            const file = addFileToVault("note.md");
            const result = await GetFileUidFromFrontmatter(mockApp, makeConfig(), file);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().none).toBe(true);
        });

        test("returns None without touching frontmatter for excluded files", async () => {
            const file = addFileToVault("image.png", { [FILE_ID_FRONTMATTER_KEY]: "id-123" });
            const result = await GetFileUidFromFrontmatter(mockApp, makeConfig(), file);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().none).toBe(true);
            expect(mockApp.fileManager.processFrontMatter).not.toHaveBeenCalled();
        });

        test("passes through malformed non-string ids as-is", async () => {
            const file = addFileToVault("note.md", { [FILE_ID_FRONTMATTER_KEY]: 42 });
            const result = await GetFileUidFromFrontmatter(mockApp, makeConfig(), file);

            expect(result.ok).toBe(true);
            const optional = result.unsafeUnwrap();
            expect(optional.some).toBe(true);
            expect(optional.valueOr(undefined)).toBe(42 as unknown as string);
        });

        test("a rejected frontmatter read becomes an error result", async () => {
            const file = addFileToVault("note.md");
            failNextProcessFrontmatter = new Error("frontmatter is malformed");
            const result = await GetFileUidFromFrontmatter(mockApp, makeConfig(), file);

            expect(result.err).toBe(true);
        });
    });

    describe("WriteUidToFile", () => {
        test("writes the uid to the frontmatter", async () => {
            const file = addFileToVault("note.md");
            const result = await WriteUidToFile(mockApp, makeConfig(), file, "uid-1");

            expect(result.ok).toBe(true);
            expect(frontmatters.get("note.md")).toEqual({
                [FILE_ID_FRONTMATTER_KEY]: "uid-1"
            });
        });

        test("overwrites an existing uid", async () => {
            const file = addFileToVault("note.md", { [FILE_ID_FRONTMATTER_KEY]: "old-uid" });
            const result = await WriteUidToFile(mockApp, makeConfig(), file, "new-uid");

            expect(result.ok).toBe(true);
            expect(frontmatters.get("note.md")![FILE_ID_FRONTMATTER_KEY]).toBe("new-uid");
        });

        test("is a no-op when file id writing is disabled", async () => {
            const file = addFileToVault("note.md");
            const config = makeConfig({ enableFileIdWriting: false });
            const result = await WriteUidToFile(mockApp, config, file, "uid-1");

            expect(result.ok).toBe(true);
            expect(frontmatters.has("note.md")).toBe(false);
            expect(mockApp.fileManager.processFrontMatter).not.toHaveBeenCalled();
        });

        test("is a no-op for files excluded by the file id query", async () => {
            const file = addFileToVault("image.png");
            const result = await WriteUidToFile(mockApp, makeConfig(), file, "uid-1");

            expect(result.ok).toBe(true);
            expect(frontmatters.has("image.png")).toBe(false);
            expect(mockApp.fileManager.processFrontMatter).not.toHaveBeenCalled();
        });

        test("forwards data write options to processFrontMatter", async () => {
            const file = addFileToVault("note.md");
            const options = { ctime: 1, mtime: 2 };
            const result = await WriteUidToFile(mockApp, makeConfig(), file, "uid-1", options);

            expect(result.ok).toBe(true);
            expect(mockApp.fileManager.processFrontMatter).toHaveBeenCalledWith(
                file,
                expect.any(Function),
                options
            );
        });

        test("a rejected frontmatter write becomes an error result", async () => {
            const file = addFileToVault("note.md");
            failNextProcessFrontmatter = new Error("write failed");
            const result = await WriteUidToFile(mockApp, makeConfig(), file, "uid-1");

            expect(result.err).toBe(true);
        });
    });

    describe("WriteUidToAllFilesIfNecessary", () => {
        test("writes a fresh uuid to matching files without an id", async () => {
            addFileToVault("a.md");
            addFileToVault("b.md", { title: "no id yet" });

            const result = await WriteUidToAllFilesIfNecessary(mockApp, makeConfig());

            expect(result.ok).toBe(true);
            expect(frontmatters.get("a.md")![FILE_ID_FRONTMATTER_KEY]).toMatch(uuidRegex);
            expect(frontmatters.get("b.md")![FILE_ID_FRONTMATTER_KEY]).toMatch(uuidRegex);
            // Untouched frontmatter keys survive.
            expect(frontmatters.get("b.md")!.title).toBe("no id yet");
        });

        test("leaves files that already have an id untouched", async () => {
            addFileToVault("a.md", { [FILE_ID_FRONTMATTER_KEY]: "existing-id" });

            const result = await WriteUidToAllFilesIfNecessary(mockApp, makeConfig());

            expect(result.ok).toBe(true);
            expect(frontmatters.get("a.md")![FILE_ID_FRONTMATTER_KEY]).toBe("existing-id");
        });

        test("skips excluded paths and non-file vault entries", async () => {
            addFileToVault("image.png");
            // A folder-like entry that is not a TFile.
            (mockApp.vault as unknown as { fileMap: Record<string, unknown> }).fileMap[
                "folder.md"
            ] = { path: "folder.md" };

            const result = await WriteUidToAllFilesIfNecessary(mockApp, makeConfig());

            expect(result.ok).toBe(true);
            expect(frontmatters.size).toBe(0);
            expect(mockApp.fileManager.processFrontMatter).not.toHaveBeenCalled();
        });

        test("is a no-op when file id writing is disabled", async () => {
            addFileToVault("a.md");
            const config = makeConfig({ enableFileIdWriting: false });

            const result = await WriteUidToAllFilesIfNecessary(mockApp, config);

            expect(result.ok).toBe(true);
            expect(frontmatters.size).toBe(0);
        });

        test("propagates a frontmatter read failure", async () => {
            addFileToVault("a.md");
            failNextProcessFrontmatter = new Error("read failed");

            const result = await WriteUidToAllFilesIfNecessary(mockApp, makeConfig());

            expect(result.err).toBe(true);
        });

        test("each file gets a unique uuid", async () => {
            addFileToVault("a.md");
            addFileToVault("b.md");

            const result = await WriteUidToAllFilesIfNecessary(mockApp, makeConfig());

            expect(result.ok).toBe(true);
            const idA = frontmatters.get("a.md")![FILE_ID_FRONTMATTER_KEY];
            const idB = frontmatters.get("b.md")![FILE_ID_FRONTMATTER_KEY];
            expect(idA).not.toBe(idB);
        });

        test("propagates a frontmatter write failure", async () => {
            addFileToVault("a.md");
            let calls = 0;
            const originalProcess = mockApp.fileManager.processFrontMatter;
            mockApp.fileManager.processFrontMatter = jest.fn(async (file, fn, options) => {
                calls++;
                if (calls === 2) {
                    return Promise.reject(new Error("write failed"));
                }
                return (originalProcess as any)(file, fn, options);
            }) as any;

            try {
                const result = await WriteUidToAllFilesIfNecessary(mockApp as any, makeConfig());
                expect(result.err).toBe(true);
            } finally {
                mockApp.fileManager.processFrontMatter = originalProcess;
            }
        });
    });
});
