import type { App, DataWriteOptions } from "obsidian";
import { Err, Ok, type Result, type StatusResult } from "../lib/result";
import { InternalError, InvalidArgumentError, type StatusError } from "../lib/status_error";
import type {
    AllFileNodeTypes,
    ImmutableBaseFileNode,
    FirestoreNodes,
    LocalNode,
    FilePathType
} from "./file_node";
import { CloudNodeRaw } from "./file_node";
import { CloudNodeFileRef, LocalNodeObsidian, LocalNodeRaw } from "./file_node";
import {
    DeleteObsidianFile,
    ReadObsidianFile,
    WriteToObsidianFile
} from "./file_util_obsidian_api";
import { DeleteRawFile, ReadRawFile, WriteToRawFile } from "./file_util_raw_api";
import { DownloadFileFromStorage } from "./cloud_storage_util";
import type { DocumentData, Firestore, FirestoreDataConverter } from "firebase/firestore";
import { doc, getDoc } from "firebase/firestore";
import { WrapPromise } from "../lib/wrap_promise";
import { GetHistorySchemaConverter } from "../history/history_schema";
import type { UserCredential } from "firebase/auth";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import { GetFileSchemaConverter } from "./firestore_schema";
import { HistoricFileNode } from "../history/history_file_node";
import { IsAcceptablePath, IsLocalFileRaw, IsObsidianFile } from "./query_util";
import type { SyncerConfig } from "../settings/syncer_config_data";

/** Reads a file through the raw apis. */
export async function ReadFile(
    app: App,
    filePath: FilePathType,
    node: LocalNode
): Promise<Result<Uint8Array, StatusError>> {
    switch (node.type) {
        case "LOCAL_RAW":
            return ReadRawFile(app, filePath);
        case "LOCAL_OBSIDIAN_FILE":
            return ReadObsidianFile(app, filePath);
    }
}

/** Write the `data` to the raw file at `filePath`. */
export async function WriteFile(
    app: App,
    filePath: FilePathType,
    data: Uint8Array,
    syncConfig: SyncerConfig,
    opts?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    if (IsAcceptablePath(filePath, syncConfig) && IsObsidianFile(filePath, syncConfig)) {
        return WriteToObsidianFile(app, filePath, data, opts);
    }
    if (IsAcceptablePath(filePath, syncConfig) && IsLocalFileRaw(filePath, syncConfig)) {
        return WriteToRawFile(app, filePath, data, opts);
    }
    return Err(InvalidArgumentError(`Path "${filePath}" not writable?!`));
}

/** Deletes the raw file at `filePath`, works for any file. */
export async function DeleteFile(
    app: App,
    syncConfig: SyncerConfig,
    filePath: FilePathType
): Promise<StatusResult<StatusError>> {
    if (!IsAcceptablePath(filePath, syncConfig)) {
        return Err(InvalidArgumentError(`Path "${filePath}" outside acceptable paths.`));
    }
    if (IsObsidianFile(filePath, syncConfig)) {
        return DeleteObsidianFile(app, filePath);
    }
    if (IsLocalFileRaw(filePath, syncConfig)) {
        return DeleteRawFile(app, filePath);
    }
    return Err(InvalidArgumentError(`Path "${filePath}" not raw or obsidian path.`));
}

/** QUery firestore to get a document. */
async function QueryFirestore<
    TFileNode extends ImmutableBaseFileNode,
    NewAppModelType,
    NewDbModelType extends DocumentData = DocumentData
>(
    db: Firestore,
    path: string,
    converter: FirestoreDataConverter<NewAppModelType, NewDbModelType>
): Promise<Result<TFileNode, StatusError>> {
    const query = await WrapPromise(
        getDoc(doc(db, path).withConverter(converter)),
        /*textForUnknown=*/ `Failed to query for "${path}"`
    );
    if (query.err) {
        return query;
    }
    const data = query.safeUnwrap().data() as unknown as TFileNode;
    return Ok(data);
}

/** Read the data from a file node wherever it may be. */
export async function ReadFileNode(
    app: App,
    db: Firestore,
    creds: UserCredential,
    fileNode: AllFileNodeTypes | HistoricFileNode
): Promise<Result<Uint8Array, StatusError>> {
    // For local file nodes use the `ReadFile` api.
    if (fileNode instanceof LocalNodeObsidian || fileNode instanceof LocalNodeRaw) {
        return ReadFile(app, fileNode.data.fullPath, fileNode);
    }
    // For data in the file storage api just read it.
    if (fileNode instanceof CloudNodeFileRef) {
        const data = await DownloadFileFromStorage(fileNode.extra.fileStorageRef);
        return data.map((n) => new Uint8Array(n));
    }
    if (fileNode instanceof HistoricFileNode && fileNode.extra.type === "file_ref") {
        const data = await DownloadFileFromStorage(fileNode.extra.fileStorageRef);
        return data.map((n) => new Uint8Array(n));
    }

    // For data from the cloud filestore it is compressed and needs to
    // be preprocessed.
    let readData: Uint8Array;
    if (fileNode instanceof HistoricFileNode && fileNode.extra.type === "raw_data") {
        readData = fileNode.extra.data;
    } else if (fileNode instanceof CloudNodeRaw && fileNode.extra.data.some) {
        readData = fileNode.extra.data.safeValue();
    } else {
        switch (fileNode.type) {
            case "CLOUD_RAW": {
                const queryResult = await QueryFirestore<CloudNodeRaw, FirestoreNodes>(
                    db,
                    `${GetFileCollectionPath(creds)}/${fileNode.metadata.fileId.safeValue()}`,
                    GetFileSchemaConverter()
                );
                if (queryResult.err) {
                    return queryResult;
                }
                const data = queryResult.safeUnwrap().extra.data;
                if (data.none) {
                    return Err(
                        InternalError(`Cloud node"${fileNode.toString()}" had no data found`)
                    );
                }
                readData = data.safeValue();
                break;
            }
            case "HISTORIC_NODE": {
                const queryResult = await QueryFirestore<HistoricFileNode, HistoricFileNode>(
                    db,
                    `hist/${fileNode.extra.historyDocId}`,
                    GetHistorySchemaConverter()
                );
                if (queryResult.err) {
                    return queryResult;
                }
                const node = queryResult.safeUnwrap();
                if (node.extra.type !== "raw_data") {
                    return Err(
                        InternalError(
                            `Node "${node.toString()}" has no data but expected in ReadFile.`
                        )
                    );
                }
                readData = node.extra.data;
                break;
            }
        }
    }

    // Create the read stream and decompress the data.
    const compressedReadableStream = await WrapPromise(
        Promise.resolve(
            new ReadableStream({
                start(controller) {
                    controller.enqueue(readData);
                    controller.close();
                }
            }).pipeThrough(new DecompressionStream("gzip"))
        ),
        /*textForUnknown=*/ `Failed to decompress "${fileNode.toString()}" fetched data`
    );
    if (compressedReadableStream.err) {
        return compressedReadableStream;
    }

    // Convert data to uint8array.
    const wrappedResponse = new Response(compressedReadableStream.safeUnwrap());
    const dataDecompressed = await WrapPromise(
        wrappedResponse.arrayBuffer(),
        /*textForUnknown=*/ `[ReadFileNode] Failed to convert to array buffer`
    );
    return dataDecompressed.map((n) => new Uint8Array(n));
}
