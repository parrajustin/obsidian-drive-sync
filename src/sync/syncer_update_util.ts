/**
 * Contains the logic to actually resolve the convergence updates. Contains the logic to upload to
 * firestore or cloud storgae and keeping the progress viewer up to date.
 */

import type { Firestore, Transaction } from "firebase/firestore";
import { doc, getDoc, runTransaction } from "firebase/firestore";
import type { App } from "obsidian";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { Result, StatusResult } from "../lib/result";
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
    LocalDeleteCloudConvergenceUpdate
} from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import type { FileDbModel } from "./firestore_schema";
import { GetFileSchemaConverter } from "./firestore_schema";
import type { UserCredential } from "firebase/auth";
import type { SyncProgressView } from "../progressView";
import { GetOrCreateSyncProgressView } from "../progressView";
import { GetLocalFileNode } from "./file_node_util";
import { DeleteFile, ReadFile, WriteFile } from "./file_util";
import type { SyncerConfig } from "../settings/syncer_config_data";
import type {
    CloudNode,
    FilePathType,
    FirestoreNodes,
    LocalNode,
    UploadNodeMetadata
} from "./file_node";
import { LocalNodeObsidian, LocalNodeRaw, UploadFileNode } from "./file_node";
import { CloudNodeFileRef, CloudNodeRaw } from "./file_node";
import { MarkFirestoreAsDeleted, UploadFileToFirestore } from "./firestore_util";
import { GetFileCollectionPath } from "../firestore/file_db_util";

const ONE_HUNDRED_KB_IN_BYTES = 1000 * 100;

export interface Identifiers {
    /** The id of the syncer. */
    syncerId: string;
    /** The id of the cycle. */
    cycleId: string;
    /** The id of the client. */
    clientId: string;
    /** The name of the vault. */
    vaultName: string;
}

export interface ExecuteUpdateReturn {
    /** Local node updates keyed by the file ID. */
    localNode: Map<string, Option<LocalNode>>;
}

/**
 * Creates the operations to update the cloud with local data.
 * @param localUpdates the updates that have local -> cloud actions
 * @param app the obisdian app.
 * @param creds the user credentials.
 * @returns the array of operations taking place.
 */
