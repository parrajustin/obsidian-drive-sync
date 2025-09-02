// import type { App, DataWriteOptions } from "obsidian";
// import { Err, type Result, type StatusResult } from "../lib/result";
// import {
//     InternalError,
//     InvalidArgumentError,
//     NotFoundError,
//     type StatusError
// } from "../lib/status_error";
// import type {
//     AllFileNodeTypes,
//     LocalNode,
//     FilePathType,
//     Immutable,
//     BaseMutableFileNode
// } from "./file_node";
// import { CloudNodeRaw } from "./file_node";
// import { CloudNodeFileRef, LocalNodeObsidian, LocalNodeRaw } from "./file_node";
// import { FileUtilObsidian } from "../filesystem/file_util_obsidian_api";
// import { FileUtilRaw } from "../filesystem/file_util_raw_api";
// import { DownloadFileFromStorage } from "../firestore/cloud_storage_util";
// import type { Firestore } from "firebase/firestore";
// import { doc, getDoc } from "firebase/firestore";
// import { WrapPromise } from "../lib/wrap_promise";
// import type { UserCredential } from "firebase/auth";
// import { GetFileCollectionPath } from "../firestore/file_db_util";
// import { GetNotesSchemaConverter } from "./firestore_schema";
// import { HistoricFileNode } from "../history/history_file_node";
// import { IsAcceptablePath, IsLocalFileRaw, IsObsidianFile } from "./query_util";
// import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
// import { Span } from "../logging/tracing/span.decorator";
// import { InjectMeta } from "../lib/inject_status_msg";
// import { SYNCER_ID_SPAN_ATTR } from "../constants";
// import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";

// export class FileUtil {
//     /** Reads a file through the raw apis. */
//     @Span()
//     @PromiseResultSpanError
//     public static ReadFile(
//         app: App,
//         filePath: FilePathType,
//         node: LocalNode
//     ): Promise<Result<Uint8Array, StatusError>> {
//         switch (node.type) {
//             case "LOCAL_RAW":
//                 return FileUtilRaw.readRawFile(app, filePath);
//             case "LOCAL_OBSIDIAN_FILE":
//                 return FileUtilObsidian.readObsidianFile(app, filePath);
//         }
//     }
//     /** Write the `data` to the raw file at `filePath`. */
//     @Span()
//     @PromiseResultSpanError
//     public static async WriteFile(
//         app: App,
//         filePath: FilePathType,
//         data: Uint8Array,
//         syncConfig: LatestSyncConfigVersion,
//         opts?: DataWriteOptions
//     ): Promise<StatusResult<StatusError>> {
//         if (IsAcceptablePath(filePath, syncConfig) && IsObsidianFile(filePath, syncConfig)) {
//             return FileUtilObsidian.writeToObsidianFile(app, filePath, data, opts);
//         }
//         if (IsAcceptablePath(filePath, syncConfig) && IsLocalFileRaw(filePath, syncConfig)) {
//             return FileUtilRaw.writeToRawFile(app, filePath, data, opts);
//         }
//         return Err(
//             InvalidArgumentError(`Path "${filePath}" not writable?!`).with(
//                 InjectMeta({ filePath, [SYNCER_ID_SPAN_ATTR]: syncConfig.syncerId })
//             )
//         );
//     }

//     /** Deletes the raw file at `filePath`, works for any file. */
//     @Span()
//     @PromiseResultSpanError
//     public static async DeleteFile(
//         app: App,
//         syncConfig: LatestSyncConfigVersion,
//         filePath: FilePathType
//     ): Promise<StatusResult<StatusError>> {
//         if (!IsAcceptablePath(filePath, syncConfig)) {
//             return Err(
//                 InvalidArgumentError(`Path "${filePath}" outside acceptable paths.`).with(
//                     InjectMeta({ filePath, [SYNCER_ID_SPAN_ATTR]: syncConfig.syncerId })
//                 )
//             );
//         }
//         if (IsObsidianFile(filePath, syncConfig)) {
//             return FileUtilObsidian.deleteObsidianFile(app, filePath);
//         }
//         if (IsLocalFileRaw(filePath, syncConfig)) {
//             return FileUtilRaw.deleteRawFile(app, filePath);
//         }
//         return Err(
//             InvalidArgumentError(`Path "${filePath}" not raw or obsidian path.`).with(
//                 InjectMeta({ filePath, [SYNCER_ID_SPAN_ATTR]: syncConfig.syncerId })
//             )
//         );
//     }

