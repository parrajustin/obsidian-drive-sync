import { Ok, StatusResult, type Result } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import {
    NOTES_SCHEMA_MANAGER,
    type AnyVersionNotesSchema,
    type LatestNotesSchema
} from "../schema/notes/notes.schema";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import { App } from "obsidian";
import { FileUtilRaw } from "../filesystem/file_util_raw_api";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { CompressionUtils } from "./compression_utils";
import { ErrorCode } from "../lib/status_error";
import { None, Optional, Some } from "../lib/option";

export interface SchemaWithId<T> {
    id: string;
    data: T;
}

export interface FirebaseStoredData<T> {
    /** The date of the latest update. */
    lastUpdate: number;
    /** Cached data has everything but the actual file data. */
    cache: T[];
}

export class FirebaseCache {
    private static _lastCacheEntry: Optional<FirebaseStoredData<SchemaWithId<LatestNotesSchema>>> =
        None;

    public static clearCache(): void {
        this._lastCacheEntry = None;
    }

    @Span()
    @PromiseResultSpanError
    public static async writeToFirebaseCache(
        app: App,
        config: LatestSyncConfigVersion,
        cloudData: SchemaWithId<LatestNotesSchema>[]
    ): Promise<StatusResult<StatusError>> {
        const cachedData: FirebaseStoredData<SchemaWithId<LatestNotesSchema>> = {
            lastUpdate: -1,
            cache: []
        };

        if (cloudData.length > 0) {
            let lastUpdate = Number.MIN_SAFE_INTEGER;
            for (const entry of cloudData) {
                if (entry.data.entryTime > lastUpdate) {
                    lastUpdate = entry.data.entryTime;
                }
            }
            cachedData.lastUpdate = lastUpdate;
            cachedData.cache = cloudData.map((n): SchemaWithId<LatestNotesSchema> => {
                switch (n.data.type) {
                    case "Ref":
                    case "Raw-Cache":
                        return n;
                    case "Raw": {
                        const newNode: LatestNotesSchema = {
                            ...n.data,
                            type: "Raw-Cache",
                            fileStorageRef: null,
                            data: null
                        };
                        return { id: n.id, data: newNode };
                    }
                }
            });
        }

        this._lastCacheEntry = Some(cachedData);
        const compressedCache = await CompressionUtils.compressStringData(
            JSON.stringify(cachedData),
            /*reason=*/ "Firebase Cache"
        );
        if (compressedCache.err) {
            return compressedCache;
        }

        const data = new Uint8Array(compressedCache.safeUnwrap());
        return FileUtilRaw.writeToRawFile(app, config.firebaseCachePath, data);
    }

    @Span()
    @PromiseResultSpanError
    public static async readFirebaseCache(
        app: App,
        config: LatestSyncConfigVersion
    ): Promise<Result<FirebaseStoredData<SchemaWithId<LatestNotesSchema>>, StatusError>> {
        if (this._lastCacheEntry.some) {
            return Ok(this._lastCacheEntry.safeValue());
        }

        const fileData = await FileUtilRaw.readRawFile(app, config.firebaseCachePath);
        if (fileData.err) {
            // If the cache file doesn't exist, return an empty cache.
            if (fileData.val.errorCode === ErrorCode.NOT_FOUND) {
                return Ok({ lastUpdate: -1, cache: [] });
            }
            return fileData;
        }

        const decompressed = await CompressionUtils.decompressData(
            fileData.safeUnwrap(),
            "Firebase Cache"
        );
        const parsedJson = decompressed
            // Convert to unit8array.
            .map((n) => new Uint8Array(n))
            // Convert to a string.
            .map((n) => new window.TextDecoder("utf-8").decode(n))
            // Parse the string as json.
            .map((n) => JSON.parse(n) as FirebaseStoredData<SchemaWithId<AnyVersionNotesSchema>>);
        if (parsedJson.err) {
            return parsedJson;
        }

        const updatedCache: SchemaWithId<LatestNotesSchema>[] = [];
        for (const entry of parsedJson.safeUnwrap().cache) {
            const updatedEntry = NOTES_SCHEMA_MANAGER.updateSchema(entry.data);
            if (updatedEntry.err) {
                return updatedEntry;
            }
            updatedCache.push({ id: entry.id, data: updatedEntry.safeUnwrap() });
        }
        const cache = {
            lastUpdate: parsedJson.safeUnwrap().lastUpdate,
            cache: updatedCache
        };
        this._lastCacheEntry = Some(cache);
        return Ok(cache);
    }
}
