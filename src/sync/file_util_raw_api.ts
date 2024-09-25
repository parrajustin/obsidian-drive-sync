/**
 * File utils that are specific to raw files.
 */

import type { App } from "obsidian";
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
    data: Uint8Array
): Promise<StatusResult<StatusError>> {
    const writeResult = await WrapPromise(
        app.vault.adapter.fsPromises.writeFile(`${app.vault.adapter.basePath}/${filePath}`, data)
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
    const deleteResult = await WrapPromise(
        app.vault.adapter.fsPromises.rm(`${app.vault.adapter.basePath}/${filePath}`)
    );
    if (deleteResult.err) {
        return deleteResult.mapErr(ConvertToUnknownError(`Failed to rm fs file "${filePath}"`));
    }
    return Ok();
}
