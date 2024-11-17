/**
 * Util functions to handle writing and reading from firebase cloud storage.
 */

import type { UserCredential } from "firebase/auth";
import { getBytes, getStorage, ref, uploadBytes } from "firebase/storage";
import type { App } from "obsidian";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { ReadFile } from "./file_util";
import type { SyncerConfig } from "../settings/syncer_config_data";
import type { FilePathType, LocalNode } from "./file_node";

/** uploads a file to storage using a resumable upload task. Returns storage ref path. */
export async function UploadFileToStorage(
    app: App,
    syncConfig: SyncerConfig,
    filePath: FilePathType,
    userCreds: UserCredential,
    fileId: string,
    node: LocalNode
): Promise<Result<string, StatusError>> {
    const storage = getStorage();
    const outputPath = `${userCreds.user.uid}/${syncConfig.vaultName}/${fileId}`;
    const storageRef = ref(storage, outputPath);
    const readResult = await ReadFile(app, filePath, node);
    if (readResult.err) {
        return readResult;
    }

    const uploadBytesResult = await WrapPromise(
        uploadBytes(storageRef, readResult.safeUnwrap()),
        /*textForUnknown=*/ `Failed to upload cloud storage bytes for ${outputPath}`
    );
    if (uploadBytesResult.err) {
        return uploadBytesResult;
    }

    return Ok(storageRef.fullPath);
}

/** Download the file from cloud storage as bytes. */
export async function DownloadFileFromStorage(
    fileStorageRef: string
): Promise<Result<ArrayBuffer, StatusError>> {
    const storage = getStorage();
    const storageRef = ref(storage, fileStorageRef);
    const byteDataResult = await WrapPromise(
        getBytes(storageRef),
        /*textForUnknown=*/ `Failed to download cloud storage bytes for ${fileStorageRef}`
    );
    if (byteDataResult.err) {
        return byteDataResult;
    }

    return Ok(byteDataResult.safeUnwrap());
}
