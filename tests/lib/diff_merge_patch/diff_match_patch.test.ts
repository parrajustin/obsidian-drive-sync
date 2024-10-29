import { describe, expect, test } from "@jest/globals";
import { DiffMatchPatch } from "../../../src/lib/diff_merge_patch/diff_match_patch";
import type { DiffPair } from "../../../src/lib/diff_merge_patch/diff_type";

describe("DiffMatchPatch", () => {
    test("basic diff", () => {
        const base = `The Nameless is the origin of Heaven and Earth;
The Named is the mother of all things.
Therefore let there always be non-being,
so we may see their subtlety,

And let there always be being,
  so we may see their outcome.
The two are the same,
But after they are produced,
  they have different names.`;
        const aSide = `The Way that can be told of is not the eternal Way;
The name that can be named is not the eternal name.
The Nameless is the origin of Heaven and Earth;
The Named is the mother of all things.
Therefore let there be non-being,
  so we may see their subtlety,
And let there always be being,
  so we may see their outcome.
The two are the same,
But after they are produced,
  they have different names.
The door of all subtleties!`;
        const differ = new DiffMatchPatch();
        const diffResult = differ.diffMain(base, aSide);
        expect(diffResult.ok).toBeTruthy();
        differ.diffCleanupEfficiency(diffResult.val as DiffPair[]);
        expect(diffResult.val).toStrictEqual([
            [
                1,
                "The Way that can be told of is not the eternal Way;\nThe name that can be named is not the eternal name.\n"
            ],
            [
                0,
                "The Nameless is the origin of Heaven and Earth;\nThe Named is the mother of all things.\nTherefore let there "
            ],
            [-1, "always "],
            [0, "be non-being,\n"],
            [1, "  "],
            [0, "so we may see their subtlety,"],
            [-1, "\n"],
            [
                0,
                "\nAnd let there always be being,\n  so we may see their outcome.\nThe two are the same,\nBut after they are produced,\n  they have different names."
            ],
            [-1, ""],
            [1, "\nThe door of all subtleties!"]
        ]);

        const patch = differ.changeMake(diffResult.val as DiffPair[]);
        expect(patch.ok).toBeTruthy();
        expect(patch.val).toStrictEqual([
            {
                diff: [
                    1,
                    "The Way that can be told of is not the eternal Way;\nThe name that can be named is not the eternal name.\n"
                ],
                baseStart: 0,
                testStart: 0,
                baseEnd: 0,
                testEnd: 104,
                baseLength: 0,
                testLength: 104,
                baseContent: "",
                testContent:
                    "The Way that can be told of is not the eternal Way;\nThe name that can be named is not the eternal name.\n"
            },
            {
                diff: [
                    0,
                    "The Nameless is the origin of Heaven and Earth;\nThe Named is the mother of all things.\nTherefore let there "
                ],
                baseStart: 0,
                testStart: 104,
                baseEnd: 107,
                testEnd: 211,
                baseLength: 107,
                testLength: 107,
                baseContent:
                    "The Nameless is the origin of Heaven and Earth;\nThe Named is the mother of all things.\nTherefore let there ",
                testContent:
                    "The Nameless is the origin of Heaven and Earth;\nThe Named is the mother of all things.\nTherefore let there "
            },
            {
                diff: [-1, "always "],
                baseStart: 107,
                testStart: 211,
                baseEnd: 114,
                testEnd: 211,
                baseLength: 7,
                testLength: 0,
                baseContent: "always ",
                testContent: ""
            },
            {
                diff: [0, "be non-being,\n"],
                baseStart: 114,
                testStart: 211,
                baseEnd: 128,
                testEnd: 225,
                baseLength: 14,
                testLength: 14,
                baseContent: "be non-being,\n",
                testContent: "be non-being,\n"
            },
            {
                diff: [1, "  "],
                baseStart: 128,
                testStart: 225,
                baseEnd: 128,
                testEnd: 227,
                baseLength: 0,
                testLength: 2,
                baseContent: "",
                testContent: "  "
            },
            {
                diff: [0, "so we may see their subtlety,"],
                baseStart: 128,
                testStart: 227,
                baseEnd: 157,
                testEnd: 256,
                baseLength: 29,
                testLength: 29,
                baseContent: "so we may see their subtlety,",
                testContent: "so we may see their subtlety,"
            },
            {
                diff: [-1, "\n"],
                baseStart: 157,
                testStart: 256,
                baseEnd: 158,
                testEnd: 256,
                baseLength: 1,
                testLength: 0,
                baseContent: "\n",
                testContent: ""
            },
            {
                diff: [
                    0,
                    "\nAnd let there always be being,\n  so we may see their outcome.\nThe two are the same,\nBut after they are produced,\n  they have different names."
                ],
                baseStart: 158,
                testStart: 256,
                baseEnd: 300,
                testEnd: 398,
                baseLength: 142,
                testLength: 142,
                baseContent:
                    "\nAnd let there always be being,\n  so we may see their outcome.\nThe two are the same,\nBut after they are produced,\n  they have different names.",
                testContent:
                    "\nAnd let there always be being,\n  so we may see their outcome.\nThe two are the same,\nBut after they are produced,\n  they have different names."
            },
            {
                diff: [-1, ""],
                baseStart: 300,
                testStart: 398,
                baseEnd: 300,
                testEnd: 398,
                baseLength: 0,
                testLength: 0,
                baseContent: "",
                testContent: ""
            },
            {
                diff: [1, "\nThe door of all subtleties!"],
                baseStart: 300,
                testStart: 398,
                baseEnd: 300,
                testEnd: 426,
                baseLength: 0,
                testLength: 28,
                baseContent: "",
                testContent: "\nThe door of all subtleties!"
            }
        ]);
    });
});
