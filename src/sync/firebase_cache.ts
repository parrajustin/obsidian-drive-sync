import { StatusResult, type Result } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import type { LatestNotesSchema } from "../schema/notes/notes.schema";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import type { LatestSettingsConfigVersion } from "../schema/settings/settings_config.schema";
import { App } from "obsidian";
import { FileUtilRaw } from "../filesystem/file_util_raw_api";

export interface FirebaseStoredData<T> {
    /** The date of the latest update. */
    lastUpdate: number;
    /** Cached data has everything but the actual file data. */
    cache: T[];
    /** Number of entries in the cache. */
    length: number;
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
        config: LatestSettingsConfigVersion,
        cloudData: LatestNotesSchema[]
    ): Promise<StatusResult<StatusError>> {
        let cachedData: FirebaseStoredData<LatestNotesSchema> = {
            lastUpdate: -1,
            length: 0,
            cache: []
        };

        if (cloudData.length > 0) {
            let lastUpdate = Number.MIN_SAFE_INTEGER;
            for (const entry of cloudData) {
                if (entry.entryTime > lastUpdate) {
                    lastUpdate = entry.entryTime;
                }
            }
            cachedData = {
                lastUpdate,
                length: cloudData.length,
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
        config: LatestSettingsConfigVersion
    ): Promise<Result<FirebaseStoredData<LatestNotesSchema>, StatusError>> {
        const fileData = await FileUtilRaw.readRawFile(app, config.firebaseCachePath);
        if (fileData.err) {
            return fileData;
        }

        const decompressed = await this.decompressStringData(
            fileData.safeUnwrap(),
            "Firebase Cache"
        );
        return decompressed
            .map((n) => new Uint8Array(n))
            .map((n) => new window.TextDecoder("utf-8").decode(n))
            .map((n) => JSON.parse(n) as FirebaseStoredData<LatestNotesSchema>);
    }
}
