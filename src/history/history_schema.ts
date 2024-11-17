import type {
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
    WithFieldValue
} from "firebase/firestore";
import { Bytes } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type FirestoreSyncPlugin from "../main";
import { InternalError } from "../lib/status_error";
import type { HistoricNodeExtraType } from "./history_file_node";
import { HistoricFileNode } from "./history_file_node";
import type { FileDataDbModelV1 } from "../sync/firestore_schema";
import type { FilePathType } from "../sync/file_node";

export interface HistoryDbModelV1 {
    /** File data version. */
    file: FileDataDbModelV1;
    /** the uid of the file. */
    fileId: string;
    /** The version of the schema. */
    version: "v1";
    /** Time of the creation of this entry, in ms from unix epoch. */
    entryTime: number;
}

export type AllHistoryDbModels = HistoryDbModelV1;
export type HistoryDbModel = HistoryDbModelV1;

// Firestore history data converter
export class HistorySchemaConverter
    implements FirestoreDataConverter<HistoricFileNode, HistoryDbModel>
{
    constructor(
        private _plugin: FirestoreSyncPlugin,
        private _userCreds: UserCredential
    ) {}

    public toFirestore(node: WithFieldValue<HistoricFileNode>): WithFieldValue<HistoryDbModel> {
        const fileNode = node as HistoricFileNode;
        switch (fileNode.extra.type) {
            case "file_ref":
                return {
                    file: {
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
                        version: "v1",
                        entryTime: fileNode.metadata.firestoreTime.safeValue(),
                        type: "Ref"
                    },
                    fileId: fileNode.metadata.fileId.safeValue(),
                    version: "v1",
                    entryTime: new Date().getTime()
                };
            case "raw_data":
                return {
                    file: {
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
                        version: "v1",
                        entryTime: fileNode.metadata.firestoreTime.safeValue(),
                        type: "Raw"
                    },
                    fileId: fileNode.metadata.fileId.safeValue(),
                    version: "v1",
                    entryTime: new Date().getTime()
                };
            case "cached_raw":
                throw InternalError("Some how a historic node has no raw data or file storage ref");
        }
    }

    public fromFirestore(
        _snapshot: QueryDocumentSnapshot<HistoryDbModel>,
        _options: SnapshotOptions
    ): HistoricFileNode {
        const data = _snapshot.data();
        let extraData: HistoricNodeExtraType;
        if (data.file.data !== null) {
            extraData = {
                type: "raw_data",
                data: data.file.data.toUint8Array(),
                historyDocId: _snapshot.id,
                historyDocEntryTime: data.entryTime
            };
        } else {
            extraData = {
                type: "file_ref",
                fileStorageRef: data.file.fileStorageRef,
                historyDocId: _snapshot.id,
                historyDocEntryTime: data.entryTime
            };
        }

        return new HistoricFileNode(
            {
                fullPath: data.file.path as FilePathType,
                cTime: data.file.cTime,
                mTime: data.file.mTime,
                size: data.file.size,
                baseName: data.file.baseName,
                extension: data.file.ext,
                deleted: data.file.deleted,
                fileHash: data.file.fileHash
            },
            {
                deviceId: Some(data.file.deviceId),
                syncerConfigId: data.file.syncerConfigId,
                firestoreTime: Some(data.entryTime),
                vaultName: data.file.vaultName,
                fileId: Some(data.fileId),
                userId: Some(data.file.userId)
            },
            extraData
        );
    }
}

let FIRESTORE_HISTORY_CONVERTER: Option<HistorySchemaConverter> = None;
export function SetHistorySchemaConverter(plugin: FirestoreSyncPlugin, creds: UserCredential) {
    FIRESTORE_HISTORY_CONVERTER = Some(new HistorySchemaConverter(plugin, creds));
}

export function GetHistorySchemaConverter(): HistorySchemaConverter {
    if (FIRESTORE_HISTORY_CONVERTER.none) {
        throw InternalError("FIRESTORE_HISTORY_CONVERTER is None.");
    }
    return FIRESTORE_HISTORY_CONVERTER.safeValue();
}
