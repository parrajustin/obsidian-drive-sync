import type { App, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { UnknownError } from "../lib/status_error";
import { InternalError, InvalidArgumentError } from "../lib/status_error";
import { None, Some, type Option } from "../lib/option";
import { GetFileUidFromFrontmatter } from "./file_id_util";
import { WrapPromise } from "../lib/wrap_promise";
import type { FileNodeParams, LocalDataType } from "./file_node";
import { FileNode } from "./file_node";
import { IsAcceptablePath, IsLocalFileRaw, IsObsidianFile } from "./query_util";
import type { SyncerConfig } from "./syncer";

/** Flat array of all nodes to a single file path. */
export class FileNodeArray<TypeOfData extends Option<string> = Option<string>> {
    constructor(public nodes: FileNode<TypeOfData>[]) {}
}
/** A map representing a folder in the `FileNode` representation. */
export type FileMapOfNodes<TypeOfData extends Option<string> = Option<string>> = Map<
    string,
    FileMapOfNodes<TypeOfData> | FileNodeArray<TypeOfData>
>;

/** Gets the obsidian file node. */
async function GetObsidianNode(
    app: App,
    config: SyncerConfig,
    fileName: string
): Promise<Result<Option<FileNode<Option<string>>>, StatusError>> {
    const file = app.vault.fileMap[fileName] as TAbstractFile;
    if (!(file instanceof TFile)) {
        return Ok(None);
    }
    const fileIdResult = await GetFileUidFromFrontmatter(app, config, file);
    if (fileIdResult.err) {
        return fileIdResult;
    }

    const node = FileNode.constructFromTFile(
        config.vaultName,
        config.syncerId,
        fileName,
        file,
        fileIdResult.safeUnwrap()
    );
    return Ok(Some(node));
}

/** Gets the raw file ndoe. */
async function GetRawNode(
    app: App,
    config: SyncerConfig,
    fileName: string
): Promise<Result<Option<FileNode<Option<string>>>, StatusError>> {
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
    const file = path.pop() as string;
    const [baseName, extension] = file.split(".") as [string, string | undefined];
    const dataType: LocalDataType = { type: "RAW" };
    const nodeParams: FileNodeParams<None> = {
        fullPath: fileName,
        ctime: stat.ctime,
        mtime: stat.mtime,
        size: stat.size,
        baseName,
        extension: extension ?? "",
        fileId: None,
        userId: None,
        localDataType: Some(dataType),
        deleted: false,
        vaultName: config.vaultName,
        data: None,
        fileStorageRef: None,
        deviceId: None,
        syncerConfigId: config.syncerId
    };
    const node = new FileNode(nodeParams);
    return Ok(Some(node));
}

/**
 * Updates the file map with changes that took place.
 * @param app obsidian app
 * @param config the syncer based config.
 * @param fileMap the preexisting file node tree map
 * @param changedNodes file nodes that have been modified
 * @param changedPath paths that have been changed.
 */
export async function UpdateFileMapWithChanges(
    app: App,
    config: SyncerConfig,
    fileMap: FileMapOfNodes<Option<string>>,
    changedNodes: Set<FileNode<Option<string>>>,
    changedPath: Set<string>
): Promise<Result<FileMapOfNodes<Option<string>>, StatusError>> {
    // These are all paths that have been checked.
    const checkedPaths = new Set<string>();
    let flatNodes = FlattenFileNodes(fileMap);

    for (const node of changedNodes) {
        checkedPaths.add(node.data.fullPath);
        const dataType = node.data.localDataType;
        if (dataType.none) {
            return Err(
                UnknownError(`Somehow trying to update a cloud node for "${node.data.fullPath}"`)
            );
        }
        const newNodeResult = await (dataType.safeValue().type === "RAW"
            ? GetRawNode(app, config, node.data.fullPath)
            : GetObsidianNode(app, config, node.data.fullPath));
        if (newNodeResult.err) {
            return newNodeResult;
        }
        const optNode = newNodeResult.safeUnwrap();
        if (optNode.none) {
            return Err(UnknownError(`No node found! "${node.data.fullPath}"`));
        }
        node.overwrite(optNode.safeValue());
    }

    for (const path of changedPath) {
        if (checkedPaths.has(path)) {
            continue;
        }
        checkedPaths.add(path);
        const foundNode = GetNonDeletedByFilePath(fileMap, path);
        if (foundNode.err) {
            // We don't care about errors here. all errors are just bout not files found.
            continue;
        }
        const origNode = foundNode.safeUnwrap();

        let newNode: Option<FileNode<Option<string>>> = None;
        if (!IsAcceptablePath(path, config)) {
            continue;
        }
        if (IsObsidianFile(path, config)) {
            const fileResult = await GetObsidianNode(app, config, path);
            if (fileResult.err) {
                return fileResult;
            }
            newNode = fileResult.safeUnwrap();
        }
        if (IsLocalFileRaw(path, config)) {
            const fileResult = await GetRawNode(app, config, path);
            if (fileResult.err) {
                return fileResult;
            }
            newNode = fileResult.safeUnwrap();
        }

        if (origNode.none && newNode.none) {
            continue;
        } else if (origNode.some && newNode.none) {
            // Couldn't get new file information, maybe the file is gone? just delete the file node.
            flatNodes = flatNodes.filter((node) => node !== origNode.safeValue());
        } else if (origNode.none && newNode.some) {
            // Only found the new file.
            flatNodes.push(newNode.safeValue());
        } else if (origNode.some && newNode.some) {
            // Both file nodes exist, merge information.
            const fileIdsAreTheSame =
                origNode.safeValue().data.fileId.valueOr("") ===
                newNode.safeValue().data.fileId.valueOr("");
            if (!fileIdsAreTheSame) {
                // Filter out the original node.
                flatNodes = flatNodes.filter((node) => node !== origNode.safeValue());
                flatNodes.push(newNode.safeValue());
            } else {
                origNode.safeValue().overwrite(newNode.safeValue());
            }
        }
    }

    return ConvertArrayOfNodesToMap(flatNodes);
}

/** Filters file nodes to make sure they should be kept. */
export function FilterFileNodes<TypeOfData extends Option<string> = Option<string>>(
    config: SyncerConfig,
    nodes: FileNode<TypeOfData>[]
): FileNode<TypeOfData>[] {
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
): Promise<Result<FileNode[], StatusError>> {
    const files: FileNode[] = [];

    const iterateFiles = async (path: string): Promise<StatusResult<StatusError>> => {
        const fileNamesResult = await WrapPromise(
            app.vault.adapter.list(path),
            /*textForUnknown=*/ `Failed to list(${path})`
        );
        if (fileNamesResult.err) {
            return fileNamesResult;
        }

        for (const fullPath of fileNamesResult.safeUnwrap().files) {
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
export function ConvertArrayOfNodesToMap<TypeOfData extends Option<string> = Option<string>>(
    arry: FileNode<TypeOfData>[]
): Result<FileMapOfNodes<TypeOfData>, StatusError> {
    const mapOfNodes: FileMapOfNodes<TypeOfData> = new Map();

    for (const node of arry) {
        const pathSplit = node.data.fullPath.split("/");
        if (pathSplit.length === 0) {
            return Err(InternalError(`No path nodes found. "${node.data.fullPath}"`));
        }
        // Remove the last element which is the filename itself.
        const finalFileName = pathSplit.pop() as string;
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
                    InternalError(`Found multiple not deleted files at "${node.data.fullPath}".`)
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
): Promise<Result<FileMapOfNodes, StatusError>> {
    const fileNodesResult = await GetAllFileNodes(app, config);
    if (fileNodesResult.err) {
        return fileNodesResult;
    }
    return ConvertArrayOfNodesToMap(fileNodesResult.safeUnwrap());
}

/** Flattens the file map to get the array of file nodes. */
export function FlattenFileNodes<TypeOfData extends Option<string> = Option<string>>(
    fileMap: FileMapOfNodes<TypeOfData>
): FileNode<TypeOfData>[] {
    const fileNodes: FileNode<TypeOfData>[] = [];

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

/** Gets a map of the nodes keyed by their file-id. */
export function MapByFileId<TypeOfData extends Option<string> = Option<string>>(
    arry: FileNode<TypeOfData>[]
): Map<string, FileNode<TypeOfData>> {
    const map = new Map<string, FileNode<TypeOfData>>();
    for (const node of arry) {
        if (node.data.fileId.none) {
            continue;
        }

        map.set(node.data.fileId.safeValue(), node);
    }
    return map;
}

/** Get the non deleted file at a file path. */
export function GetNonDeletedByFilePath<TypeOfData extends Option<string> = Option<string>>(
    fileMap: FileMapOfNodes<TypeOfData>,
    filePath: string
): Result<Option<FileNode<TypeOfData>>, StatusError> {
    const pathSegments = filePath.split("/");
    if (pathSegments.length === 0) {
        return Err(InvalidArgumentError("FilePath is required."));
    }
    const fileName = pathSegments.pop() as string;
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
    return Ok(Some(nonDeletedNodes[0] as FileNode<TypeOfData>));
}
