import { describe, expect, jest, test, beforeEach } from "@jest/globals";
import type { App, DataWriteOptions } from "obsidian";
import { FileUtilRaw } from "./file_util_raw_api";

const mockAdapter = {
    readBinary: jest.fn<(path: string) => Promise<ArrayBuffer>>(),
    writeBinary: jest.fn<(path: string, data: ArrayBuffer, opts?: DataWriteOptions) => Promise<void>>(),
    mkdir: jest.fn<(path: string) => Promise<void>>(),
    trashSystem: jest.fn<(path: string) => Promise<boolean>>(),
    trashLocal: jest.fn<(path: string) => Promise<void>>(),
    getFullPath: jest.fn<(path: string) => string>(),
};

const mockApp = {
    vault: {
        adapter: mockAdapter
    }
} as unknown as App;


jest.mock(
    "obsidian",
    () => {
        return {
            __esModule: true,
            normalizePath: (path: string) => path,
            FuzzySuggestModal: class MockFuzzySuggestModal {},
        };
    },
    { virtual: true }
);

jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
    }),
}));

describe("FileUtilRaw", () => {
    beforeEach(() => {
        mockAdapter.readBinary.mockClear();
        mockAdapter.writeBinary.mockClear();
        mockAdapter.mkdir.mockClear();
        mockAdapter.trashSystem.mockClear();
        mockAdapter.trashLocal.mockClear();
        mockAdapter.getFullPath.mockClear();
    });

    test("readRawFile should read a file", async () => {
        const filePath = "test.md";
        const fileData = new Uint8Array([1, 2, 3]);
        mockAdapter.readBinary.mockResolvedValue(fileData.buffer);

        const result = await FileUtilRaw.readRawFile(mockApp, filePath);

        expect(result.ok).toBe(true);
        expect(result.val).toEqual(fileData);
        expect(mockAdapter.readBinary).toHaveBeenCalledWith(filePath);
    });

    test("readRawFile should handle errors", async () => {
        const filePath = "test.md";
        mockAdapter.readBinary.mockRejectedValue(new Error("File not found"));

        const result = await FileUtilRaw.readRawFile(mockApp, filePath);

        expect(result.ok).toBe(false);
        expect(mockAdapter.readBinary).toHaveBeenCalledWith(filePath);
    });

    test("writeToRawFile should write a file", async () => {
        const filePath = "folder/test.md";
        const fileData = new Uint8Array([1, 2, 3]);
        mockAdapter.mkdir.mockResolvedValue(undefined);
        mockAdapter.writeBinary.mockResolvedValue(undefined);

        const result = await FileUtilRaw.writeToRawFile(mockApp, filePath, fileData);

        expect(result.ok).toBe(true);
        expect(mockAdapter.mkdir).toHaveBeenCalledWith("folder");
        expect(mockAdapter.writeBinary).toHaveBeenCalledWith(filePath, fileData.buffer, undefined);
    });

    test("writeToRawFile should handle mkdir errors", async () => {
        const filePath = "folder/test.md";
        const fileData = new Uint8Array([1, 2, 3]);
        mockAdapter.mkdir.mockRejectedValue(new Error("mkdir failed"));

        const result = await FileUtilRaw.writeToRawFile(mockApp, filePath, fileData);

        expect(result.ok).toBe(false);
        expect(mockAdapter.mkdir).toHaveBeenCalledWith("folder");
        expect(mockAdapter.writeBinary).not.toHaveBeenCalled();
    });

    test("writeToRawFile should handle writeBinary errors", async () => {
        const filePath = "folder/test.md";
        const fileData = new Uint8Array([1, 2, 3]);
        mockAdapter.mkdir.mockResolvedValue(undefined);
        mockAdapter.writeBinary.mockRejectedValue(new Error("write failed"));

        const result = await FileUtilRaw.writeToRawFile(mockApp, filePath, fileData);

        expect(result.ok).toBe(false);
        expect(mockAdapter.mkdir).toHaveBeenCalledWith("folder");
        expect(mockAdapter.writeBinary).toHaveBeenCalledWith(filePath, fileData.buffer, undefined);
    });

    test("deleteRawFile should use trashSystem if available", async () => {
        const filePath = "test.md";
        mockAdapter.trashSystem.mockResolvedValue(true);

        const result = await FileUtilRaw.deleteRawFile(mockApp, filePath);

        expect(result.ok).toBe(true);
        expect(mockAdapter.trashSystem).toHaveBeenCalledWith(filePath);
        expect(mockAdapter.trashLocal).not.toHaveBeenCalled();
    });

    test("deleteRawFile should use trashLocal if trashSystem is not available", async () => {
        const filePath = "test.md";
        mockAdapter.trashSystem.mockResolvedValue(false);
        mockAdapter.trashLocal.mockResolvedValue(undefined);
        mockAdapter.getFullPath.mockReturnValue(filePath);


        const result = await FileUtilRaw.deleteRawFile(mockApp, filePath);

        expect(result.ok).toBe(true);
        expect(mockAdapter.trashSystem).toHaveBeenCalledWith(filePath);
        expect(mockApp.vault.adapter.trashLocal).toHaveBeenCalledWith(filePath);
    });

    test("deleteRawFile should handle trashSystem errors", async () => {
        const filePath = "test.md";
        mockAdapter.trashSystem.mockRejectedValue(new Error("trashSystem failed"));

        const result = await FileUtilRaw.deleteRawFile(mockApp, filePath);

        expect(result.ok).toBe(false);
        expect(mockAdapter.trashSystem).toHaveBeenCalledWith(filePath);
        expect(mockAdapter.trashLocal).not.toHaveBeenCalled();
    });

    test("deleteRawFile should handle trashLocal errors", async () => {
        const filePath = "test.md";
        mockAdapter.trashSystem.mockResolvedValue(false);
        mockAdapter.trashLocal.mockRejectedValue(new Error("trashLocal failed"));
        mockAdapter.getFullPath.mockReturnValue(filePath);

        const result = await FileUtilRaw.deleteRawFile(mockApp, filePath);

        expect(result.ok).toBe(false);
        expect(mockAdapter.trashSystem).toHaveBeenCalledWith(filePath);
        expect(mockAdapter.trashLocal).toHaveBeenCalledWith(filePath);
    });
});
