/**
 * File utils that are specific to raw files.
 */

import { normalizePath, type App, type DataWriteOptions } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";

/** Reads a file through the raw apis. */
export async function ReadRawFile(
    app: App,
    filePath: string
): Promise<Result<Uint8Array, StatusError>> {
    const readDataResult = await WrapPromise(
        app.vault.adapter.readBinary(normalizePath(filePath)),
        /*textForUnknown=*/ `Failed to fs read from "${filePath}"`
    );
    if (readDataResult.err) {
        return readDataResult;
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
    const pathSplit = filePath.split("/");
    // Remove the final filename.
    pathSplit.pop();
    const mkdirs = await WrapPromise(
        app.vault.adapter.mkdir(normalizePath(pathSplit.join("/"))),
        /*textForUnknown=*/ `Failed to mkdir "${filePath}"`
    );
    if (mkdirs.err) {
        return mkdirs;
    }

    const writeResult = await WrapPromise(
        app.vault.adapter.writeBinary(normalizePath(filePath), data, opts),
        /*textForUnknown=*/ `Failed to write fs file "${filePath}"`
    );
    if (writeResult.err) {
        return writeResult;
    }
    return Ok();
}

/** Deletes the raw file at `filePath`, works for any file. */
export async function DeleteRawFile(
    app: App,
    filePath: string
): Promise<StatusResult<StatusError>> {
    const trashSystemResult = await WrapPromise(
        app.vault.adapter.trashSystem(normalizePath(filePath)),
        /*textForUnknown=*/ `Failed to trash system "${filePath}"`
    );
    if (trashSystemResult.err) {
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
        return trashLocalResult;
    }
    return Ok();
}
