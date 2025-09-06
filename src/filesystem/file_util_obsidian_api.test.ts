/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-empty-function */
import { describe, expect, jest, test, beforeEach } from "@jest/globals";
import type { App, DataWriteOptions, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import { FileUtilObsidian } from "./file_util_obsidian_api";

const mockVault = {
    getAbstractFileByPath: jest.fn<(path: string) => TAbstractFile | null>(),
    readBinary: jest.fn<(file: TFile) => Promise<ArrayBuffer>>(),
    createBinary: jest.fn<(path: string, data: ArrayBuffer, opts?: DataWriteOptions) => Promise<TFile>>(),
    modifyBinary: jest.fn<(file: TFile, data: ArrayBuffer, opts?: DataWriteOptions) => Promise<void>>(),
    trash: jest.fn<(file: TFile, system: boolean) => Promise<void>>(),
    adapter: {
        mkdir: jest.fn<(path: string) => Promise<void>>(),
    }
};

const mockApp = {
    vault: mockVault
} as unknown as App;

jest.mock(
    "obsidian",
    () => {
        return {
            __esModule: true,
            normalizePath: (path: string) => path,
            TFile: class TFile {},
            FuzzySuggestModal: class MockFuzzySuggestModal {}
        };
    },
    { virtual: true }
);

jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {}
    })
}));

describe("FileUtilObsidian", () => {
    beforeEach(() => {
        mockVault.getAbstractFileByPath.mockClear();
        mockVault.readBinary.mockClear();
        mockVault.createBinary.mockClear();
        mockVault.modifyBinary.mockClear();
        mockVault.trash.mockClear();
        mockVault.adapter.mkdir.mockClear();
    });

    describe("readObsidianFile", () => {
        test("should read a file", async () => {
            const filePath = "test.md";
            const fileData = new Uint8Array([1, 2, 3]);
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.readBinary.mockResolvedValue(fileData.buffer);
            const result = await FileUtilObsidian.readObsidianFile(mockApp, filePath);
            expect(result.ok).toBe(true);
            expect(result.val).toEqual(fileData);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.readBinary).toHaveBeenCalledWith(mockFile);
        });

        test("should handle file not found", async () => {
            const filePath = "test.md";
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            const result = await FileUtilObsidian.readObsidianFile(mockApp, filePath);
            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
        });

        test("should handle non-file type", async () => {
            const filePath = "test.md";
            const mockFile = { path: filePath }; // Not a TFile
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile as any);
            const result = await FileUtilObsidian.readObsidianFile(mockApp, filePath);
            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
        });

        test("should handle read errors", async () => {
            const filePath = "test.md";
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.readBinary.mockRejectedValue(new Error("Read error"));
            const result = await FileUtilObsidian.readObsidianFile(mockApp, filePath);
            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.readBinary).toHaveBeenCalledWith(mockFile);
        });
    });

    describe("writeToObsidianFile", () => {
        test("should write a new file", async () => {
            const filePath = "folder/test.md";
            const fileData = new Uint8Array([1, 2, 3]);
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockVault.adapter.mkdir.mockResolvedValue(undefined);
            mockVault.createBinary.mockResolvedValue(new TFile());

            const result = await FileUtilObsidian.writeToObsidianFile(mockApp, filePath, fileData);

            expect(result.ok).toBe(true);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.adapter.mkdir).toHaveBeenCalledWith("folder");
            expect(mockVault.createBinary).toHaveBeenCalledWith(filePath, fileData.buffer, undefined);
        });

        test("should write to an existing file", async () => {
            const filePath = "test.md";
            const fileData = new Uint8Array([1, 2, 3]);
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.modifyBinary.mockResolvedValue(undefined);

            const result = await FileUtilObsidian.writeToObsidianFile(mockApp, filePath, fileData);

            expect(result.ok).toBe(true);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.modifyBinary).toHaveBeenCalledWith(mockFile, fileData.buffer, undefined);
        });

        test("should handle path being a folder", async () => {
            const filePath = "folder";
            const fileData = new Uint8Array([1, 2, 3]);
            const mockFolder = { path: filePath, children: [] }; // Not a TFile
            mockVault.getAbstractFileByPath.mockReturnValue(mockFolder as any);

            const result = await FileUtilObsidian.writeToObsidianFile(mockApp, filePath, fileData);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
        });

        test("should handle mkdir errors", async () => {
            const filePath = "folder/test.md";
            const fileData = new Uint8Array([1, 2, 3]);
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockVault.adapter.mkdir.mockRejectedValue(new Error("mkdir failed"));

            const result = await FileUtilObsidian.writeToObsidianFile(mockApp, filePath, fileData);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.adapter.mkdir).toHaveBeenCalledWith("folder");
        });

        test("should handle createBinary errors", async () => {
            const filePath = "folder/test.md";
            const fileData = new Uint8Array([1, 2, 3]);
            mockVault.getAbstractFileByPath.mockReturnValue(null);
            mockVault.adapter.mkdir.mockResolvedValue(undefined);
            mockVault.createBinary.mockRejectedValue(new Error("create failed"));

            const result = await FileUtilObsidian.writeToObsidianFile(mockApp, filePath, fileData);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.adapter.mkdir).toHaveBeenCalledWith("folder");
            expect(mockVault.createBinary).toHaveBeenCalledWith(filePath, fileData.buffer, undefined);
        });

        test("should handle modifyBinary errors", async () => {
            const filePath = "test.md";
            const fileData = new Uint8Array([1, 2, 3]);
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.modifyBinary.mockRejectedValue(new Error("modify failed"));

            const result = await FileUtilObsidian.writeToObsidianFile(mockApp, filePath, fileData);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.modifyBinary).toHaveBeenCalledWith(mockFile, fileData.buffer, undefined);
        });
    });

    describe("deleteObsidianFile", () => {
        test("should delete a file", async () => {
            const filePath = "test.md";
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.trash.mockResolvedValue(undefined);

            const result = await FileUtilObsidian.deleteObsidianFile(mockApp, filePath);

            expect(result.ok).toBe(true);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.trash).toHaveBeenCalledWith(mockFile, true);
        });

        test("should handle file not found", async () => {
            const filePath = "test.md";
            mockVault.getAbstractFileByPath.mockReturnValue(null);

            const result = await FileUtilObsidian.deleteObsidianFile(mockApp, filePath);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
        });

        test("should handle non-file type", async () => {
            const filePath = "folder";
            const mockFolder = { path: filePath, children: [] }; // Not a TFile
            mockVault.getAbstractFileByPath.mockReturnValue(mockFolder as any);

            const result = await FileUtilObsidian.deleteObsidianFile(mockApp, filePath);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
        });

        test("should handle trash errors", async () => {
            const filePath = "test.md";
            const mockFile = new TFile();
            mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
            mockVault.trash.mockRejectedValue(new Error("trash failed"));

            const result = await FileUtilObsidian.deleteObsidianFile(mockApp, filePath);

            expect(result.ok).toBe(false);
            expect(mockVault.getAbstractFileByPath).toHaveBeenCalledWith(filePath);
            expect(mockVault.trash).toHaveBeenCalledWith(mockFile, true);
        });
    });
});
