import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { InternalError, InvalidArgumentError } from "../lib/status_error";
import { None, Some, WrapOptional, type Option } from "../lib/option";
import { WrapPromise } from "../lib/wrap_promise";
import type { LocalNode, AllFileNodeTypes, ImmutableBaseFileNode, FilePathType } from "./file_node";
import { LocalNodeObsidian, LocalNodeRaw } from "./file_node";
import { IsAcceptablePath, IsLocalFileRaw, IsObsidianFile } from "./query_util";
import type { SyncerConfig } from "../settings/syncer_config_data";
import { Bytes } from "firebase/firestore";
import GetSha256Hash from "../lib/sha";
import { ReadObsidianFile } from "./file_util_obsidian_api";
import { ReadRawFile } from "./file_util_raw_api";
import { AsyncForEach, CombineResults } from "../util";

/** Flat array of all nodes to a single file path. */
export class FileNodeArray<TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes> {
    constructor(public nodes: TypeOfData[]) {}
}
/** A map representing a folder in the `FileNode` representation. */
export type FileMapOfNodes<TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes> = Map<
    string,
    FileMapOfNodes<TypeOfData> | FileNodeArray<TypeOfData>
>;

/** Gets the obsidian file node. */
export async function GetObsidianNode(
    app: App,
    config: SyncerConfig,
    fileName: FilePathType
): Promise<Result<Option<LocalNodeObsidian>, StatusError>> {
    const file = app.vault.fileMap[fileName]!;
    if (!(file instanceof TFile)) {
        return Ok(None);
    }
    // TODO: look into using file id again.
    // const fileIdResult = await GetFileUidFromFrontmatter(app, config, file);
    // if (fileIdResult.err) {
    //     return fileIdResult;
    // }

    const fileContents = await ReadObsidianFile(app, fileName);
    const fileHash = fileContents.map((f) =>
        Bytes.fromUint8Array(GetSha256Hash(new Uint8Array(f))).toBase64()
    );
    if (fileHash.err) {
        return fileHash;
    }
    const node = LocalNodeObsidian.constructFromTFile(
        config.vaultName,
        config.syncerId,
        fileName,
        file,
        /*fileId=*/ None,
        fileHash.safeUnwrap()
    );
    return Ok(Some(node));
}

/** Gets the raw file ndoe. */
export async function GetRawNode(
    app: App,
    config: SyncerConfig,
    fileName: FilePathType
): Promise<Result<Option<LocalNodeRaw>, StatusError>> {
    const fileStat = await WrapPromise(
        app.vault.adapter.stat(fileName),
        /*textForUnknown=*/ `Failed to stat ${fileName}`
    );
    if (fileStat.err) {
        return fileStat;
    }
    const stat = fileStat.safeUnwrap();
    if (stat === null) {
        return Ok(None);
    }
    if (stat.type === "folder") {
        return Ok(None);
    }

    const path = fileName.split("/");
    const file = path.pop()!;
    const [baseName, extension] = file.split(".") as [string, string | undefined];

    const fileContents = await ReadRawFile(app, fileName);
    const fileHash = fileContents.map((f) =>
        Bytes.fromUint8Array(GetSha256Hash(new Uint8Array(f))).toBase64()
    );
    if (fileHash.err) {
        return fileHash;
    }

    const node = new LocalNodeRaw(
        {
            fullPath: fileName,
            cTime: stat.ctime,
            mTime: stat.mtime,
            size: stat.size,
            baseName,
            extension: extension ?? "",
            deleted: false,
            fileHash: fileHash.safeUnwrap()
        },
        {
            deviceId: None,
            syncerConfigId: config.syncerId,
            firestoreTime: None,
            vaultName: config.vaultName,
            fileId: None,
            userId: None
        }
    );
    return Ok(Some(node));
}

export function IsFilePathValid(config: SyncerConfig, fullPath: FilePathType) {
    return (
        IsAcceptablePath(fullPath, config) &&
        (IsLocalFileRaw(fullPath, config) || IsObsidianFile(fullPath, config))
    );
}

/** Get the local file node if any. */
export async function GetLocalFileNode(
    app: App,
    config: SyncerConfig,
    fullPath: FilePathType
): Promise<Result<Option<LocalNode>, StatusError>> {
    if (IsAcceptablePath(fullPath, config) && IsLocalFileRaw(fullPath, config)) {
        return GetRawNode(app, config, fullPath);
    }
    if (IsAcceptablePath(fullPath, config) && IsObsidianFile(fullPath, config)) {
        return GetObsidianNode(app, config, fullPath);
    }
    return Err(InvalidArgumentError(`File path "${fullPath}" not allowed.`));
}

/**
 * Updates the file map with changes that took place.
 * @param app obsidian app
 * @param config the syncer based config.
 * @param fileMap the preexisting file node tree map
 * @param changedNodes file nodes that have been modified
 * @param changedPath paths that have been changed.
 * @param fileIdsToBeReRead The file ids that should be reread.
 */
