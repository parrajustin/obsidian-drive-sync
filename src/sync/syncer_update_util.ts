/**
 * Contains the logic to actually resolve the convergence updates. Contains the logic to upload to
 * firestore or cloud storgae and keeping the progress viewer up to date.
 */

import type { Firestore } from "firebase/firestore";
import { doc, getDoc, setDoc } from "firebase/firestore";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { ErrorCode, InternalError, UnknownError } from "../lib/status_error";
import { uuidv7 } from "../lib/uuid";
import { WrapPromise } from "../lib/wrap_promise";
import { AsyncForEach } from "../util";
import { DownloadFileFromStorage, UploadFileToStorage } from "./cloud_storage_util";
import type {
    CloudConvergenceUpdate,
    CloudDeleteLocalConvergenceUpdate,
    ConvergenceUpdate,
    LocalConvergenceUpdate,
    LocalDeleteCloudConvergenceUpdate,
    LocalReplaceIdConvergenceUpdate
} from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import { WriteUidToFile } from "./file_id_util";
import { GetFileSchemaConverter } from "./firestore_schema";
import type { UserCredential } from "firebase/auth";
import type { SyncProgressView } from "../progressView";
import { GetOrCreateSyncProgressView } from "../progressView";
import type { FileMapOfNodes } from "./file_node_util";
import { GetNonDeletedByFilePath } from "./file_node_util";
import { DeleteFile, ReadFile, WriteFile } from "./file_util";
import type { SyncerConfig } from "./syncer";
import {
    ConvertFileNodeToLocalDataType,
    ConvertFilePathToLocalDataType,
    IsLocalFileRaw
} from "./query_util";
import type { FileNodeParams, LocalDataType } from "./file_node";
import { FileNode } from "./file_node";

const ONE_HUNDRED_KB_IN_BYTES = 1000 * 100;

export interface Identifiers {
    /** The id of the syncer. */
    syncerId: string;
    /** The id of the cycle. */
    cycleId: string;
}

/** Upload the file to firestore. */
async function UploadFileToFirestore(
    db: Firestore,
    node: FileNode,
    userId: string,
    fileId: string
): Promise<StatusResult<StatusError>> {
    const entry = `${userId}/${fileId}`;
    const documentRef = doc(db, entry).withConverter(GetFileSchemaConverter());

    const setResult = await WrapPromise(
        setDoc(documentRef, node),
        /*textForUnknown=*/ `Failed to setDoc for ${entry}`
    );
    if (setResult.err) {
        return setResult;
    }

    return Ok();
}

/**
 * Creates the operations to update the cloud with local data.
 * @param localUpdates the updates that have local -> cloud actions
 * @param app the obisdian app.
 * @param creds the user credentials.
 * @returns the array of operations taking place.
 */
