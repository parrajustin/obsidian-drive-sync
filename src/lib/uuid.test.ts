import { describe, expect, it } from "@jest/globals";
import { UUID, V7Generator, uuidv7, uuidv7obj, uuidv4, uuidv4obj } from "./uuid";

describe("UUID", () => {
    it("should parse 32-digit hex", () => {
        const u = UUID.parse("0189dcd553117d408db09496a2eef37b");
        expect(u.toString()).toBe("0189dcd5-5311-7d40-8db0-9496a2eef37b");
    });

    it("should parse 8-4-4-4-12 hex", () => {
        const u = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37b");
        expect(u.toHex()).toBe("0189dcd553117d408db09496a2eef37b");
    });

    it("should parse braced hex", () => {
        const u = UUID.parse("{0189dcd5-5311-7d40-8db0-9496a2eef37b}");
        expect(u.toString()).toBe("0189dcd5-5311-7d40-8db0-9496a2eef37b");
    });

    it("should parse URN format", () => {
        const u = UUID.parse("urn:uuid:0189dcd5-5311-7d40-8db0-9496a2eef37b");
        expect(u.toString()).toBe("0189dcd5-5311-7d40-8db0-9496a2eef37b");
    });

    it("should throw SyntaxError for invalid formats", () => {
        expect(() => UUID.parse("invalid")).toThrow(SyntaxError);
        expect(() => UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37x")).toThrow(SyntaxError);
    });

    it("should compare correctly", () => {
        const u1 = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37a");
        const u2 = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37b");
        const u3 = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37a");

        expect(u1.compareTo(u2)).toBeLessThan(0);
        expect(u2.compareTo(u1)).toBeGreaterThan(0);
        expect(u1.compareTo(u3)).toBe(0);
        expect(u1.equals(u3)).toBe(true);
        expect(u1.equals(u2)).toBe(false);
    });

    it("should clone properly", () => {
        const u = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37b");
        const cloned = u.clone();
        expect(cloned.equals(u)).toBe(true);
        expect(cloned).not.toBe(u);
    });

    it("should return JSON string", () => {
        const u = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37b");
        expect(u.toJSON()).toBe("0189dcd5-5311-7d40-8db0-9496a2eef37b");
    });

    it("should get variants and versions correctly", () => {
        const u = UUID.parse("0189dcd5-5311-7d40-8db0-9496a2eef37b"); // version 7
        expect(u.getVariant()).toBe("VAR_10");
        expect(u.getVersion()).toBe(7);

        const u4 = UUID.parse("0189dcd5-5311-4d40-8db0-9496a2eef37b"); // version 4
        expect(u4.getVersion()).toBe(4);

        const nil = UUID.parse("00000000-0000-0000-0000-000000000000");
        expect(nil.getVariant()).toBe("NIL");

        const max = UUID.parse("ffffffff-ffff-ffff-ffff-ffffffffffff");
        expect(max.getVariant()).toBe("MAX");
    });

    it("should validate fromFieldsV7", () => {
        expect(() => UUID.fromFieldsV7(-1, 0, 0, 0)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0, -1, 0, 0)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0, 0, -1, 0)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0, 0, 0, -1)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0xffff_ffff_ffff + 1, 0, 0, 0)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0, 0xfff + 1, 0, 0)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0, 0, 0x3fff_ffff + 1, 0)).toThrow(RangeError);
        expect(() => UUID.fromFieldsV7(0, 0, 0, 0xffff_ffff + 1)).toThrow(RangeError);
    });

    it("should throw if inner is not 16 bytes", () => {
        expect(() => UUID.ofInner(new Uint8Array(15))).toThrow(TypeError);
    });
});

describe("V7Generator", () => {
    it("should generate monotonically increasing uuids", () => {
        const gen = new V7Generator();
        const u1 = gen.generate();
        const u2 = gen.generate();
        expect(u1.compareTo(u2)).toBeLessThan(0);
    });

    it("should generate V4 uuids", () => {
        const gen = new V7Generator();
        const u = gen.generateV4();
        expect(u.getVersion()).toBe(4);
        expect(u.getVariant()).toBe("VAR_10");
    });

    it("should handle clock rollback within allowance", () => {
        const gen = new V7Generator();
        const u1 = gen.generateOrResetCore(10000, 1000);
        const u2 = gen.generateOrResetCore(9500, 1000); // 500ms rollback
        expect(u1.compareTo(u2)).toBeLessThan(0); // counter should increment, monotonic
    });

    it("should abort if rollback exceeds allowance", () => {
        const gen = new V7Generator();
        gen.generateOrResetCore(10000, 1000);
        const u = gen.generateOrAbortCore(5000, 1000); // 5000ms rollback > 1000
        expect(u).toBeUndefined();
    });

    it("should reset if rollback exceeds allowance using generateOrResetCore", () => {
        const gen = new V7Generator();
        const u1 = gen.generateOrResetCore(10000, 1000);
        const u2 = gen.generateOrResetCore(5000, 1000); // 5000ms rollback > 1000
        // u2 is now generated at 5000ms timestamp, so it will be less than u1
        expect(u1.compareTo(u2)).toBeGreaterThan(0);
    });

    it("should throw error for invalid arguments in generateOrAbortCore", () => {
        const gen = new V7Generator();
        expect(() => gen.generateOrAbortCore(-1, 1000)).toThrow(RangeError);
        expect(() => gen.generateOrAbortCore(1000, -1)).toThrow(RangeError);
        expect(() => gen.generateOrAbortCore(1000, 0xffff_ffff_ffff + 1)).toThrow(RangeError);
    });

    it("should increment timestamp if counter overflows", () => {
        const gen = new V7Generator({ nextUint32: () => 0xffffffff });
        // Max counter is 0x3ff_ffff_ffff
        // by making the RNG return max values, we can't easily hit overflow with just one call.
        // We'll mock the internal state to force overflow.
        (gen as any)._timestamp = 1000;
        (gen as any)._counter = 0x3ff_ffff_ffff;

        const u = gen.generateOrResetCore(1000, 1000);
        // Timestamp should increment to 1001 because counter overflowed.
        const decodedTimestamp = parseInt(u.toHex().substring(0, 12), 16);
        expect(decodedTimestamp).toBe(1001);
    });

    it("should handle UUID.getVariant edge cases", () => {
        // VAR_0
        UUID.parse("00000000-0000-0000-0000-000000000000"); // 0000...
        // set bit 63 to 0 and some other bit to 1
        const v0bytes = new Uint8Array(16);
        v0bytes[8] = 0x7f;
        expect(UUID.ofInner(v0bytes).getVariant()).toBe("VAR_0");

        // VAR_110
        const v110bytes = new Uint8Array(16);
        v110bytes[8] = 0xc0;
        expect(UUID.ofInner(v110bytes).getVariant()).toBe("VAR_110");

        // VAR_RESERVED
        const vResBytes = new Uint8Array(16);
        vResBytes[8] = 0xe0; // 1110...
        expect(UUID.ofInner(vResBytes).getVariant()).toBe("VAR_RESERVED");
    });
});

describe("uuidv7 and uuidv4 exports", () => {
    it("should generate strings and objects", () => {
        expect(typeof uuidv7()).toBe("string");
        expect(uuidv7obj()).toBeInstanceOf(UUID);
        expect(typeof uuidv4()).toBe("string");
        expect(uuidv4obj()).toBeInstanceOf(UUID);
    });

    it("should abort correctly globally", () => {
        uuidv7obj(); // just ensuring it runs
    });
});
