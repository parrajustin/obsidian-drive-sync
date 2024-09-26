/**
 * Contains the logic to actually resolve the convergence updates. Contains the logic to upload to
 * firestore or cloud storgae and keeping the progress viewer up to date.
 */

import { compress, decompress } from "brotli-compress";
import type { Firestore } from "firebase/firestore";
import { Bytes, doc, setDoc } from "firebase/firestore";
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
import { AsyncForEach, ConvertToUnknownError } from "../util";
import { DownloadFileFromStorage, UploadFileToStorage } from "./cloud_storage_util";
import type { CloudConvergenceUpdate, ConvergenceUpdate } from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import { WriteUidToFile } from "./file_id_util";
import type { FileDbModel } from "./firestore_schema";
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
import type { LocalDataType } from "./file_node";

const ONE_HUNDRED_KB_IN_BYTES = 1000 * 100;

/** Upload the file to firestore. */
async function UploadFileToFirestore(
    db: Firestore,
    node: FileDbModel,
    fileId: string
): Promise<StatusResult<StatusError>> {
    const documentRef = doc(db, `file/${fileId}`);

    const setResult = (await WrapPromise(setDoc(documentRef, node))).mapErr(
        ConvertToUnknownError(`Unknown setDoc Error`)
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
    db: Firestore,
    localUpdates: ConvergenceUpdate[],
    app: App,
    syncConfig: SyncerConfig,
    creds: UserCredential
): Promise<StatusResult<StatusError>>[] {
    const filteredUpdates = localUpdates.filter(
        (v) =>
            v.action === ConvergenceAction.USE_LOCAL ||
            v.action === ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID
    );
    const localOperations = AsyncForEach(
        filteredUpdates,
        async (update): Promise<StatusResult<StatusError>> => {
            const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
            // Get the file id.
            const fileId = update.cloudState.some
                ? update.cloudState.safeValue().fileId.safeValue()
                : update.localState.safeValue().fileId.valueOr(uuidv7());
            const localState = update.localState.safeValue();
            const tooBigForFirestore = localState.size > ONE_HUNDRED_KB_IN_BYTES;

            // For times we have to replace id do that first.
            if (update.action === ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID) {
                const file = app.vault.getAbstractFileByPath(localState.fullPath);
                if (file === null || !(file instanceof TFile)) {
                    return Err(
                        InternalError(
                            `USE_LOCAL_BUT_REPLACE_ID expect "${localState.fullPath}" to be obsidian file`
                        )
                    );
                }
                const writeUid = await WriteUidToFile(app, file, fileId, {
                    mtime: update.cloudState.safeValue().mtime
                });
                if (writeUid.err) {
                    return writeUid;
                }
            }

            const node: FileDbModel = {
                path: localState.fullPath,
                cTime: localState.ctime,
                mTime: localState.mtime,
                size: localState.size,
                baseName: localState.baseName,
                ext: localState.extension,
                userId: creds.user.uid,
                deleted: false
            };

            const initalFileName: Option<string> = update.cloudState.andThen<string>(
                (cloudStateNode) => {
                    if (cloudStateNode.fullPath !== localState.fullPath) {
                        return Some(cloudStateNode.fullPath);
                    }
                    return None;
                }
            );
            view.addEntry(fileId, initalFileName, localState.fullPath, update.action);
            view.setEntryProgress(fileId, 0.1);

            // Handle how the data is stored.
            if (!tooBigForFirestore) {
                // When the data is small enough compress it and upload to
                const readDataResult = await ReadFile(
                    app,
                    localState.fullPath,
                    ConvertFileNodeToLocalDataType(update.localState.safeValue(), syncConfig)
                );
                view.setEntryProgress(fileId, 0.2);
                if (readDataResult.err) {
                    return readDataResult.mapErr(
                        ConvertToUnknownError(`Failed to read binary string`)
                    );
                }
                const buffer = Buffer.from(readDataResult.safeUnwrap());
                const dataCompresssed = await WrapPromise(compress(buffer));
                view.setEntryProgress(fileId, 0.4);
                if (dataCompresssed.err) {
                    return dataCompresssed.mapErr(ConvertToUnknownError("Failed to compress data"));
                }

                node.data = Bytes.fromUint8Array(dataCompresssed.safeUnwrap());
            } else {
                const uploadCloudStoreResult = await UploadFileToStorage(
                    app,
                    syncConfig,
                    localState.fullPath,
                    creds,
                    fileId
                );
                view.setEntryProgress(fileId, 0.6);
                if (uploadCloudStoreResult.err) {
                    return uploadCloudStoreResult;
                }
            }

            // Upload the data to firestore.
            const uploadCloudState = await UploadFileToFirestore(db, node, fileId);
            view.setEntryProgress(fileId, 0.7);
            if (uploadCloudState.err) {
                return uploadCloudState;
            }

            // Update the local file node.
            update.localState.safeValue().fileId = Some(fileId);
            update.localState.safeValue().userId = Some(creds.user.uid);

            view.setEntryProgress(fileId, 1.0);
            return Ok();
        }
    );
    return localOperations;
}

/** Does the update by downloading the cloud file to local files. */
async function DownloadCloudUpdate(
    app: App,
    syncConfig: SyncerConfig,
    update: CloudConvergenceUpdate,
    view: SyncProgressView,
    fileId: string
): Promise<StatusResult<StatusError>> {
    let dataToWrite: Option<Uint8Array> = None;

    // First check the easy path. The file was small enough to fit into firestore.
    const textData = update.cloudState.safeValue().data;
    if (textData !== undefined) {
        const dataCompresssed = await WrapPromise(decompress(textData));
        view.setEntryProgress(fileId, 0.5);
        if (dataCompresssed.err) {
            return dataCompresssed.mapErr(ConvertToUnknownError(`Failed to compress data`));
        }
        dataToWrite = Some(dataCompresssed.safeUnwrap());
    }
    // Now check if the file was uploaded to cloud storage.
    const cloudStorageRef = update.cloudState.safeValue().fileStorageRef;
    if (cloudStorageRef !== undefined) {
        const getDataResult = await DownloadFileFromStorage(cloudStorageRef);
        view.setEntryProgress(fileId, 0.5);
        if (getDataResult.err) {
            return getDataResult;
        }
        dataToWrite = Some(new Uint8Array(getDataResult.safeUnwrap()));
    }

    if (dataToWrite.none) {
        return Err(UnknownError(`Unable to get data to write for "${fileId}`));
    }
    view.setEntryProgress(fileId, 0.5);

    const localDataType: LocalDataType = ConvertFilePathToLocalDataType(
        update.cloudState.safeValue().fullPath,
        syncConfig
    );
    const writeResult = await WriteFile(
        app,
        update.cloudState.safeValue().fullPath,
        dataToWrite.safeValue(),
        localDataType,
        {
            ctime: update.cloudState.safeValue().ctime,
            mtime: update.cloudState.safeValue().mtime
        }
    );
    view.setEntryProgress(fileId, 0.75);
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
    cloudUpdates: ConvergenceUpdate[],
    app: App,
    syncConfig: SyncerConfig
): Promise<StatusResult<StatusError>>[] {
    const filteredUpdates = cloudUpdates.filter(
        (v) =>
            v.action === ConvergenceAction.USE_CLOUD ||
            v.action === ConvergenceAction.USE_CLOUD_DELETE_LOCAL
    );

    const ops = AsyncForEach(
        filteredUpdates,
        async (update): Promise<StatusResult<StatusError>> => {
            const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
            const fileId = update.cloudState.safeValue().fileId.safeValue();

            const initalFileName: Option<string> = update.localState.andThen<string>(
                (localState) => {
                    if (localState.fullPath !== update.cloudState.safeValue().fullPath) {
                        return Some(localState.fullPath);
                    }
                    return None;
                }
            );
            // Add the progress viewer entry.
            view.addEntry(
                fileId,
                initalFileName,
                update.cloudState.safeValue().fullPath,
                update.action
            );

            // Do the convergence operation.
            if (update.action === ConvergenceAction.USE_CLOUD) {
                const downloadResult = await DownloadCloudUpdate(
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
                update.leftOverLocalFile = Some(update.cloudState.safeValue().fullPath);
                view.setEntryProgress(fileId, 0.5);
            }

            // Update local file if there is one.
            if (update.localState.some) {
                update.localState.safeValue().overwrite(update.cloudState.safeValue());
            }

            // Update progress view.
            view.setEntryProgress(fileId, 1);
            return Ok();
        }
    );

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
