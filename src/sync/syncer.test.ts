/* eslint-disable @typescript-eslint/no-unsafe-call */

/**
 * @jest-environment node
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, it, expect, beforeEach, jest, afterEach } from "@jest/globals";
import { TFile } from "obsidian";
import type { App, TFolder, Vault, Stat } from "obsidian";
import type { User, UserCredential } from "firebase/auth";
import type { Firestore, Query } from "firebase/firestore";
import { FakeClock } from "../clock";
import { FileSyncer } from "./syncer";
import type { MainAppType } from "../main_app";
import { Some } from "../lib/option";
import * as progressView from "../sidepanel/progressView";
import {
    rootSyncTypeEnum,
    type LatestSyncConfigVersion
} from "../schema/settings/syncer_config.schema";
import { FileAccess } from "../filesystem/file_access";
import { Ok } from "../lib/result";
import type { LatestNotesSchema } from "../schema/notes/notes.schema";
import { Bytes } from "firebase/firestore";
import type { FilePathType } from "../filesystem/file_node";
import { FileNodeType } from "../filesystem/file_node";
import { CompressionUtils } from "./compression_utils";
import GetSha256Hash from "../lib/sha";

// Mock dependencies
// jest.mock("../sync/firebase_cache"); - We are testing this
// jest.mock("../filesystem/file_access"); - We are testing this
// jest.mock("../constants", () => jest.requireActual("../constants")); - Do not touch constants
jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        crit: jest.fn()
    })
}));

jest.mock(
    "obsidian",
    () => ({
        ItemView: class {
            leaf: any;
            constructor(leaf: any) {
                this.leaf = leaf;
            }
        },
        TFile: class TFile {
            path: string;
            stat: Stat;
            basename: string;
            extension: string;
            vault: Vault;
            name: string;
            parent: TFolder | null;
        },
        TFolder: class {},
        Vault: class {},
        normalizePath: (path: string) => path,
        Notice: class {
            messageEl = {
                innerHTML: ""
            };
        }
    }),
    { virtual: true }
);

// Mock minimal obsidian environment
const mockObsidianFs = new Map<
    string,
    { content: Uint8Array; mtime: number; ctime: number; size: number }
>();

const clock = new FakeClock(1000000);
const mockApp = {
    vault: {
        fileMap: {} as Record<string, TFile>,
        adapter: {
            readBinary: jest.fn(async (path: string) => {
                if (mockObsidianFs.has(path)) {
                    return mockObsidianFs.get(path)!.content;
                }
                throw new Error(`File not found: ${path}`);
            }),
            writeBinary: jest.fn(async (path: string, data: Uint8Array) => {
                const now = clock.now();
                const existing = mockObsidianFs.get(path);
                mockObsidianFs.set(path, {
                    content: data,
                    mtime: now,
                    ctime: existing?.ctime ?? now,
                    size: data.length
                });
            }),
            stat: jest.fn(async (path: string) => {
                if (mockObsidianFs.has(path)) {
                    const file = mockObsidianFs.get(path)!;
                    return {
                        type: "file",
                        mtime: file.mtime,
                        ctime: file.ctime,
                        size: file.size
                    };
                }
                if (Array.from(mockObsidianFs.keys()).some((k) => k.startsWith(path + "/"))) {
                    return { type: "folder", mtime: 0, ctime: 0, size: 0 };
                }
                return null;
            }),
            mkdir: jest.fn(async (_path: string) => {
                // No-op for in-memory fs
            }),
            trashSystem: jest.fn(async (path: string) => {
                mockObsidianFs.delete(path);
                return true;
            }),
            trashLocal: jest.fn(async (path: string) => {
                mockObsidianFs.delete(path);
            }),
            on: jest.fn(),
            list: jest.fn(async (path: string) => {
                const files = new Set<string>();
                const folders = new Set<string>();
                const prefix = path ? path + "/" : "";

                for (const fullPath of mockObsidianFs.keys()) {
                    if (prefix && !fullPath.startsWith(prefix)) {
                        continue;
                    }

                    const relativePath = fullPath.substring(prefix.length);
                    if (!relativePath) continue;

                    const separatorIndex = relativePath.indexOf("/");
                    if (separatorIndex === -1) {
                        // It's a file in the current directory
                        files.add(fullPath);
                    } else {
                        // It's in a subdirectory
                        const subfolderName = relativePath.substring(0, separatorIndex);
                        folders.add(prefix + subfolderName);
                    }
                }

                return { files: Array.from(files), folders: Array.from(folders) };
            })
        },
        readBinary: jest.fn(async (file: TFile) => {
            return (mockApp.vault.adapter.readBinary as jest.Mock)(file.path);
        }),
        getAbstractFileByPath: jest.fn((path: string) => {
            return (mockApp.vault.fileMap as any)[path] || null;
        }),
        trash: jest.fn(async (file: TFile, _system: boolean) => {
            mockObsidianFs.delete(file.path);
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete (mockApp.vault.fileMap as any)[file.path];
        }),
        createBinary: jest.fn(async (path: string, data: Uint8Array) => {
            await (mockApp.vault.adapter.writeBinary as jest.Mock)(path, data);
            const tFile = new TFile();
            tFile.path = path;
            tFile.stat = {
                ctime: clock.now(),
                mtime: clock.now(),
                size: data.length
            };
            (mockApp.vault.fileMap as any)[path] = tFile;
            return tFile;
        }),
        on: jest.fn()
    },
    workspace: {
        onLayoutReady: jest.fn((cb: () => void) => {
            cb();
        }),
        on: jest.fn(),
        getLeavesOfType: jest.fn(() => []),
        getRightLeaf: jest.fn(() => ({
            setViewState: jest.fn()
        })),
        revealLeaf: jest.fn()
    }
} as unknown as App;

// In-memory Firestore
const mockFirebaseFs = new Map<string, Partial<LatestNotesSchema>>();
let onSnapshotCallback: ((snapshot: { docs: any[] }) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock("firebase/firestore", () => {
    const originalFirestore = jest.requireActual("firebase/firestore") as any;
    const firestore = {
        getFirestore: jest.fn(() => ({}) as Firestore),
        doc: jest.fn((_firestore, path, ...pathSegments) => {
            const fullPath = [path, ...pathSegments].join("/");
            const id = fullPath.split("/").pop()!;
            return { path: id };
        }),
        getDoc: jest.fn(async (docRef: { path: string }) => {
            const doc = mockFirebaseFs.get(docRef.path);
            return {
                exists: () => !!doc,
                data: () => doc
            };
        }),
        getDocs: jest.fn(async (q: Query) => {
            // Super simplified query filtering for entryTime
            const entryTimeFilter = (q as any).constraints.find(
                (f: any) => f.field === "entryTime"
            );
            const greaterThanValue = entryTimeFilter ? entryTimeFilter.value : -1;

            const docs = Array.from(mockFirebaseFs.entries())
                .filter((doc) => doc[1]!.entryTime! > greaterThanValue)
                .map((doc) => ({
                    id: doc[0],
                    data: () => doc[1]
                }));

            return { docs };
        }),
        setDoc: jest.fn(async (docRef: { path: string }, data: Partial<any>) => {
            mockFirebaseFs.set(docRef.path, data);
            if (onSnapshotCallback) {
                const results: any[] = [];
                for (const [path, doc] of mockFirebaseFs.entries()) {
                    results.push({
                        data: () => doc,
                        id: path
                    });
                }

                onSnapshotCallback({ docs: results });
            }
        }),
        Bytes: originalFirestore.Bytes,
        persistentMultipleTabManager: jest.fn(),
        persistentLocalCache: jest.fn(),
        initializeFirestore: jest.fn(() => ({})),
        collection: jest.fn((_db, path) => {
            return { path };
        }),
        query: jest.fn((collection, ...constraints) => {
            return { collection, constraints };
        }),
        where: jest.fn((field, op, value) => {
            return { field, op, value };
        }),
        onSnapshot: jest.fn((_query: any, _options: any, onNext: any) => {
            onSnapshotCallback = onNext;
            // Immediately call with current state to simulate initial data load
            const docs = Array.from(mockFirebaseFs.entries()).map(([id, data]) => ({
                id,
                data: () => data
            }));
            onNext({ docs });
            return mockUnsubscribe;
        })
    };
    return firestore;
});

const addFileToObsidian = (
    path: FilePathType,
    content: string,
    opts?: { ctime?: number; mtime?: number }
) => {
    const ctime = opts?.ctime ?? clock.now() - 1;
    const mtime = opts?.mtime ?? clock.now();
    const contentBytes = new TextEncoder().encode(content);
    mockObsidianFs.set(path, {
        content: contentBytes,
        mtime: mtime,
        ctime: ctime,
        size: contentBytes.length
    });

    const tFile = new TFile();
    tFile.path = path;
    tFile.stat = { ctime: ctime, mtime: mtime, size: contentBytes.length };
    const parts = path.split("/");
    const name = parts.pop()!;
    const nameParts = name.split(".");
    tFile.basename = nameParts[0]!;
    tFile.extension = nameParts[1]!;
    tFile.vault = mockApp.vault;
    (mockApp.vault.fileMap as any)[path] = tFile;
    return tFile;
};

const addFileToFirebase = async (
    path: FilePathType,
    content: string,
    opts?: { deleted?: boolean; entryTime?: number; mtime?: number; ctime?: number }
) => {
    const entryTime = opts?.entryTime ?? clock.now();
    const mtime = opts?.mtime ?? entryTime;
    const ctime = opts?.ctime ?? entryTime;
    const contentBytes = new TextEncoder().encode(content);
    const compressedBytesResult = await CompressionUtils.compressData(contentBytes, "test");
    const compressedBytes = compressedBytesResult.unsafeUnwrap();
    const fileHash = GetSha256Hash(contentBytes);

    const parts = path.split("/");
    const name = parts.pop()!;
    const nameParts = name.split(".");
    const basename = nameParts[0]!;
    const extension = nameParts[1]!;

    const doc: LatestNotesSchema = {
        path,
        cTime: ctime,
        mTime: mtime,
        size: contentBytes.length,
        baseName: basename,
        ext: extension,
        userId: "test-user",
        deleted: opts?.deleted ?? false,
        fileHash: Bytes.fromUint8Array(fileHash).toBase64(),
        vaultName: "test-vault",
        deviceId: "test-client",
        syncerConfigId: "test-syncer",
        entryTime,
        type: "Raw",
        data: Bytes.fromUint8Array(new Uint8Array(compressedBytes)),
        fileStorageRef: null,
        version: 0
    };

    mockFirebaseFs.set(path, doc);
    if (onSnapshotCallback) {
        const docs = Array.from(mockFirebaseFs.entries()).map(([id, data]) => ({
            id,
            data: () => data
        }));
        onSnapshotCallback({ docs });
    }
    return doc;
};

const mockPlugin = {
    app: mockApp,
    firebaseApp: Some({}),
    loggedIn: Promise.resolve({
        user: { uid: "test-user" } as User,
        providerId: "google.com",
        operationType: "signIn"
    } as UserCredential),
    settings: {
        clientId: "test-client-id"
    }
} as unknown as MainAppType;

describe("FileSyncer", () => {
    let mockSyncerConfig: LatestSyncConfigVersion;

    beforeEach(() => {
        const mockView = {
            setSyncerStatus: jest.fn(),
            newSyncerCycle: jest.fn(),
            publishSyncerCycleDone: jest.fn(),
            setEntryProgress: jest.fn(),
            addEntry: jest.fn(),
            publishSyncerError: jest.fn()
        };
        jest.spyOn(progressView, "GetOrCreateSyncProgressView").mockResolvedValue(mockView as any);

        mockObsidianFs.clear();
        mockFirebaseFs.clear();
        (mockApp.vault.fileMap as any) = {};
        onSnapshotCallback = null;

        mockSyncerConfig = {
            version: 0,
            type: rootSyncTypeEnum.root,
            syncerId: "test-syncer",
            maxUpdatePerSyncer: 10,
            vaultName: "test-vault",
            dataStorageEncrypted: false,
            syncQuery: "",
            rawFileSyncQuery: "f:^.obsidian.*.(json)$ -f:.*obsidian-firebase-sync/data.json",
            obsidianFileSyncQuery: "-f:^.obsidian",
            fileIdFileQuery: "",
            enableFileIdWriting: false,
            nestedRootPath: "",
            sharedSettings: { pathToFolder: "" },
            firebaseCachePath: ".obsidian/drive-sync-cache.json"
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("should initialize correctly", async () => {
        jest.spyOn(FileAccess, "getAllFileNodes").mockResolvedValue(Ok([]));
        // Act
        const syncerResult = await FileSyncer.constructFileSyncer(
            mockApp,
            mockPlugin,
            mockSyncerConfig,
            clock
        );
        expect(syncerResult.ok).toBe(true);
        const syncer = syncerResult.unsafeUnwrap();
        const initResult = await syncer.init();

        // Assert
        expect(initResult.ok).toBe(true);

        syncer.teardown();
    });

    it("should create and use a cache", async () => {
        // Arrange: One file in Firebase, nothing local.
        const firestore = jest.requireMock("firebase/firestore") as any;
        const firebaseFileContent = "The firebase raw content";
        const filePath = "file.md" as FilePathType;

        addFileToObsidian(filePath, firebaseFileContent);
        await addFileToFirebase(filePath, firebaseFileContent);

        // Act 1: First syncer runs, downloads file, writes cache.
        const syncerResult1 = await FileSyncer.constructFileSyncer(
            mockApp,
            mockPlugin,
            mockSyncerConfig,
            clock
        );
        const syncer1 = syncerResult1.unsafeUnwrap();
        const initResult = await syncer1.init();
        expect(initResult.ok).toBe(true);
        // The tick is what actually runs the convergence logic

        await (syncer1 as any).fileSyncerTickLogic();
        syncer1.teardown();

        // Assert 1: Cache file and downloaded file exist.
        expect(mockObsidianFs.has(mockSyncerConfig.firebaseCachePath)).toBe(true);
        expect(mockObsidianFs.has("file.md")).toBe(true);

        const fileNode = syncer1.mapOfFileNodes.get("file.md" as FilePathType);
        expect(fileNode).toBeDefined();
        expect((fileNode as any).firebaseData).toBeDefined();
        expect(firestore.getDocs).toHaveBeenCalledTimes(1);

        // Arrange 2: Reset mock and prepare for second syncer.
        (firestore.getDocs as jest.Mock).mockClear();
        // Clear the file from the mock FS to ensure it's not re-downloaded
        // but loaded from cache
        mockFirebaseFs.clear();

        // Act 2: Second syncer runs, should load from cache.
        const syncerResult2 = await FileSyncer.constructFileSyncer(
            mockApp,
            mockPlugin,
            mockSyncerConfig,
            clock
        );
        expect(syncerResult2.ok).toBe(true);
        const syncer2 = syncerResult2.unsafeUnwrap();
        const initResult2 = await syncer2.init();
        expect(initResult2.ok).toBe(true);

        expect(firestore.getDocs).toHaveBeenCalled();
        const remoteFiles = syncer2.getRemoteFilesForTesting();
        expect(remoteFiles.size).toBe(1);
        expect(remoteFiles.has("file.md")).toBe(true);

        syncer2.teardown();
    });

    it("should handle a complex end-to-end sync scenario", async () => {
        //
        // BLOCK 1: Initial State Setup
        //
        // This block establishes the baseline for the test. We create a set of files
        // both locally and remotely to simulate a user's vault in a realistic state.
        // Each file represents a different initial condition for the sync process.
        //
        // File states are:
        // - a.md: Exists only locally. Expected action: NEW_LOCAL_FILE (upload).
        // - b.md: Exists both locally and remotely, with identical content and timestamps. Expected action: None.
        // - c.md: Exists only remotely. Expected action: UPDATE_LOCAL (download).
        // - d.md: Exists only remotely, but is marked as deleted. Expected action: None (ignore).
        //
        const contentA = "content of a";
        const contentB = "content of b";
        const contentC = "content of c";
        const contentD = "content of d";

        // Create local files in the mock Obsidian vault.
        addFileToObsidian("a.md" as FilePathType, contentA, { mtime: clock.now() });
        addFileToObsidian("b.md" as FilePathType, contentB, { mtime: clock.now() });

        // Create remote files in the mock Firebase backend.
        await addFileToFirebase("b.md" as FilePathType, contentB, { entryTime: clock.now() });
        await addFileToFirebase("c.md" as FilePathType, contentC, { entryTime: clock.now() });
        await addFileToFirebase("d.md" as FilePathType, contentD, {
            deleted: true,
            entryTime: clock.now()
        });

        //
        // BLOCK 2: First Sync Cycle
        //
        // We initialize the FileSyncer and run its first sync cycle.
        // This cycle will process the initial state defined in BLOCK 1.
        //
        const syncerResult = await FileSyncer.constructFileSyncer(
            mockApp,
            mockPlugin,
            mockSyncerConfig,
            clock
        );
        expect(syncerResult.ok).toBe(true);
        const syncer = syncerResult.unsafeUnwrap();
        const initResult = await syncer.init();
        expect(initResult.ok).toBe(true);

        //
        // BLOCK 3: Verification of First Sync
        //
        // This block asserts that the first sync cycle performed the correct actions
        // based on the initial state.
        //

        //
        // 3.1: Verify Local File System State
        //
        // - a.md: Should still exist (it was uploaded).
        // - b.md: Should still exist (it was in sync).
        // - c.md: Should now exist locally (it was downloaded).
        // - d.md: Should not exist locally (it was remotely deleted).
        //
        expect(mockObsidianFs.has("a.md" as FilePathType)).toBe(true);
        expect(mockObsidianFs.has("b.md" as FilePathType)).toBe(true);
        expect(mockObsidianFs.has("c.md" as FilePathType)).toBe(true);
        expect(new TextDecoder().decode(mockObsidianFs.get("c.md")!.content)).toBe(contentC);
        expect(mockObsidianFs.has("d.md" as FilePathType)).toBe(false);

        //
        // 3.2: Verify Remote File System State
        //
        // - a.md: Should now exist remotely (it was uploaded).
        // - b.md: Should still exist and not be marked as deleted.
        // - c.md: Should still exist and not be marked as deleted.
        // - d.md: Should still be marked as deleted.
        //
        expect(mockFirebaseFs.has("b.md")).toBe(true);
        expect(mockFirebaseFs.get("b.md")?.deleted).toBe(false);
        expect(mockFirebaseFs.has("c.md")).toBe(true);
        expect(mockFirebaseFs.get("c.md")?.deleted).toBe(false);
        expect(mockFirebaseFs.has("d.md")).toBe(true);
        expect(mockFirebaseFs.get("d.md")?.deleted).toBe(true);

        const aMdFile = mockFirebaseFs.entries().find((v) => v[1].path === "a.md");
        expect(aMdFile).toBeDefined();
        expect(aMdFile?.[1].deleted).toBe(false);

        //
        // 3.3: Verify Internal Syncer State (mapOfFileNodes)
        //
        // This checks the syncer's internal representation of the file states after convergence.
        // - a.md, b.md, c.md: Should be LOCAL_CLOUD_FILE, meaning they exist in both places.
        // - d.md: Should be REMOTE_ONLY, as it only exists as a deleted stub on the remote.
        //
        const nodes1 = syncer.mapOfFileNodes;
        expect(nodes1.get("a.md" as FilePathType)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(nodes1.get("b.md" as FilePathType)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(nodes1.get("c.md" as FilePathType)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(nodes1.get("d.md" as FilePathType)?.type).toBe(FileNodeType.REMOTE_ONLY);

        //
        // BLOCK 4: Second Wave of Changes
        //
        // This block introduces a new set of changes to test the syncer's ability to handle
        // ongoing modifications after an initial sync.
        //
        // File states:
        // - a.md: Modified locally. Expected action: UPDATE_CLOUD (upload new content).
        // - c.md: Marked as deleted on the remote. Expected action: DELETE_LOCAL (delete local copy).
        //

        // Make sure to go forward 2 seconds, just to go far past the possible seconds the timeout function is waiting on.
        clock.addSeconds(2);

        // Modify local file 'a.md' and simulate a file watcher event.
        const newContentA = "new content of a";
        addFileToObsidian("a.md" as FilePathType, newContentA, { mtime: clock.now() });
        (syncer as any)._touchedFilepaths.set("a.md" as FilePathType, clock.now());

        // Modify remote file 'c.md' to be deleted and simulate a remote snapshot update.
        const remoteC = mockFirebaseFs.get("c.md");
        const updatedRemoteC = { ...remoteC, deleted: true, entryTime: clock.now() };
        mockFirebaseFs.set("c.md", updatedRemoteC as LatestNotesSchema);
        expect(onSnapshotCallback).not.toBeNull();
        onSnapshotCallback!({
            docs: [{ id: "c.md", data: () => updatedRemoteC }]
        });

        // Should go forward 2 seconds just to be sure.
        clock.addSeconds(2);
        await clock.executeTimeoutFuncs();

        //
        // BLOCK 5: Verification of Final State
        //
        // This block asserts the final state of the system after the second sync cycle,
        // ensuring the changes from BLOCK 4 were correctly processed.
        //

        //
        // 5.1: Verify Final Local File System State
        //
        // - a.md: Should exist with its new content.
        // - b.md: Should be unchanged.
        // - c.md: Should now be deleted locally.
        //
        expect(mockObsidianFs.has("a.md" as FilePathType)).toBe(true);
        expect(new TextDecoder().decode(mockObsidianFs.get("a.md")!.content)).toBe(newContentA);
        expect(mockObsidianFs.has("b.md" as FilePathType)).toBe(true);
        expect(mockObsidianFs.has("c.md" as FilePathType)).toBe(false);

        //
        // 5.2: Verify Final Remote File System State
        //
        // - a.md: Should be updated with the new content.
        // - c.md: Should remain marked as deleted.
        //
        const remoteA = mockFirebaseFs.entries().find((v) => v[1].path === "a.md");
        expect(remoteA).toBeDefined();
        expect(remoteA?.[1].deleted).toBe(false);
        const decompressedA = await CompressionUtils.decompressStringData(
            remoteA![1].data!.toUint8Array(),
            "test"
        );
        expect(decompressedA.unsafeUnwrap()).toBe(newContentA);

        expect(mockFirebaseFs.get("c.md")?.deleted).toBe(true);

        //
        // 5.3: Verify Final Internal Syncer State
        //
        // - a.md: Should still be a LOCAL_CLOUD_FILE, but with an updated file hash.
        // - c.md: Should now be REMOTE_ONLY, reflecting its local deletion.
        //
        const nodes2 = syncer.mapOfFileNodes;
        expect(nodes2.get("a.md" as FilePathType)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect((nodes2.get("a.md" as FilePathType) as any).fileData.fileHash).not.toBe(
            (nodes1.get("a.md" as FilePathType) as any).fileData.fileHash
        );
        expect(nodes2.get("c.md" as FilePathType)?.type).toBe(FileNodeType.REMOTE_ONLY);
        expect((nodes2.get("c.md" as FilePathType) as any).firebaseData.data.deleted).toBe(true);

        syncer.teardown();
        expect(mockUnsubscribe).toHaveBeenCalled();

        //
        // POTENTIAL MISSING TEST CASES:
        //
        // Based on convergence_util.md, the following scenarios should be tested:
        //
        // 1.  **Conflict Resolution (Local Newer):**
        //     - A file (e.g., 'e.md') exists on both local and remote.
        //     - It's modified in both places, but the local `mtime` is more recent.
        //     - Expected: The local version should be uploaded, overwriting the remote version (UPDATE_CLOUD).
        //
        // 2.  **Conflict Resolution (Remote Newer):**
        //     - A file (e.g., 'f.md') exists on both local and remote.
        //     - It's modified in both places, but the remote `entryTime` is more recent.
        //     - Expected: The remote version should be downloaded, overwriting the local version (UPDATE_LOCAL).
        //
        // 3.  **Local Deletion:**
        //     - A file (e.g., 'g.md') exists on both local and remote.
        //     - The local file is deleted.
        //     - Expected: The remote file should be marked as deleted (MARK_CLOUD_DELETED).
        //
        // 4.  **Simultaneous Deletion:**
        //     - A file (e.g., 'h.md') exists on both local and remote.
        //     - It is deleted locally and marked as deleted on the remote in the same sync cycle.
        //     - Expected: No action should be taken. The state is consistent.
        //
        // 5.  **Conflict: Local Deletion vs. Remote Modification:**
        //     - A file (e.g., 'i.md') is deleted locally.
        //     - In the same cycle, the file is modified on the remote, with a newer timestamp than the deletion.
        //     - Expected: The remote modification "wins". The file should be re-downloaded locally (UPDATE_LOCAL).
        //
        // 6.  **Conflict: Remote Deletion vs. Local Modification:**
        //     - A file (e.g., 'j.md') is marked as deleted on the remote.
        //     - In the same cycle, the file is modified locally with a newer timestamp.
        //     - Expected: The local modification "wins". The file should be re-uploaded, and the `deleted` flag cleared on remote (UPDATE_CLOUD).
        //
    });
});
