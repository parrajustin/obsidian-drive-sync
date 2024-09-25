/**
 * This is the stateful firebase syncer that handles maintaing the state of the firebase files.
 */

import type { FirebaseApp } from "firebase/app";
import type { FileNode } from "./file_node";
import {
    ConvertArrayOfNodesToMap,
    FlattenFileNodes,
    MapByFileId,
    type FileMapOfNodes
} from "./file_node";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import { collection, getDocs, getFirestore, onSnapshot, query, where } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import type { Result } from "../lib/result";
import { Err, Ok, type StatusResult } from "../lib/result";
import { InternalError, UnknownError, type StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import { FileSchemaConverter } from "./firestore_schema";
import { WrapPromise } from "../lib/wrap_promise";
import type { ConvergenceUpdate } from "./converge_file_models";
import { ConvergeMapsToUpdateStates } from "./converge_file_models";
import type { App } from "obsidian";
import { CreateOperationsToUpdateCloud, CreateOperationsToUpdateLocal } from "./syncer_update_util";
import { LogError } from "../log";

/**
 * Syncer that maintains the firebase file map state.
 */
export class FirebaseSyncer {
    /** Unsub function to stop real time updates. */
    private _unsubscribe: Option<Unsubscribe> = None;
    /** If this firebase syncer is ready to get updates. */
    private _isValid = false;

    private constructor(
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
            where("userId", "==", creds.user.uid)
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

        return Ok(new FirebaseSyncer(creds, db, fileMap.safeUnwrap()));
    }

    public async initailizeRealTimeUpdates() {
        const queryOfFiles = query(
            collection(this._db, "file"),
            where("userId", "==", this._creds.user.uid)
        ).withConverter(new FileSchemaConverter(this._creds));

        this._unsubscribe = Some(
            onSnapshot(queryOfFiles, (querySnapshot) => {
                const flatFiles = FlattenFileNodes(this._cloudNodes);
                const mapOfFiles = MapByFileId(flatFiles);
                querySnapshot.forEach((doc) => {
                    if (!doc.exists()) {
                        return;
                    }
                    const node = doc.data() as FileNode<Some<string>>;
                    const localRep = mapOfFiles.get(node.fileId.safeValue());
                    if (localRep === undefined) {
                        flatFiles.push(node);
                    } else {
                        localRep.baseName = node.baseName;
                        localRep.ctime = node.ctime;
                        localRep.data = node.data;
                        localRep.deleted = node.deleted;
                        localRep.extension = node.extension;
                        localRep.fileId = node.fileId;
                        localRep.fileStorageRef = node.fileStorageRef;
                        localRep.fullPath = node.fullPath;
                        localRep.mtime = node.mtime;
                        localRep.size = node.size;
                        localRep.userId = node.userId;
                    }
                });
                const convertToNodesResult = ConvertArrayOfNodesToMap<Some<string>>(flatFiles);
                if (convertToNodesResult.err) {
                    LogError(convertToNodesResult.val);
                    this._isValid = false;
                    return;
                }
                this._cloudNodes = convertToNodesResult.safeUnwrap();
            })
        );

        this._isValid = true;
    }

    /** Bring down the firebase syncer. */
    public teardown() {
        if (this._unsubscribe.some) {
            this._unsubscribe.safeValue()();
        }
    }

    /** Gets the convergence updates necessary to sync states. */
    public getConvergenceUpdates(
        localNodes: FileMapOfNodes
    ): Result<ConvergenceUpdate[], StatusError> {
        if (!this._isValid) {
            return Err(InternalError(`Firebase syncer not in valid state.`));
        }
        return ConvergeMapsToUpdateStates({
            localMapRep: localNodes,
            cloudMapRep: this._cloudNodes
        });
    }

    /**
     * Converges the convergence updates into actual operations to sync the states. Note: Does not
     * clean up from cloud -> local updates when the local file is at a different location.
     * @param app obsidian app
     * @param updates convergence updates to turn to operations
     * @returns the operation async funcs
     */
    public resolveConvergenceUpdates(
        app: App,
        updates: ConvergenceUpdate[]
    ): Result<Promise<StatusResult<StatusError>>[], StatusError> {
        if (!this._isValid) {
            return Err(InternalError(`Firebase syncer not in valid state.`));
        }
        return Ok([
            ...this.resolveLocalActionConvergenceUpdates(app, updates),
            ...this.resolveCloudActionConvergenceUpdates(app, updates)
        ]);
    }

    private resolveLocalActionConvergenceUpdates(
        app: App,
        updates: ConvergenceUpdate[]
    ): Promise<StatusResult<StatusError>>[] {
        return CreateOperationsToUpdateCloud(this._db, updates, app, this._creds);
    }

    private resolveCloudActionConvergenceUpdates(
        app: App,
        updates: ConvergenceUpdate[]
    ): Promise<StatusResult<StatusError>>[] {
        return CreateOperationsToUpdateLocal(updates, app);
    }
}
