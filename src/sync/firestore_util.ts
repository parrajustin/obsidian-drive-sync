import type { Firestore, Transaction } from "firebase/firestore";
import { Bytes, doc } from "firebase/firestore";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import type { UserCredential } from "firebase/auth";
import { Ok, type Result, type StatusResult } from "../lib/result";
import { StatusError } from "../lib/status_error";
import { ResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import { WrapToResult } from "../lib/wrap_to_result";
import { InjectMeta } from "../lib/inject_status_msg";
import { FIREBASE_NOTE_ID } from "../constants";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { LatestNotesSchema } from "../schema/notes/notes.schema";
import type { LocalCloudFileNode, LocalOnlyFileNode } from "../filesystem/file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { SchemaWithId } from "./firebase_cache";

export class FirestoreUtil {
    /** Uploads a note with data in cloudstorage. */
    @Span()
    @ResultSpanError
    public static uploadCloudNodeToFirestore(
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        transaction: Transaction,
        user: UserCredential,
        fileId: string,
        fileNode: LocalOnlyFileNode | LocalCloudFileNode,
        fileStorageRef: string
    ): Result<SchemaWithId<LatestNotesSchema>, StatusError> {
        const entry = `${GetFileCollectionPath(user)}/${fileId}`;
        const uploadData: LatestNotesSchema = {
            path: fileNode.fileData.fullPath,
            cTime: fileNode.fileData.cTime,
            mTime: fileNode.fileData.mTime,
            size: fileNode.fileData.size,
            baseName: fileNode.fileData.baseName,
            ext: fileNode.fileData.extension,
            userId: user.user.uid,
            deleted: false,
            fileHash: fileNode.fileData.fileHash,
            vaultName: syncerConfig.vaultName,
            deviceId: clientId,
            syncerConfigId: syncerConfig.syncerId,
            entryTime: fileNode.localTime,
            type: "Ref",
            data: null,
            fileStorageRef,
            version: 0
        };
        const updateResult = WrapToResult(
            () => transaction.set(doc(db, entry), uploadData),
            /*textForUnknown=*/ `Failed to execute update transaction`
        );
        if (updateResult.err) {
            updateResult.val.with(InjectMeta({ [FIREBASE_NOTE_ID]: fileId }));
            setAttributeOnActiveSpan(FIREBASE_NOTE_ID, fileId);
        }

        return Ok({ id: entry, data: uploadData });
    }

    /** Update a note where data is embeded. */
    @Span()
    @ResultSpanError
    public static uploadDataToFirestore(
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        transaction: Transaction,
        user: UserCredential,
        fileId: string,
        fileNode: LocalOnlyFileNode | LocalCloudFileNode,
        data: Uint8Array
    ): Result<SchemaWithId<LatestNotesSchema>, StatusError> {
        const entry = `${GetFileCollectionPath(user)}/${fileId}`;
        const uploadData: LatestNotesSchema = {
            path: fileNode.fileData.fullPath,
            cTime: fileNode.fileData.cTime,
            mTime: fileNode.fileData.mTime,
            size: fileNode.fileData.size,
            baseName: fileNode.fileData.baseName,
            ext: fileNode.fileData.extension,
            userId: user.user.uid,
            deleted: false,
            fileHash: fileNode.fileData.fileHash,
            vaultName: syncerConfig.vaultName,
            deviceId: clientId,
            syncerConfigId: syncerConfig.syncerId,
            entryTime: fileNode.localTime,
            type: "Raw",
            data: Bytes.fromUint8Array(data),
            fileStorageRef: null,
            version: 0
        };
        const updateResult = WrapToResult(
            () => transaction.set(doc(db, entry), uploadData),
            /*textForUnknown=*/ `Failed to execute update transaction`
        );
        if (updateResult.err) {
            updateResult.val.with(InjectMeta({ [FIREBASE_NOTE_ID]: fileId }));
            setAttributeOnActiveSpan(FIREBASE_NOTE_ID, fileId);
        }

        return Ok({ id: entry, data: uploadData });
    }

    /** Update firestore to mark a file as deleted. */
    @Span()
    @ResultSpanError
    public static markFirestoreAsDeleted(
        db: Firestore,
        transaction: Transaction,
        user: UserCredential,
        fileId: string,
        newUpdateTime: number
    ): StatusResult<StatusError> {
        const entry = `${GetFileCollectionPath(user)}/${fileId}`;

        const updateData: Pick<LatestNotesSchema, "deleted" | "entryTime"> = {
            deleted: true,
            entryTime: newUpdateTime
        };
        const updateResult = WrapToResult(
            () => transaction.update(doc(db, entry), updateData),
            /*textForUnknown=*/ `Failed to execute update transaction`
        );
        if (updateResult.err) {
            updateResult.val.with(InjectMeta({ [FIREBASE_NOTE_ID]: fileId }));
            setAttributeOnActiveSpan(FIREBASE_NOTE_ID, fileId);
        }

        return updateResult;
    }
}
