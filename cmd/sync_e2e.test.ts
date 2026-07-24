/**
 * Offline end-to-end test of the CLI's wiring: the REAL sync engine driven
 * through the Node App/adapter/plugin against a real temp directory and the
 * fake Firestore backend (tests/fake_firebase). No network, no real Firebase.
 * This is the foundation for a future full e2e harness.
 *
 * @jest-environment node
 */
import { describe, expect, test, beforeEach, afterEach, jest } from "@jest/globals";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as nodePath from "node:path";

jest.mock("obsidian", () => jest.requireActual("./obsidian_shim"));

// Fake Firestore + Storage backends behind the firebase SDK surface.
jest.mock("firebase/firestore", () => {
    const actual = jest.requireActual("firebase/firestore");
    const sdk =
        require("../tests/fake_firebase/firestore_sdk_mock") as typeof import("../tests/fake_firebase/firestore_sdk_mock");
    return sdk.CreateFirestoreSdkMock(actual as typeof import("firebase/firestore"));
});
jest.mock("firebase/storage", () => {
    const sdk =
        require("../tests/fake_firebase/fake_cloud_storage") as typeof import("../tests/fake_firebase/fake_cloud_storage");
    return sdk.CreateStorageSdkMock();
});
jest.mock("firebase/app", () => ({
    initializeApp: () => ({ fake: true })
}));
jest.mock("firebase/auth", () => ({
    initializeAuth: () => ({ fake: true }),
    inMemoryPersistence: {},
    signInWithEmailAndPassword: async () =>
        Promise.resolve({ user: { uid: "user-1", email: "e@test.dev" } })
}));

import { Bytes } from "firebase/firestore";
import { GetFakeFirestore, ResetFakeFirestore } from "../tests/fake_firebase/firestore_sdk_mock";
import { ResetFakeCloudStorage } from "../tests/fake_firebase/fake_cloud_storage";
import { NOTES_MARKDOWN_FIREBASE_DB_NAME } from "../src/constants";
import { CompressionUtils } from "../src/sync/compression_utils";
import GetSha256Hash from "../src/lib/sha";
import { FirebaseCache } from "../src/sync/firebase_cache";
import { FileSyncer } from "../src/sync/syncer";
import type { LatestNotesSchema } from "../src/schema/notes/notes.schema";

import { BuildSettings } from "./config";
import { ConsoleProgressView } from "./console_progress_view";
import { NodeApp } from "./node_app";
import { NodeClock } from "./node_clock";
import { NodePlugin } from "./node_plugin";

const VAULT = "e2e-vault";

/** Builds a valid remote "Raw" note doc for `path` with gzip-compressed body. */
async function makeRemoteDoc(
    path: string,
    content: string,
    entryTime: number
): Promise<LatestNotesSchema> {
    const bytes = new TextEncoder().encode(content);
    const compressed = (await CompressionUtils.compressData(bytes, "test")).unsafeUnwrap();
    const [baseName, ext] = path.split("/").pop()!.split(".") as [string, string];
    return {
        path,
        cTime: entryTime,
        mTime: entryTime,
        size: bytes.length,
        baseName,
        ext,
        userId: "user-1",
        deleted: false,
        fileHash: Bytes.fromUint8Array(GetSha256Hash(bytes)).toBase64(),
        vaultName: VAULT,
        deviceId: "other-device",
        syncerConfigId: "other-syncer",
        entryTime,
        type: "Raw",
        data: Bytes.fromUint8Array(new Uint8Array(compressed)),
        fileStorageRef: null,
        version: 0
    };
}

describe("CLI offline end-to-end sync", () => {
    let tmpDir: string;

    beforeEach(async () => {
        ResetFakeFirestore();
        ResetFakeCloudStorage();
        FirebaseCache.clearCache();
        tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "drive-sync-e2e-"));
    });
    afterEach(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test("syncs a remote file down and a local file up in one pass", async () => {
        // Local: a.md exists only on disk.
        await fs.writeFile(nodePath.join(tmpDir, "a.md"), "local content of a");
        // Remote: b.md exists only in the cloud.
        GetFakeFirestore().seedDoc(
            `${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-b`,
            (await makeRemoteDoc("b.md", "remote content of b", 1000)) as unknown as Record<
                string,
                unknown
            >
        );

        const settings = BuildSettings({ directory: tmpDir, vaultName: VAULT });
        const view = new ConsoleProgressView({ log: () => undefined });
        const nodeApp = new NodeApp(tmpDir, view);
        const app = nodeApp.asObsidianApp();
        const plugin = new NodePlugin(app, settings);
        expect((await plugin.login("e@test.dev", "pw")).ok).toBe(true);

        const clock = new NodeClock();
        const constructed = await FileSyncer.constructFileSyncer(
            app,
            plugin.asMainApp(),
            settings.syncers[0]!,
            clock
        );
        expect(constructed.ok).toBe(true);
        const syncer = constructed.unsafeUnwrap();
        const initResult = await syncer.init();
        expect(initResult.ok).toBe(true);

        // Remote -> local: b.md now on disk with the remote content.
        const bLocal = await fs.readFile(nodePath.join(tmpDir, "b.md"), "utf8");
        expect(bLocal).toBe("remote content of b");

        // Local -> cloud: a.md now has a firestore doc.
        const cloudDocs = [
            ...GetFakeFirestore().listDocs(NOTES_MARKDOWN_FIREBASE_DB_NAME).values()
        ];
        const aDoc = cloudDocs.find((d) => d.path === "a.md");
        expect(aDoc).toBeDefined();
        expect(aDoc!.deleted).toBe(false);
        expect(aDoc!.vaultName).toBe(VAULT);

        syncer.teardown();
        clock.clearAll();
    });

    test("applies a remote deletion to the local file", async () => {
        await fs.writeFile(nodePath.join(tmpDir, "c.md"), "content c");
        const settings = BuildSettings({ directory: tmpDir, vaultName: VAULT });
        const view = new ConsoleProgressView({ log: () => undefined });
        const nodeApp = new NodeApp(tmpDir, view);
        const app = nodeApp.asObsidianApp();
        const plugin = new NodePlugin(app, settings);
        await plugin.login("e@test.dev", "pw");
        const clock = new NodeClock();

        // First sync: uploads c.md.
        const syncer = (
            await FileSyncer.constructFileSyncer(
                app,
                plugin.asMainApp(),
                settings.syncers[0]!,
                clock
            )
        ).unsafeUnwrap();
        await syncer.init();
        const cloud = [...GetFakeFirestore().listDocs(NOTES_MARKDOWN_FIREBASE_DB_NAME).entries()];
        const cEntry = cloud.find(([, d]) => d.path === "c.md");
        expect(cEntry).toBeDefined();

        // Remote marks it deleted with a newer entry time.
        GetFakeFirestore().simulateRemoteWrite(`${NOTES_MARKDOWN_FIREBASE_DB_NAME}/${cEntry![0]}`, {
            deleted: true,
            entryTime: clock.now() + 100_000
        });
        // Give the realtime callback + a tick to process.
        await new Promise((r) => setTimeout(r, 50));
        await (
            syncer as unknown as { fileSyncerTickLogic: () => Promise<unknown> }
        ).fileSyncerTickLogic();

        // Local c.md is gone.
        await expect(fs.stat(nodePath.join(tmpDir, "c.md"))).rejects.toThrow();

        syncer.teardown();
        clock.clearAll();
    });
});
