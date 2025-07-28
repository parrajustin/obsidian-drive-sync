import { Ok, StatusResult, type Result } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
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
    /** Compress string data to base64 gzip data. */
    @Span()
    @PromiseResultSpanError
    public static async compressStringData(
        data: string,
        reason: string
    ): Promise<Result<ArrayBuffer, StatusError>> {
        // Create the read stream and compress the data.
        const readableStream = await WrapPromise(
            Promise.resolve(
                new ReadableStream({
                    start(controller) {
                        // Convert the input string into a Uint8Array (binary form)
                        const encoder = new TextEncoder();
                        const chunk = encoder.encode(data);

                        // Push the chunk into the stream
                        controller.enqueue(chunk);

                        // Close the stream
                        controller.close();
                    }
                }).pipeThrough(new CompressionStream("gzip"))
            ),
            /*textForUnknown=*/ `Failed to create stream and compress "${reason}"`
        );
        if (readableStream.err) {
            return readableStream;
        }

        // Convert data to uint8array.
        const wrappedResponse = new Response(readableStream.safeUnwrap());
        return WrapPromise(
            wrappedResponse.arrayBuffer(),
            /*textForUnknown=*/ `[CompressStringData] Failed to convert to array buffer "${reason}"`
        );
        // return outData
        //     .map((n) => Bytes.fromUint8Array(new Uint8Array(n)).toBase64())
        //     .map((val) => new window.TextEncoder().encode(val));
    }

    /** Decompress string data. */
    @Span()
    @PromiseResultSpanError
    public static async decompressStringData(
        data: Uint8Array,
        reason: string
    ): Promise<Result<ArrayBuffer, StatusError>> {
        // Create the read stream and decompress the data.
        const readableStream = await WrapPromise(
            Promise.resolve(
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(data);
                        controller.close();
                    }
                }).pipeThrough(new DecompressionStream("gzip"))
            ),
            /*textForUnknown=*/ `Failed to create stream and decompress "${reason}"`
        );
        if (readableStream.err) {
            return readableStream;
        }

        // Convert data to uint8array.
        const wrappedResponse = new Response(readableStream.safeUnwrap());
        return WrapPromise(
            wrappedResponse.arrayBuffer(),
            /*textForUnknown=*/ `[DecompressStringData] Failed to convert to array buffer "${reason}"`
        );
    }

    @Span()
    @PromiseResultSpanError
    public static async writeToFirebaseCache(
        app: App,
        config: LatestSyncConfigVersion,
        cloudData: SchemaWithId<LatestNotesSchema>[]
    ): Promise<StatusResult<StatusError>> {
        let cachedData: FirebaseStoredData<SchemaWithId<LatestNotesSchema>> = {
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
            cachedData = {
                lastUpdate,
                cache: cloudData
            };
        }

        const compressedCache = await this.compressStringData(
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
        const fileData = await FileUtilRaw.readRawFile(app, config.firebaseCachePath);
        if (fileData.err) {
            return fileData;
        }

        const decompressed = await this.decompressStringData(
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
        return Ok({
            lastUpdate: parsedJson.safeUnwrap().lastUpdate,
            cache: updatedCache
        });
    }
}
