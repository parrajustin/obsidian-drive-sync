/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/unbound-method */
import { LEVEL } from "triple-beam";
import { Writable } from "stream";
import type { TransportStreamOptions } from "winston-transport";
import type { Format, TransformableInfo } from "logform";
import type { LogEntry, Logger } from "winston";
import { WrapOptional } from "../../lib/option";
import { WrapToResult } from "../../lib/wrap_to_result";
import { CreateLogger } from "../logger";
import { Span } from "../tracing/span.decorator";

const LOGGER = CreateLogger("TransportStream");

export interface WritableStreamOptions extends TransportStreamOptions {
    highWaterMark?: number;
}

/**
 * Constructor function for the TransportStream. This is the base prototype
 * that all `winston >= 3` transports should inherit from.
 * @param {Object} options - Options for this TransportStream instance
 * @param {String} options.level - Highest level according to RFC5424.
 * @param {Boolean} options.handleExceptions - If true, info with
 * { exception: true } will be written.
 * @param {Function} options.log - Custom log function for simple Transport
 * creation
 * @param {Function} options.close - Called on "unpipe" from parent.
 */
export class TransportStream extends Writable {
    format?: Format;
    level?: string;
    handleExceptions?: boolean;
    handleRejections?: boolean;
    silent?: boolean;
    close?: () => void;
    levels?: Record<string, number>;
    parent?: Logger;

    constructor(options: WritableStreamOptions) {
        super({ objectMode: true, highWaterMark: options.highWaterMark });
        this.format = options.format;
        this.level = options.level;
        this.handleExceptions = options.handleExceptions;
        this.handleRejections = options.handleRejections;
        this.silent = options.silent;

        if (options.log) this.log = options.log;
        if (options.logv) this.logv = options.logv;
        if (options.close) this.close = options.close;

        // Get the levels from the source we are piped from.
        this.once("pipe", (logger: Logger) => {
            // Remark (indexzero): this bookkeeping can only support multiple
            // Logger parents with the same `levels`. This comes into play in
            // the `winston.Container` code in which `container.add` takes
            // a fully realized set of options with pre-constructed TransportStreams.
            this.levels = logger.levels;
            this.parent = logger;
        });

        // If and/or when the transport is removed from this instance
        this.once("unpipe", (src) => {
            // Remark (indexzero): this bookkeeping can only support multiple
            // Logger parents with the same `levels`. This comes into play in
            // the `winston.Container` code in which `container.add` takes
            // a fully realized set of options with pre-constructed TransportStreams.
            if (src === this.parent) {
                this.parent = undefined;
                if (this.close) {
                    this.close();
                }
            }
        });
    }

