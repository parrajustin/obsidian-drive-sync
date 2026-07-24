/**
 * A reusable, jest-free in-memory fake of the Firestore backend.
 *
 * The fake models the small slice of Firestore the plugin uses:
 * - documents stored under top level collections,
 * - `where` filtered queries,
 * - one-shot reads (`getDoc`/`getDocs`),
 * - writes (`setDoc`/`updateDoc`),
 * - real time listeners (`onSnapshot`) that receive the full matching result
 *   set on every change, matching real Firestore query snapshot semantics.
 *
 * It also exposes hooks that simulate events coming *from* the backend
 * (`simulateRemoteWrite`, `simulateListenError`) so tests, and eventually the
 * e2e harness, can drive the plugin as if another device pushed changes.
 *
 * Keep this file free of jest APIs so it can back both unit tests and the
 * future e2e harness. The thin `firebase/firestore` module mock lives in
 * `firestore_sdk_mock.ts`.
 */

export type FakeDocData = Record<string, unknown>;

/** The operators used by the plugin's queries. */
export type FakeWhereOp = "==" | "!=" | ">" | ">=" | "<" | "<=";

export interface FakeWhereConstraint {
    type: "where";
    field: string;
    op: FakeWhereOp;
    value: unknown;
}

/** Descriptor object created by the mocked `query()` sdk function. */
export interface FakeQuery {
    collectionPath: string;
    constraints: FakeWhereConstraint[];
}

/** Descriptor object created by the mocked `doc()` sdk function. */
export interface FakeDocRef {
    collectionPath: string;
    docId: string;
    /** Full path, `collectionPath/docId`. */
    path: string;
}

export interface FakeQueryDocSnapshot {
    id: string;
    data: () => FakeDocData;
}

export interface FakeQuerySnapshot {
    docs: FakeQueryDocSnapshot[];
}

export type SnapshotListener = (snapshot: FakeQuerySnapshot) => void;
export type SnapshotErrorListener = (error: Error) => void;

interface RegisteredListener {
    query: FakeQuery;
    onNext: SnapshotListener;
    onError: SnapshotErrorListener | undefined;
}

/** Splits and validates a firestore path. Mirrors real sdk segment rules. */
export function SplitPath(path: string): string[] {
    const segments = path.split("/").filter((s) => s.length > 0);
    if (segments.length !== path.split("/").length) {
        throw new Error(`Invalid path (${path}). Paths must not contain empty segments.`);
    }
    return segments;
}

export class FakeFirestore {
    /** collection path -> (doc id -> doc data). */
    private _collections = new Map<string, Map<string, FakeDocData>>();
    private _listeners = new Set<RegisteredListener>();
    private _nextWriteError: Error | undefined = undefined;
    /** Every write is recorded here, oldest first. Useful for asserting order. */
    public writeLog: { type: "set" | "update" | "remote"; path: string }[] = [];

    //
    // Reference helpers (used by the sdk mock's `doc`/`collection`/`query`).
    //

    /** Mirrors `doc(db, path)`: requires an even number of segments. */
    public docRef(path: string): FakeDocRef {
        const segments = SplitPath(path);
        if (segments.length % 2 !== 0) {
            throw new Error(
                `Invalid document reference. Document references must have an even number ` +
                    `of segments, but ${path} has ${segments.length}.`
            );
        }
        const docId = segments[segments.length - 1]!;
        const collectionPath = segments.slice(0, -1).join("/");
        return { collectionPath, docId, path: segments.join("/") };
    }

    /** Mirrors `collection(db, path)`: requires an odd number of segments. */
    public collectionRef(path: string): { collectionPath: string } {
        const segments = SplitPath(path);
        if (segments.length % 2 !== 1) {
            throw new Error(
                `Invalid collection reference. Collection references must have an odd number ` +
                    `of segments, but ${path} has ${segments.length}.`
            );
        }
        return { collectionPath: segments.join("/") };
    }

    //
    // Local client operations (what the plugin under test calls via the sdk).
    //

    public async setDoc(ref: FakeDocRef, data: FakeDocData): Promise<void> {
        if (this._nextWriteError !== undefined) {
            const error = this._nextWriteError;
            this._nextWriteError = undefined;
            return Promise.reject(error);
        }
        this.writeLog.push({ type: "set", path: ref.path });
        this.getCollection(ref.collectionPath).set(ref.docId, { ...data });
        this.notifyListeners();
        return Promise.resolve();
    }

    public async updateDoc(ref: FakeDocRef, data: FakeDocData): Promise<void> {
        if (this._nextWriteError !== undefined) {
            const error = this._nextWriteError;
            this._nextWriteError = undefined;
            return Promise.reject(error);
        }
        const collection = this.getCollection(ref.collectionPath);
        const existing = collection.get(ref.docId);
        if (existing === undefined) {
            // Real firestore rejects updates to missing documents.
            return Promise.reject(new Error(`No document to update: ${ref.path} (not-found)`));
        }
        this.writeLog.push({ type: "update", path: ref.path });
        collection.set(ref.docId, { ...existing, ...data });
        this.notifyListeners();
        return Promise.resolve();
    }