export async function UpdateLocalFileMapWithLocalChanges(
    app: App,
    config: SyncerConfig,
    fileMap: FileMapOfNodes<LocalNode>,
    changedPath: Set<FilePathType>
): Promise<Result<FileMapOfNodes<LocalNode>, StatusError>> {
    if (changedPath.size === 0) {
        return Ok(fileMap);
    }
    // These are all paths that have been checked.
    const checkedPaths = new Set<FilePathType>();

    const filesByFilePath = MapByFilePath(FlattenFileNodes(fileMap));
    const changedPathResult = CombineResults(
        await Promise.all(
            AsyncForEach(
                [...changedPath],
                async (path: FilePathType): Promise<StatusResult<StatusError>> => {
                    if (!IsFilePathValid(config, path)) {
                        return Ok();
                    }
                    if (checkedPaths.has(path)) {
                        return Ok();
                    }
                    checkedPaths.add(path);
                    // The current node.
                    const origNode = WrapOptional(filesByFilePath.get(path));
                    const newNodeResult = await GetLocalFileNode(app, config, path);
                    if (newNodeResult.err) {
                        return newNodeResult;
                    }
                    const newNode = newNodeResult.safeUnwrap();

                    if (origNode.none && newNode.none) {
                        // Perfect no nodes!
                        return Ok();
                    } else if (origNode.some && newNode.none) {
                        // Couldn't get new file information, maybe the file is gone? just marked the file node deleted.
                        origNode.safeValue().data.deleted = true;
                        origNode.safeValue().metadata.firestoreTime = Some(Date.now());
                    } else if (origNode.none && newNode.some) {
                        // Only found the new file.
                        newNode.safeValue().metadata.firestoreTime = Some(Date.now());
                        filesByFilePath.set(path, newNode.safeValue());
                    } else if (
                        origNode.some &&
                        newNode.some &&
                        !origNode.safeValue().equalsData(newNode.safeValue())
                    ) {
                        // Just update the node's data.
                        origNode.safeValue().data = newNode.safeValue().data;
                        origNode.safeValue().metadata.firestoreTime = Some(Date.now());
                    }
                    return Ok();
                }
            )
        )
    );
    if (changedPathResult.err) {
        return changedPathResult;
    }

    return ConvertArrayOfNodesToMap([...filesByFilePath.entries()].map((n) => n[1])).mapErr((e) =>
        e.setPayload("label", "return")
    );
}

/** Filters file nodes to make sure they should be kept. */
export function FilterFileNodes<TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes>(
    config: SyncerConfig,
    nodes: TypeOfData[]
): TypeOfData[] {
    return nodes.filter(
        (n) =>
            IsAcceptablePath(n.data.fullPath, config) &&
            (IsObsidianFile(n.data.fullPath, config) || IsLocalFileRaw(n.data.fullPath, config))
    );
}

/** Gets all the file nodes from the filesystem. */
export async function GetAllFileNodes(
    app: App,
    config: SyncerConfig
): Promise<Result<LocalNode[], StatusError>> {
    const files: LocalNode[] = [];

    const iterateFiles = async (path: string): Promise<StatusResult<StatusError>> => {
        const fileNamesResult = await WrapPromise(
            app.vault.adapter.list(path),
            /*textForUnknown=*/ `Failed to list(${path})`
        );
        if (fileNamesResult.err) {
            return fileNamesResult;
        }

        for (const fullPath of fileNamesResult.safeUnwrap().files as FilePathType[]) {
            if (!IsAcceptablePath(fullPath, config)) {
                continue;
            }
            if (IsObsidianFile(fullPath, config)) {
                const fileResult = await GetObsidianNode(app, config, fullPath);
                if (fileResult.err) {
                    return fileResult;
                }
                const optFile = fileResult.safeUnwrap();
                if (optFile.some) {
                    files.push(optFile.safeValue());
                }
            }
            if (IsLocalFileRaw(fullPath, config)) {
                const fileResult = await GetRawNode(app, config, fullPath);
                if (fileResult.err) {
                    return fileResult;
                }
                const optFile = fileResult.safeUnwrap();
                if (optFile.some) {
                    files.push(optFile.safeValue());
                }
            }
        }

        for (const folderName of fileNamesResult.safeUnwrap().folders) {
            const folderIterResult = await iterateFiles(folderName);
            if (folderIterResult.err) {
                return folderIterResult;
            }
        }

        return Ok();
    };
    const iterateResult = await iterateFiles("");
    if (iterateResult.err) {
        return iterateResult;
    }

    return Ok(files);
}

/**
 * Converts a flat array of FileNodes to a `FileMapOfNodes`. Also checks only a single non deleted
 * node at each path.
 */
export function ConvertArrayOfNodesToMap<
    TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes
