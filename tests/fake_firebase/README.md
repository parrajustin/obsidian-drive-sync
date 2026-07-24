# Fake Firebase backend

A reusable, jest-free in-memory fake of the Firebase services the plugin uses.
It backs the unit/integration tests today and is the intended foundation for
the future e2e harness (an e2e runner can construct the same fakes and drive
the plugin by injecting backend events).

## Modules

- `fake_firestore.ts` — `FakeFirestore`: documents in top-level collections,
  `where`-filtered queries, `getDoc`/`getDocs`, `setDoc`/`updateDoc` (with real
  Firestore semantics: `updateDoc` rejects on missing docs, doc paths must have
  an even number of segments), and `onSnapshot` listeners that receive the full
  matching result set on every change.
  - Backend simulation hooks: `simulateRemoteWrite` (another device pushed a
    change — notifies listeners), `simulateRemoteDelete`, `seedDoc` (arrange
    state without notifying), `simulateListenError`, `failNextWrite`.
  - Introspection: `peekDoc`, `listDocs`, `writeLog`, `activeListenerCount`.
- `firestore_sdk_mock.ts` — bridges the fake into the `firebase/firestore`
  module surface. Owns a singleton instance (`GetFakeFirestore`,
  `ResetFakeFirestore`).
- `fake_cloud_storage.ts` — same pattern for `firebase/storage`
  (`CreateStorageSdkMock`, `GetFakeCloudStorage`, `ResetFakeCloudStorage`,
  `failNextUpload`, `failNextDownload`).

## Usage in a jest test

```ts
jest.mock("firebase/firestore", () => {
    const actual = jest.requireActual("firebase/firestore");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sdk = require("../../tests/fake_firebase/firestore_sdk_mock") as
        typeof import("../../tests/fake_firebase/firestore_sdk_mock");
    return sdk.CreateFirestoreSdkMock(actual as typeof import("firebase/firestore"));
});

import { GetFakeFirestore, ResetFakeFirestore } from "../../tests/fake_firebase/firestore_sdk_mock";

beforeEach(() => {
    ResetFakeFirestore();
});

test("remote event", () => {
    // Simulates another device writing a note; onSnapshot listeners fire.
    GetFakeFirestore().simulateRemoteWrite("notes/doc-1", { path: "a.md", entryTime: 10 /* ... */ });
});
```

Real `Bytes` (and other value classes) keep their identity because the actual
module is passed into `CreateFirestoreSdkMock`.

Reference suites: `src/sync/firestore_util.test.ts`,
`src/sync/firebase_syncer_fake_backend.test.ts`, `src/sync/syncer.test.ts`.
