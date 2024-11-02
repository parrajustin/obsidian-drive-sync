import { describe, expect, test } from "@jest/globals";
import {
    ChangeType,
    GetThreeWayDifferences,
    ThreeWayDiff
} from "../../../src/lib/diff_merge_patch/three_way_merge";
import { ChangeOperation } from "../../../src/lib/diff_merge_patch/patch_operation";

type PartialType<Type> = {
    // For every existing property inside the type of Type
    // convert it to be a ?: version
    [Property in keyof Type]: PartialType<Type[Property]>;
};

function ConvertChangeOp(params: PartialType<ChangeOperation>): ChangeOperation {
    return new ChangeOperation(
        params.op,
        params.baseStart,
        params.testStart,
        params.baseEnd,
        params.testEnd,
        params.baseLength,
        params.testLength,
        params.baseContent,
        params.testContent
    );
}

function ConvertThreeWayDiff(params: PartialType<ThreeWayDiff>): ThreeWayDiff {
    return new ThreeWayDiff(
        params.changeType,
        params.leftChanges.map(ConvertChangeOp),
        params.leftLo,
        params.leftHi,
        params.leftStr,
        params.rigthChanges.map(ConvertChangeOp),
        params.rightLo,
        params.rightHi,
        params.rightStr,
        params.baseLo,
        params.baseHi,
        params.baseStr
    );
}

