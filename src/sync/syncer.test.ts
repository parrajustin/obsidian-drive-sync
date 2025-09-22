/* eslint-disable @typescript-eslint/no-dynamic-delete */
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
import type { App, TFolder, Vault, Stat, TAbstractFile } from "obsidian";
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
import { FirebaseCache } from "./firebase_cache";
import path from "path";

const { NOTES_MARKDOWN_FIREBASE_DB_NAME } = jest.requireActual("../constants") as {
    NOTES_MARKDOWN_FIREBASE_DB_NAME: "DB_NAME";
};

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
        getFiles: jest.fn(() => {
            return Object.values(mockApp.vault.fileMap as any);
        }),
        trash: jest.fn(async (file: TFile, _system: boolean) => {
            mockObsidianFs.delete(file.path);

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
        modifyBinary: jest.fn(async (file: TFile, data: Uint8Array) => {
            await (mockApp.vault.adapter.writeBinary as jest.Mock)(file.path, data);
            file.stat.mtime = clock.now();
            file.stat.size = data.length;
            (mockApp.vault.fileMap as any)[file.path] = file;
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
const inMemoryFirestoreFS = {
    [NOTES_MARKDOWN_FIREBASE_DB_NAME]: new Map<string, Partial<LatestNotesSchema>>()
};
let onSnapshotCallback: ((snapshot: { docs: any[] }) => void) | null = null;
const mockUnsubscribe = jest.fn();

jest.mock("firebase/firestore", () => {
    const originalFirestore = jest.requireActual("firebase/firestore") as any;
    const firestore = {
        getFirestore: jest.fn(() => ({}) as Firestore),
        doc: jest.fn((_firestore, path, ...pathSegments) => {
            const fullPath = [path, ...pathSegments].join("/");
            return { path: fullPath };
        }),
        getDoc: jest.fn(async (docRef: { path: string }) => {
            const parsedPath = path.parse(docRef.path);
            if (parsedPath.dir !== NOTES_MARKDOWN_FIREBASE_DB_NAME) {
                return {
                    exists: () => false,
                    data: () => undefined
                };
            }
            const data = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(parsedPath.base);
            return {
                exists: () => !!data,
                data: () => data
            };
        }),
        getDocs: jest.fn(async (q: Query) => {
            // Super simplified query filtering for entryTime
            const entryTimeFilter = (q as any).constraints.find(
                (f: any) => f.field === "entryTime"
            );
            const greaterThanValue = entryTimeFilter ? entryTimeFilter.value : -1;

            const docs = Array.from(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries())
                .filter((doc) => doc[1]!.entryTime! > greaterThanValue)
                .map((doc) => ({
                    id: doc[0],
                    data: () => doc[1]
                }));

            return { docs };
        }),
        setDoc: jest.fn(async (docRef: { path: string }, data: Partial<any>) => {
            const parsedPath = path.parse(docRef.path);
            if (parsedPath.dir !== NOTES_MARKDOWN_FIREBASE_DB_NAME) {
                return;
            }
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(parsedPath.base, data);

            if (onSnapshotCallback) {
                const results: any[] = [];
                for (const [path, doc] of inMemoryFirestoreFS[
                    NOTES_MARKDOWN_FIREBASE_DB_NAME
                ].entries()) {
                    results.push({
                        data: () => doc,
                        id: path
                    });
                }

                onSnapshotCallback({ docs: results });
            }
        }),
        Bytes: originalFirestore.Bytes,
        serverTimestamp: jest.fn(() => clock.now()),
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
            const docs = Array.from(
                inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries()
            ).map(([id, data]) => ({
                id,
                data: () => data
            }));
            onNext({ docs });
            return mockUnsubscribe;
        }),
        updateDoc: jest.fn((docRef: { path: string }, data: Partial<any>) => {
            const parsedPath = path.parse(docRef.path);
            if (parsedPath.dir !== NOTES_MARKDOWN_FIREBASE_DB_NAME) {
                return {
                    exists: () => false,
                    data: () => undefined
                };
            }
            const doc = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(parsedPath.base);
            if (doc) {
                inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(parsedPath.base, {
                    ...doc,
                    ...data
                });
            }
            return Promise.resolve();
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

    inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(path, doc);
    if (onSnapshotCallback) {
        const docs = Array.from(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries()).map(
            ([id, data]) => ({
                id,
                data: () => data
            })
        );
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
    jest.setTimeout(30000);
    let mockSyncerConfig: LatestSyncConfigVersion;

    beforeEach(() => {
        FirebaseCache.clearCache();
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
        inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].clear();
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
        inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].clear();

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
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].has("b.md")).toBe(true);
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get("b.md")?.deleted).toBe(
            false
        );
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].has("c.md")).toBe(true);
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get("c.md")?.deleted).toBe(
            false
        );
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].has("d.md")).toBe(true);
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get("d.md")?.deleted).toBe(
            true
        );

        const aMdFile = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries().find(
            (v) => v[1].path === "a.md"
        );
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
        const remoteC = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get("c.md");
        const updatedRemoteC = { ...remoteC, deleted: true, entryTime: clock.now() };
        inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(
            "c.md",
            updatedRemoteC as LatestNotesSchema
        );
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
        const remoteA = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries().find(
            (v) => v[1].path === "a.md"
        );
        expect(remoteA).toBeDefined();
        expect(remoteA?.[1].deleted).toBe(false);
        const decompressedA = await CompressionUtils.decompressStringData(
            remoteA![1].data!.toUint8Array(),
            "test"
        );
        expect(decompressedA.unsafeUnwrap()).toBe(newContentA);

        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get("c.md")?.deleted).toBe(
            true
        );

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

        //
        // BLOCK 6: Conflict Resolution (Local Newer)
        //
        // Scenario: A file is modified both locally and remotely, but the local
        // modification is newer. The syncer should prioritize the local change and
        // upload it, overwriting the stale remote version.
        //
        clock.addSeconds(2);
        const localNewerContent = "local is newer";
        const remoteStaleContent = "remote is stale";
        const fileE = "e.md" as FilePathType;

        // Remote modification happens first.
        await addFileToFirebase(fileE, remoteStaleContent, { entryTime: clock.now() });
        // Local modification happens second, making it newer.
        clock.addSeconds(1);
        addFileToObsidian(fileE, localNewerContent, { mtime: clock.now() });
        (syncer as any)._touchedFilepaths.set(fileE, clock.now());

        await clock.executeTimeoutFuncs();

        // Verification: Local content should be on the remote.
        const remoteE = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries().find(
            (v) => v[1].path === fileE
        );
        expect(remoteE).toBeDefined();
        const decompressedE = await CompressionUtils.decompressStringData(
            remoteE![1].data!.toUint8Array(),
            "test"
        );
        expect(decompressedE.unsafeUnwrap()).toBe(localNewerContent);
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileE)?.deleted).toBe(
            false
        );
        expect(syncer.mapOfFileNodes.get(fileE)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);

        //
        // BLOCK 7: Conflict Resolution (Remote Newer)
        //
        // Scenario: A file is modified both locally and remotely, but the remote
        // modification is newer. The syncer should prioritize the remote change and
        // download it, overwriting the stale local version.
        //
        clock.addSeconds(2);
        const localStaleContent = "local is stale";
        const remoteNewerContent = "remote is newer";
        const fileF = "f.md" as FilePathType;

        // Local modification happens first.
        addFileToObsidian(fileF, localStaleContent, { mtime: clock.now() });
        (syncer as any)._touchedFilepaths.set(fileF, clock.now());
        // Remote modification happens second, making it newer.
        clock.addSeconds(1);
        await addFileToFirebase(fileF, remoteNewerContent, { entryTime: clock.now() });

        await clock.executeTimeoutFuncs();

        // Verification: Remote content should be on the local filesystem.
        expect(mockObsidianFs.has(fileF)).toBe(true);
        expect(new TextDecoder().decode(mockObsidianFs.get(fileF)!.content)).toBe(
            remoteNewerContent
        );
        expect(syncer.mapOfFileNodes.get(fileF)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);

        //
        // BLOCK 8: Local Deletion
        //
        // Scenario: A file that exists in both locations is deleted locally.
        // The syncer should propagate this change to the remote by marking the
        // remote file as deleted.
        //
        clock.addSeconds(2);
        const fileG = "g.md" as FilePathType;
        addFileToObsidian(fileG, "content", { mtime: clock.now() });
        await addFileToFirebase(fileG, "content", { entryTime: clock.now() });
        await clock.executeTimeoutFuncs(); // Initial sync to establish LOCAL_CLOUD_FILE state

        // Delete the file locally.
        clock.addSeconds(2);
        await mockApp.vault.trash({ path: fileG } as unknown as TAbstractFile, false);
        // mockObsidianFs.delete(fileG);
        // // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        // delete (mockApp.vault.fileMap as any)[fileG];
        (syncer as any)._touchedFilepaths.set(fileG, clock.now());

        await clock.executeTimeoutFuncs();

        // Verification: Remote file should be marked as deleted.
        const fileGNode = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileG);
        expect(fileGNode).toBeDefined();
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileG)?.deleted).toBe(true);
        expect(syncer.mapOfFileNodes.get(fileG)?.type).toBe(FileNodeType.REMOTE_ONLY);

        //
        // BLOCK 9: Simultaneous Deletion
        //
        // Scenario: A file is deleted locally, and in the same sync cycle, it's
        // also marked as deleted on the remote. The syncer should recognize that
        // both sides are already consistent and take no further action.
        //
        clock.addSeconds(2);
        const fileH = "h.md" as FilePathType;
        addFileToObsidian(fileH, "content", { mtime: clock.now() });
        await addFileToFirebase(fileH, "content", { entryTime: clock.now() });
        await clock.executeTimeoutFuncs(); // Initial sync

        // Delete locally.
        mockObsidianFs.delete(fileH);
        delete (mockApp.vault.fileMap as any)[fileH];
        (syncer as any)._touchedFilepaths.set(fileH, clock.now());
        // Mark as deleted remotely.
        const remoteH = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileH);
        inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(fileH, {
            ...remoteH,
            deleted: true,
            entryTime: clock.now()
        });

        const preActionNodes = syncer.mapOfFileNodes;
        await clock.executeTimeoutFuncs();
        const postActionNodes = syncer.mapOfFileNodes;

        // Verification: The node state should remain REMOTE_ONLY and no files written.
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileH)?.deleted).toBe(true);
        expect(mockObsidianFs.has(fileH)).toBe(false);
        // Compare the before and after internal states to ensure no changes were made.
        expect(postActionNodes.get(fileH)).toEqual(preActionNodes.get(fileH));

        //
        // BLOCK 10: Conflict - Local Deletion vs. Remote Modification
        //
        // Scenario: A user deletes a file locally, but before the sync happens,
        // another client modifies the same file remotely. The remote modification
        // should "win" because it's a more significant action than a deletion.
        // The file should be re-downloaded.
        //
        clock.addSeconds(2);
        const fileI = "i.md" as FilePathType;
        const remoteUpdatedContent = "remote update wins";
        addFileToObsidian(fileI, "initial", { mtime: clock.now() });
        await addFileToFirebase(fileI, "initial", { entryTime: clock.now() });
        await clock.executeTimeoutFuncs(); // Initial sync

        // Delete locally.
        mockObsidianFs.delete(fileI);
        delete (mockApp.vault.fileMap as any)[fileI];
        (syncer as any)._touchedFilepaths.set(fileI, clock.now());
        // Modify remotely with a newer timestamp.
        clock.addSeconds(1);
        await addFileToFirebase(fileI, remoteUpdatedContent, { entryTime: clock.now() });

        await clock.executeTimeoutFuncs();

        // Verification: The remote file should be re-downloaded.
        expect(mockObsidianFs.has(fileI)).toBe(true);
        expect(new TextDecoder().decode(mockObsidianFs.get(fileI)!.content)).toBe(
            remoteUpdatedContent
        );
        expect(syncer.mapOfFileNodes.get(fileI)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);

        //
        // BLOCK 11: Conflict - Remote Deletion vs. Local Modification
        //
        // Scenario: A file is marked as deleted on the remote, but a user modifies
        // it locally before the sync happens. The local modification should "win",
        // undeleting the remote file and uploading the new content.
        //
        clock.addSeconds(2);

        const fileJ = "j.md" as FilePathType;
        const localUpdatedContent = "local update wins";
        addFileToObsidian(fileJ, "initial", { mtime: clock.now() });
        await addFileToFirebase(fileJ, "initial", { entryTime: clock.now() });

        await clock.executeTimeoutFuncs(); // Initial sync
        clock.addSeconds(2);

        // Mark as deleted remotely.
        const remoteJ = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileJ);
        inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(fileJ, {
            ...remoteJ,
            deleted: true,
            entryTime: clock.now()
        });
        // Modify locally with a newer timestamp.
        clock.addSeconds(1);
        addFileToObsidian(fileJ, localUpdatedContent, { mtime: clock.now() });
        (syncer as any)._touchedFilepaths.set(fileJ, clock.now());

        clock.addSeconds(1);
        await clock.executeTimeoutFuncs();

        // Verification: The local file should be uploaded, and the remote file "undeleted".
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(fileJ)?.deleted).toBe(
            false
        );
        const remoteJFinal = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries().find(
            (v) => v[1].path === fileJ
        );
        const decompressedJ = await CompressionUtils.decompressStringData(
            remoteJFinal![1].data!.toUint8Array(),
            "test"
        );
        expect(decompressedJ.unsafeUnwrap()).toBe(localUpdatedContent);
        expect(syncer.mapOfFileNodes.get(fileJ)?.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);

        syncer.teardown();
        expect(mockUnsubscribe).toHaveBeenCalled();
    });
});
