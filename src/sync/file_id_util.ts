import type { App, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import { TypeGuard } from "../lib/type_guard";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { UnknownError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { uuidv7 } from "../lib/uuid";

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
        })
    );
    if (processFrontmatter.err) {
        return Err(UnknownError(`Failed to read frontmatter from "${file.path}".`));
    }
    return Ok(fileId);
}

/** Get the file uid from frontmatter. */
export async function GetFileUidFromFrontmatter(
    app: App,
    file: TFile
): Promise<Result<Option<string>, StatusError>> {
    // TODO: Need to look into the cache not being read sometimes.
    const cache = app.metadataCache.getFileCache(file);
    if (cache === null) {
        return ReadFileIdWithoutCache(app, file);
    }
    const frontmatterCache = cache.frontmatter;
    if (frontmatterCache === undefined) {
        return ReadFileIdWithoutCache(app, file);
    }
    const uidValue = frontmatterCache[FILE_ID_FRONTMATTER_KEY];
    if (uidValue === undefined) {
        return ReadFileIdWithoutCache(app, file);
    }
    if (TypeGuard<string>(uidValue, typeof uidValue === "string" || uidValue instanceof String)) {
        return Ok(Some(uidValue));
    }
    return ReadFileIdWithoutCache(app, file);
}

/** Writes the file uid to all files that don't have one. */
export async function WriteUidToAllFilesIfNecessary(app: App): Promise<StatusResult<StatusError>> {
    for (const fileName in app.vault.fileMap) {
        const entry = app.vault.fileMap[fileName] as TAbstractFile;
        if (!(entry instanceof TFile)) {
            continue;
        }

        const fileUidResult = await GetFileUidFromFrontmatter(app, entry);
        if (fileUidResult.err) {
            return fileUidResult;
        }
        if (fileUidResult.safeUnwrap().some) {
            continue;
        }

        const writeUidResult = await WriteUidToFile(app, entry, uuidv7());
        if (writeUidResult.err) {
            return writeUidResult;
        }
    }
    return Ok();
}

/** Write the uid to the file. */
export async function WriteUidToFile(
    app: App,
    file: TFile,
    uid: string
): Promise<StatusResult<StatusError>> {
    const processFrontmatter = await WrapPromise(
        app.fileManager.processFrontMatter(file, (frontmatter) => {
            frontmatter[FILE_ID_FRONTMATTER_KEY] = uid;
        })
    );
    if (processFrontmatter.err) {
        return Err(UnknownError(`Failed to write frontmatter to "${uid}".`));
    }
    return Ok();
}