    public async getDoc(
        ref: FakeDocRef
    ): Promise<{ id: string; exists: () => boolean; data: () => FakeDocData | undefined }> {
        const data = this.getCollection(ref.collectionPath).get(ref.docId);
        return Promise.resolve({
            id: ref.docId,
            exists: () => data !== undefined,
            data: () => (data === undefined ? undefined : { ...data })
        });
    }

    public async getDocs(query: FakeQuery): Promise<FakeQuerySnapshot> {
        return Promise.resolve(this.runQuery(query));
    }

    public onSnapshot(
        query: FakeQuery,
        onNext: SnapshotListener,
        onError?: SnapshotErrorListener
    ): () => void {
        const listener: RegisteredListener = { query, onNext, onError };
        this._listeners.add(listener);
        // Real firestore always delivers an initial snapshot with current state.
        onNext(this.runQuery(query));
        return () => {
            this._listeners.delete(listener);
        };
    }

    //
    // Backend simulation hooks (what "another device" or the server does).
    //

    /**
     * Simulates another client writing a document; fires the registered
     * `onSnapshot` listeners exactly like a server pushed update.
     */
    public simulateRemoteWrite(fullDocPath: string, data: FakeDocData): void {
        const ref = this.docRef(fullDocPath);
        this.writeLog.push({ type: "remote", path: ref.path });
        const existing = this.getCollection(ref.collectionPath).get(ref.docId);
        this.getCollection(ref.collectionPath).set(ref.docId, { ...existing, ...data });
        this.notifyListeners();
    }

    /** Simulates a remote deletion of a document. */
    public simulateRemoteDelete(fullDocPath: string): void {
        const ref = this.docRef(fullDocPath);
        this.getCollection(ref.collectionPath).delete(ref.docId);
        this.notifyListeners();
    }

    /**
     * Writes a document WITHOUT notifying listeners. Use to arrange backend
     * state that the client hasn't observed yet (e.g. writes that happened
     * while the listen stream was disconnected).
     */
    public seedDoc(fullDocPath: string, data: FakeDocData): void {
        const ref = this.docRef(fullDocPath);
        const existing = this.getCollection(ref.collectionPath).get(ref.docId);
        this.getCollection(ref.collectionPath).set(ref.docId, { ...existing, ...data });
    }

    /** Makes the next `setDoc`/`updateDoc` call reject with `error`. */
    public failNextWrite(error: Error): void {
        this._nextWriteError = error;
    }

    /** Simulates the real time listen stream erroring out (e.g. permissions). */
    public simulateListenError(error: Error): void {
        for (const listener of [...this._listeners]) {
            // Real firestore stops the listen stream after an error.
            this._listeners.delete(listener);
            if (listener.onError !== undefined) {
                listener.onError(error);
            }
        }
    }

    //
    // Introspection helpers for assertions.
    //

    /** Returns raw doc data, or undefined. */
    public peekDoc(fullDocPath: string): FakeDocData | undefined {
        const ref = this.docRef(fullDocPath);
        return this.getCollection(ref.collectionPath).get(ref.docId);
    }

    public listDocs(collectionPath: string): Map<string, FakeDocData> {
        return new Map(this.getCollection(collectionPath));
    }

    public get activeListenerCount(): number {
        return this._listeners.size;
    }

    public clear(): void {
        this._collections.clear();
        this._listeners.clear();
        this.writeLog = [];
    }

    //
    // Internals.
    //

    private getCollection(collectionPath: string): Map<string, FakeDocData> {
        let collection = this._collections.get(collectionPath);
        if (collection === undefined) {
            collection = new Map<string, FakeDocData>();
            this._collections.set(collectionPath, collection);
        }
        return collection;
    }

    private runQuery(query: FakeQuery): FakeQuerySnapshot {
        const collection = this.getCollection(query.collectionPath);
        const docs: FakeQueryDocSnapshot[] = [];
        for (const [id, data] of collection.entries()) {
            if (query.constraints.every((c) => FakeFirestore.matches(data, c))) {
                docs.push({ id, data: () => ({ ...data }) });
            }
        }
        return { docs };
    }

    private static matches(data: FakeDocData, constraint: FakeWhereConstraint): boolean {
        const fieldValue = data[constraint.field] as never;
        const constraintValue = constraint.value as never;
        switch (constraint.op) {
            case "==":
                return fieldValue === constraintValue;
            case "!=":
                return fieldValue !== constraintValue;
            case ">":
                return fieldValue > constraintValue;
            case ">=":
                return fieldValue >= constraintValue;
            case "<":
                return fieldValue < constraintValue;
            case "<=":
                return fieldValue <= constraintValue;
        }
    }

    private notifyListeners(): void {
        for (const listener of [...this._listeners]) {
            listener.onNext(this.runQuery(listener.query));
        }
    }
}
