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

export class LocalFileNode {
    public type = "LOCAL";
    constructor(
        public filedata: FileData,
        public firebaseData: Optional<LatestNotesSchema>
    ) {}
}

export class DeletedNode {
    public type = "REMOTE";
    constructor(public firebaseData: LatestNotesSchema) {}
}

export type FileNode = DeletedNode | LocalFileNode;
