import type { Option } from "../option";
import { None, Some, WrapOptional } from "../option";
import type { Result } from "../result";
import { Ok } from "../result";
import type { StatusError } from "../status_error";
import { DiffMatchPatch } from "./diff_match_patch";
import { DiffOp } from "./diff_op";
import { ChangeOperation } from "./patch_operation";
// import type { ChangeOperation } from "./patch_operation";

export enum ChangeType {
    CHOOSE_RIGHT = "choose_right",
    CHOOSE_LEFT = "choose_left",
    POSSIBLE_CONFLICT = "possible_conflict",
    NO_CONFLICT_FOUND = "no_conflict_found"
}

export enum Side {
    LEFT = "left",
    RIGHT = "right"
}

export class ThreeWayDiff {
    constructor(
        public changeType: ChangeType,
        public leftChanges: ChangeOperation[],
        public leftLo: number,
        public leftHi: number,
        public leftStr: string,
        public rigthChanges: ChangeOperation[],
        public rightLo: number,
        public rightHi: number,
        public rightStr: string,
        public baseLo: number,
        public baseHi: number,
        public baseStr: string
    ) {}
}

export function GetThreeWayDifferences(
    base: string,
    left: string,
    right: string
): Result<ThreeWayDiff[], StatusError> {
    const differ = new DiffMatchPatch();
    const leftResult = differ.diffMain(base, left);
    if (leftResult.err) {
        return leftResult;
    }
    differ.diffCleanupEfficiency(leftResult.safeUnwrap());
    const leftPatchResult = differ.changeMake(leftResult.safeUnwrap());
    if (leftPatchResult.err) {
        return leftPatchResult;
    }

    const rightResult = differ.diffMain(base, right);
    if (rightResult.err) {
        return rightResult;
    }
    differ.diffCleanupEfficiency(rightResult.safeUnwrap());
    const rightPatchResult = differ.changeMake(rightResult.safeUnwrap());
    if (rightPatchResult.err) {
        return rightPatchResult;
    }

    // return Ok([]);
    return Ok(CollapseChanges(leftPatchResult.safeUnwrap(), rightPatchResult.safeUnwrap()));
}

function CollapseChanges(
    leftChanges: ChangeOperation[],
    rightChanges: ChangeOperation[]
): ThreeWayDiff[] {
    let leftIndex = 0;
    let rightIndex = 0;
    let baseIndex = 0;
    let leftCurrentChange = WrapOptional(leftChanges.shift());
    let rightCurrentChange = WrapOptional(rightChanges.shift());
    const merges: ThreeWayDiff[] = [];
    while (leftCurrentChange.some || rightCurrentChange.some) {
        // Easy case first handle insertions.
        if (leftCurrentChange.some && leftCurrentChange.safeValue().op === DiffOp.INSERT) {
            // Left has an insertion at the current index.
            const op = leftCurrentChange.safeValue();
            merges.push(
                new ThreeWayDiff(
                    ChangeType.CHOOSE_LEFT,
                    [op],
                    op.testStart,
                    op.testEnd,
                    op.testContent,
                    [],
                    rightIndex,
                    rightIndex,
                    /*rightStr=*/ "",
                    baseIndex,
                    baseIndex,
                    /*baseStr=*/ ""
                )
            );
            leftIndex = op.testEnd;
            leftCurrentChange = None;
        }
        if (rightCurrentChange.some && rightCurrentChange.safeValue().op === DiffOp.INSERT) {
            // Right has an insertion at the current index.
            const op = rightCurrentChange.safeValue();
            merges.push(
                new ThreeWayDiff(
                    ChangeType.CHOOSE_RIGHT,
                    [],
                    leftIndex,
                    leftIndex,
                    /*leftStr=*/ "",
                    [op],
                    op.testStart,
                    op.testEnd,
                    /*rightStr=*/ op.testContent,
                    baseIndex,
                    baseIndex,
                    /*baseStr=*/ ""
                )
            );
            rightIndex = op.testEnd;
            rightCurrentChange = None;
        }

        // Instance where both changes are equal ops.
        if (
            leftCurrentChange.some &&
            leftCurrentChange.safeValue().op === DiffOp.EQUAL &&
            rightCurrentChange.some &&
            rightCurrentChange.safeValue().op === DiffOp.EQUAL
        ) {
            let mergeChange: ThreeWayDiff;
            [leftCurrentChange, rightCurrentChange, mergeChange] = CombineEqualOps(
                leftCurrentChange,
                rightCurrentChange
            );
            baseIndex = mergeChange.baseHi;
            leftIndex = mergeChange.leftHi;
            rightIndex = mergeChange.rightHi;
            merges.push(mergeChange);
        }

        // TODO: Add merging of removal ops.

        // Refresh the current changes.
        if (leftCurrentChange.none) {
            leftCurrentChange = WrapOptional(leftChanges.shift());
        }
        if (rightCurrentChange.none) {
            rightCurrentChange = WrapOptional(rightChanges.shift());
        }
    }
    return merges;
}

