/* eslint-disable @typescript-eslint/no-explicit-any */

/* eslint-disable @typescript-eslint/unbound-method */
import { LEVEL } from "triple-beam";
import type { Format, TransformableInfo } from "logform";
import type { Logger } from "./logger";
import { WrapOptional } from "../../lib/option";
import { WrapToResult } from "../../lib/wrap_to_result";
import { Span } from "../tracing/span.decorator";

export type Levels = "critical" | "error" | "warn" | "info" | "verbose" | "debug" | "silly";

export enum LevelNumber {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    critical = 6,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    error = 5,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    warn = 4,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    info = 3,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    debug = 2,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    verbose = 1,
    // eslint-disable-next-line @typescript-eslint/naming-convention
    silly = 0
}

export interface ExtendedTransformableinfo extends TransformableInfo {
    [LEVEL]?: Levels;
}

export interface WritableStreamOptions {
    format?: Format;
    level?: Levels;
    silent?: boolean;
    handleExceptions?: boolean;
    handleRejections?: boolean;

    log?(info: any): any;
    close?(): void;
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
export class TransportStream {
    format?: Format;
    level?: Levels;
    handleExceptions?: boolean;
    handleRejections?: boolean;
    silent?: boolean;
    parent?: Logger;

    public log?: (_info: unknown) => void;
    public close?: () => void;

    constructor(options: WritableStreamOptions) {
        this.format = options.format;
        this.level = options.level;
        this.handleExceptions = options.handleExceptions;
        this.handleRejections = options.handleRejections;
        this.silent = options.silent;

        if (options.log) this.log = options.log;
        if (options.close) this.close = options.close;

        // // Get the levels from the source we are piped from.
        // this.once("pipe", (logger: Logger) => {
        //     // Remark (indexzero): this bookkeeping can only support multiple
        //     // Logger parents with the same `levels`. This comes into play in
        //     // the `winston.Container` code in which `container.add` takes
        //     // a fully realized set of options with pre-constructed TransportStreams.
        //     this.levels = logger.levels;
        //     this.parent = logger;
        // });

        // // If and/or when the transport is removed from this instance
        // this.once("unpipe", (src) => {
        //     // Remark (indexzero): this bookkeeping can only support multiple
        //     // Logger parents with the same `levels`. This comes into play in
        //     // the `winston.Container` code in which `container.add` takes
        //     // a fully realized set of options with pre-constructed TransportStreams.
        //     if (src === this.parent) {
        //         this.parent = undefined;
        //         if (this.close) {
        //             this.close();
        //         }
        //     }
        // });
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
    public write(info: ExtendedTransformableinfo): undefined {
        if (
            this.silent === true ||
            (info.exception === true && !(this.handleExceptions ?? false))
        ) {
            return;
        }

        // Remark: This has to be handled in the base transport now because we
        // cannot conditionally write to our pipe targets as stream. We always
        // prefer any explicit level set on the Transport itself falling back to
        // any level set on the parent.
        const level = this.level ?? this.parent?.level;
        const levelOpt = WrapOptional(level);
        const logLevel = WrapOptional(info[LEVEL]);
        const localLevelNum = levelOpt.andThen((levelRaw) => WrapOptional(LevelNumber[levelRaw]));
        const logLevelNum = logLevel.andThen((levelRaw) => WrapOptional(LevelNumber[levelRaw]));
        const levelPassesThreshold = localLevelNum.merge(
            logLevelNum,
            (localLevelNumUnwrap, logLevelNumUnwrap) => localLevelNumUnwrap >= logLevelNumUnwrap
        );
        const log = WrapOptional(this.log);
        if (log.some && (levelOpt.none || levelPassesThreshold.valueOr(false))) {
            const format = WrapOptional(this.format);
            if (format.none) {
                log.safeValue()(info);
                return;
            }

            // We trap(and re-throw) any errors generated by the user-provided format, but also
            // guarantee that the streams callback is invoked so that we can continue flowing.
            const transform = WrapToResult(
                () =>
                    format
                        .safeValue()
                        .transform(structuredClone(info), format.safeValue().options) as
                        | TransformableInfo
                        | false,
                `Failed to transform log entry`
            );

            if (transform.err) {
                console.error(transform.val.toString(), { message: info });
                return;
            }
            if (transform.safeUnwrap() === false) {
                console.error(`Failed to transform log entry`, { message: info });
                return;
            }

            log.safeValue()(transform.safeUnwrap());
        }
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
