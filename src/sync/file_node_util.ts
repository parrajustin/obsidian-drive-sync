import type { App, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import type { SearchString } from "../lib/search_string_parser";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { InternalError, InvalidArgumentError } from "../lib/status_error";
import { None, Some, type Option } from "../lib/option";
import { GetFileUidFromFrontmatter } from "./file_id_util";
import { WrapPromise } from "../lib/wrap_promise";
import { ConvertToUnknownError } from "../util";
import type { LocalDataType } from "./file_node";
import { FileNode } from "./file_node";

/** Flat array of all nodes to a single file path. */
export class FileNodeArray<TypeOfData extends Option<string> = Option<string>> {
    constructor(public nodes: FileNode<TypeOfData>[]) {}
}
/** A map representing a folder in the `FileNode` representation. */
export type FileMapOfNodes<TypeOfData extends Option<string> = Option<string>> = Map<
    string,
    FileMapOfNodes<TypeOfData> | FileNodeArray<TypeOfData>
>;

/**
 * Checks if the `node` matches the `searchString`.
 * @param node file node to check.
 * @param searchString search node query.
 * @returns true if the node passes the query.
 */
export function CheckFileNodeMatchesSearchString<
    TypeOfData extends Option<string> = Option<string>
>(node: FileNode<TypeOfData>, searchString: SearchString): boolean {
    const query = searchString.getParsedQuery();

    // check if any of the exclude filters match.
    const fileExcludeFilters = [...(query.exclude["f"] ?? []), ...(query.exclude["file"] ?? [])];
    for (const filter of fileExcludeFilters) {
        if (node.fullPath.match(filter)) {
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
        if (node.fullPath.match(filter)) {
            return true;
        }
    }

    return false;
}

/** Gets all the file nodes from the filesystem. */
export async function GetAllFileNodes(
    app: App,
    searchString: SearchString
): Promise<Result<FileNode[], StatusError>> {
    const files: FileNode[] = [];

    // First get all the files from the filemap.
    for (const fileName in app.vault.fileMap) {
        const file = app.vault.fileMap[fileName] as TAbstractFile;
        if (!(file instanceof TFile)) {
            continue;
        }
        const fileIdResult = await GetFileUidFromFrontmatter(app, file);
        if (fileIdResult.err) {
            return fileIdResult;
        }

        const node = FileNode.constructFromTFile(fileName, file, fileIdResult.safeUnwrap());
        if (!CheckFileNodeMatchesSearchString(node, searchString)) {
            continue;
        }
        files.push(node);
    }

    // TODO: everything should use the fs api to simplify logic.
    const recursivelyCheckFiles = async (path: string): Promise<StatusResult<StatusError>> => {
        const rootDirResult = (
            await WrapPromise(
                app.vault.adapter.fsPromises.readdir(`${app.vault.adapter.basePath}/${path}`)
            )
        ).mapErr(ConvertToUnknownError(`readdir ${path}`));
        if (rootDirResult.err) {
            return rootDirResult;
        }
        for (const segment of rootDirResult.safeUnwrap()) {
            const splitSegment = segment.split(".");
            const baseName = splitSegment[0] as string;
            const extension = splitSegment[1] ?? "";
            const vaultPath = `${path}/${segment}`;
            const filePath = `${app.vault.adapter.basePath}/${vaultPath}`;
            const statResult = (
                await WrapPromise(app.vault.adapter.fsPromises.stat(filePath))
            ).mapErr(ConvertToUnknownError(`stat ${filePath}`));
            if (statResult.err) {
                return statResult;
            }

            if (statResult.safeUnwrap().isDirectory()) {
                const recursiveCheckResult = await recursivelyCheckFiles(vaultPath);
                if (recursiveCheckResult.err) {
                    return recursiveCheckResult;
                }
                continue;
            }
            if (!statResult.safeUnwrap().isFile()) {
                continue;
            }

            const fileNode = new FileNode<None>({
                fullPath: vaultPath,
                ctime: statResult.safeUnwrap().ctimeMs,
                mtime: statResult.safeUnwrap().mtimeMs,
                size: statResult.safeUnwrap().size,
                baseName: baseName,
                extension: extension,
                fileId: None,
                userId: None,
                deleted: false,
                localDataType: Some<LocalDataType>({ type: "RAW" })
            });
            if (!CheckFileNodeMatchesSearchString(fileNode, searchString)) {
                continue;
            }
            files.push(fileNode);
        }

        return Ok();
    };
    const checkResult = await recursivelyCheckFiles(".obsidian");
    if (checkResult.err) {
        return checkResult;
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
        const pathSplit = node.fullPath.split("/");
        if (pathSplit.length === 0) {
            return Err(InternalError(`No path nodes found. "${node.fullPath}"`));
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
                    InternalError(`GetFileMapOfNodes path "${node.fullPath}" somehow undefined!`)
                );
            }
            if (selectedFolderNode instanceof FileNodeArray) {
                return Err(
                    InternalError(
                        `GetFileMapOfNodes found a file array when expecting a folder "${node.fullPath}".`
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
                if (!deletedCheckNode.deleted) {
                    countNonDeleted++;
                }
            }
            if (countNonDeleted > 1) {
                return Err(
                    InternalError(`Found multiple not deleted files at "${node.fullPath}".`)
                );
            }
        } else {
            return Err(InternalError(`Found a folder at final path for "${node.fullPath}".`));
        }
    }

    return Ok(mapOfNodes);
}

/** Get the map of nodes or files. Use to keep track of file changes. */
export async function GetFileMapOfNodes(
    app: App,
    searchString: SearchString
): Promise<Result<FileMapOfNodes, StatusError>> {
    const fileNodesResult = await GetAllFileNodes(app, searchString);
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
        if (node.fileId.none) {
            continue;
        }

        map.set(node.fileId.safeValue(), node);
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
    const nonDeletedNodes = expectingNodeArry.nodes.filter((node) => !node.deleted);
    if (nonDeletedNodes.length > 1) {
        return Err(InternalError(`path "${filePath}" leads to several non deleted nodes!`));
    } else if (nonDeletedNodes.length === 0) {
        return Ok(None);
    }
    return Ok(Some(nonDeletedNodes[0] as FileNode<TypeOfData>));
}
