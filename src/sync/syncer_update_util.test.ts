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

// Mock dependencies
jest.mock("../lib/sha", () => ({
    __esModule: true,
    default: jest.fn().mockReturnValue(new Uint8Array(32).fill(1))
}));
jest.mock("../constants", () => ({
    FileConst: {
        FILE_PATH: "local.filepath"
    }
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
const mockFirebaseFs = new Map<string, Partial<LatestNotesSchema>>();

const addFileToObsidian = (
    path: FilePathType,
    content: string,
    opts?: { ctime?: number; mtime?: number }
) => {
    const ctime = opts?.ctime ?? clock.now();
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

import { Bytes } from "firebase/firestore";
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
    return doc;
};

jest.mock("firebase/firestore", () => {
    const originalFirestore = jest.requireActual("firebase/firestore") as any;
    return {
        getFirestore: jest.fn(() => ({}) as Firestore),
        doc: jest.fn((_firestore, path, ...pathSegments) => {
            const fullPath = [path, ...pathSegments].join("/");
            const id = fullPath.split("/").pop()!;
            return { path: id };
        }),
        getDoc: jest.fn(async (docRef: { path: string }) => {
            const data = mockFirebaseFs.get(docRef.path);
            return {
                exists: () => !!data,
                data: () => data
            };
        }),
        setDoc: jest.fn(async (docRef: { path: string }, data: Partial<LatestNotesSchema>) => {
            mockFirebaseFs.set(docRef.path, data);
        }),
        Bytes: originalFirestore.Bytes
    };
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

        mockObsidianFs.clear();
        mockFirebaseFs.clear();
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
        const filePath = "valid_file.md" as FilePathType;
        const fileContent = "This is a test file.";
        const fileContentBytes = new TextEncoder().encode(fileContent);
        const fileMtime = clock.now();
        const fileCtime = clock.now() - 100;

        mockObsidianFs.set(filePath, {
            content: fileContentBytes,
            mtime: fileMtime,
            ctime: fileCtime,
            size: fileContentBytes.length
        });

        const tFile = new TFile();
        tFile.path = filePath;
        tFile.stat = { ctime: fileCtime, mtime: fileMtime, size: fileContentBytes.length };
        tFile.basename = "valid_file";
        tFile.extension = "md";
        tFile.vault = mockApp.vault;

        (mockApp.vault.fileMap as any)[filePath] = tFile;

        const touchedFiles = new Map<FilePathType, MsFromEpoch>([[filePath, fileMtime]]);

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
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds
        );

        // Assert
        expect(result.ok).toBe(true);
        expect(mockFirebaseFs.size).toBe(1);

        const uploadedDoc = Array.from(mockFirebaseFs.values())[0];
        expect(uploadedDoc).toBeDefined();
        expect(uploadedDoc?.path).toBe(filePath);
        expect(uploadedDoc?.data).toBeDefined();

        const decompressedData = await CompressionUtils.decompressData(
            uploadedDoc!.data!.toUint8Array()!,
            "test"
        );

        expect(new TextDecoder().decode(decompressedData.unsafeUnwrap())).toBe(fileContent);
    });

    it("should handle a mix of local-only, remote-only, and remote-deleted files", async () => {
        // Arrange
        addFileToObsidian("local1.md" as FilePathType, "local 1 content");
        addFileToObsidian("local2.md" as FilePathType, "local 2 content");
        await addFileToFirebase("remote1.md" as FilePathType, "remote 1 content");
        await addFileToFirebase("remote2.md" as FilePathType, "remote 2 content", { deleted: true });

        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["local1.md" as FilePathType, clock.now()],
            ["local2.md" as FilePathType, clock.now()]
        ]);
        const mapOfCloudData = new Map();
        for (const [path, data] of mockFirebaseFs.entries()) {
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
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds
        );

        // Assert
        expect(result.ok).toBe(true);
        const finalFileNodes = result.unsafeUnwrap();

        // Check firebase state
        expect(mockFirebaseFs.size).toBe(4);
        const fbDocs = Array.from(mockFirebaseFs.values());
        expect(fbDocs.find((d) => d?.path === "local1.md")?.deleted).toBe(false);
        expect(fbDocs.find((d) => d?.path === "local2.md")?.deleted).toBe(false);
        expect(fbDocs.find((d) => d?.path === "remote1.md")?.deleted).toBe(false);
        expect(fbDocs.find((d) => d?.path === "remote2.md")?.deleted).toBe(true);

        // Check local fs state
        expect(mockObsidianFs.has("local1.md")).toBe(true);
        expect(mockObsidianFs.has("local2.md")).toBe(true);
        expect(mockObsidianFs.has("remote1.md")).toBe(true);
        expect(mockObsidianFs.has("remote2.md")).toBe(false);

        // Check final node types
        expect(finalFileNodes.get("local1.md" as FilePathType)?.type).toBe("LOCAL_CLOUD");
        expect(finalFileNodes.get("local2.md" as FilePathType)?.type).toBe("LOCAL_CLOUD");
        expect(finalFileNodes.get("remote1.md" as FilePathType)?.type).toBe("LOCAL_CLOUD");
        expect(finalFileNodes.get("remote2.md" as FilePathType)?.type).toBe("REMOTE_ONLY");
    });

    it("should delete a local file when the remote is deleted and newer", async () => {
        // Arrange
        const filePath = "file.md" as FilePathType;
        const olderTime = clock.now() - 2000;
        const newerTime = clock.now() - 1000;

        addFileToObsidian(filePath, "old content", { mtime: olderTime });
        await addFileToFirebase(filePath, "remote content", { deleted: true, entryTime: newerTime });

        const mapOfCloudData = new Map();
        for (const [path, data] of mockFirebaseFs.entries()) {
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
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds
        );

        // Assert
        expect(result.ok).toBe(true);
        const finalFileNodes = result.unsafeUnwrap();

        expect(mockObsidianFs.has(filePath)).toBe(false);
        expect((mockApp.vault.adapter.trashSystem as jest.Mock).mock.calls.length).toBe(1);
        expect(finalFileNodes.get(filePath)?.type).toBe("REMOTE_ONLY");
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
        for (const [path, data] of mockFirebaseFs.entries()) {
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
        const result = await SyncerUpdateUtil.executeLimitedSyncConvergence(
            mockApp,
            mockDb,
            "test-client",
            mockSyncerConfig,
            actions,
            mockCreds
        );

        // Assert
        expect(result.ok).toBe(true);
        const finalFileNodes = result.unsafeUnwrap();

        const remoteDoc = mockFirebaseFs.get(filePath);
        expect(remoteDoc).toBeDefined();
        expect(remoteDoc?.deleted).toBe(false);

        const decompressedData = await CompressionUtils.decompressData(
            remoteDoc!.data!.toUint8Array()!,
            "test"
        );
        expect(new TextDecoder().decode(decompressedData.unsafeUnwrap())).toBe(newContent);

        expect(finalFileNodes.get(filePath)?.type).toBe("LOCAL_CLOUD");
    });
});