/** Combine the equal ops where they overlap. Expects both ops to start at the same base index. */
function CombineEqualOps(
    leftChange: Some<ChangeOperation>,
    rightChange: Some<ChangeOperation>
): [Option<ChangeOperation>, Option<ChangeOperation>, ThreeWayDiff] {
    const leftOp = leftChange.safeValue();
    const rightOp = rightChange.safeValue();
    const minBaseEnd = Math.min(leftOp.baseEnd, rightOp.baseEnd);
    // Easy case both end at the same place.
    if (leftOp.baseEnd === minBaseEnd && rightOp.baseEnd === minBaseEnd) {
        return [
            None,
            None,
            new ThreeWayDiff(
                ChangeType.NO_CONFLICT_FOUND,
                [leftOp],
                leftOp.testStart,
                leftOp.testEnd,
                leftOp.testContent,
                [rightOp],
                rightOp.testStart,
                rightOp.testEnd,
                rightOp.testContent,
                leftOp.baseStart,
                leftOp.baseEnd,
                leftOp.baseContent
            )
        ];
    }

    const leftTruncate = TruncateEqualOp(leftChange, minBaseEnd);
    const rightTruncate = TruncateEqualOp(rightChange, minBaseEnd);
    return [
        leftTruncate.leftOverEqualOp,
        rightTruncate.leftOverEqualOp,
        new ThreeWayDiff(
            ChangeType.NO_CONFLICT_FOUND,
            [leftTruncate.truncatedEqualOp.safeValue()],
            leftTruncate.truncatedEqualOp.safeValue().testStart,
            leftTruncate.truncatedEqualOp.safeValue().testEnd,
            leftTruncate.truncatedEqualOp.safeValue().testContent,
            [rightTruncate.truncatedEqualOp.safeValue()],
            rightTruncate.truncatedEqualOp.safeValue().testStart,
            rightTruncate.truncatedEqualOp.safeValue().testEnd,
            rightTruncate.truncatedEqualOp.safeValue().testContent,
            leftTruncate.truncatedEqualOp.safeValue().baseStart,
            leftTruncate.truncatedEqualOp.safeValue().baseEnd,
            leftTruncate.truncatedEqualOp.safeValue().baseContent
        )
    ];
}

interface TruncatedResults {
    truncatedEqualOp: Some<ChangeOperation>;
    leftOverEqualOp: Option<ChangeOperation>;
}
function TruncateEqualOp(change: Some<ChangeOperation>, maxBaseIndex: number): TruncatedResults {
    const op = change.safeValue();
    const baseIndex = change.safeValue().baseStart;
    const length = maxBaseIndex - baseIndex;
    if (length === op.testLength) {
        return { truncatedEqualOp: change, leftOverEqualOp: None };
    }

    const truncatedEqualOp = Some(
        new ChangeOperation(
            op.op,
            op.baseStart,
            op.testStart,
            op.baseStart + length,
            op.testStart + length,
            length,
            length,
            op.baseContent.slice(0, length),
            op.testContent.slice(0, length)
        )
    );
    let leftOverEqualOp: Option<ChangeOperation> = None;
    if (length !== op.baseLength) {
        const leftOverLength = op.baseLength - length;
        leftOverEqualOp = Some(
            new ChangeOperation(
                op.op,
                op.baseStart + length,
                op.testStart + length,
                op.baseEnd,
                op.testEnd,
                leftOverLength,
                leftOverLength,
                op.baseContent.slice(length),
                op.testContent.slice(length)
            )
        );
    }
    return { truncatedEqualOp, leftOverEqualOp };
}

// /** Checks if the two changes operations have any overlap. */
// function CheckChangesHaveOverlap(
//     leftChange: Option<ChangeOperation>,
//     rightChange: Option<ChangeOperation>
// ) {
//     if (leftChange.none) {
//         return false;
//     }
//     if (rightChange.none) {
//         return false;
//     }

//     // Both are insertions.
// }
