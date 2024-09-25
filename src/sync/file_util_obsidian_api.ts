/**
 * File utils that are specific to obsidian files.
 */

import type { App, DataWriteOptions } from "obsidian";
import { TFile } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { InternalError, InvalidArgumentError, NotFoundError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { ConvertToUnknownError } from "../util";

/** Reads a file through the obsidian apis. Only works for files in a vault. No dot "." folders. */
export async function ReadObsidianFile(
    app: App,
    filePath: string
): Promise<Result<Uint8Array, StatusError>> {
    // The file was not found in any current localFileNodes therefore it is a left over file.
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file === null) {
        // No file found.
        return Err(NotFoundError(`Could not find file to read "${filePath}"`));
    }
    if (!(file instanceof TFile)) {
        return Err(InvalidArgumentError(`Path leads to a non file type "${filePath}"`));
    }
    const readDataResult = await WrapPromise(app.vault.readBinary(file));
    if (readDataResult.err) {
        return readDataResult.mapErr(ConvertToUnknownError(`Failed to read binary string`));
    }
    return Ok(new Uint8Array(readDataResult.safeUnwrap()));
}

/** Write the `data` to the obsidian file at `filePath`. */
export async function WriteToObsidianFile(
    app: App,
    filePath: string,
    data: Uint8Array,
    opts?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file === null) {
        // Route if there is no file pre existing.
        const createResult = await WrapPromise(app.vault.createBinary(filePath, data, opts));
        if (createResult.err) {
            return createResult.mapErr(
                ConvertToUnknownError(`Failed to create file for "${filePath}"`)
            );
        }
    } else if (file instanceof TFile) {
        // Route if there is an existing file.
        const modifyResult = await WrapPromise(app.vault.modifyBinary(file, data, opts));
        if (modifyResult.err) {
            return modifyResult.mapErr(
                ConvertToUnknownError(`Failed to modify file for "${filePath}"`)
            );
        }
    } else {
        // Route if the path leads to a folder.
        return Err(InternalError(`File "${filePath}" leads to a folder when file is expected!`));
    }

    return Ok();
}

/** Deletes the obsidian file at `filePath`, only works for obsidian vault files. */
export async function DeleteObsidianFile(
    app: App,
    filePath: string
): Promise<StatusResult<StatusError>> {
    // First attempt to get the file.
    const file = app.vault.getAbstractFileByPath(filePath);
    if (file === null) {
        // No file found.
        return Err(NotFoundError(`Could not find file to read "${filePath}"`));
    }
    if (!(file instanceof TFile)) {
        return Err(InvalidArgumentError(`Path leads to a non file type "${filePath}"`));
    }

    // Now sent the file to trash.
    const trashResult = await WrapPromise(app.vault.trash(file, /*system=*/ true));
    if (trashResult.err) {
        return trashResult.mapErr(
            ConvertToUnknownError(`Failed to send to trash local file ${filePath}`)
        );
    }

    return Ok();
}