export function CreateOperationsToUpdateCloud(
    ids: Identifiers,
    db: Firestore,
    localUpdates: (LocalConvergenceUpdate | LocalDeleteCloudConvergenceUpdate)[],
    app: App,
    syncConfig: SyncerConfig,
    creds: UserCredential
): Promise<StatusResult<StatusError>>[] {
    const localOperations = AsyncForEach(
        localUpdates,
        async (update): Promise<StatusResult<StatusError>> => {
            const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
            // Get the file id.
            const fileId = update.localState
                .safeValue()
                .metadata.fileId.valueOr(
                    update.cloudState.some
                        ? update.cloudState.safeValue().metadata.fileId.valueOr(uuidv7())
                        : uuidv7()
                );
            const filePath = update.localState.safeValue().data.fullPath;
            const localState = update.localState.safeValue();
            const tooBigForFirestore = localState.data.size > ONE_HUNDRED_KB_IN_BYTES;
            switch (update.action) {
                case ConvergenceAction.USE_LOCAL_DELETE_CLOUD: {
                    view.addEntry(ids.syncerId, filePath, update.action);
                    view.setEntryProgress(ids.syncerId, filePath, 0.1);
                    const transactionResult = await WrapPromise(
                        runTransaction(
                            db,
                            async (transaction: Transaction): Promise<void> =>
                                MarkFirestoreAsDeleted(db, transaction, creds, fileId)
                        ),
                        /*textForUnkown=*/ `Failed mark cloud deleted transaction for "${filePath}"`
                    );
                    view.setEntryProgress(ids.syncerId, filePath, 1.0);
                    return transactionResult;
                }
                case ConvergenceAction.USE_LOCAL: {
                    // Metadata for upload file.
                    let uploadNodeMetadata: UploadNodeMetadata;
                    view.addEntry(ids.syncerId, filePath, update.action);
                    view.setEntryProgress(ids.syncerId, filePath, 0.1);

                    // Handle how the data is stored.
                    if (!tooBigForFirestore) {
                        // When the data is small enough compress it and upload to
                        const readDataResult = await ReadFile(
                            app,
                            localState.data.fullPath,
                            update.localState.safeValue()
                        );
                        view.setEntryProgress(ids.syncerId, filePath, 0.2);
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
                            /*textForUnknown=*/ `Failed to create stream and compress ${filePath}`
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
                        view.setEntryProgress(ids.syncerId, filePath, 0.4);
                        if (dataCompresssed.err) {
                            return dataCompresssed;
                        }

                        uploadNodeMetadata = {
                            type: "RAW_DATA",
                            data: new Uint8Array(dataCompresssed.safeUnwrap())
                        };
                    } else {
                        const uploadCloudStoreResult = await UploadFileToStorage(
                            app,
                            syncConfig,
                            filePath,
                            creds,
                            /*fileId=*/ uuidv7(), // Use random file id for cloud storage.
                            update.localState.safeValue()
                        );
                        view.setEntryProgress(ids.syncerId, filePath, 0.6);
                        if (uploadCloudStoreResult.err) {
                            return uploadCloudStoreResult;
                        }
                        uploadNodeMetadata = {
                            type: "FILE_REF",
                            fileStorageRef: uploadCloudStoreResult.safeUnwrap()
                        };
                    }

                    // Upload the data to firestore.
                    const uploadNode = new UploadFileNode(
                        update.localState.safeValue().data,
                        {
                            deviceId: Some(ids.clientId),
                            fileId: Some(fileId),
                            firestoreTime: Some(
                                update.localState
                                    .safeValue()
                                    .metadata.firestoreTime.valueOr(Date.now())
                            ),
                            syncerConfigId: ids.syncerId,
                            userId: Some(creds.user.uid),
                            vaultName: ids.vaultName
                        },
                        uploadNodeMetadata
                    );
                    const transactionResult = await WrapPromise(
                        runTransaction(db, async (transaction: Transaction): Promise<void> => {
                            await UploadFileToFirestore(
                                db,
                                transaction,
                                uploadNode,
                                update.cloudState,
                                creds,
                                fileId
                            );
                            return Promise.resolve();
                        }),
                        /*textForUnkown=*/ `Failed using local transaction for "${filePath}"`
                    );
                    view.setEntryProgress(ids.syncerId, filePath, 0.7);
                    if (transactionResult.err) {
                        return transactionResult;
                    }

                    // Update the local file node.
                    switch (update.localState.safeValue().type) {
                        case "LOCAL_RAW": {
                            update.newLocalFile = new LocalNodeRaw(
                                uploadNode.data,
                                uploadNode.metadata
                            );
                            break;
                        }
                        case "LOCAL_OBSIDIAN_FILE": {
                            update.newLocalFile = new LocalNodeObsidian(
                                uploadNode.data,
                                uploadNode.metadata
                            );
                            break;
                        }
                    }

                    view.setEntryProgress(ids.syncerId, filePath, 1.0);
                    return Ok();
                }
            }
        }
    );
    return localOperations;
}

