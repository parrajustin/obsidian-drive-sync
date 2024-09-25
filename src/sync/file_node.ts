import type { TFile } from "obsidian";
import { None, Some, type Option } from "../lib/option";

interface LocalObsidianFile {
    type: "OBSIDIAN";
}

interface LocalRawFile {
    type: "RAW";
}

export type LocalDataType = LocalObsidianFile | LocalRawFile;

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
    data?: Uint8Array;
    fileStorageRef?: string;
    localDataType: Option<LocalDataType>;
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
    /** Data from the cloud storage compress with brotli encoded in uint8. */
    public data?: Uint8Array;
    /** Storage path on cloud storage if any. */
    public fileStorageRef?: string;
    /** If this is a local file this denotes where the data is. */
    public localDataType: Option<LocalDataType>;

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
        this.data = config.data;
        this.fileStorageRef = config.fileStorageRef;
        this.localDataType = config.localDataType;
    }

    /** Constructs the FileNode from TFiles. */
    public static constructFromTFile(fullPath: string, file: TFile, fileId: Option<string>) {
        const backingdata: LocalDataType = {
            type: "OBSIDIAN"
        };
        return new FileNode({
            fullPath,
            ctime: file.stat.ctime,
            mtime: file.stat.mtime,
            size: file.stat.size,
            baseName: file.basename,
            extension: file.extension,
            fileId: fileId,
            userId: None,
            deleted: false,
            localDataType: Some(backingdata)
        } as FileNodeParams);
    }

    public overwrite(other: FileNode<TypeOfData>) {
        this.fullPath = other.fullPath;
        this.ctime = other.ctime;
        this.mtime = other.mtime;
        this.size = other.size;
        this.baseName = other.baseName;
        this.extension = other.extension;
        this.fileId = other.fileId;
        this.userId = other.userId;
        this.deleted = other.deleted;
        this.data = other.data;
        this.fileStorageRef = other.fileStorageRef;
    }

    public toString() {
        return this.fullPath;
    }
}
