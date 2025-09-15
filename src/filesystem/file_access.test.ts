/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/no-explicit-any */
/** @jest-environment node */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, jest, test, beforeEach, afterEach } from "@jest/globals";
import type { App, Stat, Vault, DataAdapter , TFolder, FileStats, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import { FileAccess } from "./file_access";
import { FileUtilObsidian } from "./file_util_obsidian_api";
import { FileUtilRaw } from "./file_util_raw_api";
import * as queryUtil from "../sync/query_util";
import { Ok, Err } from "../lib/result";
import { StatusError, ErrorCode } from "../lib/status_error";
import { Bytes } from "firebase/firestore";
import GetSha256Hash from "../lib/sha";
import { FileNodeType } from "./file_node";
import type {
    FilePathType,
    AllExistingFileNodeTypes,
    LocalOnlyFileNode,
    MissingFileNode,
    InvalidFileNode
} from "./file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { rootSyncTypeEnum } from "../schema/settings/syncer_config.schema";
import { Some, None } from "../lib/option";

// Mock the 'obsidian' module
jest.mock(
    "obsidian",
    () => ({
        __esModule: true,
        normalizePath: (path: string) => path,
        TFile: class FakeTFile implements TFile {
            stat: FileStats;
            basename: string;
            extension: string;
            vault: Vault;
            path: string;
            name: string;
            parent: TFolder | null;
},
        TFolder: class FakeTFolder implements TFolder {
            children: TAbstractFile[];
            vault: Vault;
            path: string;
            name: string;
            parent: TFolder | null;
            public isRoot(): boolean {
                throw new Error("Method not implemented.");
            }
},
    }),
    { virtual: true }
);

// Mock dependencies
jest.mock("./file_util_obsidian_api");
jest.mock("./file_util_raw_api");
jest.mock("../sync/query_util");
jest.mock("../lib/sha");
jest.mock("../constants", () => ({
    FileConst: {
        FILE_PATH: "file_path",
    }
}));

// Mock decorators and loggers to prevent tracing/logging timeouts
jest.mock('../logging/tracing/span.decorator', () => ({
    Span: () => (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}));
jest.mock('../logging/tracing/result_span.decorator', () => ({
    PromiseResultSpanError: () => (_target: any, _propertyKey: string, descriptor: PropertyDescriptor) => descriptor,
}));
jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
    })
}));


const mockFileUtilObsidian = jest.mocked(FileUtilObsidian);
const mockFileUtilRaw = jest.mocked(FileUtilRaw);
const mockQueryUtil = jest.mocked(queryUtil);
const mockGetSha256Hash = jest.mocked(GetSha256Hash);

const mockAdapter = {
    stat: jest.fn(),
    readBinary: jest.fn(),
    writeBinary: jest.fn(),
    mkdir: jest.fn(),
    trashSystem: jest.fn(),
    trashLocal: jest.fn(),
    getFullPath: jest.fn(),
    list: jest.fn(),
} as unknown as DataAdapter;

const mockVault = {
    getName: () => "test-vault",
    getAbstractFileByPath: jest.fn(),
    fileMap: {},
    adapter: mockAdapter,
} as unknown as Vault;

const mockApp = {
    vault: mockVault,
} as App;

const mockConfig: LatestSyncConfigVersion = {
    type: rootSyncTypeEnum.root,
    vaultName: "test-vault",
    syncerId: "test-syncer-id",
    maxUpdatePerSyncer: 50,
    dataStorageEncrypted: false,
    syncQuery: "*",
    rawFileSyncQuery: "",
    obsidianFileSyncQuery: "",
    fileIdFileQuery: "",
    enableFileIdWriting: false,
    nestedRootPath: "",
    sharedSettings: { pathToFolder: "" },
    firebaseCachePath: "",
    version: 0,
};

