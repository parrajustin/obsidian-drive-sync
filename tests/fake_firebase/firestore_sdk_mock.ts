/**
 * Bridges `FakeFirestore` into the `firebase/firestore` module surface the
 * plugin imports. Tests install it with:
 *
 * ```ts
 * jest.mock("firebase/firestore", () => {
 *     const actual = jest.requireActual("firebase/firestore");
 *     // eslint-disable-next-line @typescript-eslint/no-require-imports
 *     const sdk = require("../../tests/fake_firebase/firestore_sdk_mock");
 *     return sdk.CreateFirestoreSdkMock(actual);
 * });
 * ```
 *
 * The module owns a singleton `FakeFirestore` so both the mocked sdk and the
 * test body observe the same backend; call `ResetFakeFirestore()` in
 * `beforeEach` to isolate tests.
 */

import type { FakeQuery, FakeWhereConstraint, FakeWhereOp } from "./fake_firestore";
import { FakeFirestore } from "./fake_firestore";

let INSTANCE = new FakeFirestore();

/** The fake backend behind the mocked sdk module. */
export function GetFakeFirestore(): FakeFirestore {
    return INSTANCE;
}

/** Replaces the backend with a fresh empty one. */
export function ResetFakeFirestore(): FakeFirestore {
    INSTANCE = new FakeFirestore();
    return INSTANCE;
}

interface CollectionDescriptor {
    type: "collection";
    path: string;
}

/**
 * Creates an object with the `firebase/firestore` module shape, delegating to
 * the singleton `FakeFirestore`. Pass the actual module so value classes the
 * plugin depends on (`Bytes`) keep their real identity.
 */
export function CreateFirestoreSdkMock(
    actual: typeof import("firebase/firestore")
): Record<string, unknown> {
    return {
        // Value classes / passthroughs that must keep real identity.
        Bytes: actual.Bytes,

        // App level factories; the plugin treats the return value as opaque.
        getFirestore: () => ({ fake: true }),
        initializeFirestore: () => ({ fake: true }),
        persistentLocalCache: () => ({}),
        persistentMultipleTabManager: () => ({}),
        serverTimestamp: () => Date.now(),

        collection: (_db: unknown, path: string): CollectionDescriptor => {
            INSTANCE.collectionRef(path);
            return { type: "collection", path };
        },

        doc: (_db: unknown, path: string, ...pathSegments: string[]) => {
            const fullPath = [path, ...pathSegments].join("/");
            return INSTANCE.docRef(fullPath);
        },

        where: (field: string, op: FakeWhereOp, value: unknown): FakeWhereConstraint => ({
            type: "where",
            field,
            op,
            value
        }),

        query: (
            collectionDescriptor: CollectionDescriptor,
            ...constraints: FakeWhereConstraint[]
        ): FakeQuery => ({
            collectionPath: collectionDescriptor.path,
            constraints
        }),

        getDocs: async (query: FakeQuery) => INSTANCE.getDocs(query),
        getDoc: async (ref: ReturnType<FakeFirestore["docRef"]>) => INSTANCE.getDoc(ref),
        setDoc: async (ref: ReturnType<FakeFirestore["docRef"]>, data: Record<string, unknown>) =>
            INSTANCE.setDoc(ref, data),
        updateDoc: async (
            ref: ReturnType<FakeFirestore["docRef"]>,
            data: Record<string, unknown>
        ) => INSTANCE.updateDoc(ref, data),

        onSnapshot: (
            query: FakeQuery,
            optionsOrOnNext: unknown,
            maybeOnNext?: unknown,
            maybeOnError?: unknown
        ) => {
            // Supports both onSnapshot(query, cb, errCb) and
            // onSnapshot(query, options, cb, errCb).
            const onNext = (
                typeof optionsOrOnNext === "function" ? optionsOrOnNext : maybeOnNext
            ) as Parameters<FakeFirestore["onSnapshot"]>[1];
            const onError = (
                typeof optionsOrOnNext === "function" ? maybeOnNext : maybeOnError
            ) as Parameters<FakeFirestore["onSnapshot"]>[2];
            return INSTANCE.onSnapshot(query, onNext, onError);
        }
    };
}
