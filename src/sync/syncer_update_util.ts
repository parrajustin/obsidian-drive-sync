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
import { InternalError, NotFoundError, UnknownError } from "../lib/status_error";
import { uuidv7 } from "../lib/uuid";
import { WrapPromise } from "../lib/wrap_promise";
import { AsyncForEach, ConvertToUnknownError } from "../util";
import { DownloadFileFromStorage, UploadFileToStorage } from "./cloud_storage_util";
import type { ConvergenceUpdate } from "./converge_file_models";
import { ConvergenceAction } from "./converge_file_models";
import { WriteUidToFile } from "./file_id_util";
import type { FileDbModel } from "./firestore_schema";
import type { UserCredential } from "firebase/auth";
import { GetOrCreateSyncProgressView } from "../progressView";

const ONE_HUNDRED_KB_IN_BYTES = 1000 * 100;

/** Upload the file to firestore. */
async function UploadFileToFirestore(
    db: Firestore,
    node: FileDbModel,
    fileId: string
): Promise<StatusResult<StatusError>> {
    const documentRef = doc(db, `file/${fileId}`);

    const setResult = (await WrapPromise(setDoc(documentRef, node))).mapErr((err) => {
        console.error("setDoc error", err);
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        return UnknownError(`Unknown setDoc Error "${err}".`);
    });
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
            const file = app.vault.getAbstractFileByPath(update.localState.safeValue().fullPath);
            if (file === null) {
                return Err(
                    NotFoundError(
                        `Found no abstract file while trying to upload "${update.localState.safeValue().fullPath}".`
                    )
                );
            }
            if (!(file instanceof TFile)) {
                return Err(
                    NotFoundError(
                        `Found no local file while trying to upload "${update.localState.safeValue().fullPath}".`
                    )
                );
            }
            // Get the file id.
            const fileId = update.cloudState.some
                ? update.cloudState.safeValue().fileId.safeValue()
                : update.localState.safeValue().fileId.valueOr(uuidv7());
            const tooBigForFirestore = file.stat.size > ONE_HUNDRED_KB_IN_BYTES;

            // For times we have to replace id do that first.
            if (update.action === ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID) {
                const writeUid = await WriteUidToFile(app, file, fileId, {
                    mtime: update.cloudState.safeValue().mtime
                });
                if (writeUid.err) {
                    return writeUid;
                }
            }

            const node: FileDbModel = {
                path: file.path,
                cTime: file.stat.ctime,
                mTime: file.stat.mtime,
                size: file.stat.size,
                baseName: file.basename,
                ext: file.extension,
                userId: creds.user.uid,
                deleted: false
            };

            const initalFileName: Option<string> = update.cloudState.andThen<string>(
                (cloudStateNode) => {
                    if (cloudStateNode.fullPath !== file.path) {
                        return Some(cloudStateNode.fullPath);
                    }
                    return None;
                }
            );
            view.addEntry(fileId, initalFileName, file.path, update.action);
            view.setEntryProgress(fileId, 0.1);

            // Handle how the data is stored.
            if (!tooBigForFirestore) {
                // When the data is small enough compress it and upload to
                const readDataResult = await WrapPromise(app.vault.read(file));
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
                const uploadCloudStoreResult = await UploadFileToStorage(app, file, creds, fileId);
                view.setEntryProgress(fileId, 0.6);
                if (uploadCloudStoreResult.err) {
                    return uploadCloudStoreResult;
                }
                update.fileUploadTask = uploadCloudStoreResult.safeUnwrap().uploadTask;
                node.fileStorageRef = uploadCloudStoreResult.safeUnwrap().fullPath;
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

            // If we are uploading to cloud storage wait till that is done.
            if (update.fileUploadTask !== undefined) {
                await update.fileUploadTask;
            }

            view.setEntryProgress(fileId, 1.0);
            return Ok();
        }
    );
    return localOperations;
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
    app: App
): Promise<StatusResult<StatusError>>[] {
    const filteredUpdates = cloudUpdates.filter((v) => v.action === ConvergenceAction.USE_CLOUD);

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

            const file = app.vault.getAbstractFileByPath(update.cloudState.safeValue().fullPath);
            if (file === null) {
                const createResult = await WrapPromise(
                    app.vault.createBinary(
                        update.cloudState.safeValue().fullPath,
                        dataToWrite.safeValue()
                    )
                );
                view.setEntryProgress(fileId, 0.75);
                if (createResult.err) {
                    return createResult.mapErr(
                        ConvertToUnknownError(
                            `Failed to create file for "${update.cloudState.safeValue().fullPath}"`
                        )
                    );
                }
            } else if (file instanceof TFile) {
                const modifyResult = await WrapPromise(
                    app.vault.modifyBinary(file, dataToWrite.safeValue())
                );
                view.setEntryProgress(fileId, 0.75);
                if (modifyResult.err) {
                    return modifyResult.mapErr(
                        ConvertToUnknownError(
                            `Failed to modify file for "${update.cloudState.safeValue().fullPath}"`
                        )
                    );
                }
            } else {
                return Err(
                    InternalError(
                        `File "${update.cloudState.safeValue().fullPath}" leads to a folder when file is expected!`
                    )
                );
            }
            view.setEntryProgress(fileId, 1);
            return Ok();
        }
    );

    return ops;
}
