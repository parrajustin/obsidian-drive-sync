import { SearchString } from "../lib/search_string_parser";
import type { SyncerConfig } from "../settings/syncer_config_data";
import { RootSyncType } from "../settings/syncer_config_data";
import type { FilePathType } from "./file_node";

const SEARCH_STRING_CACHE = new Map<string, SearchString>();

/** Gets the parsed search string instance. Uses caching.  */
export function GetQueryString(queryString: string): SearchString {
    const fetch = SEARCH_STRING_CACHE.get(queryString);
    if (fetch !== undefined) {
        return fetch;
    }

    const instance = SearchString.parse(queryString);
    SEARCH_STRING_CACHE.set(queryString, instance);
    return instance;
}

/** Checks if the data passes the string search. */
export function ChecksPassedFilter(data: string, searchString: SearchString): boolean {
    const query = searchString.getParsedQuery();

    // check if any of the exclude filters match.
    const fileExcludeFilters = [...(query.exclude.f ?? []), ...(query.exclude.file ?? [])];
    for (const filter of fileExcludeFilters) {
        if (data.match(filter)) {
            return false;
        }
    }

    // Check if any include filters match if any.
    const fileIncludeFilter = [...(query.include.f ?? []), ...(query.include.file ?? [])];
    // If there are no include filters all are included.
    if (fileIncludeFilter.length === 0) {
        return true;
    }

    for (const filter of fileIncludeFilter) {
        if (data.match(filter)) {
            return true;
        }
    }

    return false;
}

/** Checks if the file should have a file id. */
export function ShouldHaveFileId(filePath: FilePathType, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.fileIdFileQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Checks if the file path is acceptable to even be included.  */
export function IsAcceptablePath(filePath: FilePathType, config: SyncerConfig): boolean {
    if (config.type === RootSyncType.FOLDER_TO_ROOT && config.nestedRootPath === "") {
        return false;
    }
    if (
        config.type === RootSyncType.FOLDER_TO_ROOT &&
        !filePath.startsWith(config.nestedRootPath)
    ) {
        return false;
    }
    const searchString = GetQueryString(config.syncQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Checks if the file path leads to an acceptable file on the device. */
export function IsObsidianFile(filePath: FilePathType, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.obsidianFileSyncQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Checks if the file path lead to a raw file on the device. */
export function IsLocalFileRaw(filePath: FilePathType, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.rawFileSyncQuery);
    return ChecksPassedFilter(filePath, searchString);
}
