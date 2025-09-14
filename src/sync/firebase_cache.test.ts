/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/unbound-method */
import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import type { App } from "obsidian";
import { FirebaseCache, type FirebaseStoredData, type SchemaWithId } from "./firebase_cache";
import { FileUtilRaw } from "../filesystem/file_util_raw_api";
import { CompressionUtils } from "./compression_utils";
import { type LatestNotesSchema } from "../schema/notes/notes.schema";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { Err, Ok } from "../lib/result";
import { UnknownError } from "../lib/status_error";
import { Bytes } from "firebase/firestore";

// Mock dependencies
jest.mock("../filesystem/file_util_raw_api");
const mockedFileUtilRaw = jest.mocked(FileUtilRaw);

const mockApp = {} as App;
const mockConfig: LatestSyncConfigVersion = {
    firebaseCachePath: "cache.json.gz"
} as LatestSyncConfigVersion;

describe("FirebaseCache", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe("writeToFirebaseCache", () => {
        const mockCloudData: SchemaWithId<LatestNotesSchema>[] = [
            {
                id: "id1",
                data: {
                    type: "Raw",
                    fileStorageRef: null,
                    deleted: false,
                    path: "file1.md",
                    entryTime: 1000,
                    data: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])) // This should be stripped
                } as unknown as LatestNotesSchema
            },
            {
                id: "id2",
                data: {
                    type: "Ref",
                    fileStorageRef: "ref2",
                    data: null,
                    deleted: false,
                    path: "file2.md",
                    entryTime: 2000
                } as unknown as LatestNotesSchema
            }
        ];

        const expectedCacheData: FirebaseStoredData<SchemaWithId<LatestNotesSchema>> = {
            lastUpdate: 2000,
            cache: [
                {
                    id: "id1",
                    data: {
                        type: "Raw-Cache",
                        fileStorageRef: null,
                        data: null,
                        deleted: false,
                        path: "file1.md",
                        entryTime: 1000
                    } as unknown as LatestNotesSchema
                },
                {
                    id: "id2",
                    data: {
                        type: "Ref",
                        fileStorageRef: "ref2",
                        data: null,
                        deleted: false,
                        path: "file2.md",
                        entryTime: 2000
                    } as unknown as LatestNotesSchema
                }
            ]
        };

        test("should write cache successfully", async () => {
            let mockData;
            mockedFileUtilRaw.writeToRawFile.mockImplementation(async (_app, _config, data) => {
                mockData = data;
                return Ok();
            });

            const result = await FirebaseCache.writeToFirebaseCache(
                mockApp,
                mockConfig,
                mockCloudData
            );
            expect(result.ok).toBe(true);

            expect(mockedFileUtilRaw.writeToRawFile).toHaveBeenCalledWith(
                mockApp,
                mockConfig.firebaseCachePath,
                expect.anything()
            );

            const decompressedData = await CompressionUtils.decompressStringData(
                mockData as unknown as Uint8Array,
                "Firebase Cache"
            );
            expect(decompressedData.ok).toBe(true);
            expect(JSON.parse(decompressedData.unsafeUnwrap())).toEqual(expectedCacheData);
        });

        test("should handle empty cloud data", async () => {
            let mockData: Uint8Array | undefined;
            mockedFileUtilRaw.writeToRawFile.mockImplementation(async (_app, _path, data) => {
                mockData = data;
                return Ok();
            });

            const result = await FirebaseCache.writeToFirebaseCache(mockApp, mockConfig, []);

            expect(result.ok).toBe(true);
            expect(mockedFileUtilRaw.writeToRawFile).toHaveBeenCalledWith(
                mockApp,
                mockConfig.firebaseCachePath,
                expect.any(Uint8Array)
            );

            const decompressedData = await CompressionUtils.decompressStringData(
                mockData!,
                "Firebase Cache"
            );
            expect(decompressedData.ok).toBe(true);
            expect(JSON.parse(decompressedData.unsafeUnwrap())).toEqual({
                lastUpdate: -1,
                cache: []
            });
        });

        test("should return error if file write fails", async () => {
            const error = UnknownError("Write failed");
            mockedFileUtilRaw.writeToRawFile.mockResolvedValue(Err(error));

            const result = await FirebaseCache.writeToFirebaseCache(
                mockApp,
                mockConfig,
                mockCloudData
            );

            expect(result.err).toBe(true);
            expect(result.val).toBe(error);
        });
    });
});
