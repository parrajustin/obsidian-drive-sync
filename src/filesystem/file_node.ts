import type { LatestNotesSchemaWithoutData } from "../schema/notes/notes.schema";
import type { SchemaWithId } from "../sync/firebase_cache";
import type { MsFromEpoch } from "../types";

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
    LOCAL_ONLY_FILE = "LOCAL_ONLY",
    LOCAL_MISSING = "LOCAL_MISSING",
    LOCAL_CLOUD_FILE = "LOCAL_CLOUD",
    REMOTE_ONLY = "REMOTE_ONLY"
}

// File node is invalid and should be ignored.
export interface InvalidFileNode {
    type: FileNodeType.INVALID;
    fileData: OnlyFilePath;
}

// A local file node with possible cloud data.
export interface LocalOnlyFileNode {
    type: FileNodeType.LOCAL_ONLY_FILE;
    fileData: FileData;
    localTime: MsFromEpoch;
}

// A file node where it is missing locally, maybe it was deleted?
export interface MissingFileNode {
    type: FileNodeType.LOCAL_MISSING;
    fileData: OnlyFilePath;
    localTime: MsFromEpoch;
}

// A file node where it had cloud data.
export interface LocalCloudFileNode {
    type: FileNodeType.LOCAL_CLOUD_FILE;
    fileData: FileData;
    localTime: MsFromEpoch;
    firebaseData: SchemaWithId<LatestNotesSchemaWithoutData>;
}

// File exist remotely but missing locally.
export interface RemoteOnlyNode {
    type: FileNodeType.REMOTE_ONLY;
    fileData: OnlyFilePath;
    localTime: MsFromEpoch;
    firebaseData: SchemaWithId<LatestNotesSchemaWithoutData>;
}

// All file node types that are valid.
export type AllValidFileNodeTypes =
    | RemoteOnlyNode
    | LocalOnlyFileNode
    | MissingFileNode
    | LocalCloudFileNode;
// All possible file node types.
export type AllFileNodeTypes =
    | RemoteOnlyNode
    | LocalOnlyFileNode
    | InvalidFileNode
    | MissingFileNode
    | LocalCloudFileNode;
// All the possible local file node types.
export type LocalFileNodeTypes = LocalOnlyFileNode | InvalidFileNode | MissingFileNode;
// All the file nodes types the syncer keep because they are meaningful.
export type AllExistingFileNodeTypes = RemoteOnlyNode | LocalOnlyFileNode | LocalCloudFileNode;