/** Does the update by downloading the cloud file to local files. */
async function DownloadCloudUpdate(
    db: Firestore,
    ids: Identifiers,
    app: App,
    syncConfig: SyncerConfig,
    update: CloudConvergenceUpdate,
    view: SyncProgressView,
    filePath: FilePathType,
    creds: UserCredential
): Promise<Result<LocalNode, StatusError>> {
    let dataToWrite: Option<Uint8Array> = None;

    let cloudNode = update.cloudState.safeValue();
    if (cloudNode instanceof CloudNodeRaw && cloudNode.extra.isFromCloudCache) {
        // The cloud state if from the cloud cache and has no file storage so we need to fetch the
        // data.
        const documentRef = doc(
            db,
            `${GetFileCollectionPath(creds)}/${cloudNode.metadata.fileId.safeValue()}`
        ).withConverter<FirestoreNodes, FileDbModel>(GetFileSchemaConverter());

        const fetchResult = await WrapPromise(
            getDoc(documentRef),
            /*textForUnknown=*/ `[DownloadCloudUpdate] Failed to get cached doc data "${filePath}"`
        );
        if (fetchResult.err) {
            return fetchResult;
        }
        cloudNode = fetchResult.safeUnwrap().data() as CloudNode;
    }

    if (cloudNode instanceof CloudNodeRaw) {
        if (cloudNode.extra.isFromCloudCache) {
            return Err(
                UnknownError(`Somehow reached [DownloadCloudUpdate] impossible cache error.`)
            );
        }
        const cloudNodeData = cloudNode.extra.data;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (cloudNodeData.none) {
            return Err(UnknownError(`[DownloadCloudUpdate] Somehow "${filePath}" empty data.`));
        }
        // Create the read stream and decompress the data.
        const compressedReadableStream = await WrapPromise(
            Promise.resolve(
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(cloudNodeData.safeValue());
                        controller.close();
                    }
                }).pipeThrough(new DecompressionStream("gzip"))
            ),
            /*textForUnknown=*/ `Failed to decompress ${filePath} from data field`
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
        view.setEntryProgress(ids.syncerId, filePath, 0.5);
        if (dataDecompressed.err) {
            return dataDecompressed;
        }
        dataToWrite = Some(new Uint8Array(dataDecompressed.safeUnwrap()));
    }
    // Now check if the file was uploaded to cloud storage.
    if (cloudNode instanceof CloudNodeFileRef) {
        const getDataResult = await DownloadFileFromStorage(cloudNode.extra.fileStorageRef);
        view.setEntryProgress(ids.syncerId, filePath, 0.5);
        if (getDataResult.err) {
            return getDataResult;
        }
        dataToWrite = Some(new Uint8Array(getDataResult.safeUnwrap()));
    }

    if (dataToWrite.none) {
        return Err(UnknownError(`Unable to get data to write for "${filePath}`));
    }
    view.setEntryProgress(ids.syncerId, filePath, 0.5);

    const writeResult = await WriteFile(app, filePath, dataToWrite.safeValue(), syncConfig, {
        ctime: update.cloudState.safeValue().data.cTime,
        mtime: update.cloudState.safeValue().data.mTime
    });
    view.setEntryProgress(ids.syncerId, filePath, 0.75);
    if (writeResult.err) {
        return writeResult;
    }

    const readFile = await GetLocalFileNode(app, syncConfig, filePath);
    if (readFile.err) {
        return readFile;
    }
    const optFile = readFile.safeUnwrap();
    if (optFile.none) {
        return Err(InternalError(`Couldn't find the new downloaded file node for "${filePath}".`));
    }
    view.setEntryProgress(ids.syncerId, filePath, 0.8);

    // Set the metadata for the file.
    return Ok(optFile.safeValue().overwriteMetadataWithCloudNode(cloudNode));
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
    ids: Identifiers,
    cloudUpdates: (CloudConvergenceUpdate | CloudDeleteLocalConvergenceUpdate)[],
    app: App,
    syncConfig: SyncerConfig,
    creds: UserCredential
): Promise<StatusResult<StatusError>>[] {
    const ops = AsyncForEach(cloudUpdates, async (update): Promise<StatusResult<StatusError>> => {
        const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
        const filePath = update.cloudState.safeValue().data.fullPath;
        // Add the progress viewer entry.
        view.addEntry(ids.syncerId, filePath, update.action);

        // Do the convergence operation.
        switch (update.action) {
            case ConvergenceAction.USE_CLOUD: {
                const downloadResult = await DownloadCloudUpdate(
                    db,
                    ids,
                    app,
                    syncConfig,
                    update,
                    view,
                    filePath,
                    creds
                );
                if (downloadResult.err) {
                    return downloadResult;
                }
                // Set the side effect to update the new local file.
                update.newLocalFile = downloadResult.safeUnwrap();
                break;
            }
            case ConvergenceAction.USE_CLOUD_DELETE_LOCAL: {
                // For `USE_CLOUD_DELETE_LOCAL` update leave it to the delete left over file system.
                update.leftOverLocalFile = Some(update.localState.safeValue().data.fullPath);
                view.setEntryProgress(ids.syncerId, filePath, 0.5);
                update.newLocalFile = update.localState
                    .safeValue()
                    .cloneWithChange({ data: { deleted: true } });
            }
        }

        // Update progress view.
        view.setEntryProgress(ids.syncerId, filePath, 1);
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
    updates: ConvergenceUpdate[]
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
        console.log("need to clean up", possibleLocalFile);

        const deleteFileResult = await DeleteFile(
            app,
            syncConfig,
            possibleLocalFile.safeValue() as FilePathType
        );
        if (deleteFileResult.err && deleteFileResult.val.errorCode !== ErrorCode.NOT_FOUND) {
            // We let the not found error move on as if the file is somehow missing we don't care.
            return deleteFileResult;
        }
    }

    return Ok();
}
