/**
 * File utils that are specific to raw files.
 */

import { normalizePath, type App, type DataWriteOptions } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Ok } from "../lib/result";
import { ErrorCode, type StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { InjectMeta } from "../lib/inject_status_msg";
import { CreateLogger } from "../logging/logger";
import { Span } from "../logging/tracing/span.decorator";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { FileConst } from "../constants";

const LOGGER = CreateLogger("file_util_raw_api");

export class FileUtilRaw {
    /** Reads a file through the raw apis. */
    @Span()
    @PromiseResultSpanError
    public static async readRawFile(
        app: App,
        filePath: string
    ): Promise<Result<Uint8Array, StatusError>> {
        const readDataResult = await WrapPromise(
            app.vault.adapter.readBinary(normalizePath(filePath)),
            /*textForUnknown=*/ `Failed to fs read from "${filePath}"`
        );
        if (readDataResult.err) {
            readDataResult.val.errorCode = ErrorCode.NOT_FOUND;
            readDataResult.val.with(
                InjectMeta({
                    [FileConst.FILE_PATH]: filePath
                })
            );
            return readDataResult;
        }
        LOGGER.debug("Read raw file", { filePath });
        return Ok(new Uint8Array(readDataResult.safeUnwrap()));
    }

    /** Write the `data` to the raw file at `filePath`. */
    @Span()
    @PromiseResultSpanError
    public static async writeToRawFile(
        app: App,
        filePath: string,
        data: Uint8Array,
        opts?: DataWriteOptions
    ): Promise<StatusResult<StatusError>> {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const arryBufferData: ArrayBuffer = data.buffer.slice(
            data.byteOffset,
            data.byteLength + data.byteOffset
        ) as ArrayBuffer;
        const pathSplit = filePath.split("/");
        // Remove the final filename.
        pathSplit.pop();
        const mkdirs = await WrapPromise(
            app.vault.adapter.mkdir(normalizePath(pathSplit.join("/"))),
            /*textForUnknown=*/ `Failed to mkdir "${filePath}"`
        );
        if (mkdirs.err) {
            mkdirs.val.with(InjectMeta({ [FileConst.FILE_PATH]: filePath }));
            return mkdirs;
        }

        const writeResult = await WrapPromise(
            app.vault.adapter.writeBinary(normalizePath(filePath), arryBufferData, opts),
            /*textForUnknown=*/ `Failed to write fs file "${filePath}"`
        );
        if (writeResult.err) {
            writeResult.val.with(InjectMeta({ [FileConst.FILE_PATH]: filePath }));
            return writeResult;
        }
        LOGGER.debug("Wrote obsidian file", { filePath });
        return Ok();
    }

    /** Deletes the raw file at `filePath`, works for any file. */
    @Span()
    @PromiseResultSpanError
    public static async deleteRawFile(
        app: App,
        filePath: string
    ): Promise<StatusResult<StatusError>> {
        const trashSystemResult = await WrapPromise(
            app.vault.adapter.trashSystem(normalizePath(filePath)),
            /*textForUnknown=*/ `Failed to trash system "${filePath}"`
        );
        if (trashSystemResult.err) {
            trashSystemResult.val.with(InjectMeta({ [FileConst.FILE_PATH]: filePath }));
            return trashSystemResult;
        }
        if (trashSystemResult.safeUnwrap()) {
            return Ok();
        }
        const trashLocalResult = await WrapPromise(
            app.vault.adapter.trashLocal(app.vault.adapter.getFullPath(filePath)),
            /*textForUnknown=*/ `Failed to trash local "${filePath}"`
        );
        if (trashLocalResult.err) {
            trashLocalResult.val.with(InjectMeta({ [FileConst.FILE_PATH]: filePath }));
            return trashLocalResult;
        }
        LOGGER.debug("Removed obsidian file", { filePath });
        return Ok();
    }
}
