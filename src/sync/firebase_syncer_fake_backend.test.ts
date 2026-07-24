/**
 * FirebaseSyncer tests driven through the fake Firestore backend
 * (tests/fake_firebase/), focusing on server pushed events: remote renames,
 * listen stream errors, and subscription lifecycle.
 */
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { App } from "obsidian";
import type { FirebaseApp } from "firebase/app";
import type { UserCredential } from "firebase/auth";
import { Ok } from "standard-ts-lib/src/result";

jest.mock("firebase/firestore", () => {
    const actual = jest.requireActual("firebase/firestore");

    const sdk =
        require("../../tests/fake_firebase/firestore_sdk_mock") as typeof import("../../tests/fake_firebase/firestore_sdk_mock");
    return sdk.CreateFirestoreSdkMock(actual as typeof import("firebase/firestore"));
});
jest.mock("../firestore/get_firestore", () => ({
    GetFirestore: () => ({ fake: true })
}));
jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        crit: jest.fn()
    })
}));
jest.mock("../logging/log", () => ({
    LogError: jest.fn(),
    CreateErrorNotice: jest.fn()
}));

import { GetFakeFirestore, ResetFakeFirestore } from "../../tests/fake_firebase/firestore_sdk_mock";
import { FirebaseSyncer } from "./firebase_syncer";
import { FirebaseCache } from "./firebase_cache";
import type { FileSyncer } from "./syncer";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { NOTES_MARKDOWN_FIREBASE_DB_NAME } from "../constants";

const CONFIG = {
    vaultName: "test-vault",
    syncerId: "test-syncer",
    firebaseCachePath: ".obsidian/cache.json"
} as LatestSyncConfigVersion;
const CREDS = { user: { uid: "test-user" } } as UserCredential;
const APP = {} as App;
const FIREBASE_APP = {} as FirebaseApp;

const makeNoteDoc = (path: string, entryTime: number, deleted = false) => ({
    path,
    cTime: 1,
    mTime: 2,
    size: 3,
    baseName: path.split(".")[0]!,
    ext: "md",
    userId: "test-user",
    deleted,
    fileHash: "hash",
    vaultName: "test-vault",
    deviceId: "other-device",
    syncerConfigId: "other-syncer",
    entryTime,
    type: "Raw-Cache",
    data: null,
    fileStorageRef: null,
    version: 0
});

const buildSyncer = async (mockFileSyncer?: Partial<FileSyncer>) => {
    const syncer = (mockFileSyncer ?? { teardown: jest.fn() }) as FileSyncer;
    const result = await FirebaseSyncer.buildFirebaseSyncer(
        APP,
        syncer,
        FIREBASE_APP,
        CONFIG,
        CREDS,
        { lastUpdate: -1, cache: [] }
    );
    expect(result.ok).toBe(true);
    return result.unsafeUnwrap();
};

describe("FirebaseSyncer with fake backend", () => {
    beforeEach(() => {
        ResetFakeFirestore();
        jest.spyOn(FirebaseCache, "writeToFirebaseCache").mockResolvedValue(Ok());
    });

    it("loads existing docs on build", async () => {
        GetFakeFirestore().seedDoc(
            `${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-1`,
            makeNoteDoc("a.md", 10)
        );
        const syncer = await buildSyncer();
        expect(syncer.cloudNodes.size).toBe(1);
        expect(syncer.cloudNodes.get("a.md")?.id).toBe("doc-1");
    });

    it("applies pushed updates from the backend", async () => {
        const syncer = await buildSyncer();
        const rtu = syncer.initailizeRealTimeUpdates();
        expect(rtu.ok).toBe(true);

        GetFakeFirestore().simulateRemoteWrite(
            `${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-1`,
            makeNoteDoc("a.md", 10)
        );
        await Promise.resolve(); // Let the async snapshot callback settle.

        expect(syncer.cloudNodes.get("a.md")?.data.entryTime).toBe(10);
        syncer.teardown();
    });

    it("a remote rename does not leave a ghost entry at the old path", async () => {
        const syncer = await buildSyncer();
        expect(syncer.initailizeRealTimeUpdates().ok).toBe(true);

        GetFakeFirestore().simulateRemoteWrite(
            `${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-1`,
            makeNoteDoc("old.md", 10)
        );
        await Promise.resolve();
        expect(syncer.cloudNodes.has("old.md")).toBe(true);

        // Same doc id, new path: a rename made on another device.
        GetFakeFirestore().simulateRemoteWrite(
            `${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-1`,
            makeNoteDoc("new.md", 20)
        );
        await Promise.resolve();

        expect(syncer.cloudNodes.has("new.md")).toBe(true);
        expect(syncer.cloudNodes.has("old.md")).toBe(false);
        expect(syncer.cloudNodes.size).toBe(1);
        syncer.teardown();
    });

    it("build dedupes cache entries renamed by newer query results", async () => {
        GetFakeFirestore().seedDoc(
            `${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-1`,
            makeNoteDoc("renamed.md", 50)
        );
        const syncer = (
            await FirebaseSyncer.buildFirebaseSyncer(
                APP,
                { teardown: jest.fn() } as unknown as FileSyncer,
                FIREBASE_APP,
                CONFIG,
                CREDS,
                {
                    lastUpdate: 10,
                    // The cache still knows the doc under its old path.
                    cache: [{ id: "doc-1", data: makeNoteDoc("stale.md", 10) as never }]
                }
            )
        ).unsafeUnwrap();

        expect(syncer.cloudNodes.has("renamed.md")).toBe(true);
        expect(syncer.cloudNodes.has("stale.md")).toBe(false);
        expect(syncer.cloudNodes.size).toBe(1);
    });

    it("tears down the file syncer when the listen stream errors", async () => {
        const teardown = jest.fn();
        const syncer = await buildSyncer({ teardown } as unknown as Partial<FileSyncer>);
        expect(syncer.initailizeRealTimeUpdates().ok).toBe(true);

        GetFakeFirestore().simulateListenError(new Error("permission-denied"));

        expect(teardown).toHaveBeenCalledTimes(1);
    });

    it("tears down the file syncer when a pushed doc fails schema validation", async () => {
        const teardown = jest.fn();
        const syncer = await buildSyncer({ teardown } as unknown as Partial<FileSyncer>);
        expect(syncer.initailizeRealTimeUpdates().ok).toBe(true);

        // Matches the syncer's query (user/vault/entryTime) but is not a valid
        // notes schema document.
        GetFakeFirestore().simulateRemoteWrite(`${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-bad`, {
            userId: "test-user",
            vaultName: "test-vault",
            entryTime: 10,
            version: 9999
        });
        // The snapshot callback is async; give it microtasks to settle.
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(teardown).toHaveBeenCalledTimes(1);
        syncer.teardown();
    });

    it("teardown unsubscribes the active listener", async () => {
        const syncer = await buildSyncer();
        expect(syncer.initailizeRealTimeUpdates().ok).toBe(true);
        expect(GetFakeFirestore().activeListenerCount).toBe(1);
        syncer.teardown();
        expect(GetFakeFirestore().activeListenerCount).toBe(0);
    });
});
