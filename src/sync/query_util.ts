import { SearchString } from "../lib/search_string_parser";
import type { FileNode, LocalDataType } from "./file_node";
import type { SyncerConfig } from "./syncer";

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
    const fileExcludeFilters = [...(query.exclude["f"] ?? []), ...(query.exclude["file"] ?? [])];
    for (const filter of fileExcludeFilters) {
        if (data.match(filter)) {
            return false;
        }
    }

    // Check if any include filters match if any.
    const fileIncludeFilter = [...(query.include["f"] ?? []), ...(query.include["file"] ?? [])];
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
export function ShouldHaveFileId(filePath: string, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.fileIdFileQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Checks if the file path leads  */
export function IsAcceptablePath(filePath: string, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.syncQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Checks if the file path leads to an acceptable file on the device. */
export function IsObsidianFile(filePath: string, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.obsidianFileSyncQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Checks if the file path lead to a raw file on the device. */
export function IsLocalFileRaw(filePath: string, config: SyncerConfig): boolean {
    const searchString = GetQueryString(config.rawFileSyncQuery);
    return ChecksPassedFilter(filePath, searchString);
}

/** Converts the file path to local data type. */
export function ConvertFilePathToLocalDataType(
    fullPath: string,
    config: SyncerConfig
): LocalDataType {
    return IsLocalFileRaw(fullPath, config) ? { type: "RAW" } : { type: "OBSIDIAN" };
}

/** Converts the file node to the local data type obj. */
export function ConvertFileNodeToLocalDataType(
    node: FileNode,
    config: SyncerConfig
): LocalDataType {
    return node.data.localDataType.valueOr<LocalDataType>(
        ConvertFilePathToLocalDataType(node.data.fullPath, config)
    );
}