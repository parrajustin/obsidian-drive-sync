import { describe, it, expect, beforeEach, jest } from "@jest/globals";
import { App, TFile, TFolder, Vault, Stat } from "obsidian";
import { SyncerUpdateUtil } from "./syncer_update_util";
import { User, UserCredential } from "firebase/auth";
import { Firestore, getFirestore, setDoc, getDoc } from "firebase/firestore";
import { FilePathType } from "../filesystem/file_node";
import { LatestSyncConfigVersion, rootSyncTypeEnum } from "../schema/settings/syncer_config.schema";
import { ConvergenceUtil } from "./convergence_util";
import { MsFromEpoch } from "../types";
import * as progressView from '../sidepanel/progressView';
import { CompressionUtils } from "./compression_utils";

// Mock dependencies
jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })
}));


jest.mock("obsidian", () => ({
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
    normalizePath: (path: string) => path,
}), { virtual: true });


// Mock minimal obsidian environment
const mockObsidianFs = new Map<string, { content: Uint8Array; mtime: number; ctime: number; size: number }>();

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
                    mtime: Date.now(),
                    ctime: mockObsidianFs.get(path)?.ctime ?? Date.now(),
                    size: data.length,
                });
            }),
            stat: jest.fn(async (path: string) => {
                if (mockObsidianFs.has(path)) {
                    const file = mockObsidianFs.get(path)!;
                    return {
                        type: 'file',
                        mtime: file.mtime,
                        ctime: file.ctime,
                        size: file.size,
                    };
                }
                if (Array.from(mockObsidianFs.keys()).some(k => k.startsWith(path + '/'))) {
                    return { type: 'folder', mtime: 0, ctime: 0, size: 0 };
                }
                return null;
            }),
            mkdir: jest.fn(async (_path: string) => {
                // No-op for in-memory fs
            }),
        },
        readBinary: jest.fn(async (file: TFile) => {
            return (mockApp.vault.adapter.readBinary as jest.Mock)(file.path);
        }),
        getAbstractFileByPath: jest.fn((path: string) => {
            return (mockApp.vault.fileMap as any)[path] || null;
        }),
    },
    workspace: {
        onLayoutReady: jest.fn((cb: () => void) => cb()),
    }
} as unknown as App;


// In-memory Firestore
const mockFirebaseFs = new Map<string, any>();

jest.mock('firebase/firestore', () => {
    const originalFirestore = jest.requireActual('firebase/firestore') as any;
    return {
        getFirestore: jest.fn(() => ({} as Firestore)),
        doc: jest.fn((_firestore, path, ...pathSegments) => ({ path: [path, ...pathSegments].join('/') })),
        getDoc: jest.fn(async (docRef: { path: string }) => {
            const data = mockFirebaseFs.get(docRef.path);
            return {
                exists: () => !!data,
                data: () => data,
            };
        }),
        setDoc: jest.fn(async (docRef: { path: string }, data: any) => {
            mockFirebaseFs.set(docRef.path, data);
        }),
        Bytes: originalFirestore.Bytes,
    }
});


describe("SyncerUpdateUtil.executeLimitedSyncConvergence", () => {
    let mockDb: Firestore;
    let mockCreds: UserCredential;
    let mockSyncerConfig: LatestSyncConfigVersion;

    beforeEach(() => {
        jest.spyOn(progressView, 'GetOrCreateSyncProgressView').mockResolvedValue({
            addEntry: jest.fn(),
            setEntryProgress: jest.fn(),
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
            operationType: "signIn",
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
            sharedSettings: { pathToFolder: ""},
            firebaseCachePath: ""
        };
    });

    it("should handle a new local file by uploading it to firebase", async () => {
        // Arrange
        const filePath = "valid_file.md" as FilePathType;
        const fileContent = "This is a test file.";
        const fileContentBytes = new TextEncoder().encode(fileContent);
        const fileMtime = Date.now();
        const fileCtime = Date.now() - 1000;

        mockObsidianFs.set(filePath, {
            content: fileContentBytes,
            mtime: fileMtime,
            ctime: fileCtime,
            size: fileContentBytes.length,
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
        expect(uploadedDoc.path).toBe(filePath);

        const decompressedData = await CompressionUtils.decompressData(uploadedDoc.data.toUint8Array(), "test");

        expect(new TextDecoder().decode(decompressedData.unsafeUnwrap())).toBe(fileContent);
    });
});
