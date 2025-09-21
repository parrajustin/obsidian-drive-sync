/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-prototype-builtins */
/* eslint-disable @typescript-eslint/naming-convention */
import type { ExtendedTransformableinfo, WritableStreamOptions } from "./winston/transport";
import { TransportStream } from "./winston/transport";
import { WrapOptional } from "../lib/option";
import { LEVEL, MESSAGE } from "triple-beam";

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

    public log = (logEntry: ExtendedTransformableinfo) => {
        const message = logEntry[MESSAGE];
        const level = logEntry[LEVEL];
        const mappedMethod = WrapOptional(
            this.methods[level as "debug" | "error" | "info" | "warn"]
        );
        const method = mappedMethod.valueOr("debug") as "debug" | "error" | "info" | "warn";
        this.outputInterface[method](message);
    };
}

enum Level {
    error = 0,
    warn = 1,
    info = 2,
    debug = 4
}
