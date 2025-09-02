/**
 * Util functions to handle writing and reading from firebase cloud storage.
 */

import type { UserCredential } from "firebase/auth";
import { getBytes, getStorage, ref, uploadBytes } from "firebase/storage";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { CreateLogger } from "../logging/logger";
import { InjectStatusMsg } from "../lib/inject_status_msg";
import { Span } from "../logging/tracing/span.decorator";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import type { FilePathType } from "../filesystem/file_node";
import { CLOUDSTORAGE_FILE_ID, FileConst, SYNCER_ID_SPAN_ATTR } from "../constants";

const LOGGER = CreateLogger("cloud-storage-util");

export class CloudStorageUtil {
    /** uploads a file to storage using a resumable upload task. Returns storage ref path. */
    @Span()
    @PromiseResultSpanError
    public static async uploadFileToStorage(
        syncConfig: LatestSyncConfigVersion,
        filePath: FilePathType,
        userCreds: UserCredential,
        cloudFileId: string,
        data: ArrayBuffer
    ): Promise<Result<string, StatusError>> {
        const storage = getStorage();
        const outputPath = `${userCreds.user.uid}/${syncConfig.vaultName}/${cloudFileId}`;
        const storageRef = ref(storage, outputPath);

        const uploadBytesResult = await WrapPromise(
            uploadBytes(storageRef, data, { customMetadata: { [FileConst.FILE_PATH]: filePath } }),
            /*textForUnknown=*/ `Failed to upload cloud storage bytes for ${filePath}`
        );
        if (uploadBytesResult.err) {
            uploadBytesResult.val.with(
                InjectStatusMsg("Failed to upload to storage.", {
                    vault: syncConfig.vaultName,
                    [SYNCER_ID_SPAN_ATTR]: syncConfig.syncerId,
                    [FileConst.FILE_PATH]: filePath,
                    [CLOUDSTORAGE_FILE_ID]: storageRef.fullPath
                })
            );
            return uploadBytesResult;
        }
        LOGGER.debug("Uploaded file to storage.", {
            vault: syncConfig.vaultName,
            [SYNCER_ID_SPAN_ATTR]: syncConfig.syncerId,
            [CLOUDSTORAGE_FILE_ID]: storageRef.fullPath,
            [FileConst.FILE_PATH]: filePath
        });

        return Ok(storageRef.fullPath);
    }

    /** Download the file from cloud storage as bytes. */
    @Span()
    @PromiseResultSpanError
    public static async downloadFileFromStorage(
        fileStorageRef: string
    ): Promise<Result<ArrayBuffer, StatusError>> {
        const storage = getStorage();
        const storageRef = ref(storage, fileStorageRef);
        const byteDataResult = await WrapPromise(
            getBytes(storageRef),
            /*textForUnknown=*/ `Failed to download cloud storage bytes for ${fileStorageRef}`
        );
        if (byteDataResult.err) {
            byteDataResult.val.with(
                InjectStatusMsg("Failed to upload to storage.", {
                    [CLOUDSTORAGE_FILE_ID]: fileStorageRef
                })
            );
            return byteDataResult;
        }
        LOGGER.debug("Success downloading from stroage.", {
            [CLOUDSTORAGE_FILE_ID]: fileStorageRef
        });

        return Ok(byteDataResult.safeUnwrap());
    }
}
