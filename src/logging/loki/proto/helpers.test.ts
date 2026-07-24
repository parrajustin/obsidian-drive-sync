import { describe, it, expect } from "@jest/globals";
import type { Batches } from "../batcher";
import { PrepareJSONBatch, PrepareProtoBatch } from "./helpers";

describe("PrepareJSONBatch", () => {
    it("converts streams into loki json push format", () => {
        const batch: Batches = {
            streams: [
                {
                    labels: { level: "info", app: "test" },
                    entries: [{ ts: 1000, line: "hello" }]
                }
            ]
        };

        const prepared = PrepareJSONBatch(batch);

        expect(prepared).toEqual({
            streams: [
                {
                    stream: { level: "info", app: "test" },
                    values: [["1000", "hello"]]
                }
            ]
        });
    });

    it("appends rest metadata as a third tuple element when it is an object", () => {
        const batch: Batches = {
            streams: [
                {
                    labels: { level: "info" },
                    entries: [
                        { ts: 1, line: "with rest", rest: { traceId: "abc" } },
                        { ts: 2, line: "null rest", rest: null },
                        { ts: 3, line: "string rest", rest: "not-an-object" },
                        { ts: 4, line: "no rest" }
                    ]
                }
            ]
        };

        const prepared = PrepareJSONBatch(batch);

        expect(prepared.streams[0]!.values).toEqual([
            ["1", "with rest", { traceId: "abc" }],
            ["2", "null rest"],
            ["3", "string rest"],
            ["4", "no rest"]
        ]);
    });

    it("handles an empty batch", () => {
        expect(PrepareJSONBatch({ streams: [] })).toEqual({ streams: [] });
    });
});

describe("PrepareProtoBatch", () => {
    it("converts object labels to a proto label string with level first", () => {
        const batch: Batches = {
            streams: [
                {
                    labels: { level: "error", app: "sync", env: "dev" },
                    entries: [{ ts: 1, line: "boom" }]
                }
            ]
        };

        const prepared = PrepareProtoBatch(batch);

        expect(prepared.streams[0]!.labels).toBe('{level="error",app="sync",env="dev"}');
    });

    it("skips streams whose labels were already prepared", () => {
        const alreadyPrepared = '{level="info"}';
        const batch: Batches = {
            streams: [
                {
                    labels: alreadyPrepared,
                    entries: [{ ts: 1, line: "line" }]
                }
            ]
        };

        const prepared = PrepareProtoBatch(batch);

        expect(prepared.streams[0]!.labels).toBe(alreadyPrepared);
    });

    it("produces only the level label when no other labels exist", () => {
        const batch: Batches = {
            streams: [
                {
                    labels: { level: "warn" },
                    entries: []
                }
            ]
        };

        expect(PrepareProtoBatch(batch).streams[0]!.labels).toBe('{level="warn"}');
    });
});
