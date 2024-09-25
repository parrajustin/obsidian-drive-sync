import { SearchString } from "../lib/search_string_parser";
import type { FileNode, LocalDataType } from "./file_node";
import type { SyncerConfig } from "./syncer";

/** Converts the file node to the local data type obj. */
export function ConvertFileNodeToLocalDataType(
    node: FileNode,
    config: SyncerConfig
): LocalDataType {
    return node.localDataType.valueOr<LocalDataType>(
        IsLocalFileRaw(node.fullPath, config) ? { type: "RAW" } : { type: "OBSIDIAN" }
    );
}

/** Checks if the file path lead to a raw file on the device. */
export function IsLocalFileRaw(filePath: string, config: SyncerConfig): boolean {
    const searchString = SearchString.parse(config.rawFileSyncQuery);
    const query = searchString.getParsedQuery();

    // check if any of the exclude filters match.
    const fileExcludeFilters = [...(query.exclude["f"] ?? []), ...(query.exclude["file"] ?? [])];
    for (const filter of fileExcludeFilters) {
        if (filePath.match(filter)) {
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
        if (filePath.match(filter)) {
            return true;
        }
    }

    return false;
}
