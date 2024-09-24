import type { FirebaseApp } from "firebase/app";
import type { FileNode } from "./file_node";
import { ConvertArrayOfNodesToMap, type FileMapOfNodes } from "./file_node";
import type { Firestore } from "firebase/firestore";
import { collection, doc, getDocs, getFirestore, query, setDoc, where } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import type { Result } from "../lib/result";
import { Err, Ok, type StatusResult } from "../lib/result";
import { NotFoundError, UnknownError, type StatusError } from "../lib/status_error";
import type { Option, Some } from "../lib/option";
import { None } from "../lib/option";
import type { FileDbModel } from "./firestore_schema";
import { FileSchemaConverter } from "./firestore_schema";
import { uuidv7 } from "../lib/uuid";
import { WrapPromise } from "../lib/wrap_promise";
import type { ConvergenceUpdate } from "./converge_file_models";
import { ConvergeMapsToUpdateStates, ConvergenceAction } from "./converge_file_models";
import type { App } from "obsidian";
import { TFile } from "obsidian";
import { UploadFileToStorage } from "./cloud_storage_util";

const ONE_HUNDRED_KB_IN_BYTES = 1000 * 100;

export class FirebaseSyncer {
    private _isInit: Option<Promise<StatusResult<StatusError>>> = None;

    private constructor(
        private _firebaseApp: FirebaseApp,
        private _creds: UserCredential,
        private _db: Firestore,
        private _cloudNodes: FileMapOfNodes<Some<string>>
    ) {}

    /** Build the firebase syncer. */
    public static async buildFirebaseSyncer(
        firebaseApp: FirebaseApp,
        creds: UserCredential
    ): Promise<Result<FirebaseSyncer, StatusError>> {
        const db = getFirestore(firebaseApp);

        // Get the file metadata from firestore.
        const queryOfFiles = query(
            collection(db, "file"),
            where("userId", "==", creds.user.uid),
            where("deleted", "!=", true)
        ).withConverter(new FileSchemaConverter(creds));
        const querySnapshotResult = await WrapPromise(getDocs(queryOfFiles));
        if (querySnapshotResult.err) {
            return querySnapshotResult.mapErr((err) =>
                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                UnknownError(`getDocs Firebase syncer "${err}"`)
            );
        }

        // Convert the docs to `FileNode`.
        const fileNodes: FileNode<Some<string>>[] = [];
        querySnapshotResult.safeUnwrap().forEach((document) => {
            fileNodes.push(document.data() as FileNode<Some<string>>);
        });
        const fileMap = ConvertArrayOfNodesToMap(fileNodes);
        if (fileMap.err) {
            return fileMap;
        }

        return Ok(new FirebaseSyncer(firebaseApp, creds, db, fileMap.safeUnwrap()));
    }

    /** Gets the convergence updates necessary to sync states. */
    public getConvergenceUpdates(
        localNodes: FileMapOfNodes
    ): Result<ConvergenceUpdate[], StatusError> {
        return ConvergeMapsToUpdateStates({
            localMapRep: localNodes,
            cloudMapRep: this._cloudNodes
        });
    }

    /**
     * Resolve the updates that are local -> cloud.
     * @param app obsidian app interface
     * @param updates
     * @returns
     */
    public async resolveUsingLocalConvergenceUpdates(
        app: App,
        updates: ConvergenceUpdate[]
    ): Promise<StatusResult<StatusError>> {
        const cloudUpdates = updates.filter(
            (v) =>
                v.action === ConvergenceAction.USE_LOCAL ||
                v.action === ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID
        );

        for (const update of cloudUpdates) {
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

            const node: FileDbModel = {
                path: file.path,
                cTime: file.stat.ctime,
                mTime: file.stat.mtime,
                size: file.stat.size,
                baseName: file.basename,
                ext: file.extension,
                userId: this._creds.user.uid,
                deleted: false
            };

            // Handle how the data is stored.
            if (!tooBigForFirestore) {
                const readDataResult = await WrapPromise(app.vault.read(file));
                if (readDataResult.err) {
                    return readDataResult.mapErr((err) =>
                        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                        UnknownError(`Failed to read string "${err}".`)
                    );
                }
                node.data = readDataResult.safeUnwrap();
            } else {
                const uploadCloudStoreResult = await UploadFileToStorage(
                    app,
                    file,
                    this._creds,
                    fileId
                );
                if (uploadCloudStoreResult.err) {
                    return uploadCloudStoreResult;
                }
                update.fileUploadTask = uploadCloudStoreResult.safeUnwrap().uploadTask;
                node.fileStorageRef = uploadCloudStoreResult.safeUnwrap().fullPath;
            }

            const uploadCloudState = await this.uploadFile(node, fileId);
            if (uploadCloudState.err) {
                return uploadCloudState;
            }
        }

        return Ok();
    }

    private async uploadFile(
        node: FileDbModel,
        fileId: string
    ): Promise<StatusResult<StatusError>> {
        const documentRef = doc(this._db, `file/${fileId}`);

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
}
