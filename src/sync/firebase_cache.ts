import { Bytes } from "firebase/firestore";
import { Ok, type Result } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import type { FilePathType } from "./file_node";
import { CloudNodeFileRef, CloudNodeRaw, type CloudNode } from "./file_node";
import type { FileMapOfNodes } from "./file_node_util";
import { FlattenFileNodes } from "./file_node_util";
import type { FileDbModel } from "./firestore_schema";
import { reduce } from "remeda";
import { None, Some } from "../lib/option";

type FileDbModelWithId = { fileId: string } & Omit<FileDbModel, "data">;

export interface FirebaseStoredData {
    /** The date of the latest update. */
    lastUpdate: number;
    /** Cached data has everything but the actual file data. */
    cache: string;
    /** Number of entries in the cache. */
    length: number;
    /** The latest version of data in cache. */
    versionOfData: string | null;
}

/** Compress string data to base64 gzip data. */
export async function CompressStringData(
    data: string,
    reason: string
): Promise<Result<string, StatusError>> {
    // Create the read stream and compress the data.
    const readableStream = await WrapPromise(
        Promise.resolve(
            new ReadableStream({
                start(controller) {
                    // Convert the input string into a Uint8Array (binary form)
                    const encoder = new TextEncoder();
                    const chunk = encoder.encode(data);

                    // Push the chunk into the stream
                    controller.enqueue(chunk);

                    // Close the stream
                    controller.close();
                }
            }).pipeThrough(new CompressionStream("gzip"))
        ),
        /*textForUnknown=*/ `Failed to create stream and compress "${reason}"`
    );
    if (readableStream.err) {
        return readableStream;
    }

    // Convert data to uint8array.
    const wrappedResponse = new Response(readableStream.safeUnwrap());
    const outData = await WrapPromise(
        wrappedResponse.arrayBuffer(),
        /*textForUnknown=*/ `[CompressStringData] Failed to convert to array buffer "${reason}"`
    );
    return outData.map((n) => Bytes.fromUint8Array(new Uint8Array(n)).toBase64());
}

/** Decompress string data. */
export async function DecompressStringData(
    data: string,
    reason: string
): Promise<Result<string, StatusError>> {
    const encodedData = Bytes.fromBase64String(data);

    // Create the read stream and decompress the data.
    const readableStream = await WrapPromise(
        Promise.resolve(
            new ReadableStream<Uint8Array>({
                start(controller) {
                    controller.enqueue(encodedData.toUint8Array());
                    controller.close();
                }
            }).pipeThrough(new DecompressionStream("gzip"))
        ),
        /*textForUnknown=*/ `Failed to create stream and decompress "${reason}"`
    );
    if (readableStream.err) {
        return readableStream;
    }

    // Convert data to uint8array.
    const wrappedResponse = new Response(readableStream.safeUnwrap());
    const outData = await WrapPromise(
        wrappedResponse.arrayBuffer(),
        /*textForUnknown=*/ `[DecompressStringData] Failed to convert to array buffer "${reason}"`
    );
    return outData
        .map((n) => new Uint8Array(n))
        .map((n) => new window.TextDecoder("utf-8").decode(n));
}

function ConvertCloudNodesToFirestoreDbModel(node: CloudNode): FileDbModelWithId {
    switch (node.type) {
        case "CLOUD_RAW":
            return {
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
                fileId: node.metadata.fileId.safeValue(),
                fileStorageRef: null,
                type: "Raw"
            };
        case "CLOUD_FILE_REF":
            return {
                path: node.data.fullPath,
                cTime: node.data.cTime,
                mTime: node.data.mTime,
                size: node.data.size,
                baseName: node.data.baseName,
                ext: node.data.extension,
                userId: node.metadata.userId.safeValue(),
                deleted: node.data.deleted,
                fileStorageRef: node.extra.fileStorageRef,
                vaultName: node.metadata.vaultName,
                deviceId: node.metadata.deviceId.safeValue(),
                syncerConfigId: node.metadata.syncerConfigId,
                fileHash: node.data.fileHash,
                entryTime: node.metadata.firestoreTime.safeValue(),
                version: "v1",
                fileId: node.metadata.fileId.safeValue(),
                type: "Ref"
            };
    }
}

/** Converts a map of file nodes to the cache entry. */
export async function ConvertCloudNodesToCache(
    fileNodes: FileMapOfNodes<CloudNode>
): Promise<Result<FirebaseStoredData, StatusError>> {
    const cloudNodes = FlattenFileNodes(fileNodes);
    if (cloudNodes.length === 0) {
        return Ok({ lastUpdate: 0, cache: "", length: 0, versionOfData: null });
    }
    const cacheData = cloudNodes.map(ConvertCloudNodesToFirestoreDbModel);
    const versionData = cacheData[0]!.version;
    const lastUpdate = reduce<FileDbModelWithId, number>(
        cacheData,
        (prev, current) => {
            return Math.max(prev, current.entryTime);
        },
        0
    );

    return (
        await CompressStringData(JSON.stringify(cacheData), "Converting Cloud Nodes to Cache")
    ).map<FirebaseStoredData>((v: string): FirebaseStoredData => {
        return { lastUpdate, cache: v, length: cacheData.length, versionOfData: versionData };
    });
}

/** Get cloud nodes from the given cache. */
export async function GetCloudNodesFromCache(
    cache: FirebaseStoredData
): Promise<Result<CloudNode[], StatusError>> {
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
    const dataModel = JSON.parse(decompressedData.safeUnwrap()) as FileDbModelWithId[];
    const constructedNode = dataModel.map((data) => {
        if (data.fileStorageRef !== null) {
            return new CloudNodeFileRef(
                {
                    fullPath: data.path as FilePathType,
                    cTime: data.cTime,
                    mTime: data.mTime,
                    size: data.size,
                    baseName: data.baseName,
                    extension: data.ext,
                    deleted: data.deleted,
                    fileHash: data.fileHash
                },
                {
                    deviceId: Some(data.deviceId),
                    syncerConfigId: data.syncerConfigId,
                    firestoreTime: Some(data.entryTime),
                    vaultName: data.vaultName,
                    fileId: Some(data.fileId),
                    userId: Some(data.userId)
                },
                {
                    isFromCloudCache: false,
                    fileStorageRef: data.fileStorageRef,
                    versionString: data.version
                }
            );
        }
        return new CloudNodeRaw(
            {
                fullPath: data.path as FilePathType,
                cTime: data.cTime,
                mTime: data.mTime,
                size: data.size,
                baseName: data.baseName,
                extension: data.ext,
                deleted: data.deleted,
                fileHash: data.fileHash
            },
            {
                deviceId: Some(data.deviceId),
                syncerConfigId: data.syncerConfigId,
                firestoreTime: Some(data.entryTime),
                vaultName: data.vaultName,
                fileId: Some(data.fileId),
                userId: Some(data.userId)
            },
            {
                isFromCloudCache: true,
                data: None,
                versionString: data.version
            }
        );
    });
    return Ok(constructedNode);
}
