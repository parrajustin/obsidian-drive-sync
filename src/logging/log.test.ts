import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import { InvalidArgumentError } from "standard-ts-lib/src/status_error";
import type { Logger } from "./winston/logger";

interface FakeNotice {
    message: string;
    duration: number | undefined;
    messageEl: { innerHTML: string };
}

const notices: FakeNotice[] = [];

jest.mock(
    "obsidian",
    () => ({
        Notice: class {
            public messageEl = { innerHTML: "" };
            constructor(
                public message: string,
                public duration?: number
            ) {
                notices.push(this as unknown as FakeNotice);
            }
        }
    }),
    { virtual: true }
);

import { CreateErrorNotice, LogError, LogUpdate } from "./log";

function MakeFakeLogger(): { logger: Logger; crit: jest.Mock } {
    const crit = jest.fn();
    return { logger: { crit } as unknown as Logger, crit };
}

describe("log", () => {
    beforeEach(() => {
        notices.length = 0;
    });

    describe("LogUpdate", () => {
        it("creates a 15s notice with the update message", () => {
            LogUpdate("something happened");

            expect(notices).toHaveLength(1);
            expect(notices[0]!.message).toBe("something happened");
            expect(notices[0]!.duration).toBe(15000);
            expect(notices[0]!.messageEl.innerHTML).toBe(
                "<b>Logged update</b>:<br/>something happened"
            );
        });
    });

    describe("CreateErrorNotice", () => {
        it("creates a 10s notice with the raw html message", () => {
            CreateErrorNotice("<b>bad</b>");

            expect(notices).toHaveLength(1);
            expect(notices[0]!.duration).toBe(10000);
            expect(notices[0]!.messageEl.innerHTML).toBe("<b>bad</b>");
        });
    });

    describe("LogError", () => {
        it("logs a StatusError with its payload as meta", () => {
            const { logger, crit } = MakeFakeLogger();
            const error = InvalidArgumentError("bad input")
                .setPayload("fileId", "abc")
                .setPayload("attempt", 2);

            LogError(logger, error);

            expect(notices).toHaveLength(1);
            expect(notices[0]!.messageEl.innerHTML).toContain("<b>Error</b>");
            expect(notices[0]!.messageEl.innerHTML).toContain("bad input");

            expect(crit).toHaveBeenCalledTimes(1);
            const [message, meta] = crit.mock.calls[0] as [string, Record<string, unknown>];
            expect(message).toContain(error.message);
            expect(message).toContain("INVALID_ARGUMENT");
            expect(meta).toEqual({ fileId: "abc", attempt: 2 });
        });

        it("logs a plain Error with its stack and instance", () => {
            const { logger, crit } = MakeFakeLogger();
            const error = new Error("plain failure");

            LogError(logger, error);

            expect(notices).toHaveLength(1);
            expect(notices[0]!.messageEl.innerHTML).toBe("<b>Logged Error</b>:<br/>plain failure");

            expect(crit).toHaveBeenCalledTimes(1);
            const [message, meta] = crit.mock.calls[0] as [string, Record<string, unknown>];
            expect(message).toBe("Logged Error: plain failure");
            expect(meta.stack).toBe(error.stack);
            expect(meta.error).toBe(error);
        });
    });
});
