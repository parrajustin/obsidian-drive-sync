/* eslint-disable @typescript-eslint/no-empty-function */
/* eslint-disable prettier/prettier */
/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
import { describe, expect, jest, test, beforeEach } from "@jest/globals";
import type { App, TFile, Stat, TFolder, Vault } from "obsidian";
import { FileAccess } from "./file_access";
import { FileUtilObsidian } from "./file_util_obsidian_api";
import { FileUtilRaw } from "./file_util_raw_api";
import * as queryUtil from "../sync/query_util";
import type { Result } from "../lib/result";
import { Ok, Err } from "../lib/result";
import { NotFoundError, StatusError, ErrorCode } from "../lib/status_error";
import { Bytes } from "firebase/firestore";
import GetSha256Hash from "../lib/sha";
import { FileNodeType } from "./file_node";
import type {
    FilePathType,
    AllExistingFileNodeTypes,
    LocalFileNodeTypes,
    LocalOnlyFileNode,
    MissingFileNode,
    InvalidFileNode
} from "./file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { RootSyncType } from "../schema/settings/syncer_config.schema";
import { Some, None } from "../lib/option";


// Mock the 'obsidian' module
jest.mock(
    "obsidian",
    () => ({
        __esModule: true,
        normalizePath: (path: string) => path,
        TFile: class TFile {}
    }),
    { virtual: true }
);

// Mock dependencies
jest.mock("./file_util_obsidian_api");
jest.mock("./file_util_raw_api");
jest.mock("../sync/query_util");
jest.mock("../lib/sha");

const mockFileUtilObsidian = jest.mocked(FileUtilObsidian);
const mockFileUtilRaw = jest.mocked(FileUtilRaw);
const mockQueryUtil = jest.mocked(queryUtil);
const mockGetSha256Hash = jest.mocked(GetSha256Hash);

const mockVault = {
    getName: () => "test-vault",
    getAbstractFileByPath: jest.fn()
    // Add other mocked methods and properties as needed by the code under test
} as unknown as Vault;

const mockApp = {
    vault: {
        ...mockVault,
        fileMap: {},
        adapter: {
            stat: jest.fn(),
            readBinary: jest.fn(),
            writeBinary: jest.fn(),
            mkdir: jest.fn(),
            trashSystem: jest.fn(),
            trashLocal: jest.fn(),
            getFullPath: jest.fn(),
            list: jest.fn()
        }
    }
} as unknown as App;

const mockConfig: LatestSyncConfigVersion = {
    type: RootSyncType.ROOT_SYNCER,
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
    version: 0
};

const createMockTFile = (path: FilePathType, stat: Partial<Stat> = {}): TFile => {
    const file = {
        path,
        stat: { ctime: 1000, mtime: 2000, size: 100, ...stat },
        basename: path.split("/").pop()?.split(".")[0] ?? "",
        extension: path.split(".").pop() ?? "",
        vault: mockVault,
        name: path.split("/").pop() ?? "",
        parent: {} as TFolder
    } as TFile;
    // Mock the constructor check
    Object.defineProperty(file, "constructor", { value: function TFile() {} });
    return file;
};

