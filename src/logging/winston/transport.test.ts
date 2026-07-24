import { describe, it, expect, jest, beforeEach, afterEach } from "@jest/globals";
import { LEVEL, MESSAGE } from "triple-beam";
import type { Format } from "logform";
import { format } from "logform";
import type { ExtendedTransformableinfo } from "./transport";
import { TransportStream } from "./transport";
import { Logger } from "./logger";

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

function MakeInfo(
    level: string,
    message = "msg",
    extra: Record<string, unknown> = {}
): ExtendedTransformableinfo {
    return {
        level,
        message,
        [LEVEL]: level,
        [MESSAGE]: message,
        ...extra
    } as ExtendedTransformableinfo;
}

describe("TransportStream", () => {
    let logged: unknown[];
    let logFn: (info: unknown) => void;

    beforeEach(() => {
        logged = [];
        logFn = (info: unknown) => {
            logged.push(info);
        };
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe("constructor", () => {
        it("copies the options onto the instance", () => {
            const close = jest.fn();
            const fmt = format.json();
            const transport = new TransportStream({
                format: fmt,
                level: "warn",
                handleExceptions: true,
                handleRejections: true,
                silent: false,
                log: logFn,
                close
            });

            expect(transport.format).toBe(fmt);
            expect(transport.level).toBe("warn");
            expect(transport.handleExceptions).toBe(true);
            expect(transport.handleRejections).toBe(true);
            expect(transport.silent).toBe(false);
            expect(transport.log).toBe(logFn);
            expect(transport.close).toBe(close);
        });

        it("leaves log and close unset when not provided", () => {
            const transport = new TransportStream({});
            expect(transport.log).toBeUndefined();
            expect(transport.close).toBeUndefined();
        });
    });

    describe("write", () => {
        it("does nothing when silent", () => {
            const transport = new TransportStream({ silent: true, log: logFn });
            transport.write(MakeInfo("error"));
            expect(logged).toHaveLength(0);
        });

        it("skips exception infos unless handleExceptions is set", () => {
            const transport = new TransportStream({ log: logFn });
            transport.write(MakeInfo("error", "boom", { exception: true }));
            expect(logged).toHaveLength(0);

            const handling = new TransportStream({ log: logFn, handleExceptions: true });
            handling.write(MakeInfo("error", "boom", { exception: true }));
            expect(logged).toHaveLength(1);
        });

        it("filters messages below the transport level", () => {
            const transport = new TransportStream({ log: logFn, level: "warn" });

            transport.write(MakeInfo("info"));
            expect(logged).toHaveLength(0);

            transport.write(MakeInfo("warn"));
            transport.write(MakeInfo("error"));
            expect(logged).toHaveLength(2);
        });

        it("falls back to the parent logger level", () => {
            const transport = new TransportStream({ log: logFn });
            new Logger({ transports: [transport], level: "error" });

            transport.write(MakeInfo("warn"));
            expect(logged).toHaveLength(0);

            transport.write(MakeInfo("error"));
            expect(logged).toHaveLength(1);
        });

        it("writes everything when no level is configured anywhere", () => {
            const transport = new TransportStream({ log: logFn });
            transport.write(MakeInfo("silly"));
            expect(logged).toHaveLength(1);
        });

        it("does nothing when there is no log function", () => {
            const transport = new TransportStream({});
            expect(() => {
                transport.write(MakeInfo("info"));
            }).not.toThrow();
        });

        it("passes the raw info through when no format is set", () => {
            const transport = new TransportStream({ log: logFn });
            const info = MakeInfo("info", "raw");
            transport.write(info);
            expect(logged[0]).toBe(info);
        });

        it("writes the transformed info when a format is set", () => {
            const transport = new TransportStream({ log: logFn, format: format.json() });
            transport.write(MakeInfo("info", "formatted", { a: 1 }));

            expect(logged).toHaveLength(1);
            const out = logged[0] as ExtendedTransformableinfo;
            const parsed = JSON.parse(out[MESSAGE] as string) as Record<string, unknown>;
            expect(parsed.message).toBe("formatted");
            expect(parsed.a).toBe(1);
        });

        it("contains errors thrown by the format instead of propagating", () => {
            const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
            const throwingFormat = {
                options: {},
                transform: () => {
                    throw new Error("bad format");
                }
            } as unknown as Format;
            const transport = new TransportStream({ log: logFn, format: throwingFormat });

            expect(() => {
                transport.write(MakeInfo("info"));
            }).not.toThrow();
            expect(logged).toHaveLength(0);
            expect(consoleError).toHaveBeenCalled();
        });

        it("drops the log when the format filters it out by returning false", () => {
            const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});
            const filteringFormat = {
                options: {},
                transform: () => false
            } as unknown as Format;
            const transport = new TransportStream({ log: logFn, format: filteringFormat });

            transport.write(MakeInfo("info"));

            expect(logged).toHaveLength(0);
            expect(consoleError).toHaveBeenCalled();
        });
    });
});
