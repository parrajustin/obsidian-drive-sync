import { describe, expect, test } from "@jest/globals";
import { SchemaManager } from "./schema";

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
const MANAGER = new SchemaManager<[Version0, Version1, Version2], 2>(
    [
        (data) => {
            return { name: data.name === "true", version: 1 };
        },
        (data) => {
            return {
                klep: data.name,
                otherData: "lol",
                version: 2
            };
        }
    ],
    () => {
        return { name: "default", otherData: "lol", temp: 0, version: 0 };
    }
);

describe("SchemaManager", () => {
    test("null", () => {
        const finalData = MANAGER.loadData(null);
        expect(finalData).toEqual({
            klep: false,
            otherData: "lol",
            version: 2
        });
    });
    test("undefined", () => {
        const finalData = MANAGER.loadData(undefined);
        expect(finalData).toEqual({
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
        const finalData = MANAGER.loadData(n);
        expect(finalData).toEqual({
            klep: true,
            otherData: "lol",
            version: 2
        });
    });
});
