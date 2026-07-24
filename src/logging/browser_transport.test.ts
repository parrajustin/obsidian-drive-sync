import { describe, it, expect, jest, afterEach } from "@jest/globals";
import { LEVEL, MESSAGE } from "triple-beam";
import BrowserConsole from "./browser_transport";
import type { ExtendedTransformableinfo } from "./winston/transport";

function MakeInfo(level: string, message: string): ExtendedTransformableinfo {
    return {
        level,
        message,
        [LEVEL]: level,
        [MESSAGE]: message
    } as ExtendedTransformableinfo;
}

describe("BrowserConsole", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("keeps a known level from the options", () => {
        const transport = new BrowserConsole({ level: "warn" });
        expect(transport.level).toBe("warn");
    });

    it("routes each level to the matching output method", () => {
        const calls: { method: string; message: unknown }[] = [];
        const output = {
            debug: (message: unknown) => calls.push({ method: "debug", message }),
            error: (message: unknown) => calls.push({ method: "error", message }),
            info: (message: unknown) => calls.push({ method: "info", message }),
            warn: (message: unknown) => calls.push({ method: "warn", message })
        };
        const transport = new BrowserConsole({ outputInterface: output });

        transport.log(MakeInfo("debug", "d"));
        transport.log(MakeInfo("error", "e"));
        transport.log(MakeInfo("info", "i"));
        transport.log(MakeInfo("warn", "w"));

        expect(calls).toEqual([
            { method: "debug", message: "d" },
            { method: "error", message: "e" },
            { method: "info", message: "i" },
            { method: "warn", message: "w" }
        ]);
    });

    it("falls back to debug for levels without a console equivalent", () => {
        const calls: string[] = [];
        const output = {
            debug: () => calls.push("debug"),
            error: () => calls.push("error"),
            info: () => calls.push("info"),
            warn: () => calls.push("warn")
        };
        const transport = new BrowserConsole({ outputInterface: output });

        transport.log(MakeInfo("critical", "c"));
        transport.log(MakeInfo("silly", "s"));

        expect(calls).toEqual(["debug", "debug"]);
    });

    it("defaults to the console when no output interface is given", () => {
        const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
        const transport = new BrowserConsole();

        transport.log(MakeInfo("debug", "to console"));

        expect(debugSpy).toHaveBeenCalledWith("to console");
    });
});
