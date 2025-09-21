/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { describe, it, expect } from "@jest/globals";
// import { format } from "logform";
import BrowserConsole from "../browser_transport";
import { Logger } from "./logger";
import { format } from "logform";

class MockOutput {
    public messages: { level: string; message: string; args: unknown[] }[] = [];

    public debug = (message: string, ...args: unknown[]) => {
        this.messages.push({ level: "debug", message, args });
    };
    public error = (message: string, ...args: unknown[]) => {
        this.messages.push({ level: "error", message, args });
    };
    public info = (message: string, ...args: unknown[]) => {
        this.messages.push({ level: "info", message, args });
    };
    public warn = (message: string, ...args: unknown[]) => {
        this.messages.push({ level: "warn", message, args });
    };

    public clear = () => {
        this.messages = [];
    };
}

describe("Logger", () => {
    it("should not be silent by default", () => {
        const logger = new Logger({
            transports: []
        });
        expect(logger.silent).toBeUndefined();
    });

    it("should not log when silent", () => {
        const mockOutput = new MockOutput();
        const transport = new BrowserConsole({ outputInterface: mockOutput });
        const logger = new Logger({
            transports: [transport],
            silent: true
        });

        logger.info("test message");

        expect(mockOutput.messages.length).toBe(0);
    });

    it("should log messages at or above the specified level", () => {
        const mockOutput = new MockOutput();
        const transport = new BrowserConsole({ outputInterface: mockOutput });
        const logger = new Logger({
            transports: [transport],
            level: "info"
        });

        logger.debug("debug message");
        logger.info("info message");
        logger.warn("warn message");
        logger.error("error message");

        expect(mockOutput.messages.length).toBe(3);
        expect(mockOutput.messages[0]!.level).toBe("info");
        expect(mockOutput.messages[1]!.level).toBe("warn");
        expect(mockOutput.messages[2]!.level).toBe("error");
    });

    it("should log all messages if no level is specified", () => {
        const mockOutput = new MockOutput();
        const transport = new BrowserConsole({ outputInterface: mockOutput });
        const logger = new Logger({
            transports: [transport]
        });

        logger.debug("debug message");
        logger.info("info message");

        expect(mockOutput.messages.length).toBe(2);
    });

    it("should use the specified format", () => {
        const mockOutput = new MockOutput();
        const transport = new BrowserConsole({
            outputInterface: mockOutput
        });
        const logger = new Logger({
            transports: [transport],
            format: format.json()
        });

        logger.info("test message", { a: 1 });

        expect(mockOutput.messages.length).toBe(1);
        const loggedMessage = JSON.parse(mockOutput.messages[0]!.message);
        expect(loggedMessage.level).toBe("info");
        expect(loggedMessage.message).toBe("test message");
        expect(loggedMessage.a).toBe(1);
    });

    it("should add and remove transports", () => {
        const mockOutput1 = new MockOutput();
        const transport1 = new BrowserConsole({ outputInterface: mockOutput1 });
        const logger = new Logger({
            transports: [transport1]
        });

        logger.info("message 1");
        expect(mockOutput1.messages.length).toBe(1);

        const mockOutput2 = new MockOutput();
        const transport2 = new BrowserConsole({ outputInterface: mockOutput2 });
        logger.transports.push(transport2);

        logger.info("message 2");
        expect(mockOutput1.messages.length).toBe(2);
        expect(mockOutput2.messages.length).toBe(1);

        logger.transports = logger.transports.filter((t) => t !== transport1);
        logger.info("message 3");
        expect(mockOutput1.messages.length).toBe(2);
        expect(mockOutput2.messages.length).toBe(2);
    });

    it("should include defaultMeta in log entries", () => {
        const mockOutput = new MockOutput();
        const transport = new BrowserConsole({ outputInterface: mockOutput });
        const logger = new Logger({
            transports: [transport],
            defaultMeta: { foo: "bar" },
            format: format.json()
        });

        logger.info("test message", { a: 1 });

        expect(mockOutput.messages.length).toBe(1);
        const loggedMessage = JSON.parse(mockOutput.messages[0]!.message);
        expect(loggedMessage.foo).toBe("bar");
        expect(loggedMessage.a).toBe(1);
    });

    it("should set the parent on the transport", () => {
        const transport = new BrowserConsole();
        const logger = new Logger({
            transports: [transport]
        });
        expect(transport.parent).toBe(logger);
    });
});
