/**
 * Util functions to handle writing and reading from firebase cloud storage.
 */

import type { UserCredential } from "firebase/auth";
import type { UploadTask } from "firebase/storage";
import { getBytes, getStorage, ref, uploadBytesResumable } from "firebase/storage";
import type { App, TFile } from "obsidian";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { UnknownError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";

interface UploadFileToStorageResult {
    uploadTask: UploadTask;
    fullPath: string;
}

/** uploads a file to storage using a resumable upload task. */
export async function UploadFileToStorage(
    app: App,
    file: TFile,
    userCreds: UserCredential,
    fileId: string
): Promise<Result<UploadFileToStorageResult, StatusError>> {
    const storage = getStorage();
    const storageRef = ref(storage, `${userCreds.user.uid}/${fileId}`);
    const data = await WrapPromise(app.vault.readBinary(file));
    if (data.err) {
        return Err(
            UnknownError(`[UploadFileToStorage] Failed when reading binary "${file.path}".`)
        );
    }

    return Ok({
        uploadTask: uploadBytesResumable(storageRef, data.safeUnwrap()),
        fullPath: storageRef.fullPath
    });
}

/** Download the file from cloud storage as bytes. */
export async function DownloadFileFromStorage(
    fileStorageRef: string
): Promise<Result<ArrayBuffer, StatusError>> {
    const storage = getStorage();
    const storageRef = ref(storage, fileStorageRef);
    const byteDataResult = await WrapPromise(getBytes(storageRef));
    if (byteDataResult.err) {
        return byteDataResult.mapErr((err) =>
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            UnknownError(`[DownloadFileFromStorage] failed to get bytes. "${err}"`)
        );
    }

    return Ok(byteDataResult.safeUnwrap());
}
