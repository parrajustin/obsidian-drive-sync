/**
 * File utils that are specific to obsidian files.
 */

import type { App, DataWriteOptions } from "obsidian";
import { normalizePath, TFile } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { InternalError, InvalidArgumentError, NotFoundError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { CreateLogger } from "../logging/logger";
import { InjectMeta } from "../lib/inject_status_msg";
import { Span } from "../logging/tracing/span.decorator";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";

const LOGGER = CreateLogger("file_util_obsidian_api");

export class FileUtilObsidian {
    /** Reads a file through the obsidian apis. Only works for files in a vault. No dot "." folders. */
    @Span()
    @PromiseResultSpanError
    public static async readObsidianFile(
        app: App,
        filePath: string
    ): Promise<Result<Uint8Array, StatusError>> {
        // The file was not found in any current localFileNodes therefore it is a left over file.
        const file = app.vault.getAbstractFileByPath(filePath);
        if (file === null) {
            // No file found.
            return Err(
                NotFoundError(`Could not find file to read "${filePath}"`).with(
                    InjectMeta({ filePath })
                )
            );
        }
        if (!(file instanceof TFile)) {
            return Err(
                InvalidArgumentError(`Path leads to a non file type "${filePath}"`).with(
                    InjectMeta({ filePath })
                )
            );
        }
        const readDataResult = await WrapPromise(
            app.vault.readBinary(file),
            /*textForUnknown=*/ `Failed to read binary string`
        );
        if (readDataResult.err) {
            readDataResult.val.with(InjectMeta({ filePath }));
            return readDataResult;
        }
        LOGGER.debug("Read obsidian file", { filePath });
        return Ok(new Uint8Array(readDataResult.safeUnwrap()));
    }

    /** Write the `data` to the obsidian file at `filePath`. */
    @Span()
    @PromiseResultSpanError
    public static async writeToObsidianFile(
        app: App,
        filePath: string,
        data: Uint8Array,
        opts?: DataWriteOptions
    ): Promise<StatusResult<StatusError>> {
        const file = app.vault.getAbstractFileByPath(filePath);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
        const arryBufferData: ArrayBuffer = data.buffer.slice(
            data.byteOffset,
            data.byteLength + data.byteOffset
        ) as ArrayBuffer;
        if (file === null) {
            // Create folders if we have to.
            const pathSplit = filePath.split("/");
            // Remove the final filename.
            pathSplit.pop();
            const mkdirs = await WrapPromise(
                app.vault.adapter.mkdir(normalizePath(pathSplit.join("/"))),
                /*textForUnknown=*/ `Failed to mkdir "${filePath}"`
            );
            if (mkdirs.err) {
                mkdirs.val.with(InjectMeta({ filePath }));
                return mkdirs;
            }
            // Route if there is no file pre existing.
            const createResult = await WrapPromise(
                app.vault.createBinary(filePath, arryBufferData, opts),
                /*textForUnknown=*/ `Failed to create file for "${filePath}"`
            );
            if (createResult.err) {
                createResult.val.with(InjectMeta({ filePath }));
                return createResult;
            }
        } else if (file instanceof TFile) {
            // Route if there is an existing file.
            const modifyResult = await WrapPromise(
                app.vault.modifyBinary(file, arryBufferData, opts),
                /*textForUnknown=*/ `Failed to modify file for "${filePath}"`
            );
            if (modifyResult.err) {
                modifyResult.val.with(InjectMeta({ filePath }));
                return modifyResult;
            }
        } else {
            // Route if the path leads to a folder.
            return Err(
                InternalError(`File "${filePath}" leads to a folder when file is expected!`).with(
                    InjectMeta({ filePath })
                )
            );
        }
        LOGGER.debug("Wrote obsidian file", { filePath });

        return Ok();
    }

    /** Deletes the obsidian file at `filePath`, only works for obsidian vault files. */
    @Span()
    @PromiseResultSpanError
    public static async deleteObsidianFile(
        app: App,
        filePath: string
    ): Promise<StatusResult<StatusError>> {
        // First attempt to get the file.
        const file = app.vault.getAbstractFileByPath(filePath);
        if (file === null) {
            // No file found.
            return Err(
                NotFoundError(`Could not find file to read "${filePath}"`).with(
                    InjectMeta({ filePath })
                )
            );
        }
        if (!(file instanceof TFile)) {
            return Err(
                InvalidArgumentError(`Path leads to a non file type "${filePath}"`).with(
                    InjectMeta({ filePath })
                )
            );
        }

        // Now sent the file to trash.
        const trashResult = await WrapPromise(
            app.vault.trash(file, /*system=*/ true),
            /*textForUnknown=*/ `Failed to send to trash local file ${filePath}`
        );
        if (trashResult.err) {
            trashResult.val.with(InjectMeta({ filePath }));
            return trashResult;
        }
        LOGGER.debug("Removed obsidian file", { filePath });

        return Ok();
    }
}
