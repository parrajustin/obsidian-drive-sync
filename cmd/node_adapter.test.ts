/** @jest-environment node */
import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

// The adapter imports `normalizePath` from "obsidian"; resolve it to the shim.
jest.mock("obsidian", () => jest.requireActual("./obsidian_shim"));

import { NodeDataAdapter } from "./node_adapter";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const dec = (b: ArrayBuffer): string => new TextDecoder().decode(b);

describe("NodeDataAdapter", () => {
    let tmpDir: string;
    let adapter: NodeDataAdapter;

    beforeEach(async () => {
        tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "drive-sync-fs-"));
        adapter = new NodeDataAdapter(tmpDir);
    });
    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("writeBinary then readBinary round-trips, creating parent dirs", async () => {
        await adapter.writeBinary("deep/nested/a.md", enc("hello"));
        const read = await adapter.readBinary("deep/nested/a.md");
        expect(dec(read)).toBe("hello");
    });

    test("stat reports file metadata and null for missing paths", async () => {
        await adapter.writeBinary("a.md", enc("xyz"));
        const stat = await adapter.stat("a.md");
        expect(stat).not.toBeNull();
        expect(stat!.type).toBe("file");
        expect(stat!.size).toBe(3);
        expect(await adapter.stat("missing.md")).toBeNull();
    });

    test("stat reports folders", async () => {
        await adapter.mkdir("sub");
        const stat = await adapter.stat("sub");
        expect(stat!.type).toBe("folder");
    });

    test("writeBinary honors the requested mtime", async () => {
        const mtime = 1_700_000_000_000;
        await adapter.writeBinary("timed.md", enc("t"), { mtime });
        const stat = await adapter.stat("timed.md");
        // Allow sub-second rounding by the filesystem.
        expect(Math.abs(stat!.mtime - mtime)).toBeLessThan(1000);
    });

    test("list returns vault-relative files and folders", async () => {
        await adapter.writeBinary("root.md", enc("r"));
        await adapter.writeBinary("sub/child.md", enc("c"));
        const root = await adapter.list("");
        expect(root.files).toContain("root.md");
        expect(root.folders).toContain("sub");
        const sub = await adapter.list("sub");
        expect(sub.files).toContain("sub/child.md");
    });

    test("list returns empty for a missing directory", async () => {
        const result = await adapter.list("does/not/exist");
        expect(result).toEqual({ files: [], folders: [] });
    });

    test("trashSystem removes the file and returns true", async () => {
        await adapter.writeBinary("gone.md", enc("g"));
        const trashed = await adapter.trashSystem("gone.md");
        expect(trashed).toBe(true);
        expect(await adapter.stat("gone.md")).toBeNull();
    });

    test("trashSystem is a no-op-success for missing files", async () => {
        expect(await adapter.trashSystem("never.md")).toBe(true);
    });

    test("getFullPath resolves under the base path", () => {
        expect(adapter.getFullPath("a/b.md")).toBe(nodePath.join(adapter.basePath, "a/b.md"));
        expect(adapter.getFullPath("")).toBe(adapter.basePath);
    });

    test("getName is the directory base name", () => {
        expect(adapter.getName()).toBe(nodePath.basename(tmpDir));
    });
});
