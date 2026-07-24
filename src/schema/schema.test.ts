import { describe, expect, test } from "@jest/globals";
import { z } from "zod";
import { Err, Ok } from "standard-ts-lib/src/result";
import { SchemaManager, type VersionedSchema } from "./schema";
import { InternalError, type StatusError } from "standard-ts-lib/src/status_error";

const version0ZodSchema = z.object({
    name: z.string(),
    otherData: z.literal("lol"),
    temp: z.number(),
    version: z.literal(0)
});
type Version0 = z.infer<typeof version0ZodSchema>;

const version1ZodSchema = z.object({
    name: z.boolean(),
    version: z.literal(1)
});
type Version1 = z.infer<typeof version1ZodSchema>;

const version2ZodSchema = z.object({
    klep: z.boolean(),
    otherData: z.literal("lol"),
    version: z.literal(2)
});
type Version2 = z.infer<typeof version2ZodSchema>;

const MANAGER = new SchemaManager<[Version0, Version1, Version2], 2>(
    "Test",
    [version0ZodSchema, version1ZodSchema, version2ZodSchema],
    [
        (data: Version0) => {
            const v1: Version1 = { name: data.name === "true", version: 1 };
            return Ok(v1);
        },
        (data: VersionedSchema<Version1, 1>) => {
            const v2: VersionedSchema<Version2, 2> = {
                klep: data.name,
                otherData: "lol",
                version: 2
            };
            return Ok(v2);
        }
    ],
    () => {
        return { klep: false, otherData: "lol", version: 2 };
    }
);

describe("SchemaManager", () => {
    test("getDefault", () => {
        const defaultData = MANAGER.getDefault();
        expect(defaultData.unsafeUnwrap()).toEqual({
            klep: false,
            otherData: "lol",
            version: 2
        });
    });

    test("null", () => {
        const finalData = MANAGER.updateSchema(null);
        expect((finalData.val as StatusError).toString()).toContain(
            "Input data either null | undefined"
        );
    });
    test("undefined", () => {
        const finalData = MANAGER.updateSchema(undefined);
        expect((finalData.val as StatusError).toString()).toContain(
            "Input data either null | undefined"
        );
    });
    test("InputData", () => {
        const n = {
            name: "true",
            otherData: "lol",
            temp: 43,
            version: 0
        };
        const finalData = MANAGER.updateSchema(n);
        expect(finalData.unsafeUnwrap()).toEqual({
            klep: true,
            otherData: "lol",
            version: 2
        });
    });

    test("data already at latest version passes through without conversion", () => {
        const n = { klep: true, otherData: "lol", version: 2 };
        const finalData = MANAGER.updateSchema(n);
        expect(finalData.unsafeUnwrap()).toEqual(n);
    });

    test("missing version property is rejected", () => {
        const finalData = MANAGER.updateSchema({ name: "true" } as never);
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            "Couldn't get input data version."
        );
    });

    test("negative version is rejected", () => {
        const finalData = MANAGER.updateSchema({ version: -1 });
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            'Failed to get a valid verison number found "-1"'
        );
    });

    test("version greater than max is rejected", () => {
        const finalData = MANAGER.updateSchema({ version: 5 });
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            'Failed to get a valid verison number found "5"'
        );
    });

    test("non integer version within bounds has no zod schema", () => {
        const finalData = MANAGER.updateSchema({ version: 1.5 });
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            "No zod schema found for version 1.5"
        );
    });

    test("data failing validation at version 0 is rejected", () => {
        const n = { name: 42, otherData: "lol", temp: 1, version: 0 };
        const finalData = MANAGER.updateSchema(n as never);
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            "Schema validation failed for Test version 0"
        );
    });

    test("data failing validation at a mid chain version is rejected", () => {
        const n = { name: "not-a-bool", version: 1 };
        const finalData = MANAGER.updateSchema(n as never);
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            "Schema validation failed for Test version 1"
        );
    });

    test("getSchemas and getLatestVersion", () => {
        expect(MANAGER.getSchemas()).toHaveLength(3);
        expect(MANAGER.getLatestVersion()).toBe(2);
    });
});

describe("SchemaManager error managers", () => {
    const FAILING_CONVERTER_MANAGER = new SchemaManager<[Version0, Version1], 1>(
        "FailTest",
        [version0ZodSchema, version1ZodSchema],
        [
            (_data: Version0) => {
                return Err(InternalError("conversion failed"));
            }
        ]
    );

    test("converter errors bubble up", () => {
        const n = { name: "true", otherData: "lol", temp: 1, version: 0 };
        const finalData = FAILING_CONVERTER_MANAGER.updateSchema(n);
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain("conversion failed");
    });

    test("getDefault without a default function returns NotFoundError", () => {
        const defaultData = FAILING_CONVERTER_MANAGER.getDefault();
        expect(defaultData.err).toBe(true);
        expect((defaultData.val as StatusError).toString()).toContain(
            "No default schema found for FailTest."
        );
    });

    const NO_SCHEMA_MANAGER = new SchemaManager<[Version0], 0>("NoSchema", [], [], () => {
        return { name: "a", otherData: "lol", temp: 1, version: 0 };
    });

    test("getDefault without a zod schema returns internal error", () => {
        const defaultData = NO_SCHEMA_MANAGER.getDefault();
        expect(defaultData.err).toBe(true);
        expect((defaultData.val as StatusError).toString()).toContain(
            "No zod schema found for version 0"
        );
    });

    test("updateSchema without a zod schema returns internal error", () => {
        const n = { name: "a", otherData: "lol", temp: 1, version: 0 };
        const finalData = NO_SCHEMA_MANAGER.updateSchema(n);
        expect(finalData.err).toBe(true);
        expect((finalData.val as StatusError).toString()).toContain(
            "No zod schema found for version 0"
        );
    });

    const BAD_DEFAULT_MANAGER = new SchemaManager<[Version0], 0>(
        "BadDefault",
        [version0ZodSchema],
        [],
        () => {
            return { name: 42, otherData: "lol", temp: 1, version: 0 } as unknown as Version0;
        }
    );

    test("getDefault failing validation returns invalid argument error", () => {
        const defaultData = BAD_DEFAULT_MANAGER.getDefault();
        expect(defaultData.err).toBe(true);
        expect((defaultData.val as StatusError).toString()).toContain(
            "Schema validation failed for BadDefault version 0"
        );
    });
});
