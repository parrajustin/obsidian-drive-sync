import { describe, expect, test, beforeEach } from "@jest/globals";
import { FakeFirestore } from "./fake_firestore";
import type { FakeQuery } from "./fake_firestore";

describe("FakeFirestore", () => {
    let fake: FakeFirestore;
    beforeEach(() => {
        fake = new FakeFirestore();
    });

    describe("path validation", () => {
        test("docRef accepts an even number of segments", () => {
            expect(fake.docRef("notes/abc")).toEqual({
                collectionPath: "notes",
                docId: "abc",
                path: "notes/abc"
            });
        });

        test("docRef rejects an odd number of segments", () => {
            expect(() => fake.docRef("notes")).toThrow(/even number/);
            expect(() => fake.docRef("notes/abc/def")).toThrow(/even number/);
        });

        test("docRef rejects empty segments", () => {
            expect(() => fake.docRef("notes//abc")).toThrow(/empty/);
        });

        test("collectionRef rejects an even number of segments", () => {
            expect(() => fake.collectionRef("notes/abc")).toThrow(/odd number/);
        });
    });

    describe("writes and reads", () => {
        test("setDoc then getDoc round trips", async () => {
            const ref = fake.docRef("notes/a");
            await fake.setDoc(ref, { path: "a.md", entryTime: 5 });
            const snap = await fake.getDoc(ref);
            expect(snap.exists()).toBe(true);
            expect(snap.data()).toEqual({ path: "a.md", entryTime: 5 });
        });

        test("setDoc fully overwrites existing data", async () => {
            const ref = fake.docRef("notes/a");
            await fake.setDoc(ref, { path: "a.md", extra: 1 });
            await fake.setDoc(ref, { path: "a.md" });
            const snap = await fake.getDoc(ref);
            expect(snap.data()).toEqual({ path: "a.md" });
        });

        test("updateDoc merges into existing data", async () => {
            const ref = fake.docRef("notes/a");
            await fake.setDoc(ref, { path: "a.md", deleted: false, entryTime: 1 });
            await fake.updateDoc(ref, { deleted: true, entryTime: 2 });
            const snap = await fake.getDoc(ref);
            expect(snap.data()).toEqual({ path: "a.md", deleted: true, entryTime: 2 });
        });

        test("updateDoc rejects for missing documents like real firestore", async () => {
            const ref = fake.docRef("notes/missing");
            await expect(fake.updateDoc(ref, { deleted: true })).rejects.toThrow(/not-found/);
        });

        test("getDoc for a missing doc reports absence", async () => {
            const snap = await fake.getDoc(fake.docRef("notes/missing"));
            expect(snap.exists()).toBe(false);
            expect(snap.data()).toBeUndefined();
        });
    });

    describe("queries", () => {
        const query = (constraints: FakeQuery["constraints"]): FakeQuery => ({
            collectionPath: "notes",
            constraints
        });

        beforeEach(async () => {
            await fake.setDoc(fake.docRef("notes/a"), {
                userId: "u1",
                vaultName: "v1",
                entryTime: 10
            });
            await fake.setDoc(fake.docRef("notes/b"), {
                userId: "u1",
                vaultName: "v2",
                entryTime: 20
            });
            await fake.setDoc(fake.docRef("notes/c"), {
                userId: "u2",
                vaultName: "v1",
                entryTime: 30
            });
        });

        test("filters on equality and range constraints together", async () => {
            const snap = await fake.getDocs(
                query([
                    { type: "where", field: "userId", op: "==", value: "u1" },
                    { type: "where", field: "entryTime", op: ">", value: 15 }
                ])
            );
            expect(snap.docs.map((d) => d.id)).toEqual(["b"]);
        });

        test("no constraints returns the whole collection", async () => {
            const snap = await fake.getDocs(query([]));
            expect(snap.docs).toHaveLength(3);
        });

        test("range constraint boundaries are exclusive for >", async () => {
            const snap = await fake.getDocs(
                query([{ type: "where", field: "entryTime", op: ">", value: 10 }])
            );
            expect(snap.docs.map((d) => d.id).sort()).toEqual(["b", "c"]);
        });
    });

    describe("snapshot listeners", () => {
        test("delivers the initial matching result set immediately", async () => {
            await fake.setDoc(fake.docRef("notes/a"), { entryTime: 10 });
            const snapshots: string[][] = [];
            fake.onSnapshot({ collectionPath: "notes", constraints: [] }, (snap) => {
                snapshots.push(snap.docs.map((d) => d.id));
            });
            expect(snapshots).toEqual([["a"]]);
        });

        test("simulateRemoteWrite pushes a new snapshot to matching listeners", async () => {
            const snapshots: string[][] = [];
            fake.onSnapshot(
                {
                    collectionPath: "notes",
                    constraints: [{ type: "where", field: "entryTime", op: ">", value: 5 }]
                },
                (snap) => {
                    snapshots.push(snap.docs.map((d) => d.id));
                }
            );
            fake.simulateRemoteWrite("notes/x", { entryTime: 10 });
            fake.simulateRemoteWrite("notes/y", { entryTime: 3 }); // filtered out
            expect(snapshots).toEqual([[], ["x"], ["x"]]);
        });

        test("unsubscribe stops further snapshots", async () => {
            const snapshots: string[][] = [];
            const unsub = fake.onSnapshot({ collectionPath: "notes", constraints: [] }, (snap) => {
                snapshots.push(snap.docs.map((d) => d.id));
            });
            unsub();
            fake.simulateRemoteWrite("notes/x", { entryTime: 10 });
            expect(snapshots).toEqual([[]]);
            expect(fake.activeListenerCount).toBe(0);
        });

        test("simulateListenError notifies and removes listeners", () => {
            const errors: Error[] = [];
            fake.onSnapshot(
                { collectionPath: "notes", constraints: [] },
                () => undefined,
                (e) => errors.push(e)
            );
            fake.simulateListenError(new Error("permission-denied"));
            expect(errors.map((e) => e.message)).toEqual(["permission-denied"]);
            expect(fake.activeListenerCount).toBe(0);
        });

        test("simulateRemoteDelete removes the doc from later snapshots", async () => {
            await fake.setDoc(fake.docRef("notes/a"), { entryTime: 10 });
            const snapshots: string[][] = [];
            fake.onSnapshot({ collectionPath: "notes", constraints: [] }, (snap) => {
                snapshots.push(snap.docs.map((d) => d.id));
            });
            fake.simulateRemoteDelete("notes/a");
            expect(snapshots).toEqual([["a"], []]);
        });
    });
});
