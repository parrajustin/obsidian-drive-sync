import type {
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
    WithFieldValue
} from "firebase/firestore";
import { Bytes } from "firebase/firestore";
import type { FileNodeParams } from "../sync/file_node";
import { FileNode } from "../sync/file_node";
import type { UserCredential } from "firebase/auth";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type FirestoreSyncPlugin from "../main";
import { InternalError } from "../lib/status_error";
import { uuidv7 } from "../lib/uuid";

export interface HistoryDbModel {
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

    /** The file id of the historic node. */
    fileId: string;
}

export interface HistoryFileNodeExtra {
    historyDocId: string;
}

// Firestore history data converter
export class HistorySchemaConverter
    implements
        FirestoreDataConverter<FileNode<Option<string>, HistoryFileNodeExtra>, HistoryDbModel>
{
    constructor(
        private _plugin: FirestoreSyncPlugin,
        private _userCreds: UserCredential
    ) {}

    public toFirestore(
        node: WithFieldValue<FileNode<Option<string>, HistoryFileNodeExtra>>
    ): WithFieldValue<HistoryDbModel> {
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
            syncerConfigId: fileNode.data.syncerConfigId,
            fileId: fileNode.data.fileId.valueOr(uuidv7())
        };
    }

    public fromFirestore(
        _snapshot: QueryDocumentSnapshot<HistoryDbModel>,
        _options: SnapshotOptions
    ): FileNode<Some<string>, HistoryFileNodeExtra> {
        const data = _snapshot.data();
        const params: FileNodeParams<Some<string>> = {
            fullPath: data.path,
            ctime: data.cTime,
            mtime: data.mTime,
            size: data.size,
            baseName: data.baseName,
            extension: data.ext,
            fileId: Some(data.fileId),
            userId: Some(data.userId),
            deleted: data.deleted,
            vaultName: data.vaultName,
            data: data.data !== null ? Some(data.data.toUint8Array()) : None,
            fileStorageRef: data.fileStorageRef !== null ? Some(data.fileStorageRef) : None,
            localDataType: None,
            deviceId: Some(data.deviceId),
            syncerConfigId: data.syncerConfigId,
            isFromCloudCache: false
        };

        return new FileNode(params, { historyDocId: _snapshot.ref.id });
    }
}

let FIRESTORE_HISTORY_CONVERTER: Option<HistorySchemaConverter> = None;
export function SetHistorySchemaConverter(plugin: FirestoreSyncPlugin, creds: UserCredential) {
    FIRESTORE_HISTORY_CONVERTER = Some(new HistorySchemaConverter(plugin, creds));
}

export function GetHistorySchemaConverter(): HistorySchemaConverter {
    if (FIRESTORE_HISTORY_CONVERTER.none) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw InternalError("FIRESTORE_HISTORY_CONVERTER is None.");
    }
    return FIRESTORE_HISTORY_CONVERTER.safeValue();
}
