// import type { DocumentSnapshot, QueryDocumentSnapshot } from "firebase/firestore";
// import { Bytes } from "firebase/firestore";
// import type { UserCredential } from "firebase/auth";
// import type { Option } from "../lib/option";
// import { None, Some, WrapOptional } from "../lib/option";
// import type FirestoreSyncPlugin from "../main";
// import { InternalError, NotFoundError, StatusError } from "../lib/status_error";
// import type { HistoricNodeExtraType } from "./history_file_node";
// import { HistoricFileNode } from "./history_file_node";
// import type { FilePathType } from "../sync/file_node";
// import type { AnyVerionHistorySchema, LatestHistorySchema } from "../schema/history/history.schema";
// import { HISTORY_SCHEMA_MANAGER } from "../schema/history/history.schema";
// import { Span } from "../logging/tracing/span.decorator";
// import { Err, Ok, type Result } from "../lib/result";
// import { ResultSpanError } from "../logging/tracing/result_span.decorator";

// // Firestore history data converter
// export class HistorySchemaConverter {
//     constructor(
//         private _plugin: FirestoreSyncPlugin,
//         private _userCreds: UserCredential
//     ) {}

//     @Span()
//     public ToFirestore(node: HistoricFileNode): LatestHistorySchema {
//         const fileNode = node;
//         switch (fileNode.extra.type) {
//             case "file_ref":
//                 return {
//                     file: {
//                         path: fileNode.data.fullPath,
//                         cTime: fileNode.data.cTime,
//                         mTime: fileNode.data.mTime,
//                         size: fileNode.data.size,
//                         baseName: fileNode.data.baseName,
//                         ext: fileNode.data.extension,
//                         userId: this._userCreds.user.uid,
//                         deleted: fileNode.data.deleted,
//                         data: null,
//                         fileStorageRef: fileNode.extra.fileStorageRef,
//                         vaultName: fileNode.metadata.vaultName,
//                         deviceId: this._plugin.settings.clientId,
//                         syncerConfigId: fileNode.metadata.syncerConfigId,
//                         fileHash: fileNode.data.fileHash,
//                         version: 0,
//                         entryTime: fileNode.metadata.firestoreTime.safeValue(),
//                         type: "Ref"
//                     },
//                     fileId: fileNode.metadata.fileId.safeValue(),
//                     version: 0,
//                     entryTime: new Date().getTime()
//                 };
//             case "raw_data":
//                 return {
//                     file: {
//                         path: fileNode.data.fullPath,
//                         cTime: fileNode.data.cTime,
//                         mTime: fileNode.data.mTime,
//                         size: fileNode.data.size,
//                         baseName: fileNode.data.baseName,
//                         ext: fileNode.data.extension,
//                         userId: this._userCreds.user.uid,
//                         deleted: fileNode.data.deleted,
//                         data: Bytes.fromUint8Array(fileNode.extra.data),
//                         fileStorageRef: null,
//                         vaultName: fileNode.metadata.vaultName,
//                         deviceId: this._plugin.settings.clientId,
//                         syncerConfigId: fileNode.metadata.syncerConfigId,
//                         fileHash: fileNode.data.fileHash,
//                         version: 0,
//                         entryTime: fileNode.metadata.firestoreTime.safeValue(),
//                         type: "Raw"
//                     },
//                     fileId: fileNode.metadata.fileId.safeValue(),
//                     version: 0,
//                     entryTime: new Date().getTime()
//                 };
//             case "cached_raw":
//                 throw InternalError("Some how a historic node has no raw data or file storage ref");
//         }
//     }

//     @Span()
//     @ResultSpanError
//     public FromFirestore(
//         snapshot: QueryDocumentSnapshot | DocumentSnapshot
//     ): Result<HistoricFileNode, StatusError> {
//         const rawData = WrapOptional(snapshot.data());
//         if (rawData.none) {
//             return Err(NotFoundError("No data fround to convert to history node."));
//         }

//         const dataResult = HISTORY_SCHEMA_MANAGER.LoadData(
//             rawData.safeValue() as unknown as AnyVerionHistorySchema
//         );
//         if (dataResult.err) {
//             return dataResult;
//         }
//         const data = dataResult.safeUnwrap();
//         let extraData: HistoricNodeExtraType;
//         if (data.file.data !== null) {
//             extraData = {
//                 type: "raw_data",
//                 data: data.file.data.toUint8Array(),
//                 historyDocId: snapshot.id,
//                 historyDocEntryTime: data.entryTime
//             };
//         } else {
//             extraData = {
//                 type: "file_ref",
//                 fileStorageRef: data.file.fileStorageRef,
//                 historyDocId: snapshot.id,
//                 historyDocEntryTime: data.entryTime
//             };
//         }

//         return Ok(
//             new HistoricFileNode(
//                 {
//                     fullPath: data.file.path as FilePathType,
//                     cTime: data.file.cTime,
//                     mTime: data.file.mTime,
//                     size: data.file.size,
//                     baseName: data.file.baseName,
//                     extension: data.file.ext,
//                     deleted: data.file.deleted,
//                     fileHash: data.file.fileHash
//                 },
//                 {
//                     deviceId: Some(data.file.deviceId),
//                     syncerConfigId: data.file.syncerConfigId,
//                     firestoreTime: Some(data.entryTime),
//                     vaultName: data.file.vaultName,
//                     fileId: Some(data.fileId),
//                     userId: Some(data.file.userId)
//                 },
//                 extraData
//             )
//         );
//     }
// }

// let FIRESTORE_HISTORY_CONVERTER: Option<HistorySchemaConverter> = None;
// export function SetHistorySchemaConverter(plugin: FirestoreSyncPlugin, creds: UserCredential) {
//     FIRESTORE_HISTORY_CONVERTER = Some(new HistorySchemaConverter(plugin, creds));
// }

// export function GetHistorySchemaConverter(): HistorySchemaConverter {
//     if (FIRESTORE_HISTORY_CONVERTER.none) {
//         throw InternalError("FIRESTORE_HISTORY_CONVERTER is None.");
//     }
//     return FIRESTORE_HISTORY_CONVERTER.safeValue();
// }
