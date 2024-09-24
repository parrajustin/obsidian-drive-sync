import type { App, TAbstractFile } from "obsidian";
import { TFile } from "obsidian";
import type { SearchString } from "../lib/search_string_parser";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { InternalError, InvalidArgumentError } from "../lib/status_error";
import { None, Some, type Option } from "../lib/option";
import { TypeGuard } from "../lib/type_guard";

interface FileNodeParams<TypeOfData extends Option<string> = Option<string>> {
    fullPath: string;
    ctime: number;
    mtime: number;
    size: number;
    baseName: string;
    extension: string;
    fileId: TypeOfData;
    userId: TypeOfData;
    deleted: boolean;
}

/** File node for book keeping. */
export class FileNode<TypeOfData extends Option<string> = Option<string>> {
    /** Full filepath. */
    public fullPath: string;
    /** The creation time. */
    public ctime: number;
    /** The modification time. */
    public mtime: number;
    /** Size of the file in bytes. */
    public size: number;
    /** Filename without the extension. */
    public baseName: string;
    /** File extension (example ".md"). */
    public extension: string;
    /** Uid of the file. */
    public fileId: TypeOfData;
    /** The user id of the authenticated user who made this file. */
    public userId: TypeOfData;
    /** Only set by the firestore. */
    public deleted: boolean;

    constructor(config: FileNodeParams<TypeOfData>) {
        this.fullPath = config.fullPath;
        this.ctime = config.ctime;
        this.mtime = config.mtime;
        this.size = config.size;
        this.baseName = config.baseName;
        this.extension = config.extension;
        this.fileId = config.fileId;
        this.userId = config.userId;
        this.deleted = config.deleted;
    }

    /** Constructs the FileNode from TFiles. */
    public static constructFromTFile(fullPath: string, file: TFile, fileId: Option<string>) {
        return new FileNode({
            fullPath,
            ctime: file.stat.ctime,
            mtime: file.stat.mtime,
            size: file.stat.size,
            baseName: file.basename,
            extension: file.extension,
            fileId: fileId,
            userId: None,
            deleted: false
        });
    }

    public toString() {
        return this.fullPath;
    }
}

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

/** Get the file uid from frontmatter. */
export function GetFileUidFromFrontmatter(app: App, file: TFile): Option<string> {
    const cache = app.metadataCache.getFileCache(file);
    if (cache === null) {
        return None;
    }
    const frontmatterCache = cache.frontmatter;
    if (frontmatterCache === undefined) {
        return None;
    }
    const uidValue = frontmatterCache["uid"];
    if (uidValue === undefined) {
        return None;
    }
    if (TypeGuard<string>(uidValue, typeof uidValue === "string" || uidValue instanceof String)) {
        return Some(uidValue);
    }
    return None;
}

/** Gets all the file nodes from the filesystem. */
export function GetAllFileNodes(app: App, searchString: SearchString): FileNode[] {
    const files: FileNode[] = [];

    // First get all the files from the filemap.
    for (const fileName in app.vault.fileMap) {
        const file = app.vault.fileMap[fileName] as TAbstractFile;
        if (!(file instanceof TFile)) {
            continue;
        }
        const fileId = GetFileUidFromFrontmatter(app, file);
        const node = FileNode.constructFromTFile(fileName, file, fileId);
        if (!CheckFileNodeMatchesSearchString(node, searchString)) {
            continue;
        }
        files.push(node);
    }

    // TODO: Add .obisdian folder sync.
    return files;
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
export function GetFileMapOfNodes(
    app: App,
    searchString: SearchString
): Result<FileMapOfNodes, StatusError> {
    const fileNodes = GetAllFileNodes(app, searchString);
    return ConvertArrayOfNodesToMap(fileNodes);
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
