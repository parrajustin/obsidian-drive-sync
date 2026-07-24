import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import type { App } from "obsidian";
import { FirebaseCache, type FirebaseStoredData, type SchemaWithId } from "./firebase_cache";
import { FileUtilRaw } from "../filesystem/file_util_raw_api";
import { CompressionUtils } from "./compression_utils";
import { type LatestNotesSchema } from "../schema/notes/notes.schema";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { Err, Ok } from "standard-ts-lib/src/result";
import { NotFoundError, UnknownError } from "standard-ts-lib/src/status_error";
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

    describe("per config cache isolation", () => {
        const makeConfig = (path: string): LatestSyncConfigVersion =>
            ({ firebaseCachePath: path }) as LatestSyncConfigVersion;
        const makeEntry = (path: string, entryTime: number): SchemaWithId<LatestNotesSchema> => ({
            id: `id-${path}`,
            data: {
                type: "Ref",
                fileStorageRef: "ref",
                data: null,
                deleted: false,
                path,
                entryTime,
                version: 0
            } as unknown as LatestNotesSchema
        });

        beforeEach(() => {
            FirebaseCache.clearCache();
        });

        test("one syncer config's in-memory cache never leaks into another's", async () => {
            mockedFileUtilRaw.writeToRawFile.mockResolvedValue(Ok());
            // Config B's on-disk cache is empty (file missing).
            mockedFileUtilRaw.readRawFile.mockResolvedValue(Err(NotFoundError("missing")));

            const configA = makeConfig("vaultA-cache.json.gz");
            const configB = makeConfig("vaultB-cache.json.gz");

            const writeA = await FirebaseCache.writeToFirebaseCache(mockApp, configA, [
                makeEntry("a.md", 100)
            ]);
            expect(writeA.ok).toBe(true);

            // Reading config A back hits the in-memory entry.
            const readA = await FirebaseCache.readFirebaseCache(mockApp, configA);
            expect(readA.ok).toBe(true);
            expect(readA.unsafeUnwrap().cache.map((e) => e.data.path)).toEqual(["a.md"]);

            // Reading config B must NOT observe config A's data.
            const readB = await FirebaseCache.readFirebaseCache(mockApp, configB);
            expect(readB.ok).toBe(true);
            expect(readB.unsafeUnwrap()).toEqual({ lastUpdate: -1, cache: [] });
        });

        test("clearCache drops all in-memory entries", async () => {
            mockedFileUtilRaw.writeToRawFile.mockResolvedValue(Ok());
            const config = makeConfig("vault-cache.json.gz");
            const write = await FirebaseCache.writeToFirebaseCache(mockApp, config, [
                makeEntry("a.md", 100)
            ]);
            expect(write.ok).toBe(true);

            FirebaseCache.clearCache();
            mockedFileUtilRaw.readRawFile.mockResolvedValue(Err(NotFoundError("missing")));

            const read = await FirebaseCache.readFirebaseCache(mockApp, config);
            expect(read.ok).toBe(true);
            expect(read.unsafeUnwrap()).toEqual({ lastUpdate: -1, cache: [] });
        });
    });
});