>(arry: TypeOfData[]): Result<FileMapOfNodes<TypeOfData>, StatusError> {
    const mapOfNodes: FileMapOfNodes<TypeOfData> = new Map();

    for (const node of arry) {
        const pathSplit = node.data.fullPath.split("/");
        if (pathSplit.length === 0) {
            return Err(InternalError(`No path nodes found. "${node.data.fullPath}"`));
        }
        // Remove the last element which is the filename itself.
        const finalFileName = pathSplit.pop()!;
        let folderNode = mapOfNodes;
        for (const path of pathSplit) {
            if (!folderNode.has(path)) {
                folderNode.set(
                    path,
                    new Map<string, FileMapOfNodes<TypeOfData> | FileNodeArray<TypeOfData>>()
                );
            }
            const selectedFolderNode = folderNode.get(path);
            if (selectedFolderNode === undefined) {
                return Err(
                    InternalError(
                        `GetFileMapOfNodes path "${node.data.fullPath}" somehow undefined!`
                    )
                );
            }
            if (selectedFolderNode instanceof FileNodeArray) {
                return Err(
                    InternalError(
                        `GetFileMapOfNodes found a file array when expecting a folder "${node.data.fullPath}".`
                    )
                );
            }
            folderNode = selectedFolderNode;
        }

        const folderArray = folderNode.get(finalFileName);
        if (folderArray === undefined) {
            folderNode.set(finalFileName, new FileNodeArray([node]));
        } else if (folderArray instanceof FileNodeArray) {
            folderArray.nodes.push(node);
            // Validate to make sure there aren't more than 1 not deleted file at a file path.
            let countNonDeleted = 0;
            for (const deletedCheckNode of folderArray.nodes) {
                if (!deletedCheckNode.data.deleted) {
                    countNonDeleted++;
                }
            }
            if (countNonDeleted > 1) {
                return Err(
                    InternalError(
                        `Found multiple not deleted files at "${node.data.fullPath}".`
                    ).with((err) => {
                        err.setPayload("full map", mapOfNodes).setPayload(
                            "current error",
                            folderArray
                        );
                    })
                );
            }
        } else {
            return Err(InternalError(`Found a folder at final path for "${node.data.fullPath}".`));
        }
    }

    return Ok(mapOfNodes);
}

/** Get the map of nodes or files. Use to keep track of file changes. */
export async function GetFileMapOfNodes(
    app: App,
    config: SyncerConfig
): Promise<Result<FileMapOfNodes<LocalNode>, StatusError>> {
    const fileNodesResult = await GetAllFileNodes(app, config);
    if (fileNodesResult.err) {
        return fileNodesResult;
    }
    return ConvertArrayOfNodesToMap(fileNodesResult.safeUnwrap());
}

/** Flattens the file map to get the array of file nodes. */
export function FlattenFileNodes<TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes>(
    fileMap: FileMapOfNodes<TypeOfData>
): TypeOfData[] {
    const fileNodes: TypeOfData[] = [];

    const recursiveCheck = (map: FileMapOfNodes<TypeOfData>) => {
        for (const [_key, value] of map) {
            if (value instanceof FileNodeArray) {
                fileNodes.push(...value.nodes);
            } else {
                recursiveCheck(value);
            }
        }
    };
    recursiveCheck(fileMap);
    return fileNodes;
}

/** Gets a map of the nodes keyed by their full path. */
export function MapByFilePath<TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes>(
    arry: TypeOfData[]
): Map<FilePathType, TypeOfData> {
    const map = new Map<FilePathType, TypeOfData>();
    for (const node of arry) {
        map.set(node.data.fullPath, node);
    }
    return map;
}

/** Get the non deleted file at a file path. */
export function GetNonDeletedByFilePath<
    TypeOfData extends ImmutableBaseFileNode = AllFileNodeTypes
>(fileMap: FileMapOfNodes<TypeOfData>, filePath: string): Result<Option<TypeOfData>, StatusError> {
    const pathSegments = filePath.split("/");
    if (pathSegments.length === 0) {
        return Err(InvalidArgumentError("FilePath is required."));
    }
    const fileName = pathSegments.pop()!;
    let selectedFileNode = fileMap;
    for (const path of pathSegments) {
        const node = selectedFileNode.get(path);
        if (node === undefined) {
            // There is no folder to where we want to go.
            return Ok(None);
        } else if (node instanceof FileNodeArray) {
            return Err(InvalidArgumentError(`path "${filePath}" leads to leaf node.`));
        }
        selectedFileNode = node;
    }
    const expectingNodeArry = selectedFileNode.get(fileName);
    if (expectingNodeArry === undefined) {
        // No file with that name found.
        return Ok(None);
    }
    if (!(expectingNodeArry instanceof FileNodeArray)) {
        return Err(InvalidArgumentError(`path "${filePath}" does not lead to a leaf node.`));
    }
    // Ensure there is only a single not deleted node.
    const nonDeletedNodes = expectingNodeArry.nodes.filter((node) => !node.data.deleted);
    if (nonDeletedNodes.length > 1) {
        return Err(InternalError(`path "${filePath}" leads to several non deleted nodes!`));
    } else if (nonDeletedNodes.length === 0) {
        return Ok(None);
    }
    return Ok(Some(nonDeletedNodes[0]!));
}
