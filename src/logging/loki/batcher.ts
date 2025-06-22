// const exitHook = require('async-exit-hook')
// const { logproto } = require('./proto')
// const protoHelpers = require('./proto/helpers')

import { log } from "console";
import * as protoHelpers from "./proto/helpers";

import type TransportStream from "winston-transport";

interface LokiTransportOptions extends TransportStream.TransportStreamOptions {
    host: string;
    headers?: object;
    // Interval between batches in seconds.
    interval?: number;
    batching?: boolean;
    labels?: object;
    clearOnError?: boolean;
    timeout?: number;
    useWinstonMetaAsLabels?: boolean;
    ignoredMeta?: string[];
    onConnectionError?(error: unknown): void;
}

interface LogEntryValue {
    ts?: number;
    line: string;
}

export interface LogEntry {
    labels: string | Record<string, unknown>;
    entries: LogEntryValue[];
}

export interface Batches {
    streams: LogEntry[];
}

/**
 * A batching transport layer for Grafana Loki
 *
 * @class Batcher
 */
export class Batcher {
    public url: string;
    // Interval between batches in MS.
    public interval: number;
    public circuitBreakerInterval: number;
    public batch: Batches;
    public contentType: string;
    public batchesSending: number;
    public onBatchesFlushed: () => void;
    public runLoop = true;

    /**
     * Creates an instance of Batcher.
     * Starts the batching loop if enabled.
     * @param {*} options
     * @memberof Batcher
     */
    constructor(public options: LokiTransportOptions) {
        console.log("Batcher construct", options);
        // Construct Grafana Loki push API url
        this.url = `${this.options.host}loki/api/v1/push`;

        // Define the batching intervals
        this.interval =
            this.options.interval !== undefined ? Number(this.options.interval) * 1000 : 5000;
        this.circuitBreakerInterval = 60000;

        // Initialize the log batch
        this.batch = {
            streams: []
        };

        // Define the content type headers for the POST request based on the data type
        this.contentType = "application/json";

        this.batchesSending = 0;
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        this.onBatchesFlushed = () => {};

        // If batching is enabled, run the loop
        void ((this.options.batching ?? false) && this.run());
    }

    /**
     * Marks the start of batch submitting.
     *
     * Must be called right before batcher starts sending logs.
     */
    public batchSending() {
        this.batchesSending++;
    }

    /**
     * Marks the end of batch submitting
     *
     * Must be called after the response from Grafana Loki push endpoint
     * is received and completely processed, right before
     * resolving/rejecting the promise.
     */
    public batchSent() {
        if (--this.batchesSending) return;

        this.onBatchesFlushed();
    }

    /**
     * Returns a promise that resolves after all the logs sent before
     * via log(), info(), etc calls are sent to Grafana Loki push endpoint
     * and the responses for all of them are received and processed.
     *
     * @returns {Promise}
     */
    public waitFlushed() {
        return new Promise<void>((resolve, _reject) => {
            if (!this.batchesSending && !this.batch.streams.length) {
                resolve();
                return;
            }

            this.onBatchesFlushed = () => {
                // eslint-disable-next-line @typescript-eslint/no-empty-function
                this.onBatchesFlushed = () => {};
                resolve();
            };
        });
    }

