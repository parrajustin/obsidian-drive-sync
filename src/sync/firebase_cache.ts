import { None, Some } from "../lib/option";
import type { CloudDataType } from "./file_node";
import { FileNode } from "./file_node";
import type { FileMapOfNodes } from "./file_node_util";
import { FlattenFileNodes } from "./file_node_util";

/** Cached information from firestore data. */
export interface CacheModel<TExtraData = unknown> {
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
    /** Any filenode extra data. */
    extraData?: TExtraData;
    /** The hash of the file contents. */
    fileHash?: string | null;
    /** The cloud data type if this is from the cloud. */
    cloudDataType?: CloudDataType | null;
}

export interface FirebaseStoredData<TExtraData = unknown> {
    /** The date of the latest update. */
    lastUpdate: number;
    /** Cached data has everything but the actual file data. */
    cache: CacheModel<TExtraData>[];
}

/**
 * Converts the cached model data to a file node.
 * @param model the cache data to turn to a fileNode
 * @returns a file node
 */
export function ConvertCacheToFileNode<TExtraData = unknown>(
    model: CacheModel<TExtraData>
): FileNode<Some<string>, TExtraData> {
    return new FileNode<Some<string>, TExtraData>(
        {
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
            localDataType: None,
            cloudDataType:
                model.cloudDataType === undefined || model.cloudDataType === null
                    ? None
                    : Some(model.cloudDataType),
            fileHash:
                model.fileHash !== undefined && model.fileHash !== null
                    ? Some(model.fileHash)
                    : None
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
        model.extraData ?? ({} as any)
    );
}

/** Converts the cache data to FileNodes. in flat array form. */
export function GetFlatFileNodesFromCache<TExtraData = unknown>(
    cache: CacheModel<TExtraData>[]
): FileNode<Some<string>, TExtraData>[] {
    const nodes: FileNode<Some<string>, TExtraData>[] = [];
    for (const node of cache) {
        nodes.push(ConvertCacheToFileNode<TExtraData>(node));
    }
    return nodes;
}

/** Converts a flat array of file nodes to the cache entry. */
export function ConvertFlatFileNodesToCache<TExtraData = unknown>(
    flatNodes: FileNode<Some<string>, TExtraData>[]
): FirebaseStoredData<TExtraData> {
    const cache: CacheModel<TExtraData>[] = [];
    let lastUpdate = 0;
    for (const node of flatNodes) {
        const entry: CacheModel<TExtraData> = {
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
            syncerConfigId: node.data.syncerConfigId,
            extraData: node.extraData,
            fileHash: node.data.fileHash.valueOr(null),
            cloudDataType: node.data.cloudDataType.valueOr(null)
        };
        lastUpdate = Math.max(lastUpdate, node.data.mtime);
        cache.push(entry);
    }
    return { lastUpdate, cache };
}

/** Converts a map of file nodes to the cache entry. */
export function ConvertMapOfFileNodesToCache(
    fileNodes: FileMapOfNodes<Some<string>>
): FirebaseStoredData {
    return ConvertFlatFileNodesToCache(FlattenFileNodes(fileNodes));
}