export function CreateOperationsToUpdateCloud(
    userId: string,
    ids: Identifiers,
    db: Firestore,
    localUpdates: (
        | LocalConvergenceUpdate
        | LocalReplaceIdConvergenceUpdate
        | LocalDeleteCloudConvergenceUpdate
    )[],
    app: App,
    syncConfig: SyncerConfig,
    creds: UserCredential
): Promise<StatusResult<StatusError>>[] {
    const localOperations = AsyncForEach(
        localUpdates,
        async (update): Promise<StatusResult<StatusError>> => {
            const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
            // Get the file id.
            const fileId = update.cloudState.some
                ? update.cloudState.safeValue().data.fileId.safeValue()
                : update.localState.safeValue().data.fileId.valueOr(uuidv7());
            const localState = update.localState.safeValue();
            const tooBigForFirestore = localState.data.size > ONE_HUNDRED_KB_IN_BYTES;
            const writeData = update.action !== ConvergenceAction.USE_LOCAL_DELETE_CLOUD;

            // For times we have to replace id do that first.
            if (update.action === ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID) {
                const file = app.vault.getAbstractFileByPath(localState.data.fullPath);
                if (file === null || !(file instanceof TFile)) {
                    return Err(
                        InternalError(
                            `USE_LOCAL_BUT_REPLACE_ID expect "${localState.data.fullPath}" to be obsidian file`
                        )
                    );
                }
                const writeUid = await WriteUidToFile(app, syncConfig, file, fileId, {
                    mtime: update.cloudState.safeValue().data.mtime
                });
                if (writeUid.err) {
                    return writeUid;
                }
            }

            const node: FileNodeParams<Some<string>> = {
                fullPath: localState.data.fullPath,
                ctime: localState.data.ctime,
                mtime: localState.data.mtime,
                size: localState.data.size,
                baseName: localState.data.baseName,
                extension: localState.data.extension,
                fileId: Some(fileId),
                userId: Some(creds.user.uid),
                deleted: update.localState.safeValue().data.deleted,
                vaultName: syncConfig.vaultName,
                // Metadata.
                data: None,
                fileStorageRef: None,
                localDataType: None,
                deviceId: None,
                syncerConfigId: syncConfig.syncerId,
                isFromCloudCache: false
            };

            const initalFileName: Option<string> = update.cloudState.andThen<string>(
                (cloudStateNode) => {
                    if (cloudStateNode.data.fullPath !== localState.data.fullPath) {
                        return Some(cloudStateNode.data.fullPath);
                    }
                    return None;
                }
            );
            view.addEntry(
                ids.syncerId,
                fileId,
                initalFileName,
                localState.data.fullPath,
                update.action
            );
            view.setEntryProgress(ids.syncerId, fileId, 0.1);

            // Handle how the data is stored.
            if (writeData && !tooBigForFirestore) {
                // When the data is small enough compress it and upload to
                const readDataResult = await ReadFile(
                    app,
                    localState.data.fullPath,
                    ConvertFileNodeToLocalDataType(update.localState.safeValue(), syncConfig)
                );
                view.setEntryProgress(ids.syncerId, fileId, 0.2);
                if (readDataResult.err) {
                    return readDataResult;
                }
                // Create the read stream and compress the data.
                const compressedReadableStream = await WrapPromise(
                    Promise.resolve(
                        new ReadableStream({
                            start(controller) {
                                controller.enqueue(readDataResult.safeUnwrap());
                                controller.close();
                            }
                        }).pipeThrough(new CompressionStream("gzip"))
                    ),
                    /*textForUnknown=*/ `Failed to create stream and compress ${localState.data.fullPath}`
                );
                if (compressedReadableStream.err) {
                    return compressedReadableStream;
                }

                // Convert data to uint8array.
                const wrappedResponse = new Response(compressedReadableStream.safeUnwrap());
                const dataCompresssed = await WrapPromise(
                    wrappedResponse.arrayBuffer(),
                    /*textForUnknown=*/ `Failed to convert to array buffer`
                );
                view.setEntryProgress(ids.syncerId, fileId, 0.4);
                if (dataCompresssed.err) {
                    return dataCompresssed;
                }

                node.data = Some(new Uint8Array(dataCompresssed.safeUnwrap()));
            } else if (writeData) {
                const uploadCloudStoreResult = await UploadFileToStorage(
                    app,
                    syncConfig,
                    localState.data.fullPath,
                    creds,
                    fileId
                );
                view.setEntryProgress(ids.syncerId, fileId, 0.6);
                if (uploadCloudStoreResult.err) {
                    return uploadCloudStoreResult;
                }
                node.fileStorageRef = Some(uploadCloudStoreResult.safeUnwrap());
            }

            // Upload the data to firestore.
            const uploadNode = new FileNode<Some<string>>(node);
            const uploadCloudState = await UploadFileToFirestore(db, uploadNode, userId, fileId);
            view.setEntryProgress(ids.syncerId, fileId, 0.7);
            if (uploadCloudState.err) {
                return uploadCloudState;
            }

            // Update the local file node.
            update.localState.safeValue().overwriteMetadata(uploadNode);

            view.setEntryProgress(ids.syncerId, fileId, 1.0);
            return Ok();
        }
    );
    return localOperations;
}

/** Does the update by downloading the cloud file to local files. */
async function DownloadCloudUpdate(
    db: Firestore,
    userId: string,
    ids: Identifiers,
    app: App,
    syncConfig: SyncerConfig,
    update: CloudConvergenceUpdate,
    view: SyncProgressView,
    fileId: string
): Promise<StatusResult<StatusError>> {
    let dataToWrite: Option<Uint8Array> = None;

    if (
        update.cloudState.safeValue().data.isFromCloudCache &&
        update.cloudState.safeValue().data.fileStorageRef.none
    ) {
        // The cloud state if from the cloud cache and has no file storage so we need to fetch the
        // data.
        const documentRef = doc(
            db,
            `${userId}/${update.cloudState.safeValue().data.fileId.safeValue()}`
        ).withConverter(GetFileSchemaConverter());

        const fetchResult = await WrapPromise(
            getDoc(documentRef),
            /*textForUnknown=*/ `Failed to get cached doc ${update.cloudState.safeValue().data.fileId.safeValue()}`
        );
        if (fetchResult.err) {
            return fetchResult;
        }
        const fileNode = fetchResult.safeUnwrap().data() as FileNode<Some<string>>;
        update.cloudState.safeValue().overwrite(fileNode);
    }

    // First check the easy path. The file was small enough to fit into firestore.
    const textData = update.cloudState.safeValue().data.data;
    if (textData.some) {
        // Create the read stream and decompress the data.
        const compressedReadableStream = await WrapPromise(
            Promise.resolve(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(textData.safeValue());
                        controller.close();
                    }
                }).pipeThrough(new DecompressionStream("gzip"))
            ),
            /*textForUnknown=*/ `Failed to decompress ${update.cloudState.safeValue().data.fullPath} from data field`
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
        view.setEntryProgress(ids.syncerId, fileId, 0.5);
        if (dataDecompressed.err) {
            return dataDecompressed;
        }
        dataToWrite = Some(new Uint8Array(dataDecompressed.safeUnwrap()));
    }
    // Now check if the file was uploaded to cloud storage.
    const cloudStorageRef = update.cloudState.safeValue().data.fileStorageRef;
    if (cloudStorageRef.some) {
        const getDataResult = await DownloadFileFromStorage(cloudStorageRef.safeValue());
        view.setEntryProgress(ids.syncerId, fileId, 0.5);
        if (getDataResult.err) {
            return getDataResult;
        }
        dataToWrite = Some(new Uint8Array(getDataResult.safeUnwrap()));
    }

    if (dataToWrite.none) {
        return Err(UnknownError(`Unable to get data to write for "${fileId}`));
    }
    view.setEntryProgress(ids.syncerId, fileId, 0.5);

    const localDataType: LocalDataType = ConvertFilePathToLocalDataType(
        update.cloudState.safeValue().data.fullPath,
        syncConfig
    );
    const writeResult = await WriteFile(
        app,
        update.cloudState.safeValue().data.fullPath,
        dataToWrite.safeValue(),
        localDataType,
        {
            ctime: update.cloudState.safeValue().data.ctime,
            mtime: update.cloudState.safeValue().data.mtime
        }
    );
    view.setEntryProgress(ids.syncerId, fileId, 0.75);
    if (writeResult.err) {
        return writeResult;
    }

    return Ok();
}

