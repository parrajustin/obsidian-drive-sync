/**
 * Tests for `CloudStorageUtil` driven through the fake cloud storage backend
 * (tests/fake_firebase/fake_cloud_storage.ts).
 */
import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import type { UserCredential } from "firebase/auth";

jest.mock("firebase/storage", () => {
    const sdk =
        require("../../tests/fake_firebase/fake_cloud_storage") as typeof import("../../tests/fake_firebase/fake_cloud_storage");
    return sdk.CreateStorageSdkMock();
});
jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    })
}));

import {
    GetFakeCloudStorage,
    ResetFakeCloudStorage
} from "../../tests/fake_firebase/fake_cloud_storage";
import { CloudStorageUtil } from "./cloud_storage_util";
import { FileConst } from "../constants";
import type { FilePathType } from "../filesystem/file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";

const CREDS = { user: { uid: "user-1" } } as UserCredential;
const SYNCER_CONFIG = {
    vaultName: "vault-1",
    syncerId: "syncer-1"
} as LatestSyncConfigVersion;
const FILE_PATH = "notes/a.md" as FilePathType;

const makeData = (bytes: number[]): ArrayBuffer => new Uint8Array(bytes).buffer;

describe("CloudStorageUtil", () => {
    beforeEach(() => {
        ResetFakeCloudStorage();
    });

    describe("uploadFileToStorage", () => {
        test("uploads under <uid>/<vault>/<cloudFileId> and returns the full path", async () => {
            const data = makeData([1, 2, 3, 4]);
            const result = await CloudStorageUtil.uploadFileToStorage(
                SYNCER_CONFIG,
                FILE_PATH,
                CREDS,
                "cloud-file-1",
                data
            );

            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap()).toBe("user-1/vault-1/cloud-file-1");

            const stored = GetFakeCloudStorage().peekObject("user-1/vault-1/cloud-file-1");
            expect(stored).toBeDefined();
            expect(new Uint8Array(stored!.data)).toEqual(new Uint8Array([1, 2, 3, 4]));
        });

        test("stores the local file path as object metadata", async () => {
            const result = await CloudStorageUtil.uploadFileToStorage(
                SYNCER_CONFIG,
                FILE_PATH,
                CREDS,
                "cloud-file-1",
                makeData([9])
            );
            expect(result.ok).toBe(true);

            const stored = GetFakeCloudStorage().peekObject("user-1/vault-1/cloud-file-1");
            expect(stored!.metadata).toEqual({
                customMetadata: { [FileConst.FILE_PATH]: FILE_PATH }
            });
        });

        test("a rejected upload becomes an error result and stores nothing", async () => {
            GetFakeCloudStorage().failNextUpload(new Error("storage/unauthorized"));
            const result = await CloudStorageUtil.uploadFileToStorage(
                SYNCER_CONFIG,
                FILE_PATH,
                CREDS,
                "cloud-file-err",
                makeData([1])
            );

            expect(result.err).toBe(true);
            expect(GetFakeCloudStorage().objectCount).toBe(0);
            // The error carries the injected upload context.
            expect(result.val.toString()).toContain("Failed to upload to storage.");
        });

        test("a failed upload does not poison subsequent uploads", async () => {
            GetFakeCloudStorage().failNextUpload(new Error("transient"));
            const first = await CloudStorageUtil.uploadFileToStorage(
                SYNCER_CONFIG,
                FILE_PATH,
                CREDS,
                "cloud-file-1",
                makeData([1])
            );
            expect(first.err).toBe(true);

            const second = await CloudStorageUtil.uploadFileToStorage(
                SYNCER_CONFIG,
                FILE_PATH,
                CREDS,
                "cloud-file-1",
                makeData([2])
            );
            expect(second.ok).toBe(true);
            expect(GetFakeCloudStorage().objectCount).toBe(1);
        });
    });

    describe("downloadFileFromStorage", () => {
        test("returns the bytes previously uploaded", async () => {
            const data = makeData([5, 6, 7]);
            const upload = await CloudStorageUtil.uploadFileToStorage(
                SYNCER_CONFIG,
                FILE_PATH,
                CREDS,
                "cloud-file-1",
                data
            );
            expect(upload.ok).toBe(true);

            const download = await CloudStorageUtil.downloadFileFromStorage(upload.unsafeUnwrap());
            expect(download.ok).toBe(true);
            expect(new Uint8Array(download.unsafeUnwrap())).toEqual(new Uint8Array([5, 6, 7]));
        });

        test("a rejected download becomes an error result", async () => {
            GetFakeCloudStorage().failNextDownload(new Error("storage/retry-limit-exceeded"));
            const result = await CloudStorageUtil.downloadFileFromStorage(
                "user-1/vault-1/cloud-file-1"
            );

            expect(result.err).toBe(true);
            expect(result.val.toString()).toContain("Failed to download from storage.");
        });

        test("downloading a missing object is an error result, not a throw", async () => {
            const result = await CloudStorageUtil.downloadFileFromStorage(
                "user-1/vault-1/does-not-exist"
            );
            expect(result.err).toBe(true);
        });
    });
});
