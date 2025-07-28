import type { Optional } from "../lib/option";
import type { LatestNotesSchema } from "../schema/notes/notes.schema";

export interface Tag<T> {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __special_tag_type: T;
}
export type FilePathType = string & Tag<"FilePath">;

export interface FileData {
    // Full filepath.
    fullPath: FilePathType;
    // The file creation time.
    cTime: number;
    // The file modification time.
    mTime: number;
    /** Size of the file in bytes. */
    size: number;
    /** File name without the extension. */
    baseName: string;
    /** File extension (example ".md"). */
    extension: string;
    /** If the file has been deleted. */
    deleted: boolean;
    /** The hash of the file contents. */
    fileHash: string;
}

interface OnlyFilePath {
    // Full filepath.
    fullPath: FilePathType;
}

export enum FileNodeType {
    INVALID = "INVALID",
    LOCAL_FILE = "LOCAL",
    LOCAL_MISSING = "LOCAL_MISSING",
    REMOTE_ONLY = "REMOTE_ONLY"
}

// File node is invalid and should be ignored.
export interface InvalidFileNode {
    type: FileNodeType.INVALID;
    fileData: OnlyFilePath;
}

// A local file node with possible cloud data.
export interface LocalFileNode {
    type: FileNodeType.LOCAL_FILE;
    fileData: FileData;
    firebaseData: Optional<LatestNotesSchema>;
}

// A file node where it is misisng locally, maybe it was deleted?
export interface MissingFileNode {
    type: FileNodeType.LOCAL_MISSING;
    fileData: OnlyFilePath;
}

// File exist remotely but missing locally.
export interface DeletedNode {
    type: FileNodeType.REMOTE_ONLY;
    fileData: OnlyFilePath;
    firebaseData: LatestNotesSchema;
}

export type FileNode = DeletedNode | LocalFileNode | InvalidFileNode | MissingFileNode;
