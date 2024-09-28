import type {
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
    WithFieldValue
} from "firebase/firestore";
import { Bytes } from "firebase/firestore";
import type { FileNodeParams } from "./file_node";
import { FileNode } from "./file_node";
import type { UserCredential } from "firebase/auth";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type FirestoreSyncPlugin from "../main";
import { InternalError } from "../lib/status_error";

export interface FileDbModel {
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
    /** The data of the file if less than 100Kb */
    data: Bytes | null;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef: string | null;

    /** The name of the vault. */
    vaultName: string;
    /** The id of the device. */
    deviceId: string;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
}

// Firestore data converter
export class FileSchemaConverter implements FirestoreDataConverter<FileNode, FileDbModel> {
    constructor(
        private _plugin: FirestoreSyncPlugin,
        private _userCreds: UserCredential
    ) {}

    public toFirestore(node: WithFieldValue<FileNode>): WithFieldValue<FileDbModel> {
        const fileNode = node as FileNode;
        return {
            path: fileNode.data.fullPath,
            cTime: fileNode.data.ctime,
            mTime: fileNode.data.mtime,
            size: fileNode.data.size,
            baseName: fileNode.data.baseName,
            ext: fileNode.data.extension,
            userId: this._userCreds.user.uid,
            deleted: fileNode.data.deleted,
            data: fileNode.data.data.andThen((text) => Bytes.fromUint8Array(text)).valueOr(null),
            fileStorageRef: fileNode.data.fileStorageRef.valueOr(null),
            vaultName: fileNode.data.vaultName,
            deviceId: this._plugin.settings.clientId,
            syncerConfigId: fileNode.data.syncerConfigId
        };
    }

    public fromFirestore(
        _snapshot: QueryDocumentSnapshot<FileDbModel, DocumentData>,
        _options: SnapshotOptions
    ): FileNode<Some<string>> {
        const data = _snapshot.data();
        const params: FileNodeParams<Some<string>> = {
            fullPath: data.path,
            ctime: data.cTime,
            mtime: data.mTime,
            size: data.size,
            baseName: data.baseName,
            extension: data.ext,
            fileId: Some(_snapshot.id),
            userId: Some(data.userId),
            deleted: data.deleted,
            vaultName: data.vaultName,
            data: data.data !== null ? Some(data.data.toUint8Array()) : None,
            fileStorageRef: data.fileStorageRef !== null ? Some(data.fileStorageRef) : None,
            localDataType: None,
            deviceId: Some(data.deviceId),
            syncerConfigId: data.syncerConfigId
        };

        return new FileNode(params);
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
