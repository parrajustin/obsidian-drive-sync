import { describe, expect, test } from "@jest/globals";
import { z } from "zod";
import { Ok } from "../lib/result";
import { SchemaManager, type VersionedSchema } from "./schema";
import type { StatusError } from "../lib/status_error";

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
});
