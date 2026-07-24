import { describe, expect, it } from "@jest/globals";
import * as crypto from "crypto";
import { Hash, HMAC, GetSha256Hash, GetHmacSha256, Hkdf, Pbkdf2 } from "./sha";

describe("sha256", () => {
    it("should hash correctly", () => {
        const data = Buffer.from("hello world");
        const expected = crypto.createHash("sha256").update(data).digest();
        const actual = GetSha256Hash(new Uint8Array(data));
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should support multiple updates", () => {
        const hash = new Hash();
        hash.update(new Uint8Array(Buffer.from("hello ")));
        hash.update(new Uint8Array(Buffer.from("world")));
        const actual = hash.digest();
        const expected = crypto.createHash("sha256").update("hello world").digest();
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should throw if updating finished hash", () => {
        const hash = new Hash();
        hash.update(new Uint8Array(Buffer.from("hello")));
        hash.digest();
        expect(() => hash.update(new Uint8Array(Buffer.from("world")))).toThrow(
            "SHA256: can't update because hash was finished."
        );
    });

    it("should be reusable after reset", () => {
        const hash = new Hash();
        hash.update(new Uint8Array(Buffer.from("hello")));
        hash.reset();
        hash.update(new Uint8Array(Buffer.from("hello world")));
        const actual = hash.digest();
        const expected = crypto.createHash("sha256").update("hello world").digest();
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should hash a very large input", () => {
        const data = crypto.randomBytes(100000); // larger than multiple blocks
        const expected = crypto.createHash("sha256").update(data).digest();
        const actual = GetSha256Hash(new Uint8Array(data));
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });
});

describe("hmac-sha256", () => {
    it("should compute hmac correctly", () => {
        const key = Buffer.from("my-secret-key");
        const data = Buffer.from("hello world");
        const expected = crypto.createHmac("sha256", key).update(data).digest();
        const actual = GetHmacSha256(new Uint8Array(key), new Uint8Array(data));
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should handle keys larger than blocksize", () => {
        const key = crypto.randomBytes(100);
        const data = Buffer.from("hello world");
        const expected = crypto.createHmac("sha256", key).update(data).digest();
        const actual = GetHmacSha256(new Uint8Array(key), new Uint8Array(data));
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should support multiple updates and reset", () => {
        const key = Buffer.from("key");
        const hmac = new HMAC(new Uint8Array(key));
        hmac.update(new Uint8Array(Buffer.from("hello ")));
        hmac.update(new Uint8Array(Buffer.from("world")));
        const actual1 = hmac.digest();

        hmac.reset();
        hmac.update(new Uint8Array(Buffer.from("hello world")));
        const actual2 = hmac.digest();

        expect(Buffer.from(actual1).toString("hex")).toBe(Buffer.from(actual2).toString("hex"));
    });
});

describe("hkdf", () => {
    it("should derive keys correctly", () => {
        // RFC 5869 Test Case 1
        const ikm = Buffer.from("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b", "hex");
        const salt = Buffer.from("000102030405060708090a0b0c", "hex");
        const info = Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex");
        const expectedOkm = Buffer.from(
            "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865",
            "hex"
        );

        const actual = Hkdf(new Uint8Array(ikm), new Uint8Array(salt), new Uint8Array(info), 42);
        expect(Buffer.from(actual).toString("hex")).toBe(expectedOkm.toString("hex"));
    });

    it("should handle large length requiring multiple iterations", () => {
        const ikm = Buffer.from("secret");
        const salt = Buffer.from("salt");
        const actual = Hkdf(new Uint8Array(ikm), new Uint8Array(salt), undefined, 100);
        expect(actual.length).toBe(100);
        // just check it produces deterministic output
        const actual2 = Hkdf(new Uint8Array(ikm), new Uint8Array(salt), undefined, 100);
        expect(Buffer.from(actual).toString("hex")).toBe(Buffer.from(actual2).toString("hex"));
    });

    it("should throw if requesting too much data", () => {
        const ikm = Buffer.from("secret");
        const salt = Buffer.from("salt");
        expect(() => {
            Hkdf(new Uint8Array(ikm), new Uint8Array(salt), undefined, 256 * 32);
        }).toThrow("hkdf: cannot expand more");
    });
});

describe("pbkdf2", () => {
    it("should derive keys correctly", () => {
        const password = Buffer.from("password");
        const salt = Buffer.from("salt");
        const actual = Pbkdf2(new Uint8Array(password), new Uint8Array(salt), 1, 20);
        const expected = crypto.pbkdf2Sync(password, salt, 1, 20, "sha256");
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should handle multiple iterations", () => {
        const password = Buffer.from("password");
        const salt = Buffer.from("salt");
        const actual = Pbkdf2(new Uint8Array(password), new Uint8Array(salt), 4096, 32);
        const expected = crypto.pbkdf2Sync(password, salt, 4096, 32, "sha256");
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });

    it("should handle dkLen larger than hash length", () => {
        const password = Buffer.from("password");
        const salt = Buffer.from("salt");
        const actual = Pbkdf2(new Uint8Array(password), new Uint8Array(salt), 10, 40);
        const expected = crypto.pbkdf2Sync(password, salt, 10, 40, "sha256");
        expect(Buffer.from(actual).toString("hex")).toBe(expected.toString("hex"));
    });
});
