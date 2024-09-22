import type { TAbstractFile, Vault } from "obsidian";
import { TFile } from "obsidian";
import type { SearchString } from "../lib/search_string_parser";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { InternalError } from "../lib/status_error";

export class FileNode {
    /** Full filepath. */
    public readonly fullPath: string;
    /** The creation time. */
    public readonly ctime: number;
    /** The modification time. */
    public readonly mtime: number;
    /** Size of the file in bytes. */
    public readonly size: number;
    /** Filename without the extension. */
    public readonly fileName: string;
    /** File extension (example .md). */
    public readonly extension: string;

    private constructor(fullPath: string, file: TFile) {
        this.fullPath = fullPath;
        this.ctime = file.stat.ctime;
        this.mtime = file.stat.mtime;
        this.size = file.stat.size;
        this.fileName = file.basename;
        this.extension = file.extension;
    }

    /** Creates a file node. */
    public static constructFileNode(fullPath: string, file: TFile): FileNode {
        return new FileNode(fullPath, file);
    }
}

/**
 * Checks if the `node` matches the `searchString`.
 * @param node file node to check.
 * @param searchString search node query.
 * @returns true if the node passes the query.
 */
export function CheckFileNodeMatchesSearchString(
    node: FileNode,
    searchString: SearchString
): boolean {
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
export function GetAllFileNodes(vault: Vault, searchString: SearchString): FileNode[] {
    const files: FileNode[] = [];

    // First get all the files from the filemap.
    for (const fileName in vault.fileMap) {
        const file = vault.fileMap[fileName] as TAbstractFile;
        if (!(file instanceof TFile)) {
            continue;
        }
        const node = FileNode.constructFileNode(fileName, file);
        if (!CheckFileNodeMatchesSearchString(node, searchString)) {
            continue;
        }
        files.push();
    }

    // TODO: Add .obisdian folder sync.
    return files;
}

export type FileMapOfNodes = Map<string, FileMapOfNodes | FileNode>;

export function GetFileMapOfNodes(
    vault: Vault,
    searchString: SearchString
): Result<FileMapOfNodes, StatusError> {
    const mapOfNodes = new Map<string, FileMapOfNodes | FileNode>();
    const fileNodes = GetAllFileNodes(vault, searchString);

    for (const node of fileNodes) {
        const pathSplit = node.fullPath.split("/");
        if (pathSplit.length === 0) {
            return Err(InternalError(`No path nodes found. "${node.fullPath}"`));
        }
        // Remove the last element which is the filename itself.
        const finalFileName = pathSplit.pop() as string;
        let folderNode = mapOfNodes;
        for (const path of pathSplit) {
            if (!folderNode.has(path)) {
                folderNode.set(path, new Map<string, FileMapOfNodes | FileNode>());
            }
            const selectedFolderNode = folderNode.get(path);
            if (selectedFolderNode === undefined) {
                return Err(
                    InternalError(`GetFileMapOfNodes path "${node.fullPath}" somehow undefined!`)
                );
            }
            if (selectedFolderNode instanceof FileNode) {
                return Err(
                    InternalError(
                        `GetFileMapOfNodes found a node of file when expecting a folder "${node.fullPath}".`
                    )
                );
            }
            folderNode = selectedFolderNode;
        }
        folderNode.set(finalFileName, node);
    }

    return Ok(mapOfNodes);
}
