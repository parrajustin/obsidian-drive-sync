import { describe, expect, test } from "@jest/globals";
import { z } from "zod";
import { Ok } from "../lib/result";
import { SchemaManager, type VersionedSchema } from "./schema";

interface Version0 {
    name: string;
    otherData: "lol";
    temp: number;
}
interface Version1 {
    name: boolean;
}
interface Version2 {
    klep: boolean;
    otherData: "lol";
}

const Version0ZodSchema = z.object({
    name: z.string(),
    otherData: z.literal("lol"),
    temp: z.number(),
    version: z.literal(0),
});

const Version1ZodSchema = z.object({
    name: z.boolean(),
    version: z.literal(1),
});

const Version2ZodSchema = z.object({
    klep: z.boolean(),
    otherData: z.literal("lol"),
    version: z.literal(2),
});


const MANAGER = new SchemaManager<[VersionedSchema<Version0, 0>, VersionedSchema<Version1, 1>, VersionedSchema<Version2, 2>], 2>(
    "Test",
    [Version0ZodSchema, Version1ZodSchema, Version2ZodSchema],
    [
        (data: VersionedSchema<Version0, 0>) => {
            const v1: VersionedSchema<Version1, 1> = { name: data.name === "true", version: 1 };
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
    ] as any,
    () => {
        return { name: "default", otherData: "lol", temp: 0, version: 0 };
    }
);

describe("SchemaManager", () => {
    test("null", () => {
        const finalData = MANAGER.updateSchema(null);
        expect(finalData.unsafeUnwrap()).toEqual({
            klep: false,
            otherData: "lol",
            version: 2
        });
    });
    test("undefined", () => {
        const finalData = MANAGER.updateSchema(undefined);
        expect(finalData.unsafeUnwrap()).toEqual({
            klep: false,
            otherData: "lol",
            version: 2
        });
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
