import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { LEVEL, MESSAGE } from "triple-beam";
import type { TransformableInfo } from "logform";
import { format } from "logform";
import { LokiTransport } from "./transport";
import type { LogEntry } from "./batcher";
import { Batcher } from "./batcher";

jest.mock(
    "obsidian",
    () => ({
        Notice: class {
            public messageEl = { innerHTML: "" };
            constructor(
                public message: string,
                public duration?: number
            ) {}
        }
    }),
    { virtual: true }
);

const HOST = "https://loki.example.com/";

function MakeInfo(overrides: Record<string | symbol, unknown> = {}): TransformableInfo {
    return {
        level: "info",
        message: "hello",
        [LEVEL]: "info",
        ...overrides
    } as TransformableInfo;
}

describe("LokiTransport", () => {
    let pushedEntries: LogEntry[];

    beforeEach(() => {
        pushedEntries = [];
        // Never run the batching loop nor hit the network in these tests.
        jest.spyOn(Batcher.prototype, "run").mockImplementation(() => Promise.resolve());
        jest.spyOn(Batcher.prototype, "pushLogEntry").mockImplementation((entry: LogEntry) => {
            pushedEntries.push(entry);
            return Promise.resolve();
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("constructor", () => {
        it("enables batching by default", () => {
            const transport = new LokiTransport({ host: HOST });
            expect(transport.batcher.options.batching).toBe(true);
            expect(transport.useCustomFormat).toBe(false);
            expect(transport.ignoredMeta).toEqual([]);
        });

        it("disables batching when explicitly turned off", () => {
            const transport = new LokiTransport({ host: HOST, batching: false });
            expect(transport.batcher.options.batching).toBe(false);
        });

        it("marks the custom format flag when a format is provided", () => {
            const transport = new LokiTransport({ host: HOST, format: format.json() });
            expect(transport.useCustomFormat).toBe(true);
        });
    });

    describe("log", () => {
        it("uses configured labels plus level and pushes to the batcher", () => {
            const transport = new LokiTransport({
                host: HOST,
                labels: { app: "sync", answer: 42 }
            });

            transport.log(MakeInfo({ timestamp: "2020-01-02T03:04:05.000Z" }));

            expect(pushedEntries).toHaveLength(1);
            const entry = pushedEntries[0]!;
            expect(entry.labels).toEqual({ level: "info", app: "sync", answer: "42" });
            expect(entry.entries).toHaveLength(1);
            expect(entry.entries[0]!.ts).toBe(new Date("2020-01-02T03:04:05.000Z").getTime());
            expect(entry.entries[0]!.line).toContain("hello");
        });

        it("falls back to the winston label as the job label", () => {
            const transport = new LokiTransport({ host: HOST });

            transport.log(MakeInfo({ label: "my-scene" }));

            expect(pushedEntries[0]!.labels).toEqual({ level: "info", job: "my-scene" });
        });

        it("does not throw when no labels nor winston label are present", () => {
            const transport = new LokiTransport({ host: HOST });

            expect(() => {
                transport.log(MakeInfo());
            }).not.toThrow();
            expect((pushedEntries[0]!.labels as Record<string, unknown>).level).toBe("info");
        });

        it("uses winston meta as labels while dropping ignored meta", () => {
            const transport = new LokiTransport({
                host: HOST,
                useWinstonMetaAsLabels: true,
                ignoredMeta: ["secret"]
            });

            transport.log(MakeInfo({ requestId: "abc", secret: "hide-me" }));

            const labels = pushedEntries[0]!.labels as Record<string, unknown>;
            expect(labels.requestId).toBe("abc");
            expect(labels.secret).toBeUndefined();
            // The ignored meta is also removed from the log line.
            expect(pushedEntries[0]!.entries[0]!.line).not.toContain("hide-me");
        });

        it("merges per-log labels over configured ones", () => {
            const transport = new LokiTransport({ host: HOST, labels: { app: "sync" } });

            transport.log(MakeInfo({ labels: { app: "override", extra: "yes" } }));

            expect(pushedEntries[0]!.labels).toEqual({
                level: "info",
                app: "override",
                extra: "yes"
            });
        });

        it("uses the formatted MESSAGE line when a custom format is given", () => {
            const transport = new LokiTransport({ host: HOST, format: format.json() });

            transport.log(MakeInfo({ [MESSAGE]: '{"formatted":true}' }));

            expect(pushedEntries[0]!.entries[0]!.line).toBe('{"formatted":true}');
        });

        it("appends remaining meta to the log line when not using a custom format", () => {
            const transport = new LokiTransport({ host: HOST, labels: { app: "sync" } });

            transport.log(MakeInfo({ requestId: "abc" }));

            expect(pushedEntries[0]!.entries[0]!.line).toContain('"requestId":"abc"');
        });

        it("defaults the timestamp to now when none is given", () => {
            jest.spyOn(Date, "now").mockReturnValue(123456789);
            const transport = new LokiTransport({ host: HOST });

            transport.log(MakeInfo());

            expect(pushedEntries[0]!.entries[0]!.ts).toBe(123456789);
        });

        it("passes metadataContext through as the entry rest", () => {
            const transport = new LokiTransport({ host: HOST });

            transport.log(MakeInfo({ metadataContext: { traceId: "t1" } }));

            expect(pushedEntries[0]!.entries[0]!.rest).toEqual({ traceId: "t1" });
        });

        it("contains push errors instead of throwing", async () => {
            const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
            (Batcher.prototype.pushLogEntry as jest.Mock).mockImplementation(() =>
                Promise.reject(new Error("push failed"))
            );
            const transport = new LokiTransport({ host: HOST });

            expect(() => {
                transport.log(MakeInfo());
            }).not.toThrow();

            // Let the rejected promise settle through the catch handler.
            await Promise.resolve();
            await Promise.resolve();
            expect(consoleError).toHaveBeenCalledWith(expect.any(Error));
        });
    });

    describe("flush", () => {
        it("delegates to the batcher waitFlushed", async () => {
            const waitFlushed = jest
                .spyOn(Batcher.prototype, "waitFlushed")
                .mockImplementation(() => Promise.resolve());
            const transport = new LokiTransport({ host: HOST });

            await transport.flush();

            expect(waitFlushed).toHaveBeenCalledTimes(1);
        });
    });

    describe("close", () => {
        it("closes the batcher", () => {
            const close = jest.spyOn(Batcher.prototype, "close").mockImplementation(() => {});
            const transport = new LokiTransport({ host: HOST });

            transport.close();

            expect(close).toHaveBeenCalledTimes(1);
        });
    });
});