const createMockTFile = (path: FilePathType, stat: Partial<Stat> = {}): TFile => {
    const file = new TFile();

    Object.assign(file, {
        path,
        stat: { ctime: 1000, mtime: 2000, size: 100, ...stat },
        basename: path.split("/").pop()?.split(".")[0] ?? "",
        extension: path.split(".").pop() ?? "",
        vault: mockVault,
        name: path.split("/").pop() ?? "",
        parent: {} as TFolder,
    });

    return file;
};

const mockFileNode: LocalOnlyFileNode = {
    type: FileNodeType.LOCAL_ONLY_FILE,
    fileData: {
        fullPath: "test.md" as FilePathType,
        cTime: 1, mTime: 1, size: 1,
        baseName: "test", extension: "md",
        deleted: false, fileHash: "hash"
    },
    localTime: 1
};


describe("FileAccess", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockVault.fileMap = {};
        // Reset mocks on the adapter
        for (const key in mockAdapter) {
            const mockFn = mockAdapter[key as keyof DataAdapter];
            if (typeof mockFn === "function" && "mockClear" in mockFn) {
                (mockFn as jest.Mock).mockClear();
            }
        }
        // Default mock implementations
        mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
        mockQueryUtil.IsObsidianFile.mockReturnValue(false);
        mockQueryUtil.IsLocalFileRaw.mockReturnValue(false);
        (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockResolvedValue(null);
        mockGetSha256Hash.mockImplementation(
            (data) => new Uint8Array(Buffer.from(new TextDecoder().decode(data)))
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("getObsidianNode", () => {
        test("should return a LocalOnlyFileNode for a valid TFile", async () => {
            const filePath = "test.md" as FilePathType;
            const fileData = new Uint8Array([1, 2, 3]);
            const hash = "hash123";
            const mockTFile = createMockTFile(filePath, { size: 3 });

            (mockVault.fileMap as Record<string, TFile>)[filePath] = mockTFile;
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(Ok(fileData));
            mockGetSha256Hash.mockReturnValue(new Uint8Array(Buffer.from(hash)));

            const result = await FileAccess.getObsidianNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            const nodeOpt = result.unsafeUnwrap();
            expect(nodeOpt.some).toBe(true);
            const node = (nodeOpt as Some<LocalOnlyFileNode>).val;
            expect(node.type).toBe(FileNodeType.LOCAL_ONLY_FILE);
            expect(node.fileData.fullPath).toBe(filePath);
            expect(node.fileData.fileHash).toEqual(
                Bytes.fromUint8Array(new Uint8Array(Buffer.from(hash))).toBase64()
            );
            expect(mockFileUtilObsidian.readObsidianFile).toHaveBeenCalledWith(mockApp, filePath);
        });

        test("should return None if file is not a TFile instance", async () => {
            const filePath = "folder/" as FilePathType;
            (mockVault.fileMap as Record<string, unknown>)[filePath] = { path: filePath }; // Not a TFile instance

            const result = await FileAccess.getObsidianNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().some).toBe(false);
        });

        test("should return error if readObsidianFile fails", async () => {
            const filePath = "test.md" as FilePathType;
            const mockTFile = createMockTFile(filePath);
            (mockVault.fileMap as Record<string, TFile>)[filePath] = mockTFile;
            const readError = new StatusError(ErrorCode.UNKNOWN, "Read error");
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(Err(readError));

            const result = await FileAccess.getObsidianNode(mockApp, filePath);

            expect(result.err).toBe(true);
            expect(result.val).toBe(readError);
        });
    });

    describe("getRawNode", () => {
        test("should return a LocalOnlyFileNode for a valid raw file", async () => {
            const filePath = "image.png" as FilePathType;
            const fileData = new Uint8Array([4, 5, 6]);
            const hash = "hash456";
            const stat: Stat = { type: "file", ctime: 3000, mtime: 4000, size: 3 };

            (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockResolvedValue(stat);
            mockFileUtilRaw.readRawFile.mockResolvedValue(Ok(fileData));
            mockGetSha256Hash.mockReturnValue(new Uint8Array(Buffer.from(hash)));

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            const nodeOpt = result.unsafeUnwrap();
            expect(nodeOpt.some).toBe(true);
            const node = (nodeOpt as Some<LocalOnlyFileNode>).val;
            expect(node.type).toBe(FileNodeType.LOCAL_ONLY_FILE);
            expect(node.fileData.fullPath).toBe(filePath);
            expect(node.fileData.fileHash).toEqual(
                Bytes.fromUint8Array(new Uint8Array(Buffer.from(hash))).toBase64()
            );
            expect(mockAdapter.stat).toHaveBeenCalledWith(filePath);
            expect(mockFileUtilRaw.readRawFile).toHaveBeenCalledWith(mockApp, filePath);
        });

        test("should return None if path points to a folder", async () => {
            const filePath = "my-folder/" as FilePathType;
            const stat: Stat = { type: "folder", ctime: 1, mtime: 1, size: 1 };
            (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockResolvedValue(stat);

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().some).toBe(false);
        });

        test("should return None if stat returns null", async () => {
            const filePath = "not-exist.txt" as FilePathType;
            (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockResolvedValue(null);

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().some).toBe(false);
        });

        test("should return error if stat fails", async () => {
            const filePath = "error.txt" as FilePathType;
            const statError = new Error("Stat failed");
            (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockRejectedValue(statError);

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.err).toBe(true);
            expect((result.val as StatusError).message).toContain("Failed to stat error.txt");
        });

        test("should return error if readRawFile fails", async () => {
            const filePath = "image.png" as FilePathType;
            const stat: Stat = { type: "file", ctime: 1, mtime: 1, size: 1 };
            (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockResolvedValue(stat);
            const readError = new StatusError(ErrorCode.UNKNOWN, "Read error");
            mockFileUtilRaw.readRawFile.mockResolvedValue(Err(readError));

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.err).toBe(true);
            expect(result.val).toBe(readError);
        });
    });

    describe("getFileNode", () => {
        beforeEach(() => {
            jest.restoreAllMocks();
            // Spy on the static methods to mock their implementation for this describe block
            jest.spyOn(FileAccess, "getObsidianNode").mockResolvedValue(Ok(Some(mockFileNode)));
            jest.spyOn(FileAccess, "getRawNode").mockResolvedValue(Ok(Some(mockFileNode)));
        });

        test("should return InvalidFileNode if path is not acceptable and ignoreInvalidPath is true", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.getFileNode(
                mockApp, "p" as FilePathType, mockConfig, false, true
            );
            expect(result.ok).toBe(true);
            const node = result.unsafeUnwrap();
            expect(node.type).toBe(FileNodeType.INVALID);
            expect((node as InvalidFileNode).fileData.fullPath).toBe("p");
        });

        test("should return NotFoundError if path is not acceptable and ignoreInvalidPath is false", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.getFileNode(
                mockApp, "p" as FilePathType, mockConfig, false, false
            );
            expect(result.err).toBe(true);
            expect((result.val as StatusError).errorCode).toBe(ErrorCode.NOT_FOUND);
        });

        test("should call getObsidianNode and return a node for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            const result = await FileAccess.getFileNode(mockApp, "p" as FilePathType, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap()).toBe(mockFileNode);
            expect(FileAccess.getObsidianNode).toHaveBeenCalledWith(mockApp, "p");
            expect(FileAccess.getRawNode).not.toHaveBeenCalled();
        });

        test("should return MissingFileNode for a missing obsidian file if ignored", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            jest.spyOn(FileAccess, "getObsidianNode").mockResolvedValue(Ok(None));
            const result = await FileAccess.getFileNode(
                mockApp, "p" as FilePathType, mockConfig, true, false
            );
            expect(result.ok).toBe(true);
            const node = result.unsafeUnwrap();
            expect(node.type).toBe(FileNodeType.LOCAL_MISSING);
            expect((node as MissingFileNode).fileData.fullPath).toBe("p");
        });

        test("should call getRawNode and return a node for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            const result = await FileAccess.getFileNode(mockApp, "p" as FilePathType, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap()).toBe(mockFileNode);
            expect(FileAccess.getRawNode).toHaveBeenCalledWith(mockApp, "p");
            expect(FileAccess.getObsidianNode).not.toHaveBeenCalled();
        });

        test("should return MissingFileNode for a missing raw file if ignored", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            jest.spyOn(FileAccess, "getRawNode").mockResolvedValue(Ok(None));
            const result = await FileAccess.getFileNode(
                mockApp, "p" as FilePathType, mockConfig, true, false
            );
            expect(result.ok).toBe(true);
            const node = result.unsafeUnwrap();
            expect(node.type).toBe(FileNodeType.LOCAL_MISSING);
            expect((node as MissingFileNode).fileData.fullPath).toBe("p");
        });

        test("should return InvalidArgumentError for acceptable path that is neither obsidian nor raw", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(false);
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(false);
            const result = await FileAccess.getFileNode(mockApp, "p" as FilePathType, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).errorCode).toBe(ErrorCode.INVALID_ARGUMENT);
        });
    });

    describe("deleteFileNode", () => {
        const mockFileNodeToDelete = { fileData: { fullPath: "p" as FilePathType } } as AllExistingFileNodeTypes;

        beforeEach(() => {
            mockFileUtilObsidian.deleteObsidianFile.mockResolvedValue(Ok());
            mockFileUtilRaw.deleteRawFile.mockResolvedValue(Ok());
        });

        test("should return Ok and not call delete if path is not acceptable", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.deleteFileNode(mockApp, mockFileNodeToDelete, mockConfig);
            expect(result.ok).toBe(true);
            expect(mockFileUtilObsidian.deleteObsidianFile).not.toHaveBeenCalled();
            expect(mockFileUtilRaw.deleteRawFile).not.toHaveBeenCalled();
        });

        test("should call deleteObsidianFile for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            await FileAccess.deleteFileNode(mockApp, mockFileNodeToDelete, mockConfig);
            expect(mockFileUtilObsidian.deleteObsidianFile).toHaveBeenCalledWith(mockApp, "p");
            expect(mockFileUtilRaw.deleteRawFile).not.toHaveBeenCalled();
        });

        test("should call deleteRawFile for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            await FileAccess.deleteFileNode(mockApp, mockFileNodeToDelete, mockConfig);
            expect(mockFileUtilRaw.deleteRawFile).toHaveBeenCalledWith(mockApp, "p");
            expect(mockFileUtilObsidian.deleteObsidianFile).not.toHaveBeenCalled();
        });

        test("should return Ok if file does not exist but path is acceptable", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            mockFileUtilObsidian.deleteObsidianFile.mockResolvedValue(Ok());
            const result = await FileAccess.deleteFileNode(mockApp, mockFileNodeToDelete, mockConfig);
            expect(result.ok).toBe(true);
        });

        test("should propagate error from deleteObsidianFile", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            const deleteError = new StatusError(ErrorCode.UNKNOWN, "Delete failed");
            mockFileUtilObsidian.deleteObsidianFile.mockResolvedValue(Err(deleteError));
            const result = await FileAccess.deleteFileNode(mockApp, mockFileNodeToDelete, mockConfig);
            expect(result.err).toBe(true);
            expect(result.val).toBe(deleteError);
        });
    });

    describe("writeFileNode", () => {
        const data = new Uint8Array([1]);

        beforeEach(() => {
            mockFileUtilObsidian.writeToObsidianFile.mockResolvedValue(Ok());
            mockFileUtilRaw.writeToRawFile.mockResolvedValue(Ok());
        });

        test("should return NotFoundError if path is not acceptable", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).errorCode).toBe(ErrorCode.NOT_FOUND);
        });

        test("should call writeToObsidianFile for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(mockFileUtilObsidian.writeToObsidianFile).toHaveBeenCalledWith(
                mockApp, mockFileNode.fileData.fullPath, data, undefined
            );
            expect(mockFileUtilRaw.writeToRawFile).not.toHaveBeenCalled();
        });

        test("should call writeToRawFile for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(mockFileUtilRaw.writeToRawFile).toHaveBeenCalledWith(
                mockApp, mockFileNode.fileData.fullPath, data, undefined
            );
            expect(mockFileUtilObsidian.writeToObsidianFile).not.toHaveBeenCalled();
        });

        test("should return NotFoundError if path is acceptable but no type matches", async () => {
            const result = await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).errorCode).toBe(ErrorCode.NOT_FOUND);
            expect((result.val as StatusError).message).toContain("File node path didn't match any type");
        });

        test("should propagate error from writeToRawFile", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            const writeError = new StatusError(ErrorCode.UNKNOWN, "Write failed");
            mockFileUtilRaw.writeToRawFile.mockResolvedValue(Err(writeError));
            const result = await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(result.err).toBe(true);
            expect(result.val).toBe(writeError);
        });
    });

    describe("readFileNode", () => {
        const data = new Uint8Array([1, 2, 3]);

        beforeEach(() => {
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(Ok(data));
            mockFileUtilRaw.readRawFile.mockResolvedValue(Ok(data));
        });

        test("should return NotFoundError if path is not acceptable", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).errorCode).toBe(ErrorCode.NOT_FOUND);
        });

        test("should call readObsidianFile for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.val).toBe(data);
            expect(mockFileUtilObsidian.readObsidianFile).toHaveBeenCalledWith(mockApp, mockFileNode.fileData.fullPath);
        });

        test("should call readRawFile for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.val).toBe(data);
            expect(mockFileUtilRaw.readRawFile).toHaveBeenCalledWith(mockApp, mockFileNode.fileData.fullPath);
        });

        test("should return NotFoundError if path is acceptable but no type matches", async () => {
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).errorCode).toBe(ErrorCode.NOT_FOUND);
        });

        test("should propagate error from readObsidianFile", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            const readError = new StatusError(ErrorCode.UNKNOWN, "Read failed");
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(Err(readError));
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.err).toBe(true);
            expect(result.val).toBe(readError);
        });
    });

    describe("getTouchedFileNodes", () => {
        beforeEach(() => {
            jest.restoreAllMocks();
            jest.spyOn(FileAccess, "getFileNode").mockImplementation(
                async (_app, fullPath, _config, _ignoreMissing, _ignoreInvalid): Promise<any> => {
                    if (fullPath === "valid.md") {
                        return Ok({ type: FileNodeType.LOCAL_ONLY_FILE, fileData: { fullPath }, localTime: 0 });
                    }
                    if (fullPath === "missing.md") {
                        return Ok({ type: FileNodeType.LOCAL_MISSING, fileData: { fullPath }, localTime: 0 });
                    }
                    if (fullPath === "invalid.md" || fullPath === "not-found.md") {
                        return Ok({ type: FileNodeType.INVALID, fileData: { fullPath } });
                    }
                    return Err(new StatusError(ErrorCode.NOT_FOUND,"File not found"));
                }
            );

            (mockAdapter.stat as jest.MockedFunction<typeof mockAdapter.stat>).mockImplementation(async (path: string) => {
                if (path.includes("error-stat")) {
                    throw new Error("Stat failed");
                }
                if (path.includes("not-found")) {
                    return null;
                }
                return { type: "file", ctime: 1, mtime: 1, size: 1 };
            });
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        test("should process touched files and return a map of file nodes", async () => {
            const touchedFiles = new Map<FilePathType, number>([
                ["valid.md" as FilePathType, 12345],
                ["missing.md" as FilePathType, 67890],
                ["invalid.md" as FilePathType, 11223],
                ["not-found.md" as FilePathType, 44556]
            ]);

            const result = await FileAccess.getTouchedFileNodes(mockApp, mockConfig, touchedFiles);

            expect(result.ok).toBe(true);
            const nodes = result.unsafeUnwrap();
            expect(nodes.size).toBe(2);

            const validNode = nodes.get("valid.md" as FilePathType) as LocalOnlyFileNode;
            expect(validNode.type).toBe(FileNodeType.LOCAL_ONLY_FILE);
            expect(validNode.localTime).toBe(12345);

            const missingNode = nodes.get("missing.md" as FilePathType) as MissingFileNode;
            expect(missingNode.type).toBe(FileNodeType.LOCAL_MISSING);
            expect(missingNode.localTime).toBe(67890);
        });

        test("should propagate error when stat fails", async () => {
            const touchedFiles = new Map<FilePathType, number>([
                ["valid.md" as FilePathType, 12345],
                ["error-stat.md" as FilePathType, 54321],
            ]);

            const result = await FileAccess.getTouchedFileNodes(mockApp, mockConfig, touchedFiles);

            expect(result.err).toBe(true);
            expect((result.val as StatusError).message).toContain("File not found");
        });

        test("should propagate error when getFileNode fails", async () => {
            const getFileNodeError = new StatusError(ErrorCode.UNKNOWN, "GetFileNode failed");
            jest.spyOn(FileAccess, "getFileNode").mockResolvedValue(Err(getFileNodeError));
            const touchedFiles = new Map<FilePathType, number>([
                ["any.md" as FilePathType, 12345]
            ]);

            const result = await FileAccess.getTouchedFileNodes(mockApp, mockConfig, touchedFiles);

            expect(result.err).toBe(true);
            expect(result.val).toBe(getFileNodeError);
        });
    });

    describe("getAllFileNodes", () => {
        beforeEach(() => {
            jest.spyOn(FileAccess, "getFileNode").mockImplementation(
                async (_app, fullPath): Promise<any> => {
                    if ((fullPath as string).includes("fail-me")) {
                        return Err(new StatusError(ErrorCode.UNKNOWN, "GetFileNode failed"));
                    }
                    return Ok({
                        type: FileNodeType.LOCAL_ONLY_FILE,
                        fileData: { fullPath },
                    } as LocalOnlyFileNode);
                }
            );
        });

        test("should recursively list and return all acceptable file nodes", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
            (mockAdapter.list as jest.MockedFunction<typeof mockAdapter.list>).mockImplementation(async (path: string) => {
                if (path === "") {
                    return { folders: ["a"], files: ["b.md"] };
                }
                if (path === "a") {
                    return { folders: [], files: ["a/c.md"] };
                }
                return { folders: [], files: [] };
            });

            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.ok).toBe(true);
            const nodes = result.unsafeUnwrap();
            const paths = nodes.map((n) => n.fileData.fullPath);
            expect(paths).toContain("b.md");
            expect(paths).toContain("a/c.md");
        });

        test("should filter out unacceptable paths", async () => {
            mockQueryUtil.IsAcceptablePath.mockImplementation((path) => path !== "b.md");
             (mockAdapter.list as jest.MockedFunction<typeof mockAdapter.list>).mockImplementation(async (path: string) => {
                if (path === "") {
                    return { folders: ["a"], files: ["b.md"] };
                }
                if (path === "a") {
                    return { folders: [], files: ["a/c.md"] };
                }
                return { folders: [], files: [] };
            });

            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.ok).toBe(true);
            const nodes = result.unsafeUnwrap();
            expect(nodes.length).toBe(1);
            expect(nodes[0]?.fileData.fullPath).toBe("a/c.md");
        });

        test("should return error if adapter.list fails", async () => {
            (mockAdapter.list as jest.MockedFunction<typeof mockAdapter.list>).mockRejectedValue(new Error("List failed"));
            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).message).toContain("Failed to list()");
        });

        test("should return error if getFileNode fails", async () => {
            (mockAdapter.list as jest.MockedFunction<typeof mockAdapter.list>).mockResolvedValue({ folders: [], files: ["fail-me.md"] });
            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.err).toBe(true);
            expect((result.val as StatusError).message).toContain("GetFileNode failed");
        });
    });
});
