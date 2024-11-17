import type {
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
    WithFieldValue
} from "firebase/firestore";
import { Bytes } from "firebase/firestore";
import type { CloudNode, FilePathType, FirestoreNodes, UploadFileNode } from "./file_node";
import { CloudNodeFileRef, CloudNodeRaw } from "./file_node";
import type { UserCredential } from "firebase/auth";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type FirestoreSyncPlugin from "../main";
import { InternalError } from "../lib/status_error";

type LatestFirestoreSchema = "v1";
/** Latest firestore schema. */
export const LATEST_FIRESTORE_SCHEMA: LatestFirestoreSchema = "v1";

interface DataFieldModel {
    type: "Raw";
    /** The data of the file if less than 100Kb */
    data: Bytes;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef: null;
}
interface StorageFieldModel {
    type: "Ref";
    /** The data of the file if less than 100Kb */
    data: null;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef: string;
}

/** Data for the file. */
export interface FileDataDbModel {
    // Full filepath.
    path: string;
    // The file creation time.
    cTime: number;
    // The file modification time.
    mTime: number;
    /** Size of the file in bytes. */
    size: number;
    /** File name without the extension. */
    baseName: string;
    /** File extension (example ".md"). */
    ext: string;
    /** The id of the user. */
    userId: string;
    /** If the file has been deleted. */
    deleted: boolean;
    /** The hash of the file contents. */
    fileHash: string;

    //
    // Metadata.
    //

    /** The name of the vault. */
    vaultName: string;
    /** The id of the device. */
    deviceId: string;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
    /** Time of the change of this file, in ms from unix epoch. */
    entryTime: number;

    //
    // Version
    //

    /** The version of the schema. */
    version: LatestFirestoreSchema;
}

/** Version 1 of the firestore data model. */
export type FileDataDbModelV1 = FileDataDbModel & (DataFieldModel | StorageFieldModel);

/** All possible versions of firestore File collections. */
export type AllFileDbModels = FileDataDbModelV1;

/** Current version of the firestore data. */
export type FileDbModel = FileDataDbModelV1;

// Firestore data converter
export class FileSchemaConverter implements FirestoreDataConverter<FirestoreNodes, FileDbModel> {
    constructor(
        private _plugin: FirestoreSyncPlugin,
        private _userCreds: UserCredential
    ) {}

    public toFirestore(node: WithFieldValue<UploadFileNode>): WithFieldValue<FileDbModel> {
        const fileNode = node as UploadFileNode;
        switch (fileNode.extra.type) {
            case "RAW_DATA":
                return {
                    path: fileNode.data.fullPath,
                    cTime: fileNode.data.cTime,
                    mTime: fileNode.data.mTime,
                    size: fileNode.data.size,
                    baseName: fileNode.data.baseName,
                    ext: fileNode.data.extension,
                    userId: this._userCreds.user.uid,
                    deleted: fileNode.data.deleted,
                    data: Bytes.fromUint8Array(fileNode.extra.data),
                    fileStorageRef: null,
                    vaultName: fileNode.metadata.vaultName,
                    deviceId: this._plugin.settings.clientId,
                    syncerConfigId: fileNode.metadata.syncerConfigId,
                    fileHash: fileNode.data.fileHash,
                    entryTime: fileNode.metadata.firestoreTime.valueOr(Date.now()),
                    version: "v1",
                    type: "Raw"
                };
            case "FILE_REF":
                return {
                    path: fileNode.data.fullPath,
                    cTime: fileNode.data.cTime,
                    mTime: fileNode.data.mTime,
                    size: fileNode.data.size,
                    baseName: fileNode.data.baseName,
                    ext: fileNode.data.extension,
                    userId: this._userCreds.user.uid,
                    deleted: fileNode.data.deleted,
                    data: null,
                    fileStorageRef: fileNode.extra.fileStorageRef,
                    vaultName: fileNode.metadata.vaultName,
                    deviceId: this._plugin.settings.clientId,
                    syncerConfigId: fileNode.metadata.syncerConfigId,
                    fileHash: fileNode.data.fileHash,
                    entryTime: fileNode.metadata.firestoreTime.valueOr(Date.now()),
                    version: "v1",
                    type: "Ref"
                };
        }
    }

    public fromFirestore(
        _snapshot: QueryDocumentSnapshot<FileDbModel>,
        _options: SnapshotOptions
    ): CloudNode {
        const data = _snapshot.data();

        switch (data.type) {
            case "Raw":
                return new CloudNodeRaw(
                    {
                        fullPath: data.path as FilePathType,
                        cTime: data.cTime,
                        mTime: data.mTime,
                        size: data.size,
                        baseName: data.baseName,
                        extension: data.ext,
                        deleted: data.deleted,
                        fileHash: data.fileHash
                    },
                    {
                        deviceId: Some(data.deviceId),
                        syncerConfigId: data.syncerConfigId,
                        firestoreTime: Some(data.entryTime),
                        vaultName: data.vaultName,
                        fileId: Some(_snapshot.id),
                        userId: Some(data.userId)
                    },
                    {
                        isFromCloudCache: false,
                        data: Some(data.data.toUint8Array()),
                        versionString: data.version
                    }
                );
            case "Ref":
                return new CloudNodeFileRef(
                    {
                        fullPath: data.path as FilePathType,
                        cTime: data.cTime,
                        mTime: data.mTime,
                        size: data.size,
                        baseName: data.baseName,
                        extension: data.ext,
                        deleted: data.deleted,
                        fileHash: data.fileHash
                    },
                    {
                        deviceId: Some(data.deviceId),
                        syncerConfigId: data.syncerConfigId,
                        firestoreTime: Some(data.entryTime),
                        vaultName: data.vaultName,
                        fileId: Some(_snapshot.id),
                        userId: Some(data.userId)
                    },
                    {
                        isFromCloudCache: false,
                        fileStorageRef: data.fileStorageRef,
                        versionString: data.version
                    }
                );
        }
    }
}

let FIRESTORE_CONVERTER: Option<FileSchemaConverter> = None;
export function SetFileSchemaConverter(plugin: FirestoreSyncPlugin, creds: UserCredential) {
    FIRESTORE_CONVERTER = Some(new FileSchemaConverter(plugin, creds));
}

export function GetFileSchemaConverter(): FileSchemaConverter {
    if (FIRESTORE_CONVERTER.none) {
        throw InternalError("FIRESTORE_CONVERTER is None.");
    }
    return FIRESTORE_CONVERTER.safeValue();
}
