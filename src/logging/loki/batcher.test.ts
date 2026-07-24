import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import type { LogEntry } from "./batcher";
import { Batcher } from "./batcher";

const HOST = "https://loki.example.com/";

function MakeEntry(labels: Record<string, unknown>, lines: string[], ts = 1): LogEntry {
    return {
        labels,
        entries: lines.map((line) => ({ ts, line }))
    };
}

describe("Batcher", () => {
    let fetchMock: jest.Mock<() => Promise<Response>>;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        fetchMock = jest.fn<() => Promise<Response>>(() =>
            Promise.resolve(new Response("", { status: 200 }))
        );
        globalThis.fetch = fetchMock as unknown as typeof fetch;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe("constructor", () => {
        it("constructs the loki push url and default interval", () => {
            const batcher = new Batcher({ host: HOST });
            expect(batcher.url).toBe(`${HOST}loki/api/v1/push`);
            expect(batcher.interval).toBe(5000);
            expect(batcher.batch.streams).toEqual([]);
            expect(batcher.contentType).toBe("application/json");
        });

        it("converts the configured interval from seconds to ms", () => {
            const batcher = new Batcher({ host: HOST, interval: 2 });
            expect(batcher.interval).toBe(2000);
        });

        it("starts the run loop only when batching is enabled", () => {
            const runSpy = jest
                .spyOn(Batcher.prototype, "run")
                .mockImplementation(() => Promise.resolve());

            new Batcher({ host: HOST });
            expect(runSpy).not.toHaveBeenCalled();

            new Batcher({ host: HOST, batching: false });
            expect(runSpy).not.toHaveBeenCalled();

            new Batcher({ host: HOST, batching: true });
            expect(runSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe("pushLogEntry", () => {
        it("ignores entries with no lines", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry({ labels: { level: "info" }, entries: [] });
            expect(batcher.batch.streams).toHaveLength(0);
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it("converts timestamps from ms to ns", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["a"], /*ts=*/ 5));
            expect(batcher.batch.streams[0]!.entries[0]!.ts).toBe(5 * 1000 * 1000);
        });

        it("treats a missing timestamp as 0", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry({ labels: { level: "info" }, entries: [{ line: "a" }] });
            expect(batcher.batch.streams[0]!.entries[0]!.ts).toBe(0);
        });

        it("merges entries with identical labels into one stream", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["one"]));
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["two"]));

            expect(batcher.batch.streams).toHaveLength(1);
            expect(batcher.batch.streams[0]!.entries.map((e) => e.line)).toEqual(["one", "two"]);
        });

        it("creates separate streams for differing labels", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["one"]));
            await batcher.pushLogEntry(MakeEntry({ level: "error" }, ["two"]));

            expect(batcher.batch.streams).toHaveLength(2);
        });

        it("sends immediately when batching is disabled", async () => {
            const batcher = new Batcher({ host: HOST, batching: false });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["direct"], /*ts=*/ 3));

            expect(batcher.batch.streams).toHaveLength(0);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            expect(url).toBe(`${HOST}loki/api/v1/push`);
            expect(request.method).toBe("post");
            const body = JSON.parse(request.body as string);
            expect(body).toEqual({
                streams: [
                    {
                        stream: { level: "info" },
                        values: [["3000000", "direct"]]
                    }
                ]
            });
        });
    });

    describe("sendBatchToLoki", () => {
        it("resolves without fetching when there is nothing to send", async () => {
            const batcher = new Batcher({ host: HOST });
            await expect(batcher.sendBatchToLoki()).resolves.toBeUndefined();
            expect(fetchMock).not.toHaveBeenCalled();
            expect(batcher.batchesSending).toBe(0);
        });

        it("sends the accumulated batch and clears it on success", async () => {
            const batcher = new Batcher({
                host: HOST,
                headers: { authorization: "Bearer token" }
            });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"], /*ts=*/ 2));

            await batcher.sendBatchToLoki();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [, request] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
            const headers = request.headers as Record<string, string>;
            expect(headers["Content-Type"]).toBe("application/json");
            expect(headers["Content-Length"]).toBe(`${(request.body as string).length}`);
            expect(headers.authorization).toBe("Bearer token");
            expect(batcher.batch.streams).toHaveLength(0);
        });

        it("rejects and reports the error when fetch fails", async () => {
            const onConnectionError = jest.fn();
            const batcher = new Batcher({ host: HOST, onConnectionError });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));

            const failure = new Error("network down");
            fetchMock.mockImplementationOnce(() => Promise.reject(failure));

            await expect(batcher.sendBatchToLoki()).rejects.toBe(failure);
            expect(onConnectionError).toHaveBeenCalledWith(failure);
            // clearOnError not set: batch is retained for retry.
            expect(batcher.batch.streams).toHaveLength(1);
            expect(batcher.batchesSending).toBe(0);
        });

        it("clears the batch on error when clearOnError is enabled", async () => {
            const batcher = new Batcher({ host: HOST, clearOnError: true });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));

            fetchMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

            await expect(batcher.sendBatchToLoki()).rejects.toThrow("boom");
            expect(batcher.batch.streams).toHaveLength(0);
        });

        it("does not clear the pending batch when sending a direct log entry", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["batched"]));

            await batcher.sendBatchToLoki(MakeEntry({ level: "error" }, ["direct"]));

            // Only the direct entry was sent; batched entries remain queued.
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(batcher.batch.streams).toHaveLength(1);
            expect(batcher.batch.streams[0]!.entries[0]!.line).toBe("batched");
        });
    });

    describe("waitFlushed", () => {
        it("resolves immediately when nothing is pending", async () => {
            const batcher = new Batcher({ host: HOST });
            await expect(batcher.waitFlushed()).resolves.toBeUndefined();
        });

        it("resolves once pending batches finish sending", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));

            let resolveFetch: (r: Response) => void = () => {};
            fetchMock.mockImplementationOnce(
                () =>
                    new Promise<Response>((resolve) => {
                        resolveFetch = resolve;
                    })
            );

            const sendPromise = batcher.sendBatchToLoki();
            let flushed = false;
            const flushPromise = batcher.waitFlushed().then(() => {
                flushed = true;
            });

            // Let microtasks run; the fetch has not resolved yet.
            await Promise.resolve();
            expect(flushed).toBe(false);

            resolveFetch(new Response("", { status: 200 }));
            await sendPromise;
            await flushPromise;
            expect(flushed).toBe(true);
        });
    });

    describe("run loop", () => {
        it("backs off to the circuit breaker interval on failure and recovers", async () => {
            jest.useFakeTimers();
            const batcher = new Batcher({
                host: HOST,
                interval: 2,
                clearOnError: true
            });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));
            fetchMock.mockImplementationOnce(() => Promise.reject(new Error("loki down")));

            const runPromise = batcher.run();

            // First iteration fails; the circuit breaker kicks in.
            await jest.advanceTimersByTimeAsync(0);
            expect(batcher.interval).toBe(batcher.circuitBreakerInterval);

            // After the circuit breaker interval the empty batch sends fine and
            // the interval resets back to the configured one.
            await jest.advanceTimersByTimeAsync(batcher.circuitBreakerInterval);
            expect(batcher.interval).toBe(2000);

            batcher.runLoop = false;
            await jest.advanceTimersByTimeAsync(2000);
            await runPromise;
        });

        it("resets to the default interval when no interval option was set", async () => {
            jest.useFakeTimers();
            const batcher = new Batcher({ host: HOST, clearOnError: true });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));
            fetchMock.mockImplementationOnce(() => Promise.reject(new Error("loki down")));

            const runPromise = batcher.run();
            await jest.advanceTimersByTimeAsync(0);
            expect(batcher.interval).toBe(batcher.circuitBreakerInterval);

            await jest.advanceTimersByTimeAsync(batcher.circuitBreakerInterval);
            expect(batcher.interval).toBe(5000);

            batcher.runLoop = false;
            await jest.advanceTimersByTimeAsync(5000);
            await runPromise;
        });
    });

    describe("close", () => {
        it("stops the loop, flushes and invokes the callback on success", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));

            const closed = new Promise<void>((resolve) => {
                batcher.close(resolve);
            });

            await closed;
            expect(batcher.runLoop).toBe(false);
            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(batcher.batch.streams).toHaveLength(0);
        });

        it("still invokes the callback when the final flush fails", async () => {
            const batcher = new Batcher({ host: HOST });
            await batcher.pushLogEntry(MakeEntry({ level: "info" }, ["line"]));
            fetchMock.mockImplementationOnce(() => Promise.reject(new Error("boom")));

            const closed = new Promise<void>((resolve) => {
                batcher.close(resolve);
            });

            await closed;
            expect(batcher.runLoop).toBe(false);
        });

        it("supports being closed without a callback", async () => {
            const batcher = new Batcher({ host: HOST });
            batcher.close();
            expect(batcher.runLoop).toBe(false);
            await batcher.waitFlushed();
        });
    });
});
