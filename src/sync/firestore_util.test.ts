import { describe, expect, test, beforeEach, jest } from "@jest/globals";
import type { Firestore } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";

jest.mock("firebase/firestore", () => {
    const actual = jest.requireActual("firebase/firestore");

    const sdk =
        require("../../tests/fake_firebase/firestore_sdk_mock") as typeof import("../../tests/fake_firebase/firestore_sdk_mock");
    return sdk.CreateFirestoreSdkMock(actual as typeof import("firebase/firestore"));
});

import { GetFakeFirestore, ResetFakeFirestore } from "../../tests/fake_firebase/firestore_sdk_mock";
import { FirestoreUtil } from "./firestore_util";
import { NOTES_MARKDOWN_FIREBASE_DB_NAME } from "../constants";
import type { LocalOnlyFileNode, FilePathType } from "../filesystem/file_node";
import { FileNodeType } from "../filesystem/file_node";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";

const DB = { fake: true } as unknown as Firestore;
const CREDS = { user: { uid: "user-1" } } as UserCredential;
const SYNCER_CONFIG = {
    vaultName: "vault-1",
    syncerId: "syncer-1"
} as LatestSyncConfigVersion;

const makeLocalNode = (path: string): LocalOnlyFileNode => ({
    type: FileNodeType.LOCAL_ONLY_FILE,
    localTime: 1000,
    fileData: {
        fullPath: path as FilePathType,
        cTime: 1,
        mTime: 2,
        size: 3,
        baseName: "file",
        extension: "md",
        deleted: false,
        fileHash: "hash-1"
    }
});

describe("FirestoreUtil", () => {
    beforeEach(() => {
        ResetFakeFirestore();
    });

    describe("uploadDataToFirestore", () => {
        test("writes the document under notes/<fileId>", async () => {
            const result = await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-1",
                makeLocalNode("file.md"),
                new Uint8Array([1, 2, 3])
            );
            expect(result.ok).toBe(true);
            const stored = GetFakeFirestore().peekDoc(`${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-1`);
            expect(stored).toBeDefined();
            expect(stored!.path).toBe("file.md");
            expect(stored!.type).toBe("Raw");
        });

        test("returned id is the bare document id, not a full path", async () => {
            const result = await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-1",
                makeLocalNode("file.md"),
                new Uint8Array([1])
            );
            expect(result.ok).toBe(true);
            // The id is reused by callers as `${collection}/${id}`; a full path
            // here would produce invalid nested doc paths on the next update.
            expect(result.unsafeUnwrap().id).toBe("doc-1");
        });

        test("an uploaded doc can be re-uploaded using the returned id", async () => {
            const first = await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-1",
                makeLocalNode("file.md"),
                new Uint8Array([1])
            );
            expect(first.ok).toBe(true);
            // Simulates the second sync cycle: the id from the first upload is
            // used as the doc id of the follow-up write.
            const second = await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                first.unsafeUnwrap().id,
                makeLocalNode("file.md"),
                new Uint8Array([2])
            );
            expect(second.ok).toBe(true);
            expect(GetFakeFirestore().listDocs(NOTES_MARKDOWN_FIREBASE_DB_NAME).size).toBe(1);
        });

        test("propagates a rejected write as an error result", async () => {
            GetFakeFirestore().failNextWrite(new Error("permission-denied"));
            const result = await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-err",
                makeLocalNode("file.md"),
                new Uint8Array([1])
            );
            expect(result.err).toBe(true);
            expect(
                GetFakeFirestore().peekDoc(`${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-err`)
            ).toBeUndefined();
        });

        test("an invalid doc id (odd path segments) is an error result, not a throw", async () => {
            const result = await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "bad/id",
                makeLocalNode("file.md"),
                new Uint8Array([1])
            );
            expect(result.err).toBe(true);
        });
    });

    describe("uploadCloudNodeToFirestore", () => {
        test("writes a Ref document pointing at cloud storage", async () => {
            const result = await FirestoreUtil.uploadCloudNodeToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-2",
                makeLocalNode("big.md"),
                "user-1/vault-1/storage-obj"
            );
            expect(result.ok).toBe(true);
            expect(result.unsafeUnwrap().id).toBe("doc-2");
            const stored = GetFakeFirestore().peekDoc(`${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-2`);
            expect(stored!.type).toBe("Ref");
            expect(stored!.fileStorageRef).toBe("user-1/vault-1/storage-obj");
            expect(stored!.data).toBeNull();
        });

        test("propagates a rejected write as an error result", async () => {
            GetFakeFirestore().failNextWrite(new Error("permission-denied"));
            const result = await FirestoreUtil.uploadCloudNodeToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-err",
                makeLocalNode("big.md"),
                "storage-ref"
            );
            expect(result.err).toBe(true);
        });
    });

    describe("markFirestoreAsDeleted", () => {
        test("marks an existing doc deleted with the new entry time", async () => {
            await FirestoreUtil.uploadDataToFirestore(
                DB,
                "client-1",
                SYNCER_CONFIG,
                CREDS,
                "doc-3",
                makeLocalNode("gone.md"),
                new Uint8Array([1])
            );
            const result = await FirestoreUtil.markFirestoreAsDeleted(DB, CREDS, "doc-3", 4242);
            expect(result.ok).toBe(true);
            const stored = GetFakeFirestore().peekDoc(`${NOTES_MARKDOWN_FIREBASE_DB_NAME}/doc-3`);
            expect(stored!.deleted).toBe(true);
            expect(stored!.entryTime).toBe(4242);
            // The rest of the doc is untouched.
            expect(stored!.path).toBe("gone.md");
        });

        test("returns an error result when the doc does not exist", async () => {
            const result = await FirestoreUtil.markFirestoreAsDeleted(
                DB,
                CREDS,
                "missing-doc",
                4242
            );
            expect(result.err).toBe(true);
        });
    });
});
