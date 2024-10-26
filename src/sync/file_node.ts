import type { TFile } from "obsidian";
import { None, Some, type Option } from "../lib/option";

interface LocalObsidianFile {
    type: "OBSIDIAN";
}

interface LocalRawFile {
    type: "RAW";
}

export type LocalDataType = LocalObsidianFile | LocalRawFile;

export interface FileNodeParams<TypeOfData extends Option<string> = Option<string>> {
    /** Full filepath. */
    fullPath: string;
    /** The creation time. */
    ctime: number;
    /** The modification time. */
    mtime: number;
    /** Size of the file in bytes. */
    size: number;
    /** Filename without the extension. */
    baseName: string;
    /** File extension (example ".md"). */
    extension: string;
    /** Uid of the file. */
    fileId: TypeOfData;
    /** The user id of the authenticated user who made this file. */
    userId: TypeOfData;
    /** Only set by the firestore. */
    deleted: boolean;
    /** Name of the vault this belongs to. */
    vaultName: string;
    /** Data from the cloud storage compress with brotli encoded in uint8. */
    data: Option<Uint8Array>;
    /** Storage path on cloud storage if any. */
    fileStorageRef: Option<string>;
    /** If this is a local file this denotes where the data is. */
    localDataType: Option<LocalDataType>;
    /** The id of the device. */
    deviceId: Option<string>;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
    /** If this file node is vitual and just represents an entry from cache.  */
    isFromCloudCache: boolean;
}

/** File node for book keeping. */

export class FileNode<TypeOfData extends Option<string> = Option<string>, ExtraData = unknown> {
    constructor(
        public data: FileNodeParams<TypeOfData>,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
        public extraData: ExtraData = {} as any
    ) {}

    /** Constructs the FileNode from TFiles. */
    public static constructFromTFile(
        vaultName: string,
        syncerConfigId: string,
        fullPath: string,
        file: TFile,
        fileId: Option<string>
    ) {
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
            vaultName,
            data: None,
            fileStorageRef: None,
            localDataType: Some(backingdata),
            deviceId: None,
            syncerConfigId: syncerConfigId,
            isFromCloudCache: false
        });
    }

    /**
     * Overwrite most entries except `localDataType`.
     * @param other
     * @returns true if there were any diffs
     */
    public overwrite(other: FileNode<TypeOfData>): bool {
        this.data.fullPath = other.data.fullPath;
        this.data.ctime = other.data.ctime;
        this.data.mtime = other.data.mtime;
        this.data.size = other.data.size;
        this.data.baseName = other.data.baseName;
        this.data.extension = other.data.extension;
        if (other.data.fileId.some) {
            this.data.fileId = other.data.fileId;
        }
        this.data.userId = other.data.userId;
        this.data.deleted = other.data.deleted;
        this.data.data = other.data.data;
        this.data.fileStorageRef = other.data.fileStorageRef;
        // localDataType not overwritten.
        // vault name should not change so no need to overwrite it.
        // this.data.vaultName = other.data.vaultName;
        this.data.deviceId = other.data.deviceId;
        this.data.syncerConfigId = other.data.syncerConfigId;
        if (this.data.localDataType.none) {
            this.data.isFromCloudCache = other.data.isFromCloudCache;
        }
    }

    /** Overwrite metadata from the cloud. */
    public overwriteMetadata(other: FileNode<TypeOfData>) {
        this.data.fileId = other.data.fileId;
        this.data.userId = other.data.userId;
        // Vault name is fixed.
        // this.data.vaultName = other.data.vaultName;
        // Device id is set from config.
        // this.data.deviceId = other.data.deviceId;
        // Syncer config should be set at creation.
        // this.data.syncerConfigId = other.data.syncerConfigId;
    }

    public toString() {
        return this.data.fullPath;
    }

    /** Checks if the data are equal in both file nodes. */
    public equalsData(other: FileNode): boolean {
        return (
            this.data.fullPath === other.data.fullPath &&
            this.data.ctime === other.data.ctime &&
            this.data.mtime === other.data.mtime &&
            this.data.size === other.data.size &&
            this.data.baseName === other.data.baseName &&
            this.data.extension === other.data.extension &&
            this.data.deleted === other.data.deleted &&
            this.data.data.equals(other.data.data) &&
            this.data.fileStorageRef.equals(other.data.fileStorageRef)
        );
    }
}
