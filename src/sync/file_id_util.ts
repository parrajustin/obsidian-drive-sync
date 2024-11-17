/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/**
 * Utils for file unique ids in markdown files with frontmatter.
 */

import type { App, DataWriteOptions } from "obsidian";
import { TFile } from "obsidian";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { Result, StatusResult } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { uuidv7 } from "../lib/uuid";
import type { SyncerConfig } from "../settings/syncer_config_data";
import { ShouldHaveFileId } from "./query_util";
import type { FilePathType } from "./file_node";

export const FILE_ID_FRONTMATTER_KEY = "File Id";

async function ReadFileIdWithoutCache(
    app: App,
    file: TFile
): Promise<Result<Option<string>, StatusError>> {
    let fileId: Option<string> = None;
    const processFrontmatter = await WrapPromise(
        app.fileManager.processFrontMatter(file, (frontmatter) => {
            if (frontmatter[FILE_ID_FRONTMATTER_KEY] !== undefined) {
                fileId = Some(frontmatter[FILE_ID_FRONTMATTER_KEY]);
            }
        }),
        /*textForUnknown=*/ `Failed to read frontmatter from "${file.path}".`
    );
    if (processFrontmatter.err) {
        return processFrontmatter;
    }
    return Ok(fileId);
}

/** Get the file uid from frontmatter. */
export async function GetFileUidFromFrontmatter(
    app: App,
    config: SyncerConfig,
    file: TFile
): Promise<Result<Option<string>, StatusError>> {
    if (!ShouldHaveFileId(file.path as FilePathType, config)) {
        return Ok(None);
    }
    return ReadFileIdWithoutCache(app, file);
}

/** Writes the file uid to all files that don't have one. */
export async function WriteUidToAllFilesIfNecessary(
    app: App,
    config: SyncerConfig
): Promise<StatusResult<StatusError>> {
    if (!config.enableFileIdWriting) {
        return Ok();
    }

    for (const fileName in app.vault.fileMap) {
        if (!ShouldHaveFileId(fileName as FilePathType, config)) {
            continue;
        }
        const entry = app.vault.fileMap[fileName]!;
        if (!(entry instanceof TFile)) {
            continue;
        }

        const fileUidResult = await GetFileUidFromFrontmatter(app, config, entry);
        if (fileUidResult.err) {
            return fileUidResult;
        }
        if (fileUidResult.safeUnwrap().some) {
            continue;
        }

        const writeUidResult = await WriteUidToFile(app, config, entry, uuidv7());
        if (writeUidResult.err) {
            return writeUidResult;
        }
    }
    return Ok();
}

/** Write the uid to the file. If no supported frontmatter returns Ok(). */
export async function WriteUidToFile(
    app: App,
    config: SyncerConfig,
    file: TFile,
    uid: string,
    dataWriteOptions?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    if (!config.enableFileIdWriting) {
        return Ok();
    }
    if (!ShouldHaveFileId(file.path as FilePathType, config)) {
        return Ok();
    }
    const processFrontmatter = await WrapPromise(
        app.fileManager.processFrontMatter(
            file,
            (frontmatter) => {
                frontmatter[FILE_ID_FRONTMATTER_KEY] = uid;
            },
            dataWriteOptions
        ),
        /*textForUnknown=*/ `Failed to write frontmatter to "${uid}"`
    );
    if (processFrontmatter.err) {
        return processFrontmatter;
    }
    return Ok();
}
