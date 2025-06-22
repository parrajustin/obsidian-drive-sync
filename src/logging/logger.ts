import { LokiTransport } from "./loki/transport";
import type TransportStream from "winston-transport";
import {
    LOKI_ACCESS_CLIENT_ID,
    LOKI_ACCESS_CLIENT_SECRET,
    LOKI_URL,
    PLUGIN_ENVIRONMENT,
    PLUGIN_VERSION,
    RUN_ID,
    SERVICE_NAME
} from "../constants";
import { format } from "logform";
import type { Logger } from "winston";
import { createLogger, transports } from "winston";

// export interface LogInfoObj extends TransformableInfo {
//     [LEVEL]: string;
//     // Label associated with each message.
//     label: string;
//     labels: string[];
//     // eslint-disable-next-line @typescript-eslint/no-explicit-any
//     [MESSAGE]: any;
//     timestamp: number;
//     // Raw message.
//     message: string;
// }

// interface LoggerOpts {
//     format?: Format;
// }

// enum Levels {
//     INFO = "info",
//     WARN = "warn",
//     ERROR = "error",
//     FATAL = "fatal"
// }

// class Logger {
//     constructor(
//         private _opts: LoggerOpts,
//         private _transports: TransportStream[]
//     ) {}

//     public addTransport(transport: TransportStream[]) {
//         this._transports.push(...transport);
//     }

//     public warn(msg: string, meta: Record<string, unknown>) {
//         this.log(Levels.WARN, msg, meta);
//     }

//     public error(msg: string, meta: Record<string, unknown>) {
//         this.log(Levels.ERROR, msg, meta);
//     }

//     public fatal(msg: string, meta: Record<string, unknown>) {
//         this.log(Levels.FATAL, msg, meta);
//     }

//     public info(msg: string, meta: Record<string, unknown>) {
//         this.log(Levels.INFO, msg, meta);
//     }

//     public log(level: Levels, msg: string, meta: Record<string, unknown>) {
//         const { label, labels, ...rest } = meta;
//         const msgObj: LogInfoObj = {
//             level,
//             // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
//             label: label as any,
//             // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
//             labels: labels as any,
//             timestamp: new Date().getTime(),
//             message: msg,
//             ...rest,
//             [LEVEL]: level,
//             [MESSAGE]: msg
//         };
//         let formatedStr: Option<LogInfoObj> = None;
//         if (this._opts.format !== undefined) {
//             formatedStr = WrapOptional<LogInfoObj | boolean>(
//                 this._opts.format.transform(msgObj) as LogInfoObj | boolean
//             ).andThen<LogInfoObj>((val) => {
//                 if (typeof val === "boolean") {
//                     return None;
//                 }
//                 return Some(val);
//             });
//         }
//         for (const transport of this._transports) {
//             transport.write(formatedStr.valueOr(msgObj));
//         }
//     }
// }

export function CreateLogger(label: string): Logger {
    const transportStreams: TransportStream[] = [
        new LokiTransport({
            level: "debug",
            host: LOKI_URL,
            labels: {
                env: PLUGIN_ENVIRONMENT,
                version: PLUGIN_VERSION,
                // eslint-disable-next-line @typescript-eslint/naming-convention, camelcase
                service_name: SERVICE_NAME,
                scene: label
            },
            format: format.json(),
            headers: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "CF-Access-Client-Id": LOKI_ACCESS_CLIENT_ID,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "CF-Access-Client-Secret": LOKI_ACCESS_CLIENT_SECRET
            },
            batching: false,
            clearOnError: true,
            onConnectionError: (err: unknown) => {
                console.log("ERROR!", err);
            }
        })
    ];
    if (PLUGIN_ENVIRONMENT !== "production") {
        transportStreams.unshift(
            new transports.Console({
                level: "debug",
                format: format.combine(
                    format.label({ label }),
                    format.timestamp(),
                    format.prettyPrint()
                )
            })
        );
    }

    return createLogger({
        level: "info",
        format: format.combine(format.label({ label }), format.timestamp(), format.prettyPrint()),
        defaultMeta: { env: PLUGIN_ENVIRONMENT, version: PLUGIN_VERSION, runId: RUN_ID },
        transports: transportStreams
    });
}
