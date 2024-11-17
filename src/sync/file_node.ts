import type { TFile } from "obsidian";
import type { Some } from "../lib/option";
import { None, type Option } from "../lib/option";

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

export interface FileMetadata {
    /** The id of the device that pushed this change. */
    deviceId: Option<string>;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
    /** The time for the firestore entry, in ms from unix epoch. */
    firestoreTime: Option<number>;
    /** Name of the vault this belongs to. */
    vaultName: string;
    /** Uid of the file. */
    fileId: Option<string>;
    /** The UId of the user that made the change. */
    userId: Option<string>;
}
export interface CloudFileMetadata {
    /** The id of the device that pushed this change. */
    deviceId: Some<string>;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
    /** The time for the firestore entry, in ms from unix epoch. */
    firestoreTime: Some<number>;
    /** Name of the vault this belongs to. */
    vaultName: string;
    /** Uid of the file. */
    fileId: Some<string>;
    /** The UId of the user that made the change. */
    userId: Some<string>;
}

/** File node for book keeping. */
export class BaseMutableFileNode {
    public type = "BASE_FILE_NODE";
    public data: FileData;
    public metadata: FileMetadata;
    public extra: unknown = {};

    constructor(data: FileData, metadata: FileMetadata, extra: unknown) {
        this.data = data;
        this.metadata = metadata;
        this.extra = extra;
    }

    /** Converts the file to string. */
    public toString(): string {
        const attributes: string[] = [
            `File type: ${this.type}`,
            this.metadata.fileId.andThen((val) => `Id: ${val}`).valueOr(""),
            `Vault: ${this.metadata.vaultName}`,
            this.metadata.firestoreTime
                .andThen(
                    (val) => `Time: ${window.moment(val).format("MMMM Do YYYY, h:mm:ss.SSS a")}`
                )
                .valueOr(""),
            `Hash: ${this.data.fileHash}`,
            `Deleted: ${this.data.deleted}`
        ].filter((v) => v !== "");
        return `File "${this.data.fullPath}" [${attributes.join(", ")}]`;
    }