describe("FileAccess", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockApp.vault.fileMap = {};
        jest.spyOn(mockApp.vault.adapter, "stat").mockResolvedValue(null);
    });

    describe("getObsidianNode", () => {
        test("should return a LocalOnlyFileNode for a valid TFile", async () => {
            const filePath = "test.md" as FilePathType;
            const fileData = new Uint8Array([1, 2, 3]);
            const hash = "hash123";
            const mockTFile = createMockTFile(filePath, { size: 3 });

            mockApp.vault.fileMap[filePath] = mockTFile;
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(Ok(fileData));
            mockGetSha256Hash.mockReturnValue(Buffer.from(hash));

            const result = await FileAccess.getObsidianNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            const nodeOpt = result.unsafeUnwrap();
            expect(nodeOpt.some).toBe(true);
            const node = (nodeOpt as Some<LocalOnlyFileNode>).val;
            expect(node.fileData.fileHash).toEqual(
                Bytes.fromUint8Array(Buffer.from(hash)).toBase64()
            );
        });

        test("should return None if file is not a TFile", async () => {
            const filePath = "folder/" as FilePathType;
            mockApp.vault.fileMap[filePath] = {} as TFile;

            const result = await FileAccess.getObsidianNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().some).toBe(false);
        });

        test("should return error if readObsidianFile fails", async () => {
            const filePath = "test.md" as FilePathType;
            const mockTFile = createMockTFile(filePath);
            mockApp.vault.fileMap[filePath] = mockTFile;
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(
                Err(new StatusError(ErrorCode.UNKNOWN, "Read error"))
            );

            const result = await FileAccess.getObsidianNode(mockApp, filePath);

            expect(result.err).toBe(true);
            expect(result.val).toBeInstanceOf(StatusError);
        });
    });

    describe("getRawNode", () => {
        test("should return a LocalOnlyFileNode for a valid raw file", async () => {
            const filePath = "image.png" as FilePathType;
            const fileData = new Uint8Array([4, 5, 6]);
            const hash = "hash456";
            const stat = { ctime: 3000, mtime: 4000, size: 3, type: "file" } as Stat;

            jest.spyOn(mockApp.vault.adapter, "stat").mockResolvedValue(stat);
            mockFileUtilRaw.readRawFile.mockResolvedValue(Ok(fileData));
            mockGetSha256Hash.mockReturnValue(Buffer.from(hash));

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            const nodeOpt = result.unsafeUnwrap();
            expect(nodeOpt.some).toBe(true);
            const node = (nodeOpt as Some<LocalOnlyFileNode>).val;
            expect(node.fileData.fileHash).toEqual(
                Bytes.fromUint8Array(Buffer.from(hash)).toBase64()
            );
        });

        test("should return None if path is a folder", async () => {
            const filePath = "my-folder/" as FilePathType;
            const stat = { type: "folder" } as Stat;
            jest.spyOn(mockApp.vault.adapter, "stat").mockResolvedValue(stat);

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().some).toBe(false);
        });

        test("should return None if stat returns null", async () => {
            const filePath = "not-exist.txt" as FilePathType;
            jest.spyOn(mockApp.vault.adapter, "stat").mockResolvedValue(null);

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().some).toBe(false);
        });

        test("should return error if stat fails", async () => {
            const filePath = "error.txt" as FilePathType;
            jest.spyOn(mockApp.vault.adapter, "stat").mockRejectedValue(new Error("Stat failed"));

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.err).toBe(true);
        });

        test("should return error if readRawFile fails", async () => {
            const filePath = "image.png" as FilePathType;
            const stat = { ctime: 3000, mtime: 4000, size: 3, type: "file" } as Stat;
            jest.spyOn(mockApp.vault.adapter, "stat").mockResolvedValue(stat);
            mockFileUtilRaw.readRawFile.mockResolvedValue(
                Err(new StatusError(ErrorCode.UNKNOWN, "Read error"))
            );

            const result = await FileAccess.getRawNode(mockApp, filePath);

            expect(result.err).toBe(true);
            expect(result.val).toBeInstanceOf(StatusError);
        });
    });

    describe("getFileNode", () => {
        const mockLocalNode = {
            type: FileNodeType.LOCAL_ONLY_FILE
        } as LocalOnlyFileNode;

        beforeEach(() => {
            jest.spyOn(FileAccess, "getObsidianNode").mockResolvedValue(Ok(Some(mockLocalNode)));
            jest.spyOn(FileAccess, "getRawNode").mockResolvedValue(Ok(Some(mockLocalNode)));
            mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
            mockQueryUtil.IsObsidianFile.mockReturnValue(false);
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(false);
        });

        test("should return InvalidFileNode if path is not acceptable and ignoreInvalidPath is true", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.getFileNode(
                mockApp,
                "p" as FilePathType,
                mockConfig,
                false,
                true
            );
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().type).toBe(FileNodeType.INVALID);
        });

        test("should return NotFoundError if path is not acceptable and ignoreInvalidPath is false", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.getFileNode(
                mockApp,
                "p" as FilePathType,
                mockConfig,
                false,
                false
            );
            expect(result.err).toBe(true);
            expect(result.val).toBeInstanceOf(NotFoundError);
        });

        test("should return LocalOnlyFileNode for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            const result = await FileAccess.getFileNode(mockApp, "p" as FilePathType, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap()).toBe(mockLocalNode);
            expect(FileAccess.getObsidianNode).toHaveBeenCalled();
        });

        test("should return MissingFileNode for a missing obsidian file if ignored", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            jest.spyOn(FileAccess, "getObsidianNode").mockResolvedValue(Ok(None));
            const result = await FileAccess.getFileNode(
                mockApp,
                "p" as FilePathType,
                mockConfig,
                true
            );
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().type).toBe(FileNodeType.LOCAL_MISSING);
        });

        test("should return LocalOnlyFileNode for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            const result = await FileAccess.getFileNode(mockApp, "p" as FilePathType, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap()).toBe(mockLocalNode);
            expect(FileAccess.getRawNode).toHaveBeenCalled();
        });

        test("should return MissingFileNode for a missing raw file if ignored", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            jest.spyOn(FileAccess, "getRawNode").mockResolvedValue(Ok(None));
            const result = await FileAccess.getFileNode(
                mockApp,
                "p" as FilePathType,
                mockConfig,
                true
            );
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().type).toBe(FileNodeType.LOCAL_MISSING);
        });
    });

    describe("deleteFileNode", () => {
        const mockFileNode = {
            fileData: { fullPath: "p" as FilePathType }
        } as AllExistingFileNodeTypes;

        beforeEach(() => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
            mockQueryUtil.IsObsidianFile.mockReturnValue(false);
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(false);
            mockFileUtilObsidian.deleteObsidianFile.mockResolvedValue(Ok());
            mockFileUtilRaw.deleteRawFile.mockResolvedValue(Ok());
        });

        test("should return Ok if path is not acceptable", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.deleteFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.ok).toBe(true);
            expect(mockFileUtilObsidian.deleteObsidianFile).not.toHaveBeenCalled();
            expect(mockFileUtilRaw.deleteRawFile).not.toHaveBeenCalled();
        });

        test("should call deleteObsidianFile for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            await FileAccess.deleteFileNode(mockApp, mockFileNode, mockConfig);
            expect(mockFileUtilObsidian.deleteObsidianFile).toHaveBeenCalledWith(mockApp, "p");
        });

        test("should call deleteRawFile for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            await FileAccess.deleteFileNode(mockApp, mockFileNode, mockConfig);
            expect(mockFileUtilRaw.deleteRawFile).toHaveBeenCalledWith(mockApp, "p");
        });
    });

    describe("writeFileNode", () => {
        const mockFileNode = {
            fileData: { fullPath: "p" as FilePathType }
        } as AllExistingFileNodeTypes;
        const data = new Uint8Array([1]);

        beforeEach(() => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
            mockQueryUtil.IsObsidianFile.mockReturnValue(false);
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(false);
            mockFileUtilObsidian.writeToObsidianFile.mockResolvedValue(Ok());
            mockFileUtilRaw.writeToRawFile.mockResolvedValue(Ok());
        });

        test("should return error if path is not acceptable", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(result.err).toBe(true);
            expect(result.val).toBeInstanceOf(NotFoundError);
        });

        test("should call writeToObsidianFile for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(mockFileUtilObsidian.writeToObsidianFile).toHaveBeenCalledWith(
                mockApp,
                "p",
                data,
                undefined
            );
        });

        test("should call writeToRawFile for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            await FileAccess.writeFileNode(mockApp, mockFileNode, data, mockConfig);
            expect(mockFileUtilRaw.writeToRawFile).toHaveBeenCalledWith(
                mockApp,
                "p",
                data,
                undefined
            );
        });
    });

    describe("readFileNode", () => {
        const mockFileNode = {
            fileData: { fullPath: "p" as FilePathType }
        } as LocalOnlyFileNode;
        const data = new Uint8Array([1]);

        beforeEach(() => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
            mockQueryUtil.IsObsidianFile.mockReturnValue(false);
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(false);
            mockFileUtilObsidian.readObsidianFile.mockResolvedValue(Ok(data));
            mockFileUtilRaw.readRawFile.mockResolvedValue(Ok(data));
        });

        test("should return error if path is not acceptable", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(false);
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.err).toBe(true);
            expect(result.val).toBeInstanceOf(NotFoundError);
        });

        test("should call readObsidianFile for an obsidian file", async () => {
            mockQueryUtil.IsObsidianFile.mockReturnValue(true);
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.val).toBe(data);
            expect(mockFileUtilObsidian.readObsidianFile).toHaveBeenCalledWith(mockApp, "p");
        });

        test("should call readRawFile for a raw file", async () => {
            mockQueryUtil.IsLocalFileRaw.mockReturnValue(true);
            const result = await FileAccess.readFileNode(mockApp, mockFileNode, mockConfig);
            expect(result.ok).toBe(true);
            expect(result.val).toBe(data);
            expect(mockFileUtilRaw.readRawFile).toHaveBeenCalledWith(mockApp, "p");
        });
    });

    describe("getTouchedFileNodes", () => {
        beforeEach(() => {
            jest.spyOn(FileAccess, "getFileNode").mockImplementation(
                async (_app, fullPath): Promise<Result<LocalFileNodeTypes, StatusError>> => {
                    if (fullPath === "valid.md") {
                        return Ok({
                            type: FileNodeType.LOCAL_ONLY_FILE,
                            fileData: { fullPath },
                            localTime: 0
                        } as LocalOnlyFileNode);
                    }
                    if (fullPath === "missing.md") {
                        return Ok({
                            type: FileNodeType.LOCAL_MISSING,
                            fileData: { fullPath },
                            localTime: 0
                        } as MissingFileNode);
                    }
                    if (fullPath === "invalid.md") {
                        return Ok({
                            type: FileNodeType.INVALID,
                            fileData: { fullPath }
                        } as InvalidFileNode);
                    }
                    return Err(NotFoundError("File not found"));
                }
            );

            jest.spyOn(mockApp.vault.adapter, "stat").mockImplementation(async (path) => {
                if (path.includes("error")) {
                    throw new Error("Stat failed");
                }
                return { type: "file", ctime: 1, mtime: 1, size: 1 };
            });
        });

        test("should process a map of touched files and return file nodes", async () => {
            const touchedFiles = new Map<FilePathType, number>([
                ["valid.md" as FilePathType, 12345],
                ["missing.md" as FilePathType, 67890],
                ["invalid.md" as FilePathType, 11223]
            ]);

            const result = await FileAccess.getTouchedFileNodes(mockApp, mockConfig, touchedFiles);

            expect(result.ok).toBe(true);
            const nodes = result.unsafeUnwrap();
            expect(nodes.size).toBe(2); // invalid.md should be filtered out
            const validNode = nodes.get("valid.md" as FilePathType);
            if (validNode?.type === FileNodeType.LOCAL_ONLY_FILE) {
                expect(validNode.localTime).toBe(12345);
            } else {
                throw new Error("Node should be LocalOnlyFileNode");
            }
        });
    });

    describe("getAllFileNodes", () => {
        beforeEach(() => {
            jest.spyOn(FileAccess, "getFileNode").mockImplementation(
                async (_app, fullPath): Promise<Result<LocalOnlyFileNode, StatusError>> => {
                    return Ok({
                        type: FileNodeType.LOCAL_ONLY_FILE,
                        fileData: { fullPath }
                    } as LocalOnlyFileNode);
                }
            );

            jest.spyOn(mockApp.vault.adapter, "list").mockImplementation(async (path) => {
                if (path === "") {
                    return { folders: ["a"], files: ["b.md"] };
                }
                if (path === "a") {
                    return { folders: [], files: ["a/c.md"] };
                }
                return { folders: [], files: [] };
            });
        });

        test("should return all file nodes from the vault", async () => {
            mockQueryUtil.IsAcceptablePath.mockReturnValue(true);
            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.ok).toBe(true);
            const nodes = result.unsafeUnwrap();
            expect(nodes.length).toBe(2);
            expect(nodes.map((n) => n.fileData.fullPath)).toContain("b.md");
            expect(nodes.map((n) => n.fileData.fullPath)).toContain("a/c.md");
        });

        test("should filter unacceptable paths", async () => {
            mockQueryUtil.IsAcceptablePath.mockImplementation((path) => path !== "b.md");
            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.ok).toBe(true);
            const nodes = result.unsafeUnwrap();
            expect(nodes.length).toBe(1);
            expect(nodes[0]?.fileData.fullPath).toBe("a/c.md");
        });

        test("should return error if list fails", async () => {
            jest.spyOn(mockApp.vault.adapter, "list").mockRejectedValue(new Error("List failed"));
            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.err).toBe(true);
        });

        test("should return error if getFileNode fails", async () => {
            jest.spyOn(FileAccess, "getFileNode").mockResolvedValue(
                Err(new StatusError(ErrorCode.UNKNOWN, "GetFileNode failed"))
            );
            const result = await FileAccess.getAllFileNodes(mockApp, mockConfig);
            expect(result.err).toBe(true);
        });
    });
});
