import type { App, DataWriteOptions } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import type { LocalDataType } from "./file_node";
import {
    DeleteObsidianFile,
    ReadObsidianFile,
    WriteToObsidianFile
} from "./file_util_obsidian_api";
import { DeleteRawFile, ReadRawFile, WriteToRawFile } from "./file_util_raw_api";

/** Reads a file through the raw apis. */
export async function ReadFile(
    app: App,
    filePath: string,
    type: LocalDataType
): Promise<Result<Uint8Array, StatusError>> {
    switch (type.type) {
        case "OBSIDIAN":
            return ReadObsidianFile(app, filePath);
        case "RAW":
            return ReadRawFile(app, filePath);
    }
}

/** Write the `data` to the raw file at `filePath`. */
export async function WriteFile(
    app: App,
    filePath: string,
    data: Uint8Array,
    type: LocalDataType,
    opts?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    switch (type.type) {
        case "OBSIDIAN":
            return WriteToObsidianFile(app, filePath, data, opts);
        case "RAW":
            return WriteToRawFile(app, filePath, data, opts);
    }
}

/** Deletes the raw file at `filePath`, works for any file. */
export async function DeleteFile(
    app: App,
    filePath: string,
    type: LocalDataType
): Promise<StatusResult<StatusError>> {
    switch (type.type) {
        case "OBSIDIAN":
            return DeleteObsidianFile(app, filePath);
        case "RAW":
            return DeleteRawFile(app, filePath);
    }
}
