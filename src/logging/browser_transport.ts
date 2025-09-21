/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */
/* eslint-disable @typescript-eslint/naming-convention */
import type * as winston from "winston";
import type { WritableStreamOptions } from "./winston/transport";
import { TransportStream } from "./winston/transport";
import { WrapOptional } from "../lib/option";

export interface BrowserConsoleOptions extends WritableStreamOptions {
    outputInterface?: {
        debug: (...args: any) => void;
        error: (...args: any) => void;
        info: (...args: any) => void;
        warn: (...args: any) => void;
    };
}

export default class BrowserConsole extends TransportStream {
    private methods = {
        debug: "debug",
        error: "error",
        info: "info",
        warn: "warn"
    };

    private outputInterface: {
        debug: (...args: any) => void;
        error: (...args: any) => void;
        info: (...args: any) => void;
        warn: (...args: any) => void;
    };

    constructor(opts: BrowserConsoleOptions = {}) {
        super(opts);

        if (opts.level && Level.hasOwnProperty(opts.level)) {
            this.level = opts.level;
        }
        if (opts.outputInterface !== undefined) {
            this.outputInterface = opts.outputInterface;
        } else {
            this.outputInterface = {
                // eslint-disable-next-line no-console
                debug: console.debug,
                // eslint-disable-next-line no-console
                error: console.error,
                // eslint-disable-next-line no-console
                info: console.info,
                // eslint-disable-next-line no-console
                warn: console.warn
            };
        }
    }

    public log(logEntry: winston.LogEntry, next: () => void) {
        // (window as any).l = logEntry;
        setImmediate(() => {
            (this as any).emit("logged", logEntry);
        });

        const { message, level } = logEntry;
        const mappedMethod = WrapOptional(
            this.methods[level as "debug" | "error" | "info" | "warn"]
        );
        const method = mappedMethod.valueOr("debug") as "debug" | "error" | "info" | "warn";

        if (Object.getOwnPropertySymbols(logEntry).length === 2) {
            this.outputInterface[method](message);
        } else {
            // @ts-ignore
            let args = logEntry[Object.getOwnPropertySymbols(logEntry)[1]];
            args = args.length >= 1 ? args[0] : args;
            if (args) {
                this.outputInterface[method](message, args);
            } else {
                this.outputInterface[method](message);
            }
        }

        next();
    }
}

enum Level {
    error = 0,
    warn = 1,
    info = 2,
    debug = 4
}
