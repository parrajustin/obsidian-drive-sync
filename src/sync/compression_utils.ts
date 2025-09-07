import type { Result } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import { WrapToResult } from "../lib/wrap_to_result";

export class CompressionUtils {
    /** Compress string data to base64 gzip data. */
    @Span()
    @PromiseResultSpanError
    public static async compressStringData(
        data: string,
        reason: string
    ): Promise<Result<ArrayBuffer, StatusError>> {
        const encoder = new TextEncoder();
        const chunk = encoder.encode(data);
        return CompressionUtils.compressData(chunk, reason);
    }
    /** Compress string data to base64 gzip data. */
    @Span()
    @PromiseResultSpanError
    public static async compressData(
        data: Uint8Array,
        reason: string
    ): Promise<Result<ArrayBuffer, StatusError>> {
        // Create the read stream and compress the data.
        const readableStream = WrapToResult(
            () =>
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(data);
                        controller.close();
                    }
                }).pipeThrough(new CompressionStream("gzip")),
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
    }

    /** Decompress string data. */
    @Span()
    @PromiseResultSpanError
    public static async decompressData(
        data: Uint8Array,
        reason: string
    ): Promise<Result<ArrayBuffer, StatusError>> {
        // Create the read stream and decompress the data.
        const readableStream = WrapToResult(
            () =>
                new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(data);
                        controller.close();
                    }
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
                }).pipeThrough(new DecompressionStream("gzip") as any),
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

    /** Decompress string data. */
    @Span()
    @PromiseResultSpanError
    public static async decompressStringData(
        data: Uint8Array,
        reason: string
    ): Promise<Result<string, StatusError>> {
        const decompressedResult = await CompressionUtils.decompressData(data, reason);
        return decompressedResult.map((buffer) => new TextDecoder().decode(buffer));
    }
}