    /**
     * Returns a promise that resolves after the given duration.
     *
     * @param {*} duration
     * @returns {Promise}
     */
    public wait(duration: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, duration);
        });
    }

    /**
     * Pushes logs into the batch.
     * If logEntry is given, pushes it straight to this.sendBatchToLoki()
     *
     * @param {*} logEntry
     */
    public async pushLogEntry(logEntry: LogEntry) {
        if (logEntry.entries.length === 0) {
            return;
        }
        logEntry.entries = logEntry.entries.map((v) => {
            return {
                ts: (v.ts ?? 0) * 1000 * 1000,
                line: v.line
            };
        });
        // if ((this.options.replaceTimestamp ?? false) || noTimestamp) {
        //     logEntry.entries[0]!.ts = Date.now() * 1000 * 1000;
        // } else {
        //     logEntry.entries[0]!.ts = Date.now() * 1000 * 1000;
        // }

        // If protobuf is the used data type, construct the timestamps
        // logEntry = protoHelpers.CreateProtoTimestamps(logEntry);

        // If batching is not enabled, push the log immediately to Loki API
        if (this.options.batching !== undefined && !this.options.batching) {
            await this.sendBatchToLoki(logEntry);
        } else {
            const { streams } = this.batch;

            // Find if there's already a log with identical labels in the batch
            const match = streams.findIndex(
                (stream) => JSON.stringify(stream.labels) === JSON.stringify(logEntry.labels)
            );

            if (match > -1) {
                // If there's a match, push the log under the same label
                logEntry.entries.forEach((entry) => {
                    streams[match]!.entries.push(entry);
                });
            } else {
                // Otherwise, create a new label under streams
                streams.push(logEntry);
            }
        }
    }

    /**
     * Clears the batch.
     */
    public clearBatch() {
        this.batch.streams = [];
    }

    /**
     * Sends a batch to Grafana Loki push endpoint.
     * If a single logEntry is given, creates a batch first around it.
     *
     * @param {*} logEntry
     * @returns {Promise}
     */
    public sendBatchToLoki(logEntry?: LogEntry): Promise<void> {
        this.batchSending();
        return new Promise((resolve, reject) => {
            // If the batch is empty, do nothing
            if (this.batch.streams.length === 0 && !logEntry) {
                this.batchSent();
                resolve();
            } else {
                let reqBody = "";

                // If the data format is JSON, there's no need to construct a buffer
                let preparedJSONBatch;
                if (logEntry !== undefined) {
                    // If a single logEntry is given, wrap it according to the batch format
                    preparedJSONBatch = protoHelpers.PrepareJSONBatch({ streams: [logEntry] });
                } else {
                    // Stringify the JSON ready for transport
                    preparedJSONBatch = protoHelpers.PrepareJSONBatch(this.batch);
                }
                reqBody = JSON.stringify(preparedJSONBatch);

                // Send the data to Grafana Loki
                // Construct a buffer from the data string to have deterministic data size
                const dataBuffer = Buffer.from(reqBody, "utf8");

                // Construct the headers
                const defaultHeaders = {
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Content-Type": this.contentType,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    "Content-Length": `${dataBuffer.length}`
                };
                console.log("Header", { ...defaultHeaders, ...this.options.headers });
                fetch(this.url, {
                    body: reqBody,
                    method: "post",
                    headers: { ...defaultHeaders, ...this.options.headers },
                    redirect: "error"
                })
                    .then(() => {
                        // No need to clear the batch if batching is disabled
                        if (logEntry === undefined) {
                            this.clearBatch();
                        }
                        this.batchSent();
                        resolve();
                    })
                    .catch((err: unknown) => {
                        // Clear the batch on error if enabled
                        if (this.options.clearOnError === true) {
                            this.clearBatch();
                        }
                        if (this.options.onConnectionError !== undefined) {
                            this.options.onConnectionError(err);
                        }

                        this.batchSent();
                        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
                        reject(err);
                    });
            }
        });
    }

    /**
     * Runs the batch push loop.
     *
     * Sends the batch to Loki and waits for
     * the amount of this.interval between requests.
     */
    public async run() {
        this.runLoop = true;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (this.runLoop) {
            try {
                await this.sendBatchToLoki();
                if (this.interval === this.circuitBreakerInterval) {
                    if (this.options.interval !== undefined) {
                        this.interval = Number(this.options.interval) * 1000;
                    } else {
                        this.interval = 5000;
                    }
                }
            } catch (_e: unknown) {
                this.interval = this.circuitBreakerInterval;
            }
            await this.wait(this.interval);
        }
    }

    /**
     * Stops the batch push loop
     *
     * @param {() => void} [callback]
     */
    public close(callback?: () => void) {
        this.runLoop = false;
        this.sendBatchToLoki()
            .then(() => {
                if (callback) {
                    callback();
                }
            }) // maybe should emit something here
            .catch(() => {
                if (callback) {
                    callback();
                }
            }); // maybe should emit something here
    }
}
