/* eslint-disable @typescript-eslint/no-unnecessary-condition */
// const Transport = require('winston-transport')
// const Batcher = require('./src/batcher')
// const { MESSAGE } = require('triple-beam')
import Transport from "winston-transport";
import type { LogEntry } from "./batcher";
import { Batcher } from "./batcher";
import { MESSAGE } from "triple-beam";
import type TransportStream from "winston-transport";
import type { TransformableInfo } from "logform";

interface LokiTransportOptions extends TransportStream.TransportStreamOptions {
    host: string;
    headers?: object;
    // Interval between batches in seconds.
    interval?: number;
    batching?: boolean;
    labels?: Record<string, unknown>;
    clearOnError?: boolean;
    timeout?: number;
    useWinstonMetaAsLabels?: boolean;
    ignoredMeta?: string[];
    onConnectionError?(error: unknown): void;
}

/**
 * A Winston transport for Grafana Loki.
 *
 * @class LokiTransport
 * @extends {Transport}
 */
export class LokiTransport extends Transport {
    public batcher: Batcher;
    public labels?: Record<string, unknown>;
    public useCustomFormat: boolean;
    public useWinstonMetaAsLabels?: boolean;
    public ignoredMeta: string[];
    /**
     * Creates an instance of LokiTransport.
     * @param {*} options
     * @memberof LokiTransport
     */
    constructor(options: LokiTransportOptions) {
        console.log("LokiTransport construct", options);
        super(options);

        // Pass all the given options to batcher
        this.batcher = new Batcher({
            host: options.host,
            headers: options.headers ?? {},
            interval: options.interval,
            batching: options.batching !== false,
            clearOnError: options.clearOnError,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            onConnectionError: options.onConnectionError,
            timeout: options.timeout
        });

        this.useCustomFormat = options.format !== undefined;
        this.labels = options.labels;
        this.useWinstonMetaAsLabels = options.useWinstonMetaAsLabels;
        this.ignoredMeta = options.ignoredMeta ?? [];
    }

    /**
     * An overwrite of winston-transport's log(),
     * which the Winston logging library uses
     * when pushing logs to a transport.
     *
     * @param {*} info
     * @param {*} callback
     * @memberof LokiTransport
     */
    public log(info: TransformableInfo, callback?: () => void) {
        console.log("LOG", info);
        // Immediately tell Winston that this transport has received the log.
        setImmediate(() => {
            this.emit("logged", info);
        });

        // Deconstruct the log
        const { label, labels, timestamp, message, ...rest } = info;
        const level = info[Symbol.for("level")];

        // build custom labels if provided
        let lokiLabels: Record<string, unknown> = { level: level };

        if (this.useWinstonMetaAsLabels ?? false) {
            // deleting the keys (labels) that we want to ignore from Winston's meta
            for (const [key, _] of Object.entries(rest)) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                if (this.ignoredMeta.includes(key)) delete rest[key];
            }
            lokiLabels = Object.assign(lokiLabels, rest);
        } else if (this.labels) {
            lokiLabels = Object.assign(lokiLabels, this.labels);
        } else {
            lokiLabels.job = label;
        }

        lokiLabels = Object.assign(lokiLabels, labels);

        // follow the format provided
        const line: string = this.useCustomFormat
            ? (info[MESSAGE] as string)
            : `${message as string} ${rest !== undefined && Object.keys(rest).length > 0 ? JSON.stringify(rest) : ""}`;

        // Make sure all label values are strings
        lokiLabels = Object.fromEntries(
            Object.entries(lokiLabels).map(([key, value]) => [
                key,
                // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
                value !== undefined || value !== null ? (value as any).toString() : value
            ])
        );

        // Construct the log to fit Grafana Loki's accepted format
        let ts = 0;
        if (timestamp !== undefined) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
            ts = new Date(timestamp as any).getTime();
        } else {
            ts = Date.now();
        }

        const logEntry: LogEntry = {
            labels: lokiLabels,
            entries: [
                {
                    ts,
                    line
                }
            ]
        };

        // Pushes the log to the batcher
        this.batcher.pushLogEntry(logEntry).catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.error(err);
        });

        // Trigger the optional callback
        if (callback !== undefined) {
            callback();
        }
    }

    /**
     * Flush unsent batched logs to Winston transport and return
     * a promise that resolves after response is received from
     * the transport. If some (batched or not) logs are being sent
     * at the time of call, the promise resolves after the transport
     * responds.
     *
     * As a result the promise returned resolves only when the transport
     * has confirmed receiving all the logs sent via log(), info(), etc
     * calls preceding the flush() call.
     */
    public async flush() {
        return this.batcher.waitFlushed();
    }

    /**
     * Send batch to loki when clean up
     */
    public close() {
        this.batcher.close();
    }
}
