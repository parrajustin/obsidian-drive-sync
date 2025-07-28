/**
 * This is the stateful firebase syncer that handles maintaing the state of the firebase files.
 */

import type { FirebaseApp } from "firebase/app";
import type { Query, QuerySnapshot, Unsubscribe } from "firebase/firestore";
import { collection, getDocs, onSnapshot, query, where } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import type { Result } from "../lib/result";
import { Ok, type StatusResult } from "../lib/result";
import { ErrorCode, StatusError } from "../lib/status_error";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import { WrapPromise } from "../lib/wrap_promise";
import type { App } from "obsidian";
import { LogError } from "../logging/log";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import { GetFirestore } from "../firestore/get_firestore";
import type { FileSyncer } from "./syncer";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import {
    AnyVersionNotesSchema,
    LatestNotesSchema,
    NOTES_SCHEMA_MANAGER
} from "../schema/notes/notes.schema";
import { PromiseResultSpanError, ResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import { WrapToResult } from "../lib/wrap_to_result";
import { FirebaseCache, SchemaWithId, type FirebaseStoredData } from "./firebase_cache";
import { CreateLogger } from "../logging/logger";

const LOGGER = CreateLogger("firebase_syncer");

/**
 * Syncer that maintains the firebase file map state.
 */
export class FirebaseSyncer {
    /** Unsub function to stop real time updates. */
    private _unsubscribe: Option<Unsubscribe> = None;
    /** If this firebase syncer is ready to get updates. */
    private _isValid = false;
    /** If there is a save setting microtask already running. */
    // private _savingSettings = false;

    private constructor(
        private _app: App,
        private _syncer: FileSyncer,
        private _config: LatestSyncConfigVersion,
        public cloudNodes: Map<string, SchemaWithId<LatestNotesSchema>>,
        private _query: Query
    ) {}

    /** Build the firebase syncer. */
    @Span()
    @PromiseResultSpanError
    public static async buildFirebaseSyncer(
        app: App,
        syncer: FileSyncer,
        firebaseApp: FirebaseApp,
        config: LatestSyncConfigVersion,
        creds: UserCredential,
        cache: FirebaseStoredData<SchemaWithId<LatestNotesSchema>>
    ): Promise<Result<FirebaseSyncer, StatusError>> {
        const db = GetFirestore(firebaseApp);

        // Get the file metadata from firestore that happen after our cache.
        const queryOfFiles = WrapToResult(
            () =>
                query(
                    collection(db, GetFileCollectionPath(creds)),
                    where("userId", "==", creds.user.uid),
                    where("vaultName", "==", config.vaultName),
                    where("entryTime", ">", cache.lastUpdate)
                ),
            /*textForUnknown=*/ "Failed to make query for notes syncer."
        );
        if (queryOfFiles.err) {
            return queryOfFiles;
        }
        const querySnapshotResult = await WrapPromise(
            getDocs(queryOfFiles.safeUnwrap()),
            /*textForUnknown=*/ `failed queryOfFiles getDocs Firebase syncer`
        );
        if (querySnapshotResult.err) {
            return querySnapshotResult;
        }

        const cloudMapFilePathToFirebaseEntry = new Map<string, SchemaWithId<LatestNotesSchema>>();
        // First load up all the cached firebase note data.
        for (const entry of cache.cache) {
            cloudMapFilePathToFirebaseEntry.set(entry.data.path, entry);
        }
        for (const change of querySnapshotResult.safeUnwrap().docs) {
            const cloudNote = change.data() as unknown as AnyVersionNotesSchema;
            const updatedCloudNote = NOTES_SCHEMA_MANAGER.updateSchema(cloudNote);
            if (updatedCloudNote.err) {
                return updatedCloudNote;
            }
            cloudMapFilePathToFirebaseEntry.set(updatedCloudNote.safeUnwrap().path, {
                id: change.id,
                data: updatedCloudNote.safeUnwrap()
            });
        }

        // Update the cache if there were any changes.
        if (querySnapshotResult.safeUnwrap().docs.length > 0) {
            LOGGER.debug(`buildFirebaseSyncer updating cache with new entries`, {
                newEntries: querySnapshotResult.safeUnwrap().docs.length
            });
            const writeResult = await FirebaseCache.writeToFirebaseCache(app, config, [
                ...cloudMapFilePathToFirebaseEntry.values()
            ]);
            if (writeResult.err) {
                return writeResult;
            }
        }

        return Ok(
            new FirebaseSyncer(
                app,
                syncer,
                config,
                cloudMapFilePathToFirebaseEntry,
                queryOfFiles.safeUnwrap()
            )
        );
    }

    /** Initializes the real time subscription on firestore data. */
    @Span()
    @ResultSpanError
    public initailizeRealTimeUpdates(): StatusResult<StatusError> {
        this._unsubscribe = Some(
            onSnapshot(
                this._query,
                { includeMetadataChanges: false, source: "default" },
                (querySnapshot): void => {
                    if (!this._isValid) {
                        return;
                    }

                    this.onSnapshotCallback(querySnapshot)
                        .then((result) => {
                            if (result.err) {
                                this._isValid = false;
                                LogError(LOGGER, result.val);
                                this._syncer.teardown();
                            }
                        })
                        .catch((e: unknown) => {
                            const outputError = new StatusError(
                                ErrorCode.UNKNOWN,
                                // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                                `Firebase Syncer onSnapshotCallback catched error [${e}]`
                            );
                            outputError.setPayload("error", e);
                            this._isValid = false;
                            LogError(LOGGER, outputError);
                            this._syncer.teardown();
                        });
                },
                (e) => {
                    const outputError = new StatusError(
                        ErrorCode.UNKNOWN,
                        `Firebase Syncer real time updates [${e.message}]`,
                        e
                    );
                    outputError.setPayload("error", e);
                    this._isValid = false;
                    LogError(LOGGER, outputError);
                    this._syncer.teardown();
                }
            )
        );

        this._isValid = true;
        return Ok();
    }

    /** Bring down the firebase syncer. */
    @Span()
    public teardown() {
        if (this._unsubscribe.some) {
            this._unsubscribe.safeValue()();
        }
    }

    @Span({ root: true })
    @PromiseResultSpanError
    private async onSnapshotCallback(
        querySnapshot: QuerySnapshot
    ): Promise<StatusResult<StatusError>> {
        // First get all the query snapshot docs and overwrite the cloudnodes in this firebase syncer.
        for (const entry of querySnapshot.docs) {
            const cloudNote = entry.data() as unknown as AnyVersionNotesSchema;
            const updatedCloudNote = NOTES_SCHEMA_MANAGER.updateSchema(cloudNote);
            if (updatedCloudNote.err) {
                return updatedCloudNote;
            }
            this.cloudNodes.set(updatedCloudNote.safeUnwrap().path, {
                id: entry.id,
                data: updatedCloudNote.safeUnwrap()
            });
        }
        if (querySnapshot.docs.length > 0) {
            LOGGER.debug(`onSnapshotCallback updating cache with new entries`, {
                newEntries: querySnapshot.docs.length
            });
            const writeResult = await FirebaseCache.writeToFirebaseCache(this._app, this._config, [
                ...this.cloudNodes.values()
            ]);
            if (writeResult.err) {
                return writeResult;
            }
        }
        return Ok();
    }
}