    /**
     * Writes the info object to our transport instance.
     * @param {mixed} info - TODO: add param description.
     * @param {mixed} enc - TODO: add param description.
     * @param {function} callback - TODO: add param description.
     * @returns {undefined}
     * @private
     */
    @Span()
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public _write(
        info: LogEntry,
        _encoding: BufferEncoding,
        callback: (error?: Error | null) => void
    ): undefined {
        if (
            this.silent === true ||
            (info.exception === true && !(this.handleExceptions ?? false))
        ) {
            callback(null);
            return;
        }

        // Remark: This has to be handled in the base transport now because we
        // cannot conditionally write to our pipe targets as stream. We always
        // prefer any explicit level set on the Transport itself falling back to
        // any level set on the parent.
        const level = this.level ?? this.parent?.level;
        const levelOpt = WrapOptional(level);
        const logLevel = WrapOptional(info[LEVEL as any]);
        const levelsOpt = WrapOptional(this.levels);
        const localLevelNum = levelOpt.merge(levelsOpt, (levelRaw, levels) =>
            WrapOptional(levels[levelRaw])
        );
        const logLevelNum = logLevel.merge(levelsOpt, (levelRaw, levels) =>
            WrapOptional(levels[levelRaw])
        );
        const levelPassesThreshold = localLevelNum.merge(
            logLevelNum,
            (localLevelNumUnwrap, logLevelNumUnwrap) => localLevelNumUnwrap >= logLevelNumUnwrap
        );
        const log = WrapOptional(this.log);
        if (log.some && (levelOpt.none || levelPassesThreshold.valueOr(false))) {
            const format = WrapOptional(this.format);
            if (format.none) {
                log.safeValue()(info, callback);
                return;
            }

            // We trap(and re-throw) any errors generated by the user-provided format, but also
            // guarantee that the streams callback is invoked so that we can continue flowing.
            const transform = WrapToResult(
                () =>
                    format
                        .safeValue()
                        .transform(
                            structuredClone(info) as TransformableInfo,
                            format.safeValue().options
                        ) as TransformableInfo,
                `Failed to transform log entry`
            );

            if (transform.err) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                callback(transform.val as any);
                LOGGER.error(transform.val.toString(), { message: info });
                return;
            }

            log.safeValue()(transform.safeUnwrap(), callback);
            return;
        }
        // this._writableState.sync = false;
        callback(null);
    }

    /**
     * Writes the batch of info objects (i.e. "object chunks") to our transport
     * instance after performing any necessary filtering.
     * @param {mixed} chunks - TODO: add params description.
     * @param {function} callback - TODO: add params description.
     * @returns {mixed} - TODO: add returns description.
     * @private
     */
    @Span()
    // eslint-disable-next-line @typescript-eslint/naming-convention
    public _writev(
        chunks: {
            chunk: any;
            encoding: BufferEncoding;
            callbasck: (error?: Error | null) => void;
        }[],
        callback: (error?: Error | null) => void
    ) {
        const logv = WrapOptional(this.logv);
        if (logv.some) {
            const infos = chunks.filter(this.accept, this);
            if (!infos.length) {
                callback(null);
                return;
            }

            // Remark (indexzero): from a performance perspective if Transport
            // implementers do choose to implement logv should we make it their
            // responsibility to invoke their format?
            logv.safeValue()(infos, callback);
            return;
        }

        const log = WrapOptional(this.log);
        const format = WrapOptional(this.format);
        if (log.some) {
            for (const entry of chunks) {
                if (!this.accept(entry)) continue;

                const chunk = WrapOptional(entry.chunk);
                if (chunk.none) {
                    continue;
                }
                if (format.none) {
                    log.safeValue()(chunk.safeValue(), callback);
                    continue;
                }

                // We trap(and re-throw) any errors generated by the user-provided format, but also
                // guarantee that the streams callback is invoked so that we can continue flowing.
                const transform = WrapToResult(
                    () =>
                        format
                            .safeValue()
                            .transform(
                                structuredClone(chunk.safeValue()) as TransformableInfo,
                                format.safeValue().options
                            ) as TransformableInfo,
                    `Failed to transform log entry`
                );

                if (transform.err) {
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                    callback(transform.val as any);
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
                    LOGGER.error(transform.val.toString(), { message: chunk.safeValue() });
                    return;
                }

                log.safeValue()(transform.safeUnwrap(), callback);
            }
        }

        callback(null);
    }

    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public log(_info: unknown, _callback: () => void) {}
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    public logv(_infos: unknown[], _callback: () => void) {}

    /**
     * Predicate function that returns true if the specfied `info` on the
     * WriteReq, `write`, should be passed down into the derived
     * TransportStream's I/O via `.log(info, callback)`.
     * @param {WriteReq} write - winston@3 Node.js WriteReq for the `info` object
     * representing the log message.
     * @returns {Boolean} - Value indicating if the `write` should be accepted &
     * logged.
     */
    private accept(write: { chunk: any; encoding: BufferEncoding }) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const info = write.chunk;
        if (this.silent === true) {
            return false;
        }

        const level = WrapOptional(this.level);
        const parentLevel = WrapOptional(this.parent?.level);
        // We always prefer any explicit level set on the Transport itself
        // falling back to any level set on the parent.
        const levelOut = WrapOptional(level.valueOr(parentLevel.valueOr(undefined)));

        const levels = WrapOptional(this.levels);
        const levelNumber = level.merge(levels, (val, levelsUnwrap) =>
            WrapOptional(levelsUnwrap[val])
        );
        const infoLevel = WrapOptional(info[LEVEL] as string | undefined);
        const infoLevelNumber = infoLevel.merge(levels, (val, levelsUnwrap) =>
            WrapOptional(levelsUnwrap[val])
        );
        const levelPassesThreshold = levelNumber.merge(
            infoLevelNumber,
            (levelNumberUnwrap, infoLevelNumberUnwrap) => levelNumberUnwrap >= infoLevelNumberUnwrap
        );

        // Immediately check the average case: log level filtering.
        if (info.exception === true || levelOut.none || levelPassesThreshold.valueOr(false)) {
            // Ensure the info object is valid based on `{ exception }`:
            // 1. { handleExceptions: true }: all `info` objects are valid
            // 2. { exception: false }: accepted by all transports.
            if (this.handleExceptions !== undefined || info.exception !== true) {
                return true;
            }
        }

        return false;
    }
}

// /**
//  * _nop is short for "No operation"
//  * @returns {Boolean} Intentionally false.
//  */
// TransportStream.prototype._nop = function _nop() {
//   // eslint-disable-next-line no-undefined
//   return void undefined;
// };
