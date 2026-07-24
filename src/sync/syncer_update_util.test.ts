import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import type { App, TFolder, Vault, Stat } from "obsidian";
import { TFile } from "obsidian";
import { SyncerUpdateUtil } from "./syncer_update_util";
import type { User, UserCredential } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { getFirestore, setDoc, getDoc } from "firebase/firestore";
import type { FilePathType } from "../filesystem/file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { rootSyncTypeEnum } from "../schema/settings/syncer_config.schema";
import { ConvergenceUtil } from "./convergence_util";
import type { MsFromEpoch } from "../types";
import * as progressView from "../sidepanel/progressView";
import { CompressionUtils } from "./compression_utils";
import { FakeClock } from "../clock";
import type { LatestNotesSchema } from "../schema/notes/notes.schema";
import GetSha256Hash from "../lib/sha";
import { Bytes } from "firebase/firestore";
import { GetOrCreateSyncProgressView } from "../sidepanel/progressView";
import path from "path";
import {
    GetFakeCloudStorage,
    ResetFakeCloudStorage
} from "../../tests/fake_firebase/fake_cloud_storage";
import type { RemoteOnlyNode, AllExistingFileNodeTypes } from "../filesystem/file_node";
import { FileNodeType } from "../filesystem/file_node";
import type { ConvergenceStateReturnType } from "./convergence_util";

const { NOTES_MARKDOWN_FIREBASE_DB_NAME } = jest.requireActual("../constants") as {
    NOTES_MARKDOWN_FIREBASE_DB_NAME: "DB_NAME";
};

// Mock dependencies
jest.mock("../lib/sha", () => ({
    __esModule: true,
    default: jest.fn().mockReturnValue(new Uint8Array(32).fill(1))
}));
jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

jest.mock(
    "obsidian",
    () => ({
        ItemView: class {},
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
        normalizePath: (path: string) => path
    }),
    { virtual: true }
);

// Mock minimal obsidian environment
const mockObsidianFs = new Map<
    string,
    { content: Uint8Array; mtime: number; ctime: number; size: number }
>();

