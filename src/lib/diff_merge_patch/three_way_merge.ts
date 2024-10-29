import type { Result } from "../result";
import { Ok } from "../result";
import type { StatusError } from "../status_error";
import { DiffMatchPatch } from "./diff_match_patch";
import type { ChangeOperation } from "./patch_operation";

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
        public leftLo: number,
        public leftHi: number,
        public leftStr: string,
        public rightLo: number,
        public rightHi: number,
        public rightStr: string,
        public baseLo: number,
        public baseHi: number,
        public baseStr: string
    ) {}
}

// export default class Diff3 {
//     constructor(
//         public left: string[],
//         public base: string[],
//         public right: string[]
//     ) {}

//     public static executeDiff(left: string[], base: string[], right: string[]) {
//         return new Diff3(left, base, right).getDifferences();
//     }

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

    return CollapseDifferences(
        base,
        left,
        right,
        new DiffDoubleQueue(leftPatchResult.safeUnwrap(), rightPatchResult.safeUnwrap())
    );
}

function CollapseDifferences(
    base: string,
    left: string,
    right: string,
    diffsQueue: DiffDoubleQueue,
    diffs: ThreeWayDiff[] = []
): Result<ThreeWayDiff[], StatusError> {
    if (diffsQueue.isFinished()) {
        return Ok(diffs);
    } else {
        const resultQueue = new DiffDoubleQueue();
        const initSide = diffsQueue.chooseSide();
        // Won't be undefined, we already check `isFinished` and `chooseSide` will set go to non
        // empty side.
        const topDiff = diffsQueue.dequeue()!;

        resultQueue.enqueue(initSide, topDiff);

        diffsQueue.switchSides();
        BuildResultQueue(diffsQueue, topDiff.baseEnd, resultQueue);

        diffs.push(
            DetermineDifference(base, left, right, resultQueue, initSide, diffsQueue.switchSides())
        );

        return CollapseDifferences(base, left, right, diffsQueue, diffs);
    }
}

function BuildResultQueue(
    diffsQueue: DiffDoubleQueue,
    prevBaseHi: number,
    resultQueue: DiffDoubleQueue
): DiffDoubleQueue {
    if (QueueIsFinished(diffsQueue.peek(), prevBaseHi)) {
        return resultQueue;
    } else {
        const topDiff = diffsQueue.dequeue()!;
        resultQueue.enqueue(diffsQueue.currentSide, topDiff);

        if (prevBaseHi < topDiff.baseEnd) {
            diffsQueue.switchSides();
            return BuildResultQueue(diffsQueue, GetBaseHigh(topDiff), resultQueue);
        } else {
            return BuildResultQueue(diffsQueue, prevBaseHi, resultQueue);
        }
    }
}

function QueueIsFinished(queue: ChangeOperation[], prevBaseHi: number) {
    return queue.length !== 0 ? queue[0]!.baseStart > prevBaseHi + 1 : true;
}

function DetermineDifference(
    base: string,
    left: string,
    right: string,
    diffDiffsQueue: DiffDoubleQueue,
    initSide: Side,
    finalSide: Side
): ThreeWayDiff {
    const baseLo = diffDiffsQueue.get(initSide)[0]!.baseStart;
    const finalQueue = diffDiffsQueue.get(finalSide);
    const baseHi = GetBaseHigh(finalQueue[finalQueue.length - 1]!);

    const [leftLo, leftHi] = DiffableEndpoints(diffDiffsQueue.get(Side.LEFT), baseLo, baseHi);
    const [rightLo, rightHi] = DiffableEndpoints(diffDiffsQueue.get(Side.RIGHT), baseLo, baseHi);

    const leftSubset = left.slice(leftLo - 1, leftHi);
    const rightSubset = right.slice(rightLo - 1, rightHi);
    const changeType = DecideAction(diffDiffsQueue, leftSubset, rightSubset);

    const baseSubset = base.slice(baseLo - 1, baseHi);

    return new ThreeWayDiff(
        changeType,
        leftLo,
        leftHi,
        leftSubset,
        rightLo,
        rightHi,
        rightSubset,
        baseLo,
        baseHi,
        baseSubset
    );
}

function GetBaseHigh(op: ChangeOperation) {
    return op.baseEnd;
}

function GetPatchHigh(op: ChangeOperation) {
    return op.baseEnd;
}

function DiffableEndpoints(
    commands: ChangeOperation[],
    baseLo: number,
    baseHi: number
): [number, number] {
    if (commands.length !== 0) {
        const firstCommand = commands[0]!;
        const lastCommand = commands[commands.length - 1]!;
        const lo = firstCommand.testStart - firstCommand.baseStart + baseLo;
        const hi = GetPatchHigh(lastCommand) - GetBaseHigh(lastCommand) + baseHi;

        return [lo, hi];
    } else {
        return [baseLo, baseHi];
    }
}

function DecideAction(diffDiffsQueue: DiffDoubleQueue, leftSubset: string, rightSubset: string) {
    if (diffDiffsQueue.isEmpty(Side.LEFT)) {
        return ChangeType.CHOOSE_RIGHT;
    } else if (diffDiffsQueue.isEmpty(Side.RIGHT)) {
        return ChangeType.CHOOSE_LEFT;
    } else {
        // leftSubset deepEquals rightSubset
        if (leftSubset !== rightSubset) {
            return ChangeType.POSSIBLE_CONFLICT;
        } else {
            return ChangeType.NO_CONFLICT_FOUND;
        }
    }
}

export class DiffDoubleQueue {
    currentSide: Side;
    diffs: { left: ChangeOperation[]; right: ChangeOperation[] };

    constructor(left: ChangeOperation[] = [], right: ChangeOperation[] = []) {
        this.diffs = { left: left, right: right };
    }

    public dequeue(side = this.currentSide) {
        return this.diffs[side].shift();
    }

    public peek(side = this.currentSide) {
        return this.diffs[side];
    }

    public isFinished() {
        return this.isEmpty(Side.LEFT) && this.isEmpty(Side.RIGHT);
    }

    public enqueue(side = this.currentSide, val: ChangeOperation) {
        return this.diffs[side].push(val);
    }

    public get(side = this.currentSide) {
        return this.diffs[side];
    }

    public isEmpty(side = this.currentSide) {
        return this.diffs[side].length === 0;
    }

    public switchSides(side = this.currentSide) {
        this.currentSide = side === Side.LEFT ? Side.RIGHT : Side.LEFT;
        return this.currentSide;
    }

    public chooseSide() {
        if (this.isEmpty(Side.LEFT)) {
            this.currentSide = Side.RIGHT;
        } else if (this.isEmpty(Side.RIGHT)) {
            this.currentSide = Side.LEFT;
        } else {
            this.currentSide =
                this.get(Side.LEFT)[0]!.baseStart <= this.get(Side.RIGHT)[0]!.baseStart
                    ? Side.LEFT
                    : Side.RIGHT;
        }

        return this.currentSide;
    }
}
