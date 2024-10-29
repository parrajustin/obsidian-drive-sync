import { describe, expect, test } from "@jest/globals";
import { GetThreeWayDifferences } from "../../../src/lib/diff_merge_patch/three_way_merge";

describe("GetThreeWayDifferences", () => {
    test("empty", () => {
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
Therefore let there always be non-being,
  so we may see their subtlety,
And let there always be being,
  so we may see their outcome.
The two are the same,
But after they are produced,
  they have different names.
The door of all subtleties!`;
        const bSide = `The Nameless is the origin of Heaven and Earth;
The named is the mother of all things.

Therefore let there always be non-being,
  so we may see their subtlety,
And let there always be being,
  so we may see their outcome.
The two are the same,
But after they are produced,
  they have different names.
They both may be called deep and profound.
Deeper and more profound,
The door of all subtleties!`;
        const result = GetThreeWayDifferences(base, aSide, bSide);
        expect(result).toStrictEqual([]);
    });
});