const clock = new FakeClock(1000);
const mockApp = {
    vault: {
        fileMap: {} as Record<string, TFile>,
        adapter: {
            readBinary: jest.fn(async (path: string) => {
                if (mockObsidianFs.has(path)) {
                    return mockObsidianFs.get(path)!.content;
                }
                throw new Error("File not found");
            }),
            writeBinary: jest.fn(async (path: string, data: Uint8Array) => {
                mockObsidianFs.set(path, {
                    content: data,
                    mtime: clock.now(),
                    ctime: mockObsidianFs.get(path)?.ctime ?? clock.now(),
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
        })
    },
    workspace: {
        onLayoutReady: jest.fn((cb: () => void) => {
            cb();
        })
    }
} as unknown as App;

// In-memory Firestore
const inMemoryFirestoreFS = {
    [NOTES_MARKDOWN_FIREBASE_DB_NAME]: new Map<string, Partial<LatestNotesSchema>>()
};

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
    return doc;
};

jest.mock("firebase/firestore", () => {
    const originalFirestore = jest.requireActual("firebase/firestore") as any;
    return {
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
        setDoc: jest.fn(async (docRef: { path: string }, data: Partial<LatestNotesSchema>) => {
            const parsedPath = path.parse(docRef.path);
            if (parsedPath.dir !== NOTES_MARKDOWN_FIREBASE_DB_NAME) {
                return;
            }
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(parsedPath.base, data);
        }),
        updateDoc: jest.fn(async (docRef: { path: string }, data: Partial<LatestNotesSchema>) => {
            const parsedPath = path.parse(docRef.path);
            const existing = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(
                parsedPath.base
            );
            if (parsedPath.dir !== NOTES_MARKDOWN_FIREBASE_DB_NAME || !existing) {
                throw new Error(`not-found: ${docRef.path}`);
            }
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(parsedPath.base, {
                ...(existing as any),
                ...(data as any)
            } as Partial<LatestNotesSchema>);
        }),
        Bytes: originalFirestore.Bytes
    };
});

jest.mock("firebase/storage", () => {
    const sdk =
        require("../../tests/fake_firebase/fake_cloud_storage") as typeof import("../../tests/fake_firebase/fake_cloud_storage");
    return sdk.CreateStorageSdkMock();
});

describe("SyncerUpdateUtil.executeLimitedSyncConvergence", () => {
    let mockDb: Firestore;
    let mockCreds: UserCredential;
    let mockSyncerConfig: LatestSyncConfigVersion;

    beforeEach(() => {
        jest.spyOn(progressView, "GetOrCreateSyncProgressView").mockResolvedValue({
            addEntry: jest.fn(),
            setEntryProgress: jest.fn()
        } as any);

        ResetFakeCloudStorage();
        mockObsidianFs.clear();
        inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].clear();
        (mockApp.vault.fileMap as any) = {};
        (mockApp.vault.adapter.readBinary as jest.Mock).mockClear();
        (mockApp.vault.adapter.writeBinary as jest.Mock).mockClear();
        (mockApp.vault.adapter.stat as jest.Mock).mockClear();
        (mockApp.vault.adapter.mkdir as jest.Mock).mockClear();
        (mockApp.vault.getAbstractFileByPath as jest.Mock).mockClear();
        (getDoc as jest.Mock).mockClear();
        (setDoc as jest.Mock).mockClear();

        mockDb = getFirestore();
        mockCreds = {
            user: { uid: "test-user" } as User,
            providerId: "google.com",
            operationType: "signIn"
        } as UserCredential;
        mockSyncerConfig = {
            version: 0,
            type: rootSyncTypeEnum.root,
            syncerId: "test-syncer",
            maxUpdatePerSyncer: 10,
            vaultName: "test-vault",
            dataStorageEncrypted: false,
            syncQuery: "",
            rawFileSyncQuery: "",
            obsidianFileSyncQuery: "f:.md$",
            fileIdFileQuery: "",
            enableFileIdWriting: false,
            nestedRootPath: "",
            sharedSettings: { pathToFolder: "" },
            firebaseCachePath: ""
        };
    });

    it("should handle a new local file by uploading it to firebase", async () => {
        // Arrange
        const fileContent = "This is a test file.";
        const filePath = "valid_file.md";
        addFileToObsidian("valid_file.md" as FilePathType, fileContent);

        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["valid_file.md" as FilePathType, clock.now()]
        ]);

        const convergenceResult = await ConvergenceUtil.createStateConvergenceActions(
            mockApp,
            mockSyncerConfig,
            new Map(),
            touchedFiles,
            new Map()
        );

        expect(convergenceResult.ok).toBe(true);
        const actions = convergenceResult.unsafeUnwrap();
        expect(actions.actions.length).toBe(1);

        // Act
        const view = await GetOrCreateSyncProgressView(mockApp, /*reveal=*/ false);
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds,
            view
        );

        // Assert
        expect(result.ok).toBe(true);
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].size).toBe(1);

        const uploadedDoc = Array.from(
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].values()
        )[0];
        expect(uploadedDoc).toBeDefined();
        expect(uploadedDoc?.path).toBe(filePath);
        expect(uploadedDoc?.data).toBeDefined();

        const decompressedData = await CompressionUtils.decompressStringData(
            uploadedDoc!.data!.toUint8Array()!,
            "test"
        );
        expect(decompressedData.ok).toBe(true);
        expect(decompressedData.unsafeUnwrap()).toBe(fileContent);
    });

    it("should handle a mix of local-only, remote-only, and remote-deleted files", async () => {
        // local only file.
        addFileToObsidian("local1.md" as FilePathType, "local 1 content");
        // local only file.
        addFileToObsidian("local2.md" as FilePathType, "local 2 content");
        // remote only file.
        await addFileToFirebase("remote1.md" as FilePathType, "remote 1 content");
        // deleted remote only file.
        await addFileToFirebase("remote2.md" as FilePathType, "remote 2 content", {
            deleted: true
        });

        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["local1.md" as FilePathType, clock.now()],
            ["local2.md" as FilePathType, clock.now()]
        ]);
        const mapOfCloudData = new Map();
        for (const [path, data] of inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries()) {
            mapOfCloudData.set(path, { id: path, data });
        }

        const convergenceResult = await ConvergenceUtil.createStateConvergenceActions(
            mockApp,
            mockSyncerConfig,
            new Map(),
            touchedFiles,
            mapOfCloudData
        );

        expect(convergenceResult.ok).toBe(true);
        const actions = convergenceResult.unsafeUnwrap();
        expect(actions.actions.length).toBe(3);

        // Act
        const view = await GetOrCreateSyncProgressView(mockApp, /*reveal=*/ false);
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds,
            view
        );

        // Assert
        expect(result.ok).toBe(true);
        const finalFileNodes = result.unsafeUnwrap();

        // Check firebase state
        expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].size).toBe(4);
        const fbDocs = Array.from(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].values());
        expect(fbDocs.find((d) => d.path === "local1.md")).toBeDefined();
        expect(fbDocs.find((d) => d.path === "local1.md")?.deleted).toBe(false);
        expect(fbDocs.find((d) => d.path === "local2.md")).toBeDefined();
        expect(fbDocs.find((d) => d.path === "local2.md")?.deleted).toBe(false);
        expect(fbDocs.find((d) => d.path === "remote1.md")).toBeDefined();
        expect(fbDocs.find((d) => d.path === "remote1.md")?.deleted).toBe(false);
        expect(fbDocs.find((d) => d.path === "remote2.md")).toBeDefined();
        expect(fbDocs.find((d) => d.path === "remote2.md")?.deleted).toBe(true);

        // Check local fs state
        expect(mockObsidianFs.has("local1.md")).toBe(true);
        expect(mockObsidianFs.has("local2.md")).toBe(true);
        expect(mockObsidianFs.has("remote1.md")).toBe(true);
        expect(mockObsidianFs.has("remote2.md")).toBe(false);

        // Check final node types
        expect(finalFileNodes.mapOfFileNodes.get("local1.md" as FilePathType)?.type).toBe(
            "LOCAL_CLOUD"
        );
        expect(finalFileNodes.mapOfFileNodes.get("local2.md" as FilePathType)?.type).toBe(
            "LOCAL_CLOUD"
        );
        expect(finalFileNodes.mapOfFileNodes.get("remote1.md" as FilePathType)?.type).toBe(
            "LOCAL_CLOUD"
        );
        expect(finalFileNodes.mapOfFileNodes.get("remote2.md" as FilePathType)?.type).toBe(
            "REMOTE_ONLY"
        );
    });

    it("should delete a local file when the remote is deleted and newer", async () => {
        // Arrange
        const filePath = "file.md" as FilePathType;
        const olderTime = clock.now() - 2000;
        const newerTime = clock.now() - 1000;

        addFileToObsidian(filePath, "old content", { mtime: olderTime });
        await addFileToFirebase(filePath, "remote content", {
            deleted: true,
            entryTime: newerTime
        });

        const mapOfCloudData = new Map();
        for (const [path, data] of inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries()) {
            mapOfCloudData.set(path, { id: path, data });
        }

        const convergenceResult = await ConvergenceUtil.createStateConvergenceActions(
            mockApp,
            mockSyncerConfig,
            new Map(),
            new Map([[filePath, olderTime]]),
            mapOfCloudData
        );

        expect(convergenceResult.ok).toBe(true);
        const actions = convergenceResult.unsafeUnwrap();
        expect(actions.actions.length).toBe(1);
        expect(actions.actions[0]?.action).toBe("DELETE_LOCAL_FILE");

        // Act
        const view = await GetOrCreateSyncProgressView(mockApp, /*reveal=*/ false);
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds,
            view
        );

        // Assert
        expect(result.ok).toBe(true);
        const finalFileNodes = result.unsafeUnwrap();

        expect(mockObsidianFs.has(filePath)).toBe(false);
        expect((mockApp.vault.adapter.trashSystem as jest.Mock).mock.calls.length).toBe(1);
        expect(finalFileNodes.mapOfFileNodes.get(filePath)?.type).toBe("REMOTE_ONLY");
    });

    it("should undelete a remote file when the local file is newer", async () => {
        // Arrange
        const filePath = "file.md" as FilePathType;
        const olderTime = clock.now() - 2000;
        const newerTime = clock.now() - 1000;
        const newContent = "this is new content";

        addFileToObsidian(filePath, newContent, { mtime: newerTime });
        await addFileToFirebase(filePath, "old content", { deleted: true, entryTime: olderTime });

        const mapOfCloudData = new Map();
        for (const [path, data] of inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries()) {
            mapOfCloudData.set(path, { id: path, data });
        }

        const convergenceResult = await ConvergenceUtil.createStateConvergenceActions(
            mockApp,
            mockSyncerConfig,
            new Map(),
            new Map([[filePath, newerTime]]),
            mapOfCloudData
        );

        expect(convergenceResult.ok).toBe(true);
        const actions = convergenceResult.unsafeUnwrap();
        expect(actions.actions.length).toBe(1);
        expect(actions.actions[0]?.action).toBe("UPDATE_CLOUD");

        // Act
        const view = await GetOrCreateSyncProgressView(mockApp, /*reveal=*/ false);
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds,
            view
        );

        // Assert
        expect(result.ok).toBe(true);
        const finalFileNodes = result.unsafeUnwrap();

        const remoteDoc = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(filePath);
        expect(remoteDoc).toBeDefined();
        expect(remoteDoc?.deleted).toBe(false);

        const decompressedData = await CompressionUtils.decompressData(
            remoteDoc!.data!.toUint8Array()!,
            "test"
        );
        expect(new TextDecoder().decode(decompressedData.unsafeUnwrap())).toBe(newContent);

        expect(finalFileNodes.mapOfFileNodes.get(filePath)?.type).toBe("LOCAL_CLOUD");
    });

    /** Deterministic pseudo-random printable content that stays >100KB after gzip. */
    const makeBigContent = (length: number): string => {
        let seed = 123456789;
        const chars = new Array<string>(length);
        for (let i = 0; i < length; i++) {
            seed = (Math.imul(seed, 48271) >>> 0) % 2147483647;
            chars[i] = String.fromCharCode(33 + (seed % 90));
        }
        return chars.join("");
    };

    const makeBaseDoc = (path: FilePathType, entryTime: number) => ({
        path,
        cTime: entryTime,
        mTime: entryTime,
        size: 10,
        baseName: path.split(".")[0]!,
        ext: "md",
        userId: "test-user",
        deleted: false,
        fileHash: "some-hash",
        vaultName: "test-vault",
        deviceId: "other-device",
        syncerConfigId: "other-syncer",
        entryTime,
        version: 0 as const
    });

    const makeRefDoc = (
        path: FilePathType,
        fileStorageRef: string,
        entryTime: number
    ): LatestNotesSchema => ({
        ...makeBaseDoc(path, entryTime),
        type: "Ref",
        data: null,
        fileStorageRef
    });

    const makeRawCacheDoc = (path: FilePathType, entryTime: number): LatestNotesSchema => ({
        ...makeBaseDoc(path, entryTime),
        type: "Raw-Cache",
        data: null,
        fileStorageRef: null
    });

    const runConvergence = async (
        mapOfFileNodes: Map<FilePathType, AllExistingFileNodeTypes>,
        touchedFiles: Map<FilePathType, MsFromEpoch>,
        mapOfCloudData: Map<string, { id: string; data: LatestNotesSchema }>
    ) => {
        const convergenceResult = await ConvergenceUtil.createStateConvergenceActions(
            mockApp,
            mockSyncerConfig,
            mapOfFileNodes,
            touchedFiles,
            mapOfCloudData as any
        );
        expect(convergenceResult.ok).toBe(true);
        return convergenceResult.unsafeUnwrap();
    };

    const executeActions = async (actions: ConvergenceStateReturnType) => {
        const view = await GetOrCreateSyncProgressView(mockApp, /*reveal=*/ false);
        return SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds,
            view
        );
    };

    describe("no-op cycles", () => {
        it("returns zero actions when there is nothing to converge", async () => {
            const result = await executeActions({ mapOfFileNodes: new Map(), actions: [] });
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().numberOfActions).toBe(0);
            expect(result.unsafeUnwrap().mapOfFileNodes.size).toBe(0);
        });
    });

    describe("big file uploads (>100KB compressed)", () => {
        it("uploads to cloud storage and writes a Ref doc to firestore", async () => {
            const bigContent = makeBigContent(300000);
            const filePath = "big.md" as FilePathType;
            addFileToObsidian(filePath, bigContent);

            const actions = await runConvergence(
                new Map(),
                new Map([[filePath, clock.now()]]),
                new Map()
            );
            expect(actions.actions.length).toBe(1);

            const result = await executeActions(actions);
            expect(result.ok).toBe(true);

            // A single "Ref" doc landed in firestore pointing at cloud storage.
            expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].size).toBe(1);
            const [docId, uploadedDoc] = Array.from(
                inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].entries()
            )[0]!;
            expect(uploadedDoc.type).toBe("Ref");
            expect(uploadedDoc.data).toBeNull();
            expect(uploadedDoc.path).toBe(filePath);
            expect(uploadedDoc.fileStorageRef).toMatch(/^test-user\/test-vault\//);

            // The compressed payload landed in fake cloud storage and survives a roundtrip.
            const stored = GetFakeCloudStorage().peekObject(uploadedDoc.fileStorageRef!);
            expect(stored).toBeDefined();
            expect(stored!.data.byteLength).toBeGreaterThan(100000);
            const decompressed = await CompressionUtils.decompressData(
                new Uint8Array(stored!.data),
                "test"
            );
            expect(decompressed.ok).toBe(true);
            expect(new TextDecoder().decode(decompressed.unsafeUnwrap())).toBe(bigContent);

            // The returned node references the bare firestore doc id, not a path.
            const node = result.unsafeUnwrap().mapOfFileNodes.get(filePath)!;
            expect(node.type).toBe("LOCAL_CLOUD");
            expect((node as any).firebaseData.id).toBe(docId);
            expect((node as any).firebaseData.id).not.toContain("/");
            expect((node as any).firebaseData.data.type).toBe("Ref");
        });

        it("propagates a cloud storage upload failure and marks the entry failed", async () => {
            const filePath = "big.md" as FilePathType;
            addFileToObsidian(filePath, makeBigContent(300000));
            const actions = await runConvergence(
                new Map(),
                new Map([[filePath, clock.now()]]),
                new Map()
            );

            GetFakeCloudStorage().failNextUpload(new Error("storage/unauthorized"));
            const result = await executeActions(actions);

            expect(result.err).toBe(true);
            expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].size).toBe(0);
            expect(GetFakeCloudStorage().objectCount).toBe(0);
            const view = await GetOrCreateSyncProgressView(mockApp, /*reveal=*/ false);
            expect(view.setEntryProgress).toHaveBeenCalledWith("test-syncer", filePath, -1.0);
        });

        it("propagates a firestore Ref doc write failure after the storage upload", async () => {
            const filePath = "big.md" as FilePathType;
            addFileToObsidian(filePath, makeBigContent(300000));
            const actions = await runConvergence(
                new Map(),
                new Map([[filePath, clock.now()]]),
                new Map()
            );

            (setDoc as jest.Mock).mockRejectedValueOnce(new Error("permission-denied") as never);
            const result = await executeActions(actions);

            expect(result.err).toBe(true);
            // The object was uploaded but the Ref doc write failed.
            expect(GetFakeCloudStorage().objectCount).toBe(1);
            expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].size).toBe(0);
        });
    });

    describe("local updates from Ref nodes (cloud storage)", () => {
        const seedStorageObject = async (fullPath: string, content: string) => {
            const compressed = await CompressionUtils.compressData(
                new TextEncoder().encode(content),
                "test"
            );
            await GetFakeCloudStorage().uploadBytes({ fullPath }, compressed.unsafeUnwrap());
        };

        it("downloads the payload from cloud storage and writes the local file", async () => {
            const filePath = "ref.md" as FilePathType;
            const content = "content stored in cloud storage";
            const storageRef = "test-user/test-vault/obj-1";
            await seedStorageObject(storageRef, content);

            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([
                    [
                        filePath,
                        { id: "doc-ref", data: makeRefDoc(filePath, storageRef, clock.now()) }
                    ]
                ])
            );
            expect(actions.actions.length).toBe(1);
            expect(actions.actions[0]?.action).toBe("UPDATE_LOCAL");

            const result = await executeActions(actions);
            expect(result.ok).toBe(true);

            expect(mockObsidianFs.has(filePath)).toBe(true);
            expect(new TextDecoder().decode(mockObsidianFs.get(filePath)!.content)).toBe(content);
            const node = result.unsafeUnwrap().mapOfFileNodes.get(filePath)!;
            expect(node.type).toBe("LOCAL_CLOUD");
            expect((node as any).firebaseData.id).toBe("doc-ref");
        });

        it("propagates a cloud storage download failure", async () => {
            const filePath = "ref.md" as FilePathType;
            const storageRef = "test-user/test-vault/obj-1";
            await seedStorageObject(storageRef, "content");

            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([
                    [
                        filePath,
                        { id: "doc-ref", data: makeRefDoc(filePath, storageRef, clock.now()) }
                    ]
                ])
            );

            GetFakeCloudStorage().failNextDownload(new Error("storage/retry-limit-exceeded"));
            const result = await executeActions(actions);

            expect(result.err).toBe(true);
            expect(mockObsidianFs.has(filePath)).toBe(false);
        });

        it("errors when the Ref node has no file storage ref", async () => {
            const filePath = "ref.md" as FilePathType;
            const badDoc = makeRefDoc(filePath, /*fileStorageRef=*/ null as never, clock.now());

            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([[filePath, { id: "doc-ref", data: badDoc }]])
            );
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });

        it("errors when the stored payload is not valid gzip data", async () => {
            const filePath = "ref.md" as FilePathType;
            const storageRef = "test-user/test-vault/obj-corrupt";
            await GetFakeCloudStorage().uploadBytes(
                { fullPath: storageRef },
                new Uint8Array([1, 2, 3, 4]).buffer
            );

            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([
                    [
                        filePath,
                        { id: "doc-ref", data: makeRefDoc(filePath, storageRef, clock.now()) }
                    ]
                ])
            );
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });
    });

    describe("local updates from Raw-Cache nodes (firestore refetch)", () => {
        it("errors when the full firestore doc is missing", async () => {
            const filePath = "cache.md" as FilePathType;
            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([
                    [filePath, { id: "missing-doc", data: makeRawCacheDoc(filePath, clock.now()) }]
                ])
            );
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });

        it("errors when the firestore fetch rejects", async () => {
            const filePath = "cache.md" as FilePathType;
            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([[filePath, { id: "doc-1", data: makeRawCacheDoc(filePath, clock.now()) }]])
            );

            (getDoc as jest.Mock).mockRejectedValueOnce(new Error("network") as never);
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });

        it("errors when the fetched doc fails schema validation", async () => {
            const filePath = "cache.md" as FilePathType;
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set("doc-bad", {
                version: 9999
            } as any);

            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([
                    [filePath, { id: "doc-bad", data: makeRawCacheDoc(filePath, clock.now()) }]
                ])
            );
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });

        it("errors when the fetched doc is a Ref instead of Raw", async () => {
            const filePath = "cache.md" as FilePathType;
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].set(
                "doc-ref-type",
                makeRefDoc(filePath, "test-user/test-vault/obj-1", clock.now())
            );

            const actions = await runConvergence(
                new Map(),
                new Map(),
                new Map([
                    [filePath, { id: "doc-ref-type", data: makeRawCacheDoc(filePath, clock.now()) }]
                ])
            );
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });
    });

    describe("marking cloud files deleted", () => {
        it("marks the firestore doc deleted when the local file was removed", async () => {
            const filePath = "gone.md" as FilePathType;
            const cloudTime = clock.now() - 1000;
            const localDeleteTime = clock.now();
            const doc = await addFileToFirebase(filePath, "content", { entryTime: cloudTime });

            const remoteNode: RemoteOnlyNode = {
                type: FileNodeType.REMOTE_ONLY,
                fileData: { fullPath: filePath },
                localTime: localDeleteTime,
                firebaseData: { id: filePath, data: doc }
            };
            const actions = await runConvergence(
                new Map<FilePathType, AllExistingFileNodeTypes>([[filePath, remoteNode]]),
                new Map(),
                new Map([[filePath, { id: filePath, data: doc }]])
            );
            expect(actions.actions.length).toBe(1);
            expect(actions.actions[0]?.action).toBe("MARK_CLOUD_DELETED");

            const result = await executeActions(actions);
            expect(result.ok).toBe(true);

            const storedDoc = inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].get(filePath);
            expect(storedDoc?.deleted).toBe(true);
            expect(storedDoc?.entryTime).toBe(localDeleteTime);
            // The rest of the doc is untouched.
            expect(storedDoc?.path).toBe(filePath);

            const node = result.unsafeUnwrap().mapOfFileNodes.get(filePath)!;
            expect(node.type).toBe("REMOTE_ONLY");
            expect((node as any).firebaseData.data.deleted).toBe(true);
            expect((node as any).firebaseData.data.entryTime).toBe(localDeleteTime);
        });

        it("propagates a failure to update the firestore doc", async () => {
            const filePath = "gone.md" as FilePathType;
            const doc = await addFileToFirebase(filePath, "content", {
                entryTime: clock.now() - 1000
            });
            // Remove the doc so updateDoc rejects.
            inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].clear();

            const remoteNode: RemoteOnlyNode = {
                type: FileNodeType.REMOTE_ONLY,
                fileData: { fullPath: filePath },
                localTime: clock.now(),
                firebaseData: { id: filePath, data: doc }
            };
            const actions = await runConvergence(
                new Map<FilePathType, AllExistingFileNodeTypes>([[filePath, remoteNode]]),
                new Map(),
                new Map([[filePath, { id: filePath, data: doc }]])
            );
            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });
    });

    describe("cloud update error propagation", () => {
        it("propagates a local read failure", async () => {
            const filePath = "vanish.md" as FilePathType;
            addFileToObsidian(filePath, "content");
            const actions = await runConvergence(
                new Map(),
                new Map([[filePath, clock.now()]]),
                new Map()
            );
            // The file disappears between convergence and execution.
            mockObsidianFs.delete(filePath);

            const result = await executeActions(actions);
            expect(result.err).toBe(true);
        });

        it("propagates a firestore write failure for small files", async () => {
            const filePath = "small.md" as FilePathType;
            addFileToObsidian(filePath, "small content");
            const actions = await runConvergence(
                new Map(),
                new Map([[filePath, clock.now()]]),
                new Map()
            );

            (setDoc as jest.Mock).mockRejectedValueOnce(new Error("permission-denied") as never);
            const result = await executeActions(actions);

            expect(result.err).toBe(true);
            expect(inMemoryFirestoreFS[NOTES_MARKDOWN_FIREBASE_DB_NAME].size).toBe(0);
        });

        it("propagates a compression failure", async () => {
            const filePath = "compress.md" as FilePathType;
            addFileToObsidian(filePath, "content");
            const actions = await runConvergence(
                new Map(),
                new Map([[filePath, clock.now()]]),
                new Map()
            );

            const origCompress = CompressionUtils.compressData;
            CompressionUtils.compressData = jest.fn().mockResolvedValueOnce({
                ok: false,
                err: true,
                val: { with: jest.fn() },
                safeUnwrap: () => {
                    throw new Error();
                },
                unsafeUnwrapErr: () => new Error("compress error")
            } as never) as any;

            try {
                const result = await executeActions(actions);
                expect(result.err).toBe(true);
            } finally {
                CompressionUtils.compressData = origCompress;
            }
        });

        it("propagates a local delete failure", async () => {
            const filePath = "delete.md" as FilePathType;
            addFileToObsidian(filePath, "content");

            // Set up a convergence where the file is deleted on cloud
            const doc = await addFileToFirebase(filePath, "content", {
                entryTime: clock.now() - 1000
            });
            doc.deleted = true; // Mark as deleted on cloud
            doc.entryTime = clock.now() + 1000; // Newer on cloud

            const actions = await runConvergence(
                new Map([
                    [
                        filePath,
                        {
                            type: "LOCAL_CLOUD",
                            localTime: clock.now(),
                            firebaseData: { id: filePath, data: doc },
                            fileData: { fullPath: filePath }
                        } as any
                    ]
                ]),
                new Map([[filePath, clock.now()]]),
                new Map([[filePath, { id: filePath, data: doc }]])
            );

            // Mock trash to reject
            const origTrash = mockApp.vault.adapter.trashSystem;
            mockApp.vault.adapter.trashSystem = jest
                .fn()
                .mockRejectedValueOnce(new Error("trash failed") as never) as any;

            try {
                const result = await executeActions(actions);
                expect(result.err).toBe(true);
            } finally {
                mockApp.vault.adapter.trashSystem = origTrash;
            }
        });
    });
});
