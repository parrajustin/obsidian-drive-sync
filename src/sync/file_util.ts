import type { App, DataWriteOptions } from "obsidian";
import { Err, Ok, type Result, type StatusResult } from "../lib/result";
import { InternalError, NotFoundError, type StatusError } from "../lib/status_error";
import type { FileNode, LocalDataType } from "./file_node";
import { CloudDataType } from "./file_node";
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
import type { HistoryFileNodeExtra } from "../history/history_schema";
import { GetHistorySchemaConverter } from "../history/history_schema";
import type { Option } from "../lib/option";
import type { UserCredential } from "firebase/auth";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import { GetFileSchemaConverter } from "./firestore_schema";

/** Reads a file through the raw apis. */
export async function ReadFile(
    app: App,
    filePath: string,
    type: LocalDataType
): Promise<Result<Uint8Array, StatusError>> {
    switch (type.type) {
        case "OBSIDIAN":
            return ReadObsidianFile(app, filePath);
        case "RAW":
            return ReadRawFile(app, filePath);
    }
}

/** Write the `data` to the raw file at `filePath`. */
export async function WriteFile(
    app: App,
    filePath: string,
    data: Uint8Array,
    type: LocalDataType,
    opts?: DataWriteOptions
): Promise<StatusResult<StatusError>> {
    switch (type.type) {
        case "OBSIDIAN":
            return WriteToObsidianFile(app, filePath, data, opts);
        case "RAW":
            return WriteToRawFile(app, filePath, data, opts);
    }
}

/** Deletes the raw file at `filePath`, works for any file. */
export async function DeleteFile(
    app: App,
    filePath: string,
    type: LocalDataType
): Promise<StatusResult<StatusError>> {
    switch (type.type) {
        case "OBSIDIAN":
            return DeleteObsidianFile(app, filePath);
        case "RAW":
            return DeleteRawFile(app, filePath);
    }
}

async function QueryFirestore<NewAppModelType, NewDbModelType extends DocumentData = DocumentData>(
    db: Firestore,
    path: string,
    converter: FirestoreDataConverter<NewAppModelType, NewDbModelType>
): Promise<Result<FileNode, StatusError>> {
    const query = await WrapPromise(
        getDoc(doc(db, path).withConverter(converter)),
        /*textForUnknown=*/ `Failed to query for "${path}"`
    );
    if (query.err) {
        return query;
    }
    const data = query.safeUnwrap().data() as FileNode;
    return Ok(data);
}

/** Read the data from a file node wherever it may be. */
export async function ReadFileNode(
    app: App,
    db: Firestore,
    creds: UserCredential,
    fileNode: FileNode | FileNode<Option<string>, HistoryFileNodeExtra>
): Promise<Result<Uint8Array, StatusError>> {
    if (fileNode.data.localDataType.some) {
        return ReadFile(app, fileNode.data.fullPath, fileNode.data.localDataType.safeValue());
    }
    if (fileNode.data.fileStorageRef.some) {
        const data = await DownloadFileFromStorage(fileNode.data.fileStorageRef.safeValue());
        return data.map((n) => new Uint8Array(n));
    }
    let readData: Uint8Array;
    if (fileNode.data.data.some) {
        readData = fileNode.data.data.safeValue();
    } else {
        if (!fileNode.data.cloudDataType.some || !fileNode.data.fileId.some) {
            return Err(NotFoundError(`No cloud data type set for "${fileNode.toString()}"`));
        }
        switch (fileNode.data.cloudDataType.safeValue()) {
            case CloudDataType.FILE: {
                const queryResult = await QueryFirestore(
                    db,
                    `${GetFileCollectionPath(creds)}/${fileNode.data.fileId.safeValue()}`,
                    GetFileSchemaConverter()
                );
                if (queryResult.err) {
                    return queryResult;
                }
                const data = queryResult.safeUnwrap().data.data;
                if (data.none) {
                    return Err(
                        InternalError(`Cloud node"${fileNode.toString()}" had no data found`)
                    );
                }
                readData = data.safeValue();
                break;
            }
            case CloudDataType.HISTORIC: {
                const historyNode = fileNode as FileNode<Option<string>, HistoryFileNodeExtra>;
                const queryResult = await QueryFirestore(
                    db,
                    `hist/${historyNode.extraData.historyDocId}`,
                    GetHistorySchemaConverter()
                );
                if (queryResult.err) {
                    return queryResult;
                }
                const data = queryResult.safeUnwrap().data.data;
                if (data.none) {
                    return Err(
                        InternalError(`History node "${historyNode.toString()}" had no data found`)
                    );
                }
                readData = data.safeValue();
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
        /*textForUnknown=*/ `Failed to convert to array buffer`
    );
    return dataDecompressed.map((n) => new Uint8Array(n));
}