    /** Checks if the data are equal in both file nodes. */
    public equalsData(other: BaseMutableFileNode): boolean {
        return (
            this.data.fileHash === other.data.fileHash &&
            this.metadata.firestoreTime.equals(other.metadata.firestoreTime) &&
            this.data.fullPath === other.data.fullPath
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
    public metadataAreEqual<T extends BaseMutableFileNode = BaseMutableFileNode>(node: T): boolean {
        return (
            this.metadata.deviceId.equals(node.metadata.deviceId) &&
            this.metadata.fileId.equals(node.metadata.fileId) &&
            this.metadata.firestoreTime.equals(node.metadata.firestoreTime) &&
            this.metadata.syncerConfigId === node.metadata.syncerConfigId &&
            this.metadata.userId.equals(node.metadata.userId) &&
            this.metadata.vaultName === node.metadata.vaultName
        );
    }
}

type PrimitiveType = number | string | boolean;

/** Object types that should never be mapped */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type, @typescript-eslint/no-explicit-any
type AtomicObject = Function | Promise<any> | Date | RegExp;
/**
 * If the lib "ES2015.Collection" is not included in tsconfig.json,
 * types like ReadonlyArray, WeakMap etc. fall back to `any` (specified nowhere)
 * or `{}` (from the node types), in both cases entering an infinite recursion in
 * pattern matching type mappings
 * This type can be used to cast these types to `void` in these cases.
 */
export type IfAvailable<T, Fallback = void> =
    // fallback if any
    true | false extends (T extends never ? true : false)
        ? Fallback // fallback if empty type
        : keyof T extends never
          ? Fallback // original type
          : T;
/**
 * These should also never be mapped but must be tested after regular Map and
 * Set
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WeakReferences = IfAvailable<WeakMap<any, any>> | IfAvailable<WeakSet<any>>;
/** Convert a mutable type into a readonly type */
export type Immutable<T> = T extends PrimitiveType
    ? T
    : T extends AtomicObject
      ? T
      : T extends ReadonlyMap<infer K, infer V> // Map extends ReadonlyMap
        ? ReadonlyMap<Immutable<K>, Immutable<V>>
        : T extends ReadonlySet<infer V> // Set extends ReadonlySet
          ? ReadonlySet<Immutable<V>>
          : T extends WeakReferences
            ? T
            : T extends object
              ? { readonly [K in keyof T]: Immutable<T[K]> }
              : T;

export type ImmutableBaseFileNode = Immutable<BaseMutableFileNode>;

export interface SharedCloudData {
    /** Firestore version data. */
    versionString: string;
}
export interface CachedCloudCacheData extends SharedCloudData {
    /** If this file node is vitual and just represents an entry from cache.  */
    isFromCloudCache: true;
    /** Data from the cloud storage compressed with brotli encoded in uint8. */
    data: None;
}
export interface NotCachedCloudData extends SharedCloudData {
    /** If this file node is vitual and just represents an entry from cache.  */
    isFromCloudCache: false;
    /** Data from the cloud storage compressed with brotli encoded in uint8. */
    data: Some<Uint8Array>;
}

type TCloudFileNodeRawKey = "CLOUD_RAW";
/** Represents a file node on cloud storage that contains the raw uint 8 data. */
export class CloudNodeRaw extends BaseMutableFileNode {
    public override readonly type: TCloudFileNodeRawKey = "CLOUD_RAW";
    public override readonly metadata: CloudFileMetadata;
    public override readonly extra: CachedCloudCacheData | NotCachedCloudData;

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(
        data: FileData,
        metadata: FileMetadata,
        extra: CachedCloudCacheData | NotCachedCloudData
    ) {
        super(data, metadata, extra);
    }
}

export interface CloudFileStorageData extends SharedCloudData {
    /** If this file node is vitual and just represents an entry from cache.  */
    isFromCloudCache: boolean;
    /** Storage path on cloud storage if any. */
    fileStorageRef: string;
}

type TCloudFileNodeStorageRefKey = "CLOUD_FILE_REF";
/** Represents a file node on cloud storage that contains a File Storage reference. */
export class CloudNodeFileRef extends BaseMutableFileNode {
    public override readonly type: TCloudFileNodeStorageRefKey = "CLOUD_FILE_REF";
    public override readonly metadata: CloudFileMetadata;
    public override readonly extra: CloudFileStorageData;

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(data: FileData, metadata: CloudFileMetadata, extra: CloudFileStorageData) {
        super(data, metadata, extra);
    }
}

export interface UploadRawData {
    type: "RAW_DATA";
    /** Data from the cloud storage compressed with brotli encoded in uint8. */
    data: Uint8Array;
}
export interface UploadFileRefData {
    type: "FILE_REF";
    /** Storage path on cloud storage if any. */
    fileStorageRef: string;
}
export type UploadNodeMetadata = UploadRawData | UploadFileRefData;

/** Represent a node that had data to upload. */
export class UploadFileNode extends BaseMutableFileNode {
    public override readonly type: TLocalFileNodeRawDataKey = "LOCAL_RAW";
    public override readonly metadata: FileMetadata;
    public override readonly extra: UploadNodeMetadata;

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(data: FileData, metadata: FileMetadata, extra: UploadNodeMetadata) {
        super(data, metadata, extra);
    }
}

type TLocalFileNodeRawDataKey = "LOCAL_RAW";
/** Represents a file node on the local device that is a raw file. */
export class LocalNodeRaw extends BaseMutableFileNode {
    public override readonly type: TLocalFileNodeRawDataKey = "LOCAL_RAW";
    public override readonly metadata: FileMetadata;

    constructor(data: FileData, metadata: FileMetadata, extra: unknown = {}) {
        super(data, metadata, extra);
    }

    public overwriteMetadataWithCloudNode(node: CloudNode | UploadFileNode): LocalNodeRaw {
        return this.cloneWithChange({ metadata: node.metadata });
    }

    public cloneWithChange(changes?: {
        data?: Partial<FileData>;
        metadata?: Partial<FileMetadata>;
    }): LocalNodeRaw {
        return new LocalNodeRaw(
            { ...this.data, ...(changes?.data ?? {}) },
            { ...this.metadata, ...(changes?.metadata ?? {}) },
            this.extra
        );
    }
}

type TLocalFileNodeObsidianDataKey = "LOCAL_OBSIDIAN_FILE";
/** Represents a file node on the local device that is an obsidian file. */
export class LocalNodeObsidian extends BaseMutableFileNode {
    public override readonly type: TLocalFileNodeObsidianDataKey = "LOCAL_OBSIDIAN_FILE";
    public override readonly metadata: FileMetadata;

    constructor(data: FileData, metadata: FileMetadata, extra: unknown = {}) {
        super(data, metadata, extra);
    }

    /** Constructs the FileNode from TFiles. */
    public static constructFromTFile(
        vaultName: string,
        syncerConfigId: string,
        fullPath: FilePathType,
        file: TFile,
        fileId: Option<string>,
        fileHash: string
    ) {
        return new LocalNodeObsidian(
            {
                fullPath,
                cTime: file.stat.ctime,
                mTime: file.stat.mtime,
                size: file.stat.size,
                baseName: file.basename,
                extension: file.extension,
                deleted: false,
                fileHash
            },
            {
                deviceId: None,
                syncerConfigId,
                firestoreTime: None,
                vaultName: vaultName,
                fileId: fileId,
                userId: None
            },
            {}
        );
    }

    public overwriteMetadataWithCloudNode(node: CloudNode | UploadFileNode): LocalNodeObsidian {
        return this.cloneWithChange({ metadata: node.metadata });
    }

    public cloneWithChange(changes?: {
        data?: Partial<FileData>;
        metadata?: Partial<FileMetadata>;
    }): LocalNodeObsidian {
        return new LocalNodeObsidian(
            { ...this.data, ...(changes?.data ?? {}) },
            { ...this.metadata, ...(changes?.metadata ?? {}) },
            this.extra
        );
    }
}

export type LocalNode = LocalNodeRaw | LocalNodeObsidian;

/** File nodes that come from the cloud. */
export type CloudNode = CloudNodeRaw | CloudNodeFileRef;
/** File nodes that interact with the schema converter for firestore. */
export type FirestoreNodes = CloudNode | UploadFileNode;

export type AllFileNodeTypes = CloudNode | LocalNode;
