/**
 * File utils that are specific to raw files.
 */

import { normalizePath, type App, type DataWriteOptions } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { ConvertToUnknownError } from "../util";

/** Reads a file through the raw apis. */
export async function ReadRawFile(
    app: App,
    filePath: string
): Promise<Result<Uint8Array, StatusError>> {
    const readDataResult = await WrapPromise(app.vault.adapter.readBinary(normalizePath(filePath)));
    if (readDataResult.err) {
        return readDataResult.mapErr(ConvertToUnknownError(`Failed to fs read from "${filePath}"`));
    }
    return Ok(new Uint8Array(readDataResult.safeUnwrap()));
}

/** Write the `data` to the raw file at `filePath`. */
export async function WriteToRawFile(
    app: App,
    filePath: string,
    data: Uint8Array,
    opts?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    const writeResult = await WrapPromise(
        app.vault.adapter.writeBinary(normalizePath(filePath), data, opts)
    );
    if (writeResult.err) {
        return writeResult.mapErr(ConvertToUnknownError(`Failed to write fs file "${filePath}"`));
    }
    return Ok();
}

/** Deletes the raw file at `filePath`, works for any file. */
export async function DeleteRawFile(
    app: App,
    filePath: string
): Promise<StatusResult<StatusError>> {
    const trashSystemResult = await WrapPromise(
        app.vault.adapter.trashSystem(normalizePath(filePath))
    );
    if (trashSystemResult.err) {
        return trashSystemResult.mapErr(
            ConvertToUnknownError(`Failed to trash system "${filePath}"`)
        );
    }
    if (trashSystemResult.safeUnwrap()) {
        return Ok();
    }
    const trashLocalResult = await WrapPromise(
        app.vault.adapter.trashLocal(app.vault.adapter.getFullPath(filePath))
    );
    if (trashLocalResult.err) {
        return trashLocalResult.mapErr(
            ConvertToUnknownError(`Failed to trash local "${filePath}"`)
        );
    }
    return Ok();
}
