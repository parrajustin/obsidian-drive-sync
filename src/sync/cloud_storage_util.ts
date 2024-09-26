/**
 * Util functions to handle writing and reading from firebase cloud storage.
 */

import type { UserCredential } from "firebase/auth";
import { getBytes, getStorage, ref, uploadBytes } from "firebase/storage";
import type { App } from "obsidian";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { UnknownError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { ReadFile } from "./file_util";
import { ConvertToUnknownError } from "../util";
import { ConvertFilePathToLocalDataType } from "./query_util";
import type { SyncerConfig } from "./syncer";

/** uploads a file to storage using a resumable upload task. Returns storage ref path. */
export async function UploadFileToStorage(
    app: App,
    syncConfig: SyncerConfig,
    filePath: string,
    userCreds: UserCredential,
    fileId: string
): Promise<Result<string, StatusError>> {
    const storage = getStorage();
    const storageRef = ref(storage, `${userCreds.user.uid}/${fileId}`);
    const readResult = await ReadFile(
        app,
        filePath,
        ConvertFilePathToLocalDataType(filePath, syncConfig)
    );
    if (readResult.err) {
        return readResult;
    }

    const uploadBytesResult = await WrapPromise(uploadBytes(storageRef, readResult.safeUnwrap()));
    if (uploadBytesResult.err) {
        return uploadBytesResult.mapErr(ConvertToUnknownError("Failed to upload bytes"));
    }

    return Ok(storageRef.fullPath);
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
