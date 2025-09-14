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
import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { TFile } from "obsidian";
import type { App, TFolder, Vault, Stat } from "obsidian";
import type { User, UserCredential } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { FakeClock } from "../clock";
import { FileSyncer } from "./syncer";
import { MainAppType } from "../main_app";
import { Some }from "../lib/option";
import * as progressView from "../sidepanel/progressView";
import { rootSyncTypeEnum, type LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { FileAccess } from "../filesystem/file_access";
import { Ok } from "../lib/result";
import type { LatestNotesSchema } from "../schema/notes/notes.schema";


// Mock dependencies
// jest.mock("../sync/firebase_cache"); - We are testing this
// jest.mock("../filesystem/file_access"); - We are testing this
jest.mock("../constants", () => jest.requireActual("../constants"));
jest.mock("../lib/sha", () => ({
    __esModule: true,
    default: jest.fn().mockReturnValue(new Uint8Array(32).fill(1))
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
                innerHTML: ''
            };
        },
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
            list: jest.fn(async (_path: string) => {
                return { files: [], folders: [] };
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
let onSnapshotCallback: any = null;

jest.mock("firebase/firestore", () => {
    const originalFirestore = jest.requireActual("firebase/firestore") as any;
    const firestore = {
        getFirestore: jest.fn(() => ({}) as Firestore),
        doc: jest.fn((_firestore, _path, ...pathSegments) => {
            const fullPath = pathSegments.join("/");
            return { path: fullPath, id: fullPath.split("/").pop()! };
        }),
        getDoc: jest.fn(async (docRef: { path: string }) => {
            const doc = mockFirebaseFs.get(docRef.path);
            return {
                exists: () => !!doc,
                data: () => {
                    if (!doc) return undefined;
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    const { content, ...rest } = doc as any;
                    return rest;
                }
            };
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
        onSnapshot: jest.fn((_query: any, options: any, next: any) => {
            const callback = typeof options === 'function' ? options : next;
            onSnapshotCallback = callback;
            const results: any[] = [];
            if (callback) {
                callback({ docs: results });
            }
            return jest.fn();
        }),
        getDocs: jest.fn(async (_query: any) => {
            return { docs: [] };
        }),
    };
    return firestore;
});

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
        jest.clearAllMocks();

        const mockView = {
            setSyncerStatus: jest.fn(),
            newSyncerCycle: jest.fn(),
            publishSyncerCycleDone: jest.fn(),
            setEntryProgress: jest.fn(),
            addEntry: jest.fn(),
            publishSyncerError: jest.fn(),
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
            rawFileSyncQuery: "f:never-match",
            obsidianFileSyncQuery: "f:.md$",
            fileIdFileQuery: "",
            enableFileIdWriting: false,
            nestedRootPath: "",
            sharedSettings: { pathToFolder: "" },
            firebaseCachePath: ".obsidian/drive-sync-cache.json"
        };
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
        const { Bytes } = jest.requireMock("firebase/firestore") as any;
        const firestore = jest.requireMock("firebase/firestore") as any;
        const firebaseFileContent = new Uint8Array([1, 2, 3, 4]);
        // This hash is the mocked return value from ../lib/sha
        const firebaseFileHash = "0101010101010101010101010101010101010101010101010101010101010101";
        mockFirebaseFs.set("notes/test-file.md", {
            // content is not a real field, just for our mock
            content: firebaseFileContent,

            // Schema fields
            version: 0,
            path: "test-file.md",
            cTime: 900000,
            mTime: 900000,
            size: firebaseFileContent.length,
            baseName: "test-file",
            ext: "md",
            userId: "test-user",
            deleted: false,
            fileHash: firebaseFileHash,
            vaultName: "test-vault",
            deviceId: "test-client-id",
            syncerConfigId: "test-syncer",
            entryTime: 900000,
            type: "Raw",
            data: Bytes.fromUint8Array(firebaseFileContent),
            fileStorageRef: null,
        } as any);

        (firestore.getDocs as jest.Mock).mockImplementation(async (_query: any) => {
             const results: any[] = [];
                for (const [path, doc] of mockFirebaseFs.entries()) {
                     results.push({
                        data: () => {
                            const { content, ...rest } = doc as any;
                            return rest;
                        },
                        id: path,
                        exists: () => true
                    });
                }
            return { docs: results };
        });

        // Act 1: First syncer runs, downloads file, writes cache.
        const syncerResult1 = await FileSyncer.constructFileSyncer(mockApp, mockPlugin, mockSyncerConfig, clock);
        const syncer1 = syncerResult1.unsafeUnwrap();
        await syncer1.init();
        // The tick is what actually runs the convergence logic
        await (syncer1 as any).fileSyncerTickLogic();
        syncer1.teardown();

        // Assert 1: Cache file and downloaded file exist.
        expect(mockObsidianFs.has(mockSyncerConfig.firebaseCachePath)).toBe(true);
        expect(mockObsidianFs.has("test-file.md")).toBe(true);
        const fileNode = (syncer1 as any)._mapOfFileNodes.get("test-file.md");
        expect(fileNode).toBeDefined();
        expect(fileNode.firebase).toBeDefined();
        expect(firestore.getDocs).toHaveBeenCalledTimes(1);

        // Arrange 2: Reset mock and prepare for second syncer.
        (firestore.getDocs as jest.Mock).mockClear();
        // Clear the file from the mock FS to ensure it's not re-downloaded
        // but loaded from cache
        mockFirebaseFs.clear();

        // Act 2: Second syncer runs, should load from cache.
        const syncerResult2 = await FileSyncer.constructFileSyncer(mockApp, mockPlugin, mockSyncerConfig, clock);
        const syncer2 = syncerResult2.unsafeUnwrap();
        await syncer2.init();

        // Assert 2: Firebase was not queried because cache was used.
        expect(firestore.getDocs).not.toHaveBeenCalled();
        const remoteFiles = await syncer2.getRemoteFilesForTesting();
        expect(remoteFiles.size).toBe(1);
        expect(remoteFiles.has("test-file.md")).toBe(true);

        syncer2.teardown();
    });
});
