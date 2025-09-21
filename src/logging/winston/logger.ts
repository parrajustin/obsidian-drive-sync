import type { Format } from "logform";
import {
    LevelNumber,
    type ExtendedTransformableinfo,
    type Levels,
    type TransportStream
} from "./transport";
import { WrapOptional } from "../../lib/option";
import { WrapToResult } from "../../lib/wrap_to_result";
import { CreateErrorNotice } from "../log";
import { LEVEL, MESSAGE } from "triple-beam";

export interface LoggerOptions {
    silent?: boolean;
    format?: Format;
    level?: string;
    defaultMeta?: Record<string, string | number | boolean>;
    transports: TransportStream[];
}

export class Logger {
    public silent?: boolean;
    public format?: Format;
    public levels: Levels;
    public level?: Levels;
    public defaultMeta?: Record<string, string | number | boolean>;
    public transports: TransportStream[];

    constructor(options: LoggerOptions) {
        this.silent = options.silent;
        this.format = options.format;
        this.level = options.level as Levels;
        this.defaultMeta = options.defaultMeta;
        this.transports = options.transports;

        for (const transport of this.transports) {
            transport.parent = this;
        }
    }

    public critical(message: string, meta?: Record<string, unknown>): void {
        this.log("critical", message, meta);
    }
    public crit(message: string, meta?: Record<string, unknown>): void {
        this.crit(message, meta);
    }

    public error(message: string, meta?: Record<string, unknown>): void {
        this.log("error", message, meta);
    }

    public warn(message: string, meta?: Record<string, unknown>): void {
        this.log("warn", message, meta);
    }

    public info(message: string, meta?: Record<string, unknown>): void {
        this.log("info", message, meta);
    }

    public debug(message: string, meta?: Record<string, unknown>): void {
        this.log("debug", message, meta);
    }

    public verbose(message: string, meta?: Record<string, unknown>): void {
        this.log("verbose", message, meta);
    }

    public silly(message: string, meta?: Record<string, unknown>): void {
        this.log("silly", message, meta);
    }

    public log(level: Levels, message: string, meta?: Record<string, unknown>): void {
        if (this.silent === true) {
            return;
        }

        const levelThreshold = WrapOptional(this.level);
        const levelThresholdNumber = levelThreshold.andThen((levelRaw) =>
            WrapOptional(LevelNumber[levelRaw])
        );
        const currentLevelNumber = LevelNumber[level];
        const passesLevel = levelThresholdNumber.andThen(
            (threshold) => currentLevelNumber >= threshold
        );
        if (!passesLevel.valueOr(true)) {
            // This logging level does not pass the threshold.
            return;
        }

        const info = {
            level,
            message,
            ...this.defaultMeta,
            ...meta,
            [LEVEL]: level,
            [MESSAGE]: message
        };
        let formattedInfo = info as ExtendedTransformableinfo;
        const format = WrapOptional(this.format);
        if (format.some) {
            const transform = WrapToResult(
                () =>
                    format
                        .safeValue()
                        .transform(structuredClone(info), format.safeValue().options) as
                        | false
                        | ExtendedTransformableinfo,
                `Failed to transform log entry`
            );
            if (transform.err) {
                CreateErrorNotice(`<b>Log Transform Error</b>:<br/>${transform.val.toString()}`);
                // eslint-disable-next-line no-console
                console.error(transform.val.toString());
                return;
            }
            const output = transform.safeUnwrap();
            if (output === false) {
                CreateErrorNotice(`<b>Log Transform Error</b>:<br/>Transformer invalid`);
                // eslint-disable-next-line no-console
                console.error(`Failed to transform log entry`, { message: info });
                return;
            }
            formattedInfo = output;
        }

        for (const transport of this.transports) {
            transport.write(formattedInfo);
        }
    }
}
