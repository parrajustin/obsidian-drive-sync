/**
 * File utils that are specific to raw files.
 */

import type { App, DataWriteOptions } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { ConvertToUnknownError } from "../util";
import { LogError } from "../log";

/** Reads a file through the raw apis. */
export async function ReadRawFile(
    app: App,
    filePath: string
): Promise<Result<Uint8Array, StatusError>> {
    const readDataResult = await WrapPromise(
        app.vault.adapter.fsPromises.readFile(`${app.vault.adapter.basePath}/${filePath}`)
    );
    if (readDataResult.err) {
        return readDataResult.mapErr(ConvertToUnknownError(`Failed to fs read from "${filePath}"`));
    }
    return Ok(readDataResult.safeUnwrap());
}

/** Write the `data` to the raw file at `filePath`. */
export async function WriteToRawFile(
    app: App,
    filePath: string,
    data: Uint8Array,
    opts?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    const fullPath = app.vault.adapter.getFullPath(filePath);
    const writeResult = await WrapPromise(app.vault.adapter.fsPromises.writeFile(fullPath, data));
    if (writeResult.err) {
        return writeResult.mapErr(ConvertToUnknownError(`Failed to write fs file "${fullPath}"`));
    }
    if (opts) {
        const writeOptions = await WrapPromise(app.vault.adapter.applyWriteOptions(fullPath, opts));
        if (writeOptions.err) {
            LogError(
                ConvertToUnknownError(`Failed to write opts "${fullPath}".`)(writeOptions.val)
            );
        }
    }
    return Ok();
}

/** Deletes the raw file at `filePath`, works for any file. */
export async function DeleteRawFile(
    app: App,
    filePath: string
): Promise<StatusResult<StatusError>> {
    const trashSystemResult = await WrapPromise(
        app.vault.adapter.trashSystem(app.vault.adapter.getFullPath(filePath))
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
