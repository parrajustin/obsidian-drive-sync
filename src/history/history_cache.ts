import { reduce } from "remeda";
import { Ok, type Result } from "../lib/result";
import { type StatusError } from "../lib/status_error";
import type { FirebaseStoredData } from "../sync/firebase_cache";
import { CompressStringData, DecompressStringData } from "../sync/firebase_cache";
import type { FileDataDbModelV1 } from "../sync/firestore_schema";
import { HistoricFileNode } from "./history_file_node";
import type { HistoryDbModelV1 } from "./history_schema";
import { Some } from "../lib/option";
import type { FilePathType } from "../sync/file_node";

interface HistoryCacheV1 extends Omit<HistoryDbModelV1, "file"> {
    /** File data version. */
    file: Omit<FileDataDbModelV1, "data" | "type">;
    /** Doc ID in the history collection. */
    historyDocId: string;
}

function ConvertToCacheModel(node: HistoricFileNode): HistoryCacheV1 {
    switch (node.extra.type) {
        case "file_ref":
            return {
                file: {
                    path: node.data.fullPath,
                    cTime: node.data.cTime,
                    mTime: node.data.mTime,
                    size: node.data.size,
                    baseName: node.data.baseName,
                    ext: node.data.extension,
                    userId: node.metadata.userId.safeValue(),
                    deleted: node.data.deleted,
                    vaultName: node.metadata.vaultName,
                    deviceId: node.metadata.deviceId.safeValue(),
                    syncerConfigId: node.metadata.syncerConfigId,
                    fileHash: node.data.fileHash,
                    entryTime: node.metadata.firestoreTime.safeValue(),
                    version: "v1",
                    fileStorageRef: node.extra.fileStorageRef
                },
                fileId: node.metadata.fileId.safeValue(),
                historyDocId: node.extra.historyDocId,
                version: "v1",
                entryTime: node.metadata.firestoreTime.safeValue()
            };
        case "raw_data":
        case "cached_raw":
            return {
                file: {
                    path: node.data.fullPath,
                    cTime: node.data.cTime,
                    mTime: node.data.mTime,
                    size: node.data.size,
                    baseName: node.data.baseName,
                    ext: node.data.extension,
                    userId: node.metadata.userId.safeValue(),
                    deleted: node.data.deleted,
                    vaultName: node.metadata.vaultName,
                    deviceId: node.metadata.deviceId.safeValue(),
                    syncerConfigId: node.metadata.syncerConfigId,
                    fileHash: node.data.fileHash,
                    entryTime: node.metadata.firestoreTime.safeValue(),
                    version: "v1",
                    fileStorageRef: null
                },
                fileId: node.metadata.fileId.safeValue(),
                historyDocId: node.extra.historyDocId,
                version: "v1",
                entryTime: node.metadata.firestoreTime.safeValue()
            };
    }
}

/** Converts a map of Historic nodes to the cache entry. */
export async function ConvertHistoricNodesToCache(
    nodes: HistoricFileNode[]
): Promise<Result<FirebaseStoredData, StatusError>> {
    const cacheData = nodes.map(ConvertToCacheModel);
    if (nodes.length === 0) {
        return Ok({ lastUpdate: 0, cache: "", length: 0, versionOfData: null });
    }
    const lastUpdate = reduce<HistoryCacheV1, number>(
        cacheData,
        (prev, current) => {
            return Math.max(prev, current.entryTime);
        },
        0
    );

    return (
        await CompressStringData(JSON.stringify(cacheData), "Converting Historic Nodes to Cache")
    ).map<FirebaseStoredData>((v: string): FirebaseStoredData => {
        return { lastUpdate, cache: v, length: cacheData.length, versionOfData: null };
    });
}

/** Get cloud nodes from the given cache. */
export async function GetHistoricNodesFromCache(
    cache: FirebaseStoredData
): Promise<Result<HistoricFileNode[], StatusError>> {
    if (cache.cache === "") {
        return Ok([]);
    }
    const decompressedData = await DecompressStringData(
        cache.cache,
        "Converting Cloud Node from cache"
    );
    if (decompressedData.err) {
        return decompressedData;
    }
    const dataModel = JSON.parse(decompressedData.safeUnwrap()) as HistoryCacheV1[];
    const constructedNode = dataModel.map((data) => {
        if (data.file.fileStorageRef !== null) {
            return new HistoricFileNode(
                {
                    fullPath: data.file.path as FilePathType,
                    cTime: data.file.cTime,
                    mTime: data.file.mTime,
                    size: data.file.size,
                    baseName: data.file.baseName,
                    extension: data.file.ext,
                    deleted: data.file.deleted,
                    fileHash: data.file.fileHash
                },
                {
                    deviceId: Some(data.file.deviceId),
                    syncerConfigId: data.file.syncerConfigId,
                    firestoreTime: Some(data.entryTime),
                    vaultName: data.file.vaultName,
                    fileId: Some(data.fileId),
                    userId: Some(data.file.userId)
                },
                {
                    type: "file_ref",
                    historyDocId: data.fileId,
                    historyDocEntryTime: data.file.entryTime,
                    fileStorageRef: data.file.fileStorageRef
                }
            );
        }
        return new HistoricFileNode(
            {
                fullPath: data.file.path as FilePathType,
                cTime: data.file.cTime,
                mTime: data.file.mTime,
                size: data.file.size,
                baseName: data.file.baseName,
                extension: data.file.ext,
                deleted: data.file.deleted,
                fileHash: data.file.fileHash
            },
            {
                deviceId: Some(data.file.deviceId),
                syncerConfigId: data.file.syncerConfigId,
                firestoreTime: Some(data.entryTime),
                vaultName: data.file.vaultName,
                fileId: Some(data.fileId),
                userId: Some(data.file.userId)
            },
            {
                type: "cached_raw",
                historyDocId: data.fileId,
                historyDocEntryTime: data.file.entryTime
            }
        );
    });
    return Ok(constructedNode);
}
