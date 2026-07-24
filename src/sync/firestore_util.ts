import type { Firestore } from "firebase/firestore";
import { Bytes, doc, setDoc, updateDoc } from "firebase/firestore";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import type { UserCredential } from "firebase/auth";
import { Ok, type Result, type StatusResult } from "standard-ts-lib/src/result";
import { StatusError } from "standard-ts-lib/src/status_error";
import { PromiseResultSpanError } from "standard-obsidian-lib/src/decorators/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import { WrapToResult } from "standard-ts-lib/src/wrap_to_result";
import { WrapPromise } from "standard-ts-lib/src/wrap_promise";
import { InjectMeta } from "standard-ts-lib/src/status_util/inject_status_msg";
import { FIREBASE_NOTE_ID } from "../constants";
import { setAttributeOnActiveSpan } from "../logging/tracing/set-attributes-on-active-span";
import { LatestNotesSchema } from "../schema/notes/notes.schema";
import type { LocalCloudFileNode, LocalOnlyFileNode } from "../filesystem/file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { SchemaWithId } from "./firebase_cache";

export class FirestoreUtil {
    /**
     * Runs a firestore write against the note doc `fileId`, converting both a
     * synchronous sdk throw (invalid path) and an async rejection (failed
     * write) into an error result tagged with the note id.
     */
    private static async writeDoc(
        db: Firestore,
        user: UserCredential,
        fileId: string,
        write: (docRef: ReturnType<typeof doc>) => Promise<void>
    ): Promise<StatusResult<StatusError>> {
        const entry = `${GetFileCollectionPath(user)}/${fileId}`;
        const docRefResult = WrapToResult(
            () => doc(db, entry),
            /*textForUnknown=*/ `Failed to create doc reference "${entry}"`
        );
        if (docRefResult.err) {
            FirestoreUtil.tagError(docRefResult.val, fileId);
            return docRefResult;
        }
        const writeResult = await WrapPromise(
            write(docRefResult.safeUnwrap()),
            /*textForUnknown=*/ `Failed to execute update transaction`
        );
        if (writeResult.err) {
            FirestoreUtil.tagError(writeResult.val, fileId);
        }
        return writeResult;
    }

    private static tagError(error: StatusError, fileId: string): void {
        error.with(InjectMeta({ [FIREBASE_NOTE_ID]: fileId }));
        setAttributeOnActiveSpan(FIREBASE_NOTE_ID, fileId);
    }

    /** Uploads a note with data in cloudstorage. */
    @Span()
    @PromiseResultSpanError
    public static async uploadCloudNodeToFirestore(
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        user: UserCredential,
        fileId: string,
        fileNode: LocalOnlyFileNode | LocalCloudFileNode,
        fileStorageRef: string
    ): Promise<Result<SchemaWithId<LatestNotesSchema>, StatusError>> {
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
        const updateResult = await FirestoreUtil.writeDoc(db, user, fileId, (docRef) =>
            setDoc(docRef, uploadData)
        );
        if (updateResult.err) {
            return updateResult;
        }

        return Ok({ id: fileId, data: uploadData });
    }

    /** Update a note where data is embeded. */
    @Span()
    @PromiseResultSpanError
    public static async uploadDataToFirestore(
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        user: UserCredential,
        fileId: string,
        fileNode: LocalOnlyFileNode | LocalCloudFileNode,
        data: Uint8Array
    ): Promise<Result<SchemaWithId<LatestNotesSchema>, StatusError>> {
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
        const updateResult = await FirestoreUtil.writeDoc(db, user, fileId, (docRef) =>
            setDoc(docRef, uploadData)
        );
        if (updateResult.err) {
            return updateResult;
        }

        return Ok({ id: fileId, data: uploadData });
    }

    /** Update firestore to mark a file as deleted. */
    @Span()
    @PromiseResultSpanError
    public static async markFirestoreAsDeleted(
        db: Firestore,
        user: UserCredential,
        fileId: string,
        newUpdateTime: number
    ): Promise<StatusResult<StatusError>> {
        const updateData: Pick<LatestNotesSchema, "deleted" | "entryTime"> = {
            deleted: true,
            entryTime: newUpdateTime
        };
        return FirestoreUtil.writeDoc(db, user, fileId, (docRef) => updateDoc(docRef, updateData));
    }
}