/**
 * Creates the operations to update the local files with cloud data.
 * @param localUpdates the updates that have cloud -> local actions
 * @param app the obisdian app.
 * @param creds the user credentials.
 * @returns the array of operations taking place.
 */
export function CreateOperationsToUpdateLocal(
    db: Firestore,
    userId: string,
    ids: Identifiers,
    cloudUpdates: (CloudConvergenceUpdate | CloudDeleteLocalConvergenceUpdate)[],
    app: App,
    syncConfig: SyncerConfig
): Promise<StatusResult<StatusError>>[] {
    const ops = AsyncForEach(cloudUpdates, async (update): Promise<StatusResult<StatusError>> => {
        const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
        const fileId = update.cloudState.safeValue().data.fileId.safeValue();

        const initalFileName: Option<string> = update.localState.andThen<string>((localState) => {
            if (localState.data.fullPath !== update.cloudState.safeValue().data.fullPath) {
                return Some(localState.data.fullPath);
            }
            return None;
        });
        // Add the progress viewer entry.
        view.addEntry(
            ids.syncerId,
            fileId,
            initalFileName,
            update.cloudState.safeValue().data.fullPath,
            update.action
        );

        // Do the convergence operation.
        if (update.action === ConvergenceAction.USE_CLOUD) {
            const downloadResult = await DownloadCloudUpdate(
                db,
                userId,
                ids,
                app,
                syncConfig,
                update,
                view,
                fileId
            );
            if (downloadResult.err) {
                return downloadResult;
            }
        } else if (update.action === ConvergenceAction.USE_CLOUD_DELETE_LOCAL) {
            // For `USE_CLOUD_DELETE_LOCAL` update leave it to the delete left over file system.
            update.leftOverLocalFile = Some(update.cloudState.safeValue().data.fullPath);
            view.setEntryProgress(ids.syncerId, fileId, 0.5);
        }

        // Update local file if there is one.
        if (update.localState.some) {
            update.localState.safeValue().overwrite(update.cloudState.safeValue());
        }

        // Update progress view.
        view.setEntryProgress(ids.syncerId, fileId, 1);
        return Ok();
    });

    return ops;
}

/**
 * Cleans up the local left over files for download cloud files.
 * @param app obsidian app
 * @param updates convergence updates
 * @param localFileNodes the local file nodes
 * @returns result of operation
 */
export async function CleanUpLeftOverLocalFiles(
    app: App,
    syncConfig: SyncerConfig,
    updates: ConvergenceUpdate[],
    localFileNodes: FileMapOfNodes
): Promise<StatusResult<StatusError>> {
    for (const update of updates) {
        if (
            update.action !== ConvergenceAction.USE_CLOUD &&
            update.action !== ConvergenceAction.USE_CLOUD_DELETE_LOCAL
        ) {
            continue;
        }

        // Look for cloud updates that possible have a left over local file.
        const possibleLocalFile = update.leftOverLocalFile;
        if (possibleLocalFile.none) {
            continue;
        }

        // Check to make sure nothing else used that local file path.
        const realLocalFileResult = GetNonDeletedByFilePath(
            localFileNodes,
            possibleLocalFile.safeValue()
        );
        if (realLocalFileResult.err) {
            return realLocalFileResult;
        }

        // check if the option has a value.
        const fileOption = realLocalFileResult.safeUnwrap();
        if (fileOption.some) {
            // Another file is using the directory
            continue;
        }

        const deleteFileResult = await DeleteFile(
            app,
            possibleLocalFile.safeValue(),
            IsLocalFileRaw(possibleLocalFile.safeValue(), syncConfig)
                ? { type: "RAW" }
                : { type: "OBSIDIAN" }
        );
        if (deleteFileResult.err && deleteFileResult.val.errorCode !== ErrorCode.NOT_FOUND) {
            // We let the not found error move on as if the file is somehow missing we don't care.
            return deleteFileResult;
        }
    }

    return Ok();
}