//     /** Query firestore to get a document. */
//     @Span()
//     @PromiseResultSpanError
//     public static async QueryFirestore<TFileNode extends BaseMutableFileNode>(
//         db: Firestore,
//         docId: string
//     ): Promise<Result<Immutable<TFileNode>, StatusError>> {
//         const query = await WrapPromise(
//             getDoc(doc(db, docId)),
//             /*textForUnknown=*/ `Failed to query for "${docId}"`
//         );
//         if (query.err) {
//             query.val.with(InjectMeta({ docId }));
//             return query;
//         }
//         if (!query.safeUnwrap().exists()) {
//             return Err(NotFoundError(`Didn't find doc "${docId}".`).with(InjectMeta({ docId })));
//         }
//         return GetNotesSchemaConverter().FromFirestore(query.safeUnwrap()) as Result<
//             Immutable<TFileNode>,
//             StatusError
//         >;
//     }

//     /** Read the data from a file node wherever it may be. */
//     @Span()
//     @PromiseResultSpanError
//     public static async ReadFileNode(
//         app: App,
//         db: Firestore,
//         creds: UserCredential,
//         fileNode: AllFileNodeTypes | HistoricFileNode
//     ): Promise<Result<Uint8Array, StatusError>> {
//         // For local file nodes use the `ReadFile` api.
//         if (fileNode instanceof LocalNodeObsidian || fileNode instanceof LocalNodeRaw) {
//             return this.ReadFile(app, fileNode.data.fullPath, fileNode);
//         }
//         // For data in the file storage api just read it.
//         if (fileNode instanceof CloudNodeFileRef) {
//             const data = await DownloadFileFromStorage(fileNode.extra.fileStorageRef);
//             return data.map((n) => new Uint8Array(n));
//         }
//         if (fileNode instanceof HistoricFileNode && fileNode.extra.type === "file_ref") {
//             const data = await DownloadFileFromStorage(fileNode.extra.fileStorageRef);
//             return data.map((n) => new Uint8Array(n));
//         }

//         // For data from the cloud filestore it is compressed and needs to
//         // be preprocessed.
//         let readData: Uint8Array;
//         if (fileNode instanceof HistoricFileNode && fileNode.extra.type === "raw_data") {
//             readData = fileNode.extra.data;
//         } else if (fileNode instanceof CloudNodeRaw && fileNode.extra.data.some) {
//             readData = fileNode.extra.data.safeValue();
//         } else {
//             switch (fileNode.type) {
//                 case "CLOUD_RAW": {
//                     const queryResult = await this.QueryFirestore<CloudNodeRaw>(
//                         db,
//                         `${GetFileCollectionPath(creds)}/${fileNode.metadata.fileId.safeValue()}`
//                     );
//                     if (queryResult.err) {
//                         return queryResult;
//                     }
//                     const data = queryResult.safeUnwrap().extra.data;
//                     if (data.none) {
//                         return Err(
//                             InternalError(`Cloud node"${fileNode.ToString()}" had no data found`)
//                         );
//                     }
//                     readData = data.safeValue();
//                     break;
//                 }
//                 case "HISTORIC_NODE": {
//                     const queryResult = await this.QueryFirestore<HistoricFileNode>(
//                         db,
//                         `hist/${fileNode.extra.historyDocId}`
//                     );
//                     if (queryResult.err) {
//                         return queryResult;
//                     }
//                     const node = queryResult.safeUnwrap();
//                     if (node.extra.type !== "raw_data") {
//                         return Err(
//                             InternalError(
//                                 `Node "${node.ToString()}" has no data but expected in ReadFile.`
//                             )
//                         );
//                     }
//                     readData = node.extra.data;
//                     break;
//                 }
//             }
//         }

//         // Create the read stream and decompress the data.
//         const compressedReadableStream = await WrapPromise(
//             Promise.resolve(
//                 new ReadableStream({
//                     start(controller) {
//                         controller.enqueue(readData);
//                         controller.close();
//                     }
//                 }).pipeThrough(new DecompressionStream("gzip"))
//             ),
//             /*textForUnknown=*/ `Failed to decompress "${fileNode.ToString()}" fetched data`
//         );
//         if (compressedReadableStream.err) {
//             return compressedReadableStream;
//         }

//         // Convert data to uint8array.
//         const wrappedResponse = new Response(compressedReadableStream.safeUnwrap());
//         const dataDecompressed = await WrapPromise(
//             wrappedResponse.arrayBuffer(),
//             /*textForUnknown=*/ `[ReadFileNode] Failed to convert to array buffer`
//         );
//         return dataDecompressed.map((n) => new Uint8Array(n));
//     }
// }
