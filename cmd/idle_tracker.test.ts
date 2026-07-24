/** @jest-environment node */
import { describe, expect, test } from "@jest/globals";
import { IdleTracker } from "./idle_tracker";

describe("IdleTracker", () => {
    test("announces exactly once when the only syncer becomes idle", () => {
        const t = new IdleTracker(new Set(["s1"]));
        // Backlog cycles: not idle.
        expect(t.record("s1", 50, 100)).toBe(false);
        expect(t.allIdle).toBe(false);
        // First idle cycle → announce.
        expect(t.record("s1", 0, 0)).toBe(true);
        expect(t.allIdle).toBe(true);
        // Still idle → no repeat announcement.
        expect(t.record("s1", 0, 0)).toBe(false);
    });

    test("re-arms the announcement after new activity", () => {
        const t = new IdleTracker(new Set(["s1"]));
        expect(t.record("s1", 0, 0)).toBe(true); // announce
        expect(t.record("s1", 3, 0)).toBe(false); // activity resumes
        expect(t.allIdle).toBe(false);
        expect(t.record("s1", 0, 0)).toBe(true); // announce again
    });

    test("only announces once ALL syncers are idle", () => {
        const t = new IdleTracker(new Set(["a", "b"]));
        expect(t.record("a", 0, 0)).toBe(false); // a idle, b unknown
        expect(t.allIdle).toBe(false);
        expect(t.record("b", 0, 0)).toBe(true); // now both idle → announce
        expect(t.allIdle).toBe(true);
    });

    test("a leftover queue counts as not idle", () => {
        const t = new IdleTracker(new Set(["s1"]));
        expect(t.record("s1", 0, 5)).toBe(false);
        expect(t.allIdle).toBe(false);
    });

    test("one syncer leaving idle drops allIdle", () => {
        const t = new IdleTracker(new Set(["a", "b"]));
        t.record("a", 0, 0);
        t.record("b", 0, 0);
        expect(t.allIdle).toBe(true);
        t.record("a", 2, 0);
        expect(t.allIdle).toBe(false);
    });
});