describe("GetThreeWayDifferences", () => {
    test("only addition with overlaps", () => {
        const base = `And let there always be being,
  so we may see their outcome.
The two are the same,
But after they are produced,
  they have different names`;
        const aSide = `ASideAddedThis
And let there always be being,
  so we may see their outcome.
The two are the (a added this!) same,
But after they are produced,
  they have different names
A added at end`;
        const bSide = `B Side Added This!
And let there always be being,
  so we may see their outcome.
The two are the same,
  B added new Entry!
But after they are produced,
  they have different names`;
        const result = GetThreeWayDifferences(base, aSide, bSide);
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            ConvertThreeWayDiff({
                changeType: ChangeType.CHOOSE_LEFT,
                leftChanges: [
                    {
                        op: 1,
                        baseStart: 0,
                        testStart: 0,
                        baseEnd: 0,
                        testEnd: 15,
                        baseLength: 0,
                        testLength: 15,
                        baseContent: "",
                        testContent: "ASideAddedThis\n"
                    }
                ],
                leftLo: 0,
                leftHi: 15,
                leftStr: "ASideAddedThis\n",
                rigthChanges: [],
                rightLo: 0,
                rightHi: 0,
                rightStr: "",
                baseLo: 0,
                baseHi: 0,
                baseStr: ""
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.CHOOSE_RIGHT,
                leftChanges: [],
                leftLo: 15,
                leftHi: 15,
                leftStr: "",
                rigthChanges: [
                    {
                        op: 1,
                        baseStart: 0,
                        testStart: 0,
                        baseEnd: 0,
                        testEnd: 19,
                        baseLength: 0,
                        testLength: 19,
                        baseContent: "",
                        testContent: "B Side Added This!\n"
                    }
                ],
                rightLo: 0,
                rightHi: 19,
                rightStr: "B Side Added This!\n",
                baseLo: 0,
                baseHi: 0,
                baseStr: ""
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.NO_CONFLICT_FOUND,
                leftChanges: [
                    {
                        op: 0,
                        baseStart: 0,
                        testStart: 15,
                        baseEnd: 78,
                        testEnd: 93,
                        baseLength: 78,
                        testLength: 78,
                        baseContent:
                            "And let there always be being,\n  so we may see their outcome.\nThe two are the ",
                        testContent:
                            "And let there always be being,\n  so we may see their outcome.\nThe two are the "
                    }
                ],
                leftLo: 15,
                leftHi: 93,
                leftStr:
                    "And let there always be being,\n  so we may see their outcome.\nThe two are the ",
                rigthChanges: [
                    {
                        op: 0,
                        baseStart: 0,
                        testStart: 19,
                        baseEnd: 78,
                        testEnd: 97,
                        baseLength: 78,
                        testLength: 78,
                        baseContent:
                            "And let there always be being,\n  so we may see their outcome.\nThe two are the ",
                        testContent:
                            "And let there always be being,\n  so we may see their outcome.\nThe two are the "
                    }
                ],
                rightLo: 19,
                rightHi: 97,
                rightStr:
                    "And let there always be being,\n  so we may see their outcome.\nThe two are the ",
                baseLo: 0,
                baseHi: 78,
                baseStr:
                    "And let there always be being,\n  so we may see their outcome.\nThe two are the "
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.CHOOSE_LEFT,
                leftChanges: [
                    {
                        op: 1,
                        baseStart: 78,
                        testStart: 93,
                        baseEnd: 78,
                        testEnd: 109,
                        baseLength: 0,
                        testLength: 16,
                        baseContent: "",
                        testContent: "(a added this!) "
                    }
                ],
                leftLo: 93,
                leftHi: 109,
                leftStr: "(a added this!) ",
                rigthChanges: [],
                rightLo: 97,
                rightHi: 97,
                rightStr: "",
                baseLo: 78,
                baseHi: 78,
                baseStr: ""
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.NO_CONFLICT_FOUND,
                leftChanges: [
                    {
                        op: 0,
                        baseStart: 78,
                        testStart: 109,
                        baseEnd: 83,
                        testEnd: 114,
                        baseLength: 5,
                        testLength: 5,
                        baseContent: "same,",
                        testContent: "same,"
                    }
                ],
                leftLo: 109,
                leftHi: 114,
                leftStr: "same,",
                rigthChanges: [
                    {
                        op: 0,
                        baseStart: 78,
                        testStart: 97,
                        baseEnd: 83,
                        testEnd: 102,
                        baseLength: 5,
                        testLength: 5,
                        baseContent: "same,",
                        testContent: "same,"
                    }
                ],
                rightLo: 97,
                rightHi: 102,
                rightStr: "same,",
                baseLo: 78,
                baseHi: 83,
                baseStr: "same,"
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.CHOOSE_RIGHT,
                leftChanges: [],
                leftLo: 114,
                leftHi: 114,
                leftStr: "",
                rigthChanges: [
                    {
                        op: 1,
                        baseStart: 83,
                        testStart: 102,
                        baseEnd: 83,
                        testEnd: 123,
                        baseLength: 0,
                        testLength: 21,
                        baseContent: "",
                        testContent: "\n  B added new Entry!"
                    }
                ],
                rightLo: 102,
                rightHi: 123,
                rightStr: "\n  B added new Entry!",
                baseLo: 83,
                baseHi: 83,
                baseStr: ""
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.NO_CONFLICT_FOUND,
                leftChanges: [
                    {
                        op: 0,
                        baseStart: 83,
                        testStart: 114,
                        baseEnd: 140,
                        testEnd: 171,
                        baseLength: 57,
                        testLength: 57,
                        baseContent: "\nBut after they are produced,\n  they have different names",
                        testContent: "\nBut after they are produced,\n  they have different names"
                    }
                ],
                leftLo: 114,
                leftHi: 171,
                leftStr: "\nBut after they are produced,\n  they have different names",
                rigthChanges: [
                    {
                        op: 0,
                        baseStart: 83,
                        testStart: 123,
                        baseEnd: 140,
                        testEnd: 180,
                        baseLength: 57,
                        testLength: 57,
                        baseContent: "\nBut after they are produced,\n  they have different names",
                        testContent: "\nBut after they are produced,\n  they have different names"
                    }
                ],
                rightLo: 123,
                rightHi: 180,
                rightStr: "\nBut after they are produced,\n  they have different names",
                baseLo: 83,
                baseHi: 140,
                baseStr: "\nBut after they are produced,\n  they have different names"
            }),
            ConvertThreeWayDiff({
                changeType: ChangeType.CHOOSE_LEFT,
                leftChanges: [
                    {
                        op: 1,
                        baseStart: 140,
                        testStart: 171,
                        baseEnd: 140,
                        testEnd: 186,
                        baseLength: 0,
                        testLength: 15,
                        baseContent: "",
                        testContent: "\nA added at end"
                    }
                ],
                leftLo: 171,
                leftHi: 186,
                leftStr: "\nA added at end",
                rigthChanges: [],
                rightLo: 180,
                rightHi: 180,
                rightStr: "",
                baseLo: 140,
                baseHi: 140,
                baseStr: ""
            })
        ]);
    });
    //     test("Full Merge", () => {
    //         const base = `The Nameless is the origin of Heaven and Earth;
    // The Named is the mother of all things.
    // Therefore let there always be non-being,
    // so we may see their subtlety,

    // And let there always be being,
    //   so we may see their outcome.
    // The two are the same,
    // But after they are produced,
    //   they have different names.`;
    //         const aSide = `The Way that can be told of is not the eternal Way;
    // The name that can be named is not the eternal name.
    // The Nameless is the origin of Heaven and Earth and Moon;
    // The Named is the mother of all things.
    // Therefore let there always be non-being,
    //   so we may see their subtlety,
    // And let there always be being,
    //   so we may see their outcome.
    // The two are the same,
    // But after they are produced,
    //   they have different names.
    // The door of all subtleties!`;
    //         const bSide = `The Nameless is the origin of Heaven and Earth;
    // The named is the mother of all things.

    // Therefore let there always be non-being,
    //   so we may see their subtlety,
    // And let there always be being,
    //   so we may see their outcome.
    // The two are the same,
    // But after they are produced,
    //   they have different names.
    // They both may be called deep and profound.
    // Deeper and more profound,
    // The door of all subtleties!`;
    //         const result = GetThreeWayDifferences(base, aSide, bSide);
    //         expect(result).toStrictEqual([]);
    //     });
});
