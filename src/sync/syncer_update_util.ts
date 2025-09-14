// /**
//  * Contains the logic to actually resolve the convergence updates. Contains the logic to upload to
//  * firestore or cloud storgae and keeping the progress viewer up to date.
//  */

import { App } from "obsidian";
import { FileAccess } from "../filesystem/file_access";
import { MapOfFileNodes } from "../filesystem/file_map_util";
import {
    AllExistingFileNodeTypes,
    FileNodeType,
    LocalCloudFileNode,
    RemoteOnlyNode
} from "../filesystem/file_node";
import { Err, Ok, StatusResult } from "../lib/result";
import type { Result } from "../lib/result";
import { InternalError, NotFoundError, StatusError } from "../lib/status_error";
import { PromiseResultSpanError, ResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { AsyncForEach, CombineResults } from "../util";
import { ConvergenceActionType } from "./convergence_util";
import type {
    ConvergenceAction,
    ConvergenceStateReturnType,
    DeleteLocalFileAction,
    MarkCloudDeletedAction,
    NewLocalFileAction,
    UpdateCloudAction,
    UpdateLocalFileAction
} from "./convergence_util";
import type { UserCredential } from "firebase/auth";
import { FirestoreUtil } from "./firestore_util";
import { Firestore, doc, getDoc } from "firebase/firestore";
import { GetOrCreateSyncProgressView, SyncProgressView } from "../sidepanel/progressView";
import { WrapPromise } from "../lib/wrap_promise";
import { InjectMeta } from "../lib/inject_status_msg";
import { FileConst, FIREBASE_NOTE_ID } from "../constants";
import { uuidv7 } from "../lib/uuid";
import { CloudStorageUtil } from "../firestore/cloud_storage_util";
import { NOTES_SCHEMA_MANAGER, type LatestNotesSchema } from "../schema/notes/notes.schema";
import { WrapOptional } from "../lib/option";
import { CompressionUtils } from "./compression_utils";

const ONE_HUNDRED_KB_IN_BYTES = 1000 * 100;

interface ConvergenceOutput {
    mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>;
    numberOfActions: number;
}

export class SyncerUpdateUtil {
    /**
     * Executes a limited number of sync convergence actions based on the syncer config.
     */
    @Span()
    @PromiseResultSpanError
    public static async executeLimitedSyncConvergence(
        app: App,
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        actions: ConvergenceStateReturnType,
        creds: UserCredential
    ): Promise<Result<ConvergenceOutput, StatusError>> {
        // Should updated older changes over newer changes first.
        const sortedActions = actions.actions.sort((a, b) => {
            return a.localNode.localTime - b.localNode.localTime;
        });
        const actionsToTakeThisCycle = sortedActions.slice(
            0,
            Math.min(sortedActions.length, syncerConfig.maxUpdatePerSyncer)
        );
        if (actionsToTakeThisCycle.length === 0) {
            return Ok({ mapOfFileNodes: actions.mapOfFileNodes, numberOfActions: 0 });
        }

        const view = await GetOrCreateSyncProgressView(app, /*reveal=*/ false);
        const updatedFileNodes = structuredClone(actions.mapOfFileNodes);
        const results = CombineResults(
            await Promise.all(
                AsyncForEach(
                    actionsToTakeThisCycle,
                    async (action): Promise<StatusResult<StatusError>> => {
                        const resultantNode = await SyncerUpdateUtil.handleSingleConvergence(
                            app,
                            db,
                            clientId,
                            syncerConfig,
                            action,
                            creds,
                            view
                        );
                        if (resultantNode.err) {
                            return resultantNode;
                        }

                        updatedFileNodes.set(
                            action.localNode.fileData.fullPath,
                            resultantNode.safeUnwrap()
                        );

                        return Ok();
                    }
                )
            )
        );
        if (results.err) {
            return results;
        }

        return Ok({
            mapOfFileNodes: updatedFileNodes,
            numberOfActions: actionsToTakeThisCycle.length
        });
    }

    @Span()
    @PromiseResultSpanError
    private static async handleSingleConvergence(
        app: App,
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        action: ConvergenceAction,
        creds: UserCredential,
        view: SyncProgressView
    ): Promise<Result<AllExistingFileNodeTypes, StatusError>> {
        switch (action.action) {
            case ConvergenceActionType.NEW_LOCAL_FILE:
            case ConvergenceActionType.UPDATE_CLOUD:
                return SyncerUpdateUtil.executeUpdateCloud(
                    app,
                    db,
                    clientId,
                    syncerConfig,
                    action,
                    creds,
                    view
                );
            case ConvergenceActionType.DELETE_LOCAL:
                return SyncerUpdateUtil.executeLocalDeletion(app, syncerConfig, action, view);
            case ConvergenceActionType.UPDATE_LOCAL:
                return SyncerUpdateUtil.executeLocalUpdate(app, db, syncerConfig, action, view);
            case ConvergenceActionType.MARK_CLOUD_DELETED:
                return SyncerUpdateUtil.executeMarkCloudDeleted(
                    db,
                    syncerConfig,
                    action,
                    creds,
                    view
                );
        }
    }

    @Span()
    @PromiseResultSpanError
    private static async executeLocalUpdate(
        app: App,
        db: Firestore,
        syncerConfig: LatestSyncConfigVersion,
        action: UpdateLocalFileAction,
        view: SyncProgressView
    ): Promise<Result<LocalCloudFileNode, StatusError>> {
        view.addEntry(syncerConfig.syncerId, action.fullPath, action.action);

        // 1. Download data
        let compressedDataResult: Result<ArrayBufferLike, StatusError>;

        const firebaseData = action.localNode.firebaseData.data;
        if (firebaseData.type === "Raw") {
            // Data is in firestore, we need to fetch the full document.
            const docRef = doc(db, action.localNode.firebaseData.id);
            const docSnap = await WrapPromise(
                getDoc(docRef),
                "Failed to get document for local update."
            );
            if (docSnap.err) {
                docSnap.val.with(
                    InjectMeta({
                        [FIREBASE_NOTE_ID]: action.localNode.firebaseData.id,
                        [FileConst.FILE_PATH]: action.fullPath
                    })
                );
                return docSnap;
            }

            const docData = WrapOptional(
                docSnap.safeUnwrap().data() as LatestNotesSchema | undefined
            );
            if (docData.none) {
                return Err(
                    NotFoundError(`No data found for file ${action.fullPath}.`).with(
                        InjectMeta({
                            [FIREBASE_NOTE_ID]: action.localNode.firebaseData.id,
                            [FileConst.FILE_PATH]: action.fullPath
                        })
                    )
                );
            }
            const fetchedNode = NOTES_SCHEMA_MANAGER.updateSchema(docData.safeValue());
            if (fetchedNode.err) {
                return Err(
                    InternalError(`Failed to validate the fetched notes schema.`).with(
                        InjectMeta({
                            [FIREBASE_NOTE_ID]: action.localNode.firebaseData.id,
                            [FileConst.FILE_PATH]: action.fullPath
                        })
                    )
                );
            }
            const nodeData = fetchedNode.safeUnwrap();
            if (nodeData.type !== "Raw") {
                return Err(
                    InternalError(`Type mismatched expected "RAW" got "REF".`).with(
                        InjectMeta({
                            [FIREBASE_NOTE_ID]: action.localNode.firebaseData.id,
                            [FileConst.FILE_PATH]: action.fullPath
                        })
                    )
                );
            }
            compressedDataResult = Ok(nodeData.data.toUint8Array().buffer);
        } else {
            const ref = WrapOptional(firebaseData.fileStorageRef);
            // type is "Ref"c
            if (ref.none) {
                return Err(NotFoundError(`No file storage ref found for file ${action.fullPath}`));
            }
            compressedDataResult = await CloudStorageUtil.downloadFileFromStorage(ref.safeValue());
        }

        view.setEntryProgress(syncerConfig.syncerId, action.fullPath, 0.3);
        if (compressedDataResult.err) {
            return compressedDataResult;
        }
        const compressedData = compressedDataResult.safeUnwrap();

        // 2. Decompress data
        const decompressedData = await CompressionUtils.decompressData(
            new Uint8Array(compressedData),
            "LocalUpdate"
        );
        view.setEntryProgress(syncerConfig.syncerId, action.fullPath, 0.5);
        if (decompressedData.err) {
            return decompressedData;
        }
        const decompressedBytes = new Uint8Array(decompressedData.safeUnwrap());

        // 3. Write data to local file
        const writeResult = await FileAccess.writeFileNode(
            app,
            action.localNode,
            decompressedBytes,
            syncerConfig,
            {
                ctime: firebaseData.cTime,
                mtime: firebaseData.entryTime
            }
        );
        view.setEntryProgress(syncerConfig.syncerId, action.fullPath, 0.8);
        if (writeResult.err) {
            return writeResult;
        }

        // 4. Assemble and return the new node
        const fileNodeResult = await FileAccess.getFileNode(
            app,
            action.fullPath,
            syncerConfig,
            false,
            false
        );
        if (fileNodeResult.err) {
            return fileNodeResult;
        }
        view.setEntryProgress(syncerConfig.syncerId, action.fullPath, 0.9);

        // This should be a LocalOnlyFileNode
        const fileNode = fileNodeResult.safeUnwrap();
        const node: LocalCloudFileNode = {
            type: FileNodeType.LOCAL_CLOUD_FILE,
            fileData: fileNode.fileData,
            localTime: firebaseData.entryTime,
            firebaseData: action.localNode.firebaseData
        };

        return Ok(node);
    }

    @Span()
    @PromiseResultSpanError
    private static async executeUpdateCloud(
        app: App,
        db: Firestore,
        clientId: string,
        syncerConfig: LatestSyncConfigVersion,
        action: NewLocalFileAction | UpdateCloudAction,
        creds: UserCredential,
        view: SyncProgressView
    ): Promise<Result<LocalCloudFileNode, StatusError>> {
        const firestoreDocId =
            action.action === ConvergenceActionType.NEW_LOCAL_FILE
                ? uuidv7()
                : action.localNode.firebaseData.id;

        const readDataResult = await FileAccess.readFileNode(app, action.localNode, syncerConfig);
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.3);
        if (readDataResult.err) {
            return readDataResult;
        }
        // Create the read stream and compress the data.
        const compressedData = await CompressionUtils.compressData(
            readDataResult.safeUnwrap(),
            "CloudUpdate"
        );
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.5);
        if (compressedData.err) {
            return compressedData;
        }

        const tooBigForFirestore = compressedData.safeUnwrap().byteLength > ONE_HUNDRED_KB_IN_BYTES;
        if (!tooBigForFirestore) {
            // When the data is small enough compress it and upload to firebase.

            const uploadToFirestore = FirestoreUtil.uploadDataToFirestore(
                db,
                clientId,
                syncerConfig,
                creds,
                firestoreDocId,
                action.localNode,
                new Uint8Array(compressedData.safeUnwrap())
            );
            if (uploadToFirestore.err) {
                return uploadToFirestore;
            }
            view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.9);

            const node: LocalCloudFileNode = {
                type: FileNodeType.LOCAL_CLOUD_FILE,
                fileData: action.localNode.fileData,
                localTime: action.localNode.localTime,
                firebaseData: uploadToFirestore.safeUnwrap()
            };
            return Ok(node);
        }

        // Data is too big instead upload to filestorage with a ref.
        const cloudFileId = uuidv7();
        const uploadResult = await CloudStorageUtil.uploadFileToStorage(
            syncerConfig,
            action.fullPath,
            creds,
            cloudFileId,
            compressedData.safeUnwrap()
        );
        if (uploadResult.err) {
            return uploadResult;
        }
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.7);

        const uploadToFirestore = FirestoreUtil.uploadCloudNodeToFirestore(
            db,
            clientId,
            syncerConfig,
            creds,
            firestoreDocId,
            action.localNode,
            uploadResult.safeUnwrap()
        );
        if (uploadToFirestore.err) {
            return uploadToFirestore;
        }
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.9);

        const node: LocalCloudFileNode = {
            type: FileNodeType.LOCAL_CLOUD_FILE,
            fileData: action.localNode.fileData,
            localTime: action.localNode.localTime,
            firebaseData: uploadToFirestore.safeUnwrap()
        };
        return Ok(node);
    }

    /**
     * Executes a action to mark the cloud node deleted based on local file deletion.
     * @returns A remote only file node which is marked as deleted.
     */
    @Span()
    @ResultSpanError
    private static executeMarkCloudDeleted(
        db: Firestore,
        syncerConfig: LatestSyncConfigVersion,
        action: MarkCloudDeletedAction,
        creds: UserCredential,
        view: SyncProgressView
    ): Result<RemoteOnlyNode, StatusError> {
        const updateCloud = FirestoreUtil.markFirestoreAsDeleted(
            db,
            creds,
            action.localNode.firebaseData.id,
            action.localNode.localTime
        );
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.7);
        if (updateCloud.err) {
            return updateCloud;
        }
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 1.0);

        const node: RemoteOnlyNode = {
            type: FileNodeType.REMOTE_ONLY,
            fileData: { fullPath: action.fullPath },
            localTime: action.localNode.localTime,
            firebaseData: {
                id: action.localNode.firebaseData.id,
                data: {
                    ...action.localNode.firebaseData.data,
                    deleted: true,
                    entryTime: action.localNode.localTime
                }
            }
        };
        return Ok(node);
    }

    /**
     * Executes a convergence action to delete the local file.
     * @returns A remote only file node after local was deleted.
     */
    @Span()
    @PromiseResultSpanError
    private static async executeLocalDeletion(
        app: App,
        syncerConfig: LatestSyncConfigVersion,
        action: DeleteLocalFileAction,
        view: SyncProgressView
    ): Promise<Result<RemoteOnlyNode, StatusError>> {
        view.addEntry(syncerConfig.syncerId, action.localNode.fileData.fullPath, action.action);
        const deleteFile = await FileAccess.deleteFileNode(app, action.localNode, syncerConfig);
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 0.7);
        if (deleteFile.err) {
            return deleteFile;
        }
        view.setEntryProgress(syncerConfig.syncerId, action.localNode.fileData.fullPath, 1.0);

        const node: RemoteOnlyNode = {
            type: FileNodeType.REMOTE_ONLY,
            fileData: { fullPath: action.fullPath },
            localTime: action.localNode.firebaseData.data.entryTime,
            firebaseData: action.localNode.firebaseData
        };
        return Ok(node);
    }
}
