import { None, Some } from "../lib/option";
import { FileNode } from "./file_node";
import type { FileMapOfNodes } from "./file_node_util";
import { FlattenFileNodes } from "./file_node_util";

/** Cached information from firestore data. */
export interface CacheModel {
    // Full filepath.
    path: string;
    // The file creation time.
    cTime: number;
    // The file modification time.
    mTime: number;
    /** Size of the file in bytes. */
    size: number;
    /** File name without the extension. */
    baseName: string;
    /** File extension (example ".md"). */
    ext: string;
    /** The id of the user. */
    fileId: string;
    /** The id of the user. */
    userId: string;
    /** If the file has been deleted. */
    deleted: boolean;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef: string | null;
    /** The name of the vault. */
    vaultName: string;
    /** The id of the device. */
    deviceId: string;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
}

export interface FirebaseStoredData {
    /** The date of the latest update. */
    lastUpdate: number;
    /** Cached data has everything but the actual file data. */
    cache: CacheModel[];
}

/**
 * Converts the cached model data to a file node.
 * @param model the cache data to turn to a fileNode
 * @returns a file node
 */
export function ConvertCacheToFileNode(model: CacheModel): FileNode<Some<string>> {
    return new FileNode({
        fullPath: model.path,
        ctime: model.cTime,
        mtime: model.mTime,
        size: model.size,
        baseName: model.baseName,
        extension: model.ext,
        fileId: Some(model.fileId),
        userId: Some(model.userId),
        deleted: model.deleted,
        data: None,
        fileStorageRef: model.fileStorageRef !== null ? Some(model.fileStorageRef) : None,
        vaultName: model.vaultName,
        deviceId: Some(model.deviceId),
        syncerConfigId: model.syncerConfigId,
        isFromCloudCache: true,
        localDataType: None
    });
}

/** Converts the cache data to FileNodes. in flat array form. */
export function GetFlatFileNodesFromCache(cache: CacheModel[]): FileNode<Some<string>>[] {
    const nodes: FileNode<Some<string>>[] = [];
    for (const node of cache) {
        nodes.push(ConvertCacheToFileNode(node));
    }
    return nodes;
}

/** Converts a map of file nodes to the cache entry. */
export function ConvertMapOfFileNodesToCache(
    fileNodes: FileMapOfNodes<Some<string>>
): FirebaseStoredData {
    const flatNodes = FlattenFileNodes(fileNodes);

    const cache: CacheModel[] = [];
    let lastUpdate = 0;
    for (const node of flatNodes) {
        const entry: CacheModel = {
            path: node.data.fullPath,
            cTime: node.data.ctime,
            mTime: node.data.mtime,
            size: node.data.size,
            baseName: node.data.baseName,
            ext: node.data.extension,
            fileId: node.data.fileId.safeValue(),
            userId: node.data.userId.safeValue(),
            deleted: node.data.deleted,
            fileStorageRef: node.data.fileStorageRef.some
                ? node.data.fileStorageRef.safeValue()
                : null,
            vaultName: node.data.vaultName,
            deviceId: node.data.deviceId.some ? node.data.deviceId.safeValue() : "CACHED NONE",
            syncerConfigId: node.data.syncerConfigId
        };
        lastUpdate = Math.max(lastUpdate, node.data.mtime);
        cache.push(entry);
    }
    return { lastUpdate, cache };
}
