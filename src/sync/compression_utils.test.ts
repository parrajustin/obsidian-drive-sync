import { describe, it, expect } from "@jest/globals";
import { CompressionUtils } from "./compression_utils";

describe("Compression Utils", () => {
    it("should compress and decompress a string", async () => {
        const originalString = "hello world";
        const compressed = await CompressionUtils.compressStringData(originalString, "test");
        expect(compressed.ok).toBe(true);
        const decompressed = await CompressionUtils.decompressStringData(
            new Uint8Array(compressed.unsafeUnwrap()),
            "test"
        );
        expect(decompressed.ok).toBe(true);
        expect(decompressed.unsafeUnwrap()).toEqual(originalString);
    });

    it("should handle empty string", async () => {
        const originalString = "";
        const compressed = await CompressionUtils.compressStringData(originalString, "test");
        expect(compressed.ok).toBe(true);
        const decompressed = await CompressionUtils.decompressStringData(
            new Uint8Array(compressed.unsafeUnwrap()),
            "test"
        );
        expect(decompressed.ok).toBe(true);
        expect(decompressed.unsafeUnwrap()).toEqual(originalString);
    });
});
