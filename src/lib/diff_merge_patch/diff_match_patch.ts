/**
 * DiffMatchPatch has been derived from diff_match_patch in diff-match-patch by Neil Fraser
 * and the TypeScript of diffMatchPatch.ts in ng-diff-match-patch by Elliot Forbes.
 * See LICENSE.md for licensing details.
 *
 * Changes have been made to correct tslint errors and use the Diff and DiffOp types
 * by Richard Russell.
 *
 * ----------------------------------------------------------------------------------------
 * Diff Match and Patch
 *
 * Copyright 2006 Google Inc.
 * http://code.google.com/p/google-diff-match-patch/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import type { Option } from "../option";
import { None, Some } from "../option";
import type { Result } from "../result";
import { Err, Ok } from "../result";
import type { StatusError } from "../status_error";
import { InternalError, InvalidArgumentError } from "../status_error";
import { DiffOp } from "./diff_op";
import type { DiffPair } from "./diff_type";
import { ChangeOperation, PatchOperation } from "./patch_operation";

/**
 * Class containing the diff, match and patch methods.
 * @constructor
 */
export class DiffMatchPatch {
    // Defaults.
    // Redefine these in your program to override the defaults.

    // Number of seconds to map a diff before giving up (0 for infinity).
    public diffTimeout = 1.0;
    // Cost of an empty edit operation in terms of edit characters.
    public diffEditCost = 4;
    // At what point is no match declared (0.0 = perfection, 1.0 = very loose).
    public matchThreshold = 0.5;
    // How far to search for a match (0 = exact location, 1000+ = broad match).
    // A match this many characters away from the expected location will add
    // 1.0 to the score (0.0 is a perfect match).
    public matchDistance = 1000;
    // When deleting a large block of text (over ~64 characters), how close do
    // the contents have to be to match the expected contents. (0.0 = perfection,
    // 1.0 = very loose).  Note that Match_Threshold controls how closely the
    // end points of a delete need to match.
    public patchDeleteThreshold = 0.5;
    // Chunk size for context length.
    public patchMargin = 4;

    // The number of bits in an int.
    public matchMaxBits = 32;
    /**
     * The data structure representing a diff is an array of tuples:
     * [[DiffOp.Delete, 'Hello'], [DiffOp.Insert, 'Goodbye'], [DiffOp.Equal, ' world.']]
     * which means: delete 'Hello', add 'Goodbye' and keep ' world.'
     */

    // Define some regex patterns for matching boundaries.
    private _whitespaceRegex = new RegExp("/\\s/");
    private _linebreakRegex = new RegExp("/[\\r\\n]/");
    private _blanklineEndRegex = new RegExp("/\\n\\r?\\n$/");
    private _blanklineStartRegex = new RegExp("/^\\r?\\n\\r?\\n/");

    /**
     * Find the differences between two texts.  Simplifies the problem by stripping
     * any common prefix or suffix off the texts before diffing.
     * @param {string} text1 Old string to be diffed.
     * @param {string} text2 New string to be diffed.
     * @param {boolean=} optChecklines Optional speedup flag. If present and false,
     *     then don't run a line-level diff first to identify the changed areas.
     *     Defaults to true, which does a faster, slightly less optimal diff.
     * @param {number} optDeadline Optional time when the diff should be complete
     *     by.  Used internally for recursive calls.  Users should set DiffTimeout
     *     instead.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     */
    public diffMain(
        text1: string | null,
        text2: string | null,
        optChecklines?: boolean,
        optDeadline?: number
    ): Result<DiffPair[], StatusError> {
        // Set a deadline by which time the diff must be complete.
        if (typeof optDeadline === "undefined") {
            if (this.diffTimeout <= 0) {
                optDeadline = Number.MAX_VALUE;
            } else {
                optDeadline = new Date().getTime() + this.diffTimeout * 1000;
            }
        }
        const deadline = optDeadline;

        // Check for null inputs.
        if (text1 == null || text2 == null) {
            return Err(InternalError("Null input. (diff_main)"));
        }

        // Check for equality (speedup).
        if (text1 === text2) {
            if (text1 !== "") {
                const diff = [DiffOp.EQUAL, text1] as DiffPair;
                return Ok([diff]);
            }
            return Ok([]);
        }

        if (typeof optChecklines === "undefined") {
            optChecklines = true;
        }
        const checklines = optChecklines;

        // Trim off common prefix (speedup).
        let commonlength = this.diffCommonPrefix(text1, text2);
        const commonprefix = text1.substring(0, commonlength);
        text1 = text1.substring(commonlength);
        text2 = text2.substring(commonlength);

        // Trim off common suffix (speedup).
        commonlength = this.diffCommonSuffix(text1, text2);
        const commonsuffix = text1.substring(text1.length - commonlength);
        text1 = text1.substring(0, text1.length - commonlength);
        text2 = text2.substring(0, text2.length - commonlength);

        // Compute the diff on the middle block.
        const diffsResult = this.diffCompute(text1, text2, checklines, deadline);
        if (diffsResult.err) {
            return diffsResult;
        }
        const diffs = diffsResult.safeUnwrap();

        // Restore the prefix and suffix.
        if (commonprefix) {
            diffs.unshift([DiffOp.EQUAL, commonprefix]);
        }
        if (commonsuffix) {
            diffs.push([DiffOp.EQUAL, commonsuffix]);
        }
        this.diffCleanupMerge(diffs);
        return Ok(diffs);
    }

    /**
     * Reduce the number of edits by eliminating semantically trivial equalities.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     */
    public diffCleanupSemantic(diffs: DiffPair[]): void {
        let changes = false;
        const equalities = []; // Stack of indices where equalities are found.
        let equalitiesLength = 0; // Keeping our own length const is faster in JS.
        /** @type {?string} */
        let lastequality = null;
        // Always equal to diffs[equalities[equalitiesLength - 1]][1]
        let pointer = 0; // Index of current position.
        // Number of characters that changed prior to the equality.
        let lengthInsertions1 = 0;
        let lengthDeletions1 = 0;
        // Number of characters that changed after the equality.
        let lengthInsertions2 = 0;
        let lengthDeletions2 = 0;
        while (pointer < diffs.length) {
            if (diffs[pointer]![0] === DiffOp.EQUAL) {
                // Equality found.
                equalities[equalitiesLength++] = pointer;
                lengthInsertions1 = lengthInsertions2;
                lengthDeletions1 = lengthDeletions2;
                lengthInsertions2 = 0;
                lengthDeletions2 = 0;
                lastequality = diffs[pointer]![1];
            } else {
                // An insertion or deletion.
                if (diffs[pointer]![0] === DiffOp.INSERT) {
                    lengthInsertions2 += diffs[pointer]![1].length;
                } else {
                    lengthDeletions2 += diffs[pointer]![1].length;
                }
                // Eliminate an equality that is smaller or equal to the edits on both
                // sides of it.
                if (
                    lastequality !== null &&
                    lastequality.length <= Math.max(lengthInsertions1, lengthDeletions1) &&
                    lastequality.length <= Math.max(lengthInsertions2, lengthDeletions2)
                ) {
                    // Duplicate record.
                    diffs.splice(equalities[equalitiesLength - 1]!, 0, [
                        DiffOp.DELETE,
                        lastequality
                    ]);
                    // Change second copy to insert.
                    diffs[equalities[equalitiesLength - 1]! + 1]![0] = DiffOp.INSERT;
                    // Throw away the equality we just deleted.
                    equalitiesLength--;
                    // Throw away the previous equality (it needs to be reevaluated).
                    equalitiesLength--;
                    pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1]! : -1;
                    lengthInsertions1 = 0; // Reset the counters.
                    lengthDeletions1 = 0;
                    lengthInsertions2 = 0;
                    lengthDeletions2 = 0;
                    lastequality = null;
                    changes = true;
                }
            }
            pointer++;
        }

        // Normalize the diff.
        if (changes) {
            this.diffCleanupMerge(diffs);
        }
        this.diffCleanupSemanticLossless(diffs);

        // Find any overlaps between deletions and insertions.
        // e.g: <del>abcxxx</del><ins>xxxdef</ins>
        //   -> <del>abc</del>xxx<ins>def</ins>
        // e.g: <del>xxxabc</del><ins>defxxx</ins>
        //   -> <ins>def</ins>xxx<del>abc</del>
        // Only extract an overlap if it is as big as the edit ahead or behind it.
        pointer = 1;
        while (pointer < diffs.length) {
            if (diffs[pointer - 1]![0] === DiffOp.DELETE && diffs[pointer]![0] === DiffOp.INSERT) {
                const deletion = diffs[pointer - 1]![1];
                const insertion = diffs[pointer]![1];
                const overlapLength1 = this.diffCommonOverlap(deletion, insertion);
                const overlapLength2 = this.diffCommonOverlap(insertion, deletion);
                if (overlapLength1 >= overlapLength2) {
                    if (
                        overlapLength1 >= deletion.length / 2 ||
                        overlapLength1 >= insertion.length / 2
                    ) {
                        // Overlap found.  Insert an equality and trim the surrounding edits.
                        diffs.splice(pointer, 0, [
                            DiffOp.EQUAL,
                            insertion.substring(0, overlapLength1)
                        ]);
                        diffs[pointer - 1]![1] = deletion.substring(
                            0,
                            deletion.length - overlapLength1
                        );
                        diffs[pointer + 1]![1] = insertion.substring(overlapLength1);
                        pointer++;
                    }
                } else {
                    if (
                        overlapLength2 >= deletion.length / 2 ||
                        overlapLength2 >= insertion.length / 2
                    ) {
                        // Reverse overlap found.
                        // Insert an equality and swap and trim the surrounding edits.
                        diffs.splice(pointer, 0, [
                            DiffOp.EQUAL,
                            deletion.substring(0, overlapLength2)
                        ]);
                        diffs[pointer - 1]![0] = DiffOp.INSERT;
                        diffs[pointer - 1]![1] = insertion.substring(
                            0,
                            insertion.length - overlapLength2
                        );
                        diffs[pointer + 1]![0] = DiffOp.DELETE;
                        diffs[pointer + 1]![1] = deletion.substring(overlapLength2);
                        pointer++;
                    }
                }
                pointer++;
            }
            pointer++;
        }
    }

    /**
     * Reduce the number of edits by eliminating operationally trivial equalities.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     */
    public diffCleanupEfficiency(diffs: DiffPair[]): void {
        let changes = false;
        const equalities = []; // Stack of indices where equalities are found.
        let equalitiesLength = 0; // Keeping our own length const is faster in JS.
        /** @type {?string} */
        let lastequality = null;
        // Always equal to diffs[equalities[equalitiesLength - 1]][1]
        let pointer = 0; // Index of current position.
        // Is there an insertion operation before the last equality.
        let preIns = false;
        // Is there a deletion operation before the last equality.
        let preDel = false;
        // Is there an insertion operation after the last equality.
        let postIns = false;
        // Is there a deletion operation after the last equality.
        let postDel = false;
        while (pointer < diffs.length) {
            if (diffs[pointer]![0] === DiffOp.EQUAL) {
                // Equality found.
                if (diffs[pointer]![1].length < this.diffEditCost && (postIns || postDel)) {
                    // Candidate found.
                    equalities[equalitiesLength++] = pointer;
                    preIns = postIns;
                    preDel = postDel;
                    lastequality = diffs[pointer]![1];
                } else {
                    // Not a candidate, and can never become one.
                    equalitiesLength = 0;
                    lastequality = null;
                }
                postIns = postDel = false;
            } else {
                // An insertion or deletion.
                if (diffs[pointer]![0] === DiffOp.DELETE) {
                    postDel = true;
                } else {
                    postIns = true;
                }
                /*
                 * Five types to be split:
                 * <ins>A</ins><del>B</del>XY<ins>C</ins><del>D</del>
                 * <ins>A</ins>X<ins>C</ins><del>D</del>
                 * <ins>A</ins><del>B</del>X<ins>C</ins>
                 * <ins>A</del>X<ins>C</ins><del>D</del>
                 * <ins>A</ins><del>B</del>X<del>C</del>
                 */
                if (
                    lastequality !== null &&
                    ((preIns && preDel && postIns && postDel) ||
                        (lastequality.length < this.diffEditCost / 2 &&
                            (preIns ? 1 : 0) +
                                (preDel ? 1 : 0) +
                                (postIns ? 1 : 0) +
                                (postDel ? 1 : 0) ===
                                3))
                ) {
                    // Duplicate record.
                    diffs.splice(equalities[equalitiesLength - 1]!, 0, [
                        DiffOp.DELETE,
                        lastequality
                    ]);
                    // Change second copy to insert.
                    diffs[equalities[equalitiesLength - 1]! + 1]![0] = DiffOp.INSERT;
                    equalitiesLength--; // Throw away the equality we just deleted;
                    lastequality = null;
                    if (preIns && preDel) {
                        // No changes made which could affect previous entry, keep going.
                        postIns = postDel = true;
                        equalitiesLength = 0;
                    } else {
                        equalitiesLength--; // Throw away the previous equality.
                        pointer = equalitiesLength > 0 ? equalities[equalitiesLength - 1]! : -1;
                        postIns = postDel = false;
                    }
                    changes = true;
                }
            }
            pointer++;
        }

        if (changes) {
            this.diffCleanupMerge(diffs);
        }
    }

    /**
     * Convert a diff array into a pretty HTML report.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @return {string} HTML representation.
     */
    public diffPrettyHtml(diffs: DiffPair[]): string {
        const html = [];
        const patternAmp = /&/g;
        const patternLt = /</g;
        const patternGt = />/g;
        const patternPara = /\n/g;
        for (let x = 0; x < diffs.length; x++) {
            const op = diffs[x]![0]; // Operation (insert, delete, equal)
            const data = diffs[x]![1]; // Text of change.
            const text = data
                .replace(patternAmp, "&amp;")
                .replace(patternLt, "&lt;")
                .replace(patternGt, "&gt;")
                .replace(patternPara, "&para;<br>");
            switch (op) {
                case DiffOp.INSERT:
                    html[x] = '<ins style="background:#e6ffe6;">' + text + "</ins>";
                    break;
                case DiffOp.DELETE:
                    html[x] = '<del style="background:#ffe6e6;">' + text + "</del>";
                    break;
                case DiffOp.EQUAL:
                    html[x] = "<span>" + text + "</span>";
                    break;
            }
        }
        return html.join("");
    }

    /**
     * Compute the Levenshtein distance; the number of inserted, deleted or
     * substituted characters.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @return {number} Number of changes.
     */
    public diffLevenshtein(diffs: DiffPair[]): number {
        let levenshtein = 0;
        let insertions = 0;
        let deletions = 0;
        for (const diff of diffs) {
            const op = diff[0];
            const data = diff[1];
            switch (op) {
                case DiffOp.INSERT:
                    insertions += data.length;
                    break;
                case DiffOp.DELETE:
                    deletions += data.length;
                    break;
                case DiffOp.EQUAL:
                    // A deletion and an insertion is one substitution.
                    levenshtein += Math.max(insertions, deletions);
                    insertions = 0;
                    deletions = 0;
                    break;
            }
        }
        levenshtein += Math.max(insertions, deletions);
        return levenshtein;
    }

    /**
     * Converts Diffs to changes.
     *
     * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or
     * Array of diff tuples for text1 to text2 (method 2).
     * @param {string|!Array.<!diff_match_patch.Diff>} optB text2 (methods 1,4) or
     * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).
     * @param {string|!Array.<!diff_match_patch.Diff>} optC Array of diff tuples
     * for text1 to text2 (method 4) or undefined (methods 1,2,3).
     * @return {!Array.<!diff_match_patch.PatchOperation>} Array of Patch objects.
     */
    public changeMake(diffs: DiffPair[]): Result<ChangeOperation[], StatusError> {
        if (diffs.length === 0) {
            return Ok([]); // Get rid of the null case.
        }
        const patches: ChangeOperation[] = [];
        let charCountBase = 0; // Number of characters into the text1 string.
        let charCountTest = 0; // Number of characters into the text2 string.
        for (const diff of diffs) {
            // public baseStart = 0,
            // public testStart = 0,
            // public baseEnd = 0,
            // public testEnd = 0,
            // public baseLength = 0,
            // public testLength = 0
            const baseStart = charCountBase;
            const testStart = charCountTest;
            let baseEnd = charCountBase;
            let testEnd = charCountTest;
            let baseLength = 0;
            let testLength = 0;

            const diffType = diff[0];
            const diffText = diff[1];

            switch (diffType) {
                case DiffOp.INSERT:
                    testEnd = testStart + diffText.length;
                    testLength = diffText.length;
                    charCountTest += diffText.length;
                    patches.push(
                        new ChangeOperation(
                            diffType,
                            baseStart,
                            testStart,
                            baseEnd,
                            testEnd,
                            baseLength,
                            testLength,
                            "",
                            diffText
                        )
                    );
                    break;
                case DiffOp.DELETE:
                    baseEnd = baseStart + diffText.length;
                    baseLength = diffText.length;
                    charCountBase += diffText.length;
                    patches.push(
                        new ChangeOperation(
                            diffType,
                            baseStart,
                            testStart,
                            baseEnd,
                            testEnd,
                            baseLength,
                            testLength,
                            diffText,
                            ""
                        )
                    );
                    break;
                case DiffOp.EQUAL:
                    testEnd = testStart + diffText.length;
                    testLength = diffText.length;
                    charCountTest += diffText.length;
                    baseEnd = baseStart + diffText.length;
                    baseLength = diffText.length;
                    charCountBase += diffText.length;
                    patches.push(
                        new ChangeOperation(
                            diffType,
                            baseStart,
                            testStart,
                            baseEnd,
                            testEnd,
                            baseLength,
                            testLength,
                            diffText,
                            diffText
                        )
                    );
                    break;
            }
        }

        return Ok(patches);
    }

    /**
     * Compute a list of patches to turn text1 into text2.
     * Use diffs if provided, otherwise compute it ourselves.
     * There are four ways to call this function, depending on what data is
     * available to the caller:
     * Method 1:
     * a = text1, b = text2
     * Method 2:
     * a = diffs
     * Method 3 (optimal):
     * a = text1, b = diffs
     * Method 4 (deprecated, use method 3):
     * a = text1, b = text2, c = diffs
     *
     * @param {string|!Array.<!diff_match_patch.Diff>} a text1 (methods 1,3,4) or
     * Array of diff tuples for text1 to text2 (method 2).
     * @param {string|!Array.<!diff_match_patch.Diff>} optB text2 (methods 1,4) or
     * Array of diff tuples for text1 to text2 (method 3) or undefined (method 2).
     * @param {string|!Array.<!diff_match_patch.Diff>} optC Array of diff tuples
     * for text1 to text2 (method 4) or undefined (methods 1,2,3).
     * @return {!Array.<!diff_match_patch.PatchOperation>} Array of Patch objects.
     */
    public patchMake(
        a: string | DiffPair[],
        optB?: string | DiffPair[],
        optC?: string | DiffPair[]
    ): Result<PatchOperation[], StatusError> {
        let text1;
        let diffs: undefined | DiffPair[];
        if (typeof a === "string" && typeof optB === "string" && typeof optC === "undefined") {
            // Method 1: text1, text2
            // Compute diffs from text1 and text2.
            text1 = /** @type {string} */ a;
            const diffsResult = this.diffMain(text1, /** @type {string} */ optB, true);
            if (diffsResult.err) {
                return diffsResult;
            }
            diffs = diffsResult.safeUnwrap();
            if (diffs.length > 2) {
                this.diffCleanupSemantic(diffs);
                this.diffCleanupEfficiency(diffs);
            }
        } else if (
            typeof a === "object" &&
            typeof optB === "undefined" &&
            typeof optC === "undefined"
        ) {
            // Method 2: diffs
            // Compute text1 from diffs.
            diffs = /** @type {!Array.<!diff_match_patch.Diff>} */ a;
            text1 = this.diffText1(diffs);
        } else if (
            typeof a === "string" &&
            optB !== undefined &&
            typeof optB === "object" &&
            typeof optC === "undefined"
        ) {
            // Method 3: text1, diffs
            text1 = /** @type {string} */ a;
            diffs = /** @type {!Array.<!diff_match_patch.Diff>} */ optB;
        } else if (
            typeof a === "string" &&
            typeof optB === "string" &&
            optC !== undefined &&
            typeof optC === "object"
        ) {
            // Method 4: text1, text2, diffs
            // text2 is not used.
            text1 = /** @type {string} */ a;
            diffs = /** @type {!Array.<!diff_match_patch.Diff>} */ optC;
        } else {
            throw new Error("Unknown call format to patch_make.");
        }

        if (diffs.length === 0) {
            return Ok([]); // Get rid of the null case.
        }
        const patches = [];
        let patch = new PatchOperation();
        let patchDiffLength = 0; // Keeping our own length const is faster in JS.
        let charCount1 = 0; // Number of characters into the text1 string.
        let charCount2 = 0; // Number of characters into the text2 string.
        // Start with text1 (prepatch_text) and apply the diffs until we arrive at
        // text2 (postpatch_text).  We recreate the patches one by one to determine
        // context info.
        let prepatchText = text1;
        let postpatchText = text1;
        for (let x = 0; x < diffs.length; x++) {
            const diffType = diffs[x]![0];
            const diffText = diffs[x]![1];

            if (!patchDiffLength && diffType !== DiffOp.EQUAL) {
                // A new patch starts here.
                patch.start1 = charCount1;
                patch.start2 = charCount2;
            }

            switch (diffType) {
                case DiffOp.INSERT:
                    patch.diffs[patchDiffLength++] = diffs[x]!;
                    patch.length2 += diffText.length;
                    postpatchText =
                        postpatchText.substring(0, charCount2) +
                        diffText +
                        postpatchText.substring(charCount2);
                    break;
                case DiffOp.DELETE:
                    patch.length1 += diffText.length;
                    patch.diffs[patchDiffLength++] = diffs[x]!;
                    postpatchText =
                        postpatchText.substring(0, charCount2) +
                        postpatchText.substring(charCount2 + diffText.length);
                    break;
                case DiffOp.EQUAL:
                    if (
                        diffText.length <= 2 * this.patchMargin &&
                        patchDiffLength &&
                        diffs.length !== x + 1
                    ) {
                        // Small equality inside a patch.
                        patch.diffs[patchDiffLength++] = diffs[x]!;
                        patch.length1 += diffText.length;
                        patch.length2 += diffText.length;
                    } else if (diffText.length >= 2 * this.patchMargin) {
                        // Time for a new patch.
                        if (patchDiffLength) {
                            this.patchAddContext(patch, prepatchText);
                            patches.push(patch);
                            patch = new PatchOperation();
                            patchDiffLength = 0;
                            // Unlike Unidiff, our patch lists have a rolling context.
                            // http://code.google.com/p/google-diff-match-patch/wiki/Unidiff
                            // Update prepatch text & pos to reflect the application of the
                            // just completed patch.
                            prepatchText = postpatchText;
                            charCount1 = charCount2;
                        }
                    }
                    break;
            }

            // Update the current character count.
            if (diffType !== DiffOp.INSERT) {
                charCount1 += diffText.length;
            }
            if (diffType !== DiffOp.DELETE) {
                charCount2 += diffText.length;
            }
        }
        // Pick up the leftover patch if not empty.
        if (patchDiffLength) {
            this.patchAddContext(patch, prepatchText);
            patches.push(patch);
        }

        return Ok(patches);
    }

    /**
     * Merge a set of patches onto the text.  Return a patched text, as well
     * as a list of true/false values indicating which patches were applied.
     * @param {!Array.<!diff_match_patch.PatchOperation>} patches Array of Patch objects.
     * @param {string} text Old text.
     * @return {!Array.<string|!Array.<boolean>>} Two element Array, containing the
     *      new text and an array of boolean values.
     */
    public patchApply(
        patches: PatchOperation[],
        text: string
    ): Result<[string, boolean[]], StatusError> {
        if (patches.length === 0) {
            return Ok([text, []] as [string, boolean[]]);
        }

        // Deep copy the patches so that no changes are made to originals.
        patches = this.patchDeepCopy(patches);

        const nullPadding = this.patchAddPadding(patches);
        text = nullPadding + text + nullPadding;

        this.patchSplitMax(patches);
        // delta keeps track of the offset between the expected and actual location
        // of the previous patch.  If there are patches expected at positions 10 and
        // 20, but the first patch was found at 12, delta is 2 and the second patch
        // has an effective expected position of 22.
        let delta = 0;
        const results = [];
        for (let x = 0; x < patches.length; x++) {
            const expectedLoc = patches[x]!.start2 + delta;
            const text1 = this.diffText1(patches[x]!.diffs);
            let startLoc;
            let endLoc = -1;
            if (text1.length > this.matchMaxBits) {
                // patch_splitMax will only provide an oversized pattern in the case of
                // a monster delete.
                const startLocResult = this.matchMain(
                    text,
                    text1.substring(0, this.matchMaxBits),
                    expectedLoc
                );
                if (startLocResult.err) {
                    return startLocResult;
                }
                startLoc = startLocResult.safeUnwrap();
                if (startLoc !== -1) {
                    const endLocResult = this.matchMain(
                        text,
                        text1.substring(text1.length - this.matchMaxBits),
                        expectedLoc + text1.length - this.matchMaxBits
                    );
                    if (endLocResult.err) {
                        return endLocResult;
                    }
                    endLoc = endLocResult.safeUnwrap();
                    if (endLoc === -1 || startLoc >= endLoc) {
                        // Can't find valid trailing context.  Drop this patch.
                        startLoc = -1;
                    }
                }
            } else {
                const startLocResult = this.matchMain(text, text1, expectedLoc);
                if (startLocResult.err) {
                    return startLocResult;
                }
                startLoc = startLocResult.safeUnwrap();
            }
            if (startLoc === -1) {
                // No match found.  :(
                results[x] = false;
                // Subtract the delta for this failed patch from subsequent patches.
                delta -= patches[x]!.length2 - patches[x]!.length1;
            } else {
                // Found a match.  :)
                results[x] = true;
                delta = startLoc - expectedLoc;
                let text2;
                if (endLoc === -1) {
                    text2 = text.substring(startLoc, startLoc + text1.length);
                } else {
                    text2 = text.substring(startLoc, endLoc + this.matchMaxBits);
                }
                if (text1 === text2) {
                    // Perfect match, just shove the replacement text in.
                    text =
                        text.substring(0, startLoc) +
                        this.diffText2(patches[x]!.diffs) +
                        text.substring(startLoc + text1.length);
                } else {
                    // Imperfect match.  Run a diff to get a framework of equivalent
                    // indices.
                    const diffs = this.diffMain(text1, text2, false);
                    if (diffs.err) {
                        return diffs;
                    }
                    if (
                        text1.length > this.matchMaxBits &&
                        this.diffLevenshtein(diffs.safeUnwrap()) / text1.length >
                            this.patchDeleteThreshold
                    ) {
                        // The end points match, but the content is unacceptably bad.
                        results[x] = false;
                    } else {
                        this.diffCleanupSemanticLossless(diffs.safeUnwrap());
                        let index1 = 0;
                        let index2 = 0;
                        for (const diff of patches[x]!.diffs) {
                            if (diff[0] !== DiffOp.EQUAL) {
                                index2 = this.diffXIndex(diffs.safeUnwrap(), index1);
                            }
                            if (diff[0] === DiffOp.INSERT) {
                                // Insertion
                                text =
                                    text.substring(0, startLoc + index2) +
                                    diff[1] +
                                    text.substring(startLoc + index2);
                            } else if (diff[0] === DiffOp.DELETE) {
                                // Deletion
                                text =
                                    text.substring(0, startLoc + index2) +
                                    text.substring(
                                        startLoc +
                                            this.diffXIndex(
                                                diffs.safeUnwrap(),
                                                index1 + diff[1].length
                                            )
                                    );
                            }
                            if (diff[0] !== DiffOp.DELETE) {
                                index1 += diff[1].length;
                            }
                        }
                    }
                }
            }
        }
        // Strip the padding off.
        text = text.substring(nullPadding.length, text.length - nullPadding.length);
        return Ok([text, results] as [string, boolean[]]);
    }

    /**
     * Take a list of patches and return a textual representation.
     * @param {!Array.<!diff_match_patch.PatchOperation>} patches Array of Patch objects.
     * @return {string} Text representation of patches.
     */
    public patchToText(patches: PatchOperation[]): string {
        const text = [];
        for (let x = 0; x < patches.length; x++) {
            text[x] = patches[x];
        }
        return text.join("");
    }

    /**
     * Parse a textual representation of patches and return a list of Patch objects.
     * @param {string} textline Text representation of patches.
     * @return {!Array.<!diff_match_patch.PatchOperation>} Array of Patch objects.
     * @throws {!Error} If invalid input.
     */
    public patchFromText(textline: string): Result<PatchOperation[], StatusError> {
        const patches: PatchOperation[] = [];
        if (!textline) {
            return Ok(patches);
        }
        const text = textline.split("\n");
        let textPointer = 0;
        const patchHeader = /^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@$/;
        while (textPointer < text.length) {
            const m = patchHeader.exec(text[textPointer]!);
            if (!m) {
                return Err(InvalidArgumentError("Invalid patch string: " + text[textPointer]!));
            }
            const patch = new PatchOperation();
            patches.push(patch);
            patch.start1 = parseInt(m[1]!, 10);
            if (m[2] === "") {
                patch.start1--;
                patch.length1 = 1;
            } else if (m[2] === "0") {
                patch.length1 = 0;
            } else {
                patch.start1--;
                patch.length1 = parseInt(m[2]!, 10);
            }

            patch.start2 = parseInt(m[3]!, 10);
            if (m[4] === "") {
                patch.start2--;
                patch.length2 = 1;
            } else if (m[4] === "0") {
                patch.length2 = 0;
            } else {
                patch.start2--;
                patch.length2 = parseInt(m[4]!, 10);
            }
            textPointer++;

            while (textPointer < text.length) {
                const sign = text[textPointer]!.charAt(0);
                let line: string;
                try {
                    line = decodeURI(text[textPointer]!.substring(1));
                } catch (_ex) {
                    // Malformed URI sequence.
                    return Err(
                        InvalidArgumentError(
                            "Illegal escape in patch_fromText: " + text[textPointer]!.substring(1)
                        )
                    );
                }
                if (sign === "-") {
                    // Deletion.
                    patch.diffs.push([DiffOp.DELETE, line]);
                } else if (sign === "+") {
                    // Insertion.
                    patch.diffs.push([DiffOp.INSERT, line]);
                } else if (sign === " ") {
                    // Minor equality.
                    patch.diffs.push([DiffOp.EQUAL, line]);
                } else if (sign === "@") {
                    // Start of next patch.
                    break;
                } else if (sign === "") {
                    // Blank line?  Whatever.
                } else {
                    // WTF?
                    throw new Error('Invalid patch mode "' + sign + '" in: ' + line);
                }
                textPointer++;
            }
        }
        return Ok(patches);
    }

    /**
     * Determine the common prefix of two strings.
     * @param {string} text1 First string.
     * @param {string} text2 Second string.
     * @return {number} The number of characters common to the start of each
     *     string.
     */
    public diffCommonPrefix(text1: string, text2: string): number {
        // Quick check for common null cases.
        if (!text1 || !text2 || !text1.startsWith(text2.charAt(0))) {
            return 0;
        }
        // Binary search.
        // Performance analysis: http://neil.fraser.name/news/2007/10/09/
        let pointermin = 0;
        let pointermax = Math.min(text1.length, text2.length);
        let pointermid = pointermax;
        let pointerstart = 0;
        while (pointermin < pointermid) {
            if (
                text1.substring(pointerstart, pointermid) ===
                text2.substring(pointerstart, pointermid)
            ) {
                pointermin = pointermid;
                pointerstart = pointermin;
            } else {
                pointermax = pointermid;
            }
            pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
        }
        return pointermid;
    }

    /**
     * Determine the common suffix of two strings.
     * @param {string} text1 First string.
     * @param {string} text2 Second string.
     * @return {number} The number of characters common to the end of each string.
     */
    public diffCommonSuffix(text1: string, text2: string): number {
        // Quick check for common null cases.
        if (!text1 || !text2 || text1.charAt(text1.length - 1) !== text2.charAt(text2.length - 1)) {
            return 0;
        }
        // Binary search.
        // Performance analysis: http://neil.fraser.name/news/2007/10/09/
        let pointermin = 0;
        let pointermax = Math.min(text1.length, text2.length);
        let pointermid = pointermax;
        let pointerend = 0;
        while (pointermin < pointermid) {
            if (
                text1.substring(text1.length - pointermid, text1.length - pointerend) ===
                text2.substring(text2.length - pointermid, text2.length - pointerend)
            ) {
                pointermin = pointermid;
                pointerend = pointermin;
            } else {
                pointermax = pointermid;
            }
            pointermid = Math.floor((pointermax - pointermin) / 2 + pointermin);
        }
        return pointermid;
    }

    /**
     * Reorder and merge like edit sections.  Merge equalities.
     * Any edit section can move as long as it doesn't cross an equality.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     */
    public diffCleanupMerge(diffs: DiffPair[]): void {
        diffs.push([DiffOp.EQUAL, ""]); // Add a dummy entry at the end.
        let pointer = 0;
        let countDelete = 0;
        let countInsert = 0;
        let textDelete = "";
        let textInsert = "";
        let commonlength;
        while (pointer < diffs.length) {
            switch (diffs[pointer]![0]) {
                case DiffOp.INSERT:
                    countInsert++;
                    textInsert += diffs[pointer]![1];
                    pointer++;
                    break;
                case DiffOp.DELETE:
                    countDelete++;
                    textDelete += diffs[pointer]![1];
                    pointer++;
                    break;
                case DiffOp.EQUAL:
                    // Upon reaching an equality, check for prior redundancies.
                    if (countDelete + countInsert > 1) {
                        if (countDelete !== 0 && countInsert !== 0) {
                            // Factor out any common prefixies.
                            commonlength = this.diffCommonPrefix(textInsert, textDelete);
                            if (commonlength !== 0) {
                                if (
                                    pointer - countDelete - countInsert > 0 &&
                                    diffs[pointer - countDelete - countInsert - 1]![0] ===
                                        DiffOp.EQUAL
                                ) {
                                    diffs[pointer - countDelete - countInsert - 1]![1] +=
                                        textInsert.substring(0, commonlength);
                                } else {
                                    diffs.splice(0, 0, [
                                        DiffOp.EQUAL,
                                        textInsert.substring(0, commonlength)
                                    ]);
                                    pointer++;
                                }
                                textInsert = textInsert.substring(commonlength);
                                textDelete = textDelete.substring(commonlength);
                            }
                            // Factor out any common suffixies.
                            commonlength = this.diffCommonSuffix(textInsert, textDelete);
                            if (commonlength !== 0) {
                                diffs[pointer]![1] =
                                    textInsert.substring(textInsert.length - commonlength) +
                                    diffs[pointer]![1];
                                textInsert = textInsert.substring(
                                    0,
                                    textInsert.length - commonlength
                                );
                                textDelete = textDelete.substring(
                                    0,
                                    textDelete.length - commonlength
                                );
                            }
                        }
                        // Delete the offending records and add the merged ones.
                        if (countDelete === 0) {
                            diffs.splice(pointer - countInsert, countDelete + countInsert, [
                                DiffOp.INSERT,
                                textInsert
                            ]);
                        } else if (countInsert === 0) {
                            diffs.splice(pointer - countDelete, countDelete + countInsert, [
                                DiffOp.DELETE,
                                textDelete
                            ]);
                        } else {
                            diffs.splice(
                                pointer - countDelete - countInsert,
                                countDelete + countInsert,
                                [DiffOp.DELETE, textDelete],
                                [DiffOp.INSERT, textInsert]
                            );
                        }
                        pointer =
                            pointer -
                            countDelete -
                            countInsert +
                            (countDelete ? 1 : 0) +
                            (countInsert ? 1 : 0) +
                            1;
                    } else if (pointer !== 0 && diffs[pointer - 1]![0] === DiffOp.EQUAL) {
                        // Merge this equality with the previous one.
                        diffs[pointer - 1]![1] += diffs[pointer]![1];
                        diffs.splice(pointer, 1);
                    } else {
                        pointer++;
                    }
                    countInsert = 0;
                    countDelete = 0;
                    textDelete = "";
                    textInsert = "";
                    break;
            }
        }
        if (diffs[diffs.length - 1]![1] === "") {
            diffs.pop(); // Remove the dummy entry at the end.
        }

        // Second pass: look for single edits surrounded on both sides by equalities
        // which can be shifted sideways to eliminate an equality.
        // e.g: A<ins>BA</ins>C -> <ins>AB</ins>AC
        let changes = false;
        pointer = 1;
        // Intentionally ignore the first and last element (don't need checking).
        while (pointer < diffs.length - 1) {
            if (
                diffs[pointer - 1]![0] === DiffOp.EQUAL &&
                diffs[pointer + 1]![0] === DiffOp.EQUAL
            ) {
                // This is a single edit surrounded by equalities.
                if (
                    diffs[pointer]![1].substring(
                        diffs[pointer]![1].length - diffs[pointer - 1]![1].length
                    ) === diffs[pointer - 1]![1]
                ) {
                    // Shift the edit over the previous equality.
                    diffs[pointer]![1] =
                        diffs[pointer - 1]![1] +
                        diffs[pointer]![1].substring(
                            0,
                            diffs[pointer]![1].length - diffs[pointer - 1]![1].length
                        );
                    diffs[pointer + 1]![1] = diffs[pointer - 1]![1] + diffs[pointer + 1]![1];
                    diffs.splice(pointer - 1, 1);
                    changes = true;
                } else if (
                    diffs[pointer]![1].substring(0, diffs[pointer + 1]![1].length) ===
                    diffs[pointer + 1]![1]
                ) {
                    // Shift the edit over the next equality.
                    diffs[pointer - 1]![1] += diffs[pointer + 1]![1];
                    diffs[pointer]![1] =
                        diffs[pointer]![1].substring(diffs[pointer + 1]![1].length) +
                        diffs[pointer + 1]![1];
                    diffs.splice(pointer + 1, 1);
                    changes = true;
                }
            }
            pointer++;
        }
        // If shifts were made, the diff needs reordering and another shift sweep.
        if (changes) {
            this.diffCleanupMerge(diffs);
        }
    }

    /**
     * Compute and return the source text (all equalities and deletions).
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @return {string} Source text.
     */
    public diffText1(diffs: DiffPair[]): string {
        const text = [];
        for (let x = 0; x < diffs.length; x++) {
            if (diffs[x]![0] !== DiffOp.INSERT) {
                text[x] = diffs[x]![1];
            }
        }
        return text.join("");
    }

    /**
     * Compute and return the destination text (all equalities and insertions).
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @return {string} Destination text.
     */
    public diffText2(diffs: DiffPair[]): string {
        const text = [];
        for (let x = 0; x < diffs.length; x++) {
            if (diffs[x]![0] !== DiffOp.DELETE) {
                text[x] = diffs[x]![1];
            }
        }
        return text.join("");
    }

    /**
     * Compute and return a line-mode diff.
     * @param {string} text1 Old string to be diffed.
     * @param {string} text2 New string to be diffed.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     */
    public diffLineMode(text1: string, text2: string): Result<DiffPair[], StatusError> {
        const encodedStrings = this.diffLinesToChars(text1, text2);
        const diffs = this.diffMain(encodedStrings.chars1, encodedStrings.chars2, false);
        if (diffs.err) {
            return diffs;
        }
        this.diffCharsToLines(diffs.safeUnwrap(), encodedStrings.lineArray);
        return diffs;
    }

    /**
     * Crush the diff into an encoded string which describes the operations
     * required to transform text1 into text2.
     * E.g. =3\t-2\t+ing  -> Keep 3 chars, delete 2 chars, insert 'ing'.
     * Operations are tab-separated.  Inserted text is escaped using %xx notation.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @return {string} Delta text.
     */
    public diffToDelta(diffs: DiffPair[]): string {
        const text = [];
        for (let x = 0; x < diffs.length; x++) {
            switch (diffs[x]![0]) {
                case DiffOp.INSERT:
                    text[x] = "+" + encodeURI(diffs[x]![1]);
                    break;
                case DiffOp.DELETE:
                    text[x] = `-${diffs[x]![1].length}`;
                    break;
                case DiffOp.EQUAL:
                    text[x] = `=${diffs[x]![1].length}`;
                    break;
            }
        }
        return text.join("\t").replace(/%20/g, " ");
    }

    /**
     * Given the original text1, and an encoded string which describes the
     * operations required to transform text1 into text2, compute the full diff.
     * @param {string} text1 Source string for the diff.
     * @param {string} delta Delta text.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     * @throws {!Error} If invalid input.
     */
    public diffFromDelta(text1: string, delta: string): Result<DiffPair[], StatusError> {
        const diffs: DiffPair[] = [];
        let diffsLength = 0; // Keeping our own length const is faster in JS.
        let pointer = 0; // Cursor in text1
        const tokens = delta.split(/\t/g);
        for (const token of tokens) {
            // Each token begins with a one character parameter which specifies the
            // operation of this token (delete, insert, equality).
            const param = token.substring(1);
            switch (token.charAt(0)) {
                case "+": {
                    try {
                        diffs[diffsLength++] = [DiffOp.INSERT, decodeURI(param)];
                    } catch (_ex) {
                        // Malformed URI sequence.
                        throw new Error("Illegal escape in diff_fromDelta: " + param);
                    }
                    break;
                }
                case "-":
                // Fall through.
                case "=": {
                    const n = parseInt(param, 10);
                    if (isNaN(n) || n < 0) {
                        throw new Error("Invalid number in diff_fromDelta: " + param);
                    }
                    const text = text1.substring(pointer, (pointer += n));
                    if (token.charAt(0) === "=") {
                        diffs[diffsLength++] = [DiffOp.EQUAL, text];
                    } else {
                        diffs[diffsLength++] = [DiffOp.DELETE, text];
                    }
                    break;
                }
                default: {
                    // Blank tokens are ok (from a trailing \t).
                    // Anything else is an error.
                    if (token) {
                        throw new Error(`Invalid diff operation in diff_fromDelta: ${token}`);
                    }
                }
            }
        }
        if (pointer !== text1.length) {
            return Err(
                InvalidArgumentError(
                    `Delta length (${pointer}) does not equal source text length (${text1.length}).`
                )
            );
        }
        return Ok(diffs);
    }

    /**
     * Find the differences between two texts.  Assumes that the texts do not
     * have any common prefix or suffix.
     * @param {string} text1 Old string to be diffed.
     * @param {string} text2 New string to be diffed.
     * @param {boolean} checklines Speedup flag.  If false, then don't run a
     *     line-level diff first to identify the changed areas.
     *     If true, then run a faster, slightly less optimal diff.
     * @param {number} deadline Time when the diff should be complete by.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     * @private
     */
    private diffCompute(
        text1: string,
        text2: string,
        checklines: boolean,
        deadline: number
    ): Result<DiffPair[], StatusError> {
        let diffs: DiffPair[];

        if (!text1) {
            // Just add some text (speedup).
            return Ok([[DiffOp.INSERT, text2]] as DiffPair[]);
        }

        if (!text2) {
            // Just delete some text (speedup).
            return Ok([[DiffOp.DELETE, text1]] as DiffPair[]);
        }

        const longtext = text1.length > text2.length ? text1 : text2;
        const shorttext = text1.length > text2.length ? text2 : text1;
        const i = longtext.indexOf(shorttext);
        if (i !== -1) {
            // Shorter text is inside the longer text (speedup).
            diffs = [
                [DiffOp.INSERT, longtext.substring(0, i)],
                [DiffOp.EQUAL, shorttext],
                [DiffOp.INSERT, longtext.substring(i + shorttext.length)]
            ];
            // Swap insertions for deletions if diff is reversed.
            if (text1.length > text2.length) {
                diffs[0]![0] = diffs[2]![0] = DiffOp.DELETE;
            }
            return Ok(diffs);
        }

        if (shorttext.length === 1) {
            // Single character string.
            // After the previous speedup, the character can't be an equality.
            return Ok([
                [DiffOp.DELETE, text1],
                [DiffOp.INSERT, text2]
            ] as DiffPair[]);
        }

        // Check to see if the problem can be split in two.
        const hmOption = this.diffHalfMatch(text1, text2);
        if (hmOption.some) {
            const hm = hmOption.safeValue();
            // A half-match was found, sort out the return data.
            const text1A = hm[0];
            const text1B = hm[1];
            const text2A = hm[2];
            const text2B = hm[3];
            const midCommon = hm[4];
            // Send both pairs off for separate processing.
            const diffsA = this.diffMain(text1A, text2A, checklines, deadline);
            if (diffsA.err) {
                return diffsA;
            }
            const diffsB = this.diffMain(text1B, text2B, checklines, deadline);
            if (diffsB.err) {
                return diffsB;
            }
            // Merge the results.
            return Ok(diffsA.safeUnwrap().concat([[DiffOp.EQUAL, midCommon]], diffsB.safeUnwrap()));
        }

        if (checklines && text1.length > 100 && text2.length > 100) {
            return this.diffLineModeInternal(text1, text2, deadline);
        }

        return this.diffBisect(text1, text2, deadline);
    }

    /**
     * Do a quick line-level diff on both strings, then rediff the parts for
     * greater accuracy.
     * This speedup can produce non-minimal diffs.
     * @param {string} text1 Old string to be diffed.
     * @param {string} text2 New string to be diffed.
     * @param {number} deadline Time when the diff should be complete by.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     * @private
     */
    private diffLineModeInternal(
        text1: string,
        text2: string,
        deadline: number
    ): Result<DiffPair[], StatusError> {
        // Scan the text on a line-by-line basis first.
        const a = this.diffLinesToChars(text1, text2);
        text1 = a.chars1;
        text2 = a.chars2;
        const linearray = a.lineArray;

        const diffs = this.diffMain(text1, text2, false, deadline);
        if (diffs.err) {
            return diffs;
        }

        // Convert the diff back to original text.
        this.diffCharsToLines(diffs.safeUnwrap(), linearray);
        // Eliminate freak matches (e.g. blank lines)
        this.diffCleanupSemantic(diffs.safeUnwrap());

        // Rediff any replacement blocks, this time character-by-character.
        // Add a dummy entry at the end.
        diffs.safeUnwrap().push([DiffOp.EQUAL, ""]);
        let pointer = 0;
        let countDelete = 0;
        let countInsert = 0;
        let textDelete = "";
        let textInsert = "";
        while (pointer < diffs.safeUnwrap().length) {
            switch (diffs.safeUnwrap()[pointer]![0]) {
                case DiffOp.INSERT:
                    countInsert++;
                    textInsert += diffs.safeUnwrap()[pointer]![1];
                    break;
                case DiffOp.DELETE:
                    countDelete++;
                    textDelete += diffs.safeUnwrap()[pointer]![1];
                    break;
                case DiffOp.EQUAL:
                    // Upon reaching an equality, check for prior redundancies.
                    if (countDelete >= 1 && countInsert >= 1) {
                        // Delete the offending records and add the merged ones.
                        diffs
                            .safeUnwrap()
                            .splice(pointer - countDelete - countInsert, countDelete + countInsert);
                        pointer = pointer - countDelete - countInsert;
                        const bResult = this.diffMain(textDelete, textInsert, false, deadline);
                        if (bResult.err) {
                            return bResult;
                        }
                        const b = bResult.safeUnwrap();
                        for (let j = b.length - 1; j >= 0; j--) {
                            diffs.safeUnwrap().splice(pointer, 0, b[j]!);
                        }
                        pointer += b.length;
                    }
                    countInsert = 0;
                    countDelete = 0;
                    textDelete = "";
                    textInsert = "";
                    break;
            }
            pointer++;
        }
        diffs.safeUnwrap().pop(); // Remove the dummy entry at the end.

        return diffs;
    }

    /**
     * Find the 'middle snake' of a diff, split the problem in two
     * and return the recursively constructed diff.
     * See Myers 1986 paper: An O(ND) Difference Algorithm and Its constiations.
     * @param {string} text1 Old string to be diffed.
     * @param {string} text2 New string to be diffed.
     * @param {number} deadline Time at which to bail if not yet complete.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     * @private
     */
    private diffBisect(
        text1: string,
        text2: string,
        deadline: number
    ): Result<DiffPair[], StatusError> {
        // Cache the text lengths to prevent multiple calls.
        const text1Length = text1.length;
        const text2Length = text2.length;
        const maxD = Math.ceil((text1Length + text2Length) / 2);
        const vOffset = maxD;
        const vLength = 2 * maxD;
        const v1: number[] = new Array<number>(vLength);
        const v2: number[] = new Array<number>(vLength);
        // Setting all elements to -1 is faster in Chrome & Firefox than mixing
        // integers and undefined.
        for (let x = 0; x < vLength; x++) {
            v1[x] = -1;
            v2[x] = -1;
        }
        v1[vOffset + 1] = 0;
        v2[vOffset + 1] = 0;
        const delta = text1Length - text2Length;
        // If the total number of characters is odd, then the front path will collide
        // with the reverse path.
        const front = delta % 2 !== 0;
        // Offsets for start and end of k loop.
        // Prevents mapping of space beyond the grid.
        let k1start = 0;
        let k1end = 0;
        let k2start = 0;
        let k2end = 0;
        for (let d = 0; d < maxD; d++) {
            // Bail out if deadline is reached.
            if (new Date().getTime() > deadline) {
                break;
            }

            // Walk the front path one step.
            for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
                const k1Offset = vOffset + k1;
                let x1;
                if (k1 === -d || (k1 !== d && v1[k1Offset - 1]! < v1[k1Offset + 1]!)) {
                    x1 = v1[k1Offset + 1]!;
                } else {
                    x1 = v1[k1Offset - 1]! + 1;
                }
                let y1 = x1 - k1;
                while (
                    x1 < text1Length &&
                    y1 < text2Length &&
                    text1.charAt(x1) === text2.charAt(y1)
                ) {
                    x1++;
                    y1++;
                }
                v1[k1Offset] = x1;
                if (x1 > text1Length) {
                    // Ran off the right of the graph.
                    k1end += 2;
                } else if (y1 > text2Length) {
                    // Ran off the bottom of the graph.
                    k1start += 2;
                } else if (front) {
                    const k2Offset = vOffset + delta - k1;
                    if (k2Offset >= 0 && k2Offset < vLength && v2[k2Offset] !== -1) {
                        // Mirror x2 onto top-left coordinate system.
                        const x2 = text1Length - v2[k2Offset]!;
                        if (x1 >= x2) {
                            // Overlap detected.
                            return this.diffBisectSplit(text1, text2, x1, y1, deadline);
                        }
                    }
                }
            }

            // Walk the reverse path one step.
            for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
                const k2Offset = vOffset + k2;
                let x2: number;
                if (k2 === -d || (k2 !== d && v2[k2Offset - 1]! < v2[k2Offset + 1]!)) {
                    x2 = v2[k2Offset + 1]!;
                } else {
                    x2 = v2[k2Offset - 1]! + 1;
                }
                let y2 = x2 - k2;
                while (
                    x2 < text1Length &&
                    y2 < text2Length &&
                    text1.charAt(text1Length - x2 - 1) === text2.charAt(text2Length - y2 - 1)
                ) {
                    x2++;
                    y2++;
                }
                v2[k2Offset] = x2;
                if (x2 > text1Length) {
                    // Ran off the left of the graph.
                    k2end += 2;
                } else if (y2 > text2Length) {
                    // Ran off the top of the graph.
                    k2start += 2;
                } else if (!front) {
                    const k1Offset = vOffset + delta - k2;
                    if (k1Offset >= 0 && k1Offset < vLength && v1[k1Offset] !== -1) {
                        const x1 = v1[k1Offset]!;
                        const y1 = vOffset + x1 - k1Offset;
                        // Mirror x2 onto top-left coordinate system.
                        x2 = text1Length - x2;
                        if (x1 >= x2) {
                            // Overlap detected.
                            return this.diffBisectSplit(text1, text2, x1, y1, deadline);
                        }
                    }
                }
            }
        }
        // Diff took too long and hit the deadline or
        // number of diffs equals number of characters, no commonality at all.
        return Ok([
            [DiffOp.DELETE, text1],
            [DiffOp.INSERT, text2]
        ] as DiffPair[]);
    }

    /**
     * Given the location of the 'middle snake', split the diff in two parts
     * and recurse.
     * @param {string} text1 Old string to be diffed.
     * @param {string} text2 New string to be diffed.
     * @param {number} x Index of split point in text1.
     * @param {number} y Index of split point in text2.
     * @param {number} deadline Time at which to bail if not yet complete.
     * @return {!Array.<!diff_match_patch.Diff>} Array of diff tuples.
     * @private
     */
    private diffBisectSplit(
        text1: string,
        text2: string,
        x: number,
        y: number,
        deadline: number
    ): Result<DiffPair[], StatusError> {
        const text1a = text1.substring(0, x);
        const text2a = text2.substring(0, y);
        const text1b = text1.substring(x);
        const text2b = text2.substring(y);

        // Compute both diffs serially.
        const diffs = this.diffMain(text1a, text2a, false, deadline);
        if (diffs.err) {
            return diffs;
        }
        const diffsb = this.diffMain(text1b, text2b, false, deadline);
        if (diffsb.err) {
            return diffsb;
        }

        return Ok(diffs.safeUnwrap().concat(diffsb.safeUnwrap()));
    }

    /**
     * Split two texts into an array of strings.  Reduce the texts to a string of
     * hashes where each Unicode character represents one line.
     * @param {string} text1 First string.
     * @param {string} text2 Second string.
     * @return {{chars1: string, chars2: string, lineArray: !Array.<string>}}
     *     An object containing the encoded text1, the encoded text2 and
     *     the array of unique strings.
     *     The zeroth element of the array of unique strings is intentionally blank.
     * @private
     */
    private diffLinesToChars(
        text1: string,
        text2: string
    ): { chars1: string; chars2: string; lineArray: string[] } {
        const lineArray = []; // e.g. lineArray[4] == 'Hello\n'
        const lineHash = {}; // e.g. lineHash['Hello\n'] == 4

        // '\x00' is a valid character, but constious debuggers don't like it.
        // So we'll insert a junk entry to avoid generating a null character.
        lineArray[0] = "";

        const chars1 = this.diffLinesToCharsMunge(text1, lineArray, lineHash);
        const chars2 = this.diffLinesToCharsMunge(text2, lineArray, lineHash);
        return { chars1, chars2, lineArray };
    }

    /**
     * Split a text into an array of strings.  Reduce the texts to a string of
     * hashes where each Unicode character represents one line.
     * Modifies linearray and linehash through being a closure.
     * @param {string} text String to encode.
     * @return {string} Encoded string.
     * @private
     */
    private diffLinesToCharsMunge(
        text: string,
        lineArray: string[],
        lineHash: Record<string, number>
    ): string {
        let chars = "";
        // Walk the text, pulling out a substring for each line.
        // text.split('\n') would would temporarily double our memory footprint.
        // Modifying text would create many large strings to garbage collect.
        let lineStart = 0;
        let lineEnd = -1;
        // Keeping our own length constiable is faster than looking it up.
        let lineArrayLength = lineArray.length;
        while (lineEnd < text.length - 1) {
            lineEnd = text.indexOf("\n", lineStart);
            if (lineEnd === -1) {
                lineEnd = text.length - 1;
            }
            const line = text.substring(lineStart, lineEnd + 1);
            lineStart = lineEnd + 1;

            if (
                Boolean(Object.prototype.hasOwnProperty.call(lineHash, line)) ||
                lineHash[line] !== undefined
            ) {
                chars += String.fromCharCode(lineHash[line]!);
            } else {
                chars += String.fromCharCode(lineArrayLength);
                lineHash[line] = lineArrayLength;
                lineArray[lineArrayLength++] = line;
            }
        }
        return chars;
    }

    /**
     * Rehydrate the text in a diff from a string of line hashes to real lines of
     * text.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @param {!Array.<string>} lineArray Array of unique strings.
     * @private
     */
    private diffCharsToLines(diffs: DiffPair[], lineArray: string[]): void {
        for (const diff of diffs) {
            const chars = diff[1];
            const text = [];
            for (let y = 0; y < chars.length; y++) {
                text[y] = lineArray[chars.charCodeAt(y)];
            }
            diff[1] = text.join("");
        }
    }

    /**
     * Determine if the suffix of one string is the prefix of another.
     * @param {string} text1 First string.
     * @param {string} text2 Second string.
     * @return {number} The number of characters common to the end of the first
     *     string and the start of the second string.
     * @private
     */
    private diffCommonOverlap(text1: string, text2: string): number {
        // Cache the text lengths to prevent multiple calls.
        const text1Length = text1.length;
        const text2Length = text2.length;
        // Eliminate the null case.
        if (text1Length === 0 || text2Length === 0) {
            return 0;
        }
        // Truncate the longer string.
        if (text1Length > text2Length) {
            text1 = text1.substring(text1Length - text2Length);
        } else if (text1Length < text2Length) {
            text2 = text2.substring(0, text1Length);
        }
        const textLength = Math.min(text1Length, text2Length);
        // Quick check for the worst case.
        if (text1 === text2) {
            return textLength;
        }

        // Start by looking for a single character match
        // and increase length until no match is found.
        // Performance analysis: http://neil.fraser.name/news/2010/11/04/
        let best = 0;
        let length = 1;
        for (;;) {
            const pattern = text1.substring(textLength - length);
            const found = text2.indexOf(pattern);
            if (found === -1) {
                return best;
            }
            length += found;
            if (
                found === 0 ||
                text1.substring(textLength - length) === text2.substring(0, length)
            ) {
                best = length;
                length++;
            }
        }
    }

    /**
     * Do the two texts share a substring which is at least half the length of the
     * longer text?
     * This speedup can produce non-minimal diffs.
     * @param {string} text1 First string.
     * @param {string} text2 Second string.
     * @return {Array.<string>} Five element Array, containing the prefix of
     *     text1, the suffix of text1, the prefix of text2, the suffix of
     *     text2 and the common middle.  Or null if there was no match.
     * @private
     */
    private diffHalfMatch(
        text1: string,
        text2: string
    ): Option<[string, string, string, string, string]> {
        if (this.diffTimeout <= 0) {
            // Don't risk returning a non-optimal diff if we have unlimited time.
            return None;
        }
        const longtext = text1.length > text2.length ? text1 : text2;
        const shorttext = text1.length > text2.length ? text2 : text1;
        if (longtext.length < 4 || shorttext.length * 2 < longtext.length) {
            return None; // Pointless.
        }

        // First check if the second quarter is the seed for a half-match.
        const hm1 = this.diffHalfMatchI(longtext, shorttext, Math.ceil(longtext.length / 4), this);
        // Check again based on the third quarter.
        const hm2 = this.diffHalfMatchI(longtext, shorttext, Math.ceil(longtext.length / 2), this);
        let hm!: string[];
        if (hm1.none && hm2.none) {
            return None;
        } else if (hm1.some && hm2.none) {
            hm = hm1.safeValue();
        } else if (hm2.some && hm1.none) {
            hm = hm2.safeValue();
        } else if (hm2.some && hm1.some) {
            // Both matched.  Select the longest.
            hm =
                hm1.safeValue()[4].length > hm2.safeValue()[4].length
                    ? hm1.safeValue()
                    : hm2.safeValue();
        }

        // A half-match was found, sort out the return data.
        let text1A;
        let text1B;
        let text2A;
        let text2B;
        if (text1.length > text2.length) {
            text1A = hm[0];
            text1B = hm[1];
            text2A = hm[2];
            text2B = hm[3];
        } else {
            text2A = hm[0];
            text2B = hm[1];
            text1A = hm[2];
            text1B = hm[3];
        }
        const midCommon = hm[4];
        return Some([text1A, text1B, text2A, text2B, midCommon] as [
            string,
            string,
            string,
            string,
            string
        ]);
    }

    /**
     * Does a substring of shorttext exist within longtext such that the substring
     * is at least half the length of longtext?
     * Closure, but does not reference any external constiables.
     * @param {string} longtext Longer string.
     * @param {string} shorttext Shorter string.
     * @param {number} i Start index of quarter length substring within longtext.
     * @return {Array.<string>} Five element Array, containing the prefix of
     *     longtext, the suffix of longtext, the prefix of shorttext, the suffix
     *     of shorttext and the common middle.  Or null if there was no match.
     * @private
     */
    private diffHalfMatchI(
        longtext: string,
        shorttext: string,
        i: number,
        dmp: DiffMatchPatch
    ): Option<[string, string, string, string, string]> {
        // Start with a 1/4 length substring at position i as a seed.
        const seed = longtext.substring(i, i + Math.floor(longtext.length / 4));
        let j = -1;
        let bestCommon = "";
        let bestLongtextA = "";
        let bestLongtextB = "";
        let bestShorttextA = "";
        let bestShorttextB = "";
        while ((j = shorttext.indexOf(seed, j + 1)) !== -1) {
            const prefixLength = dmp.diffCommonPrefix(
                longtext.substring(i),
                shorttext.substring(j)
            );
            const suffixLength = dmp.diffCommonSuffix(
                longtext.substring(0, i),
                shorttext.substring(0, j)
            );
            if (bestCommon.length < suffixLength + prefixLength) {
                bestCommon =
                    shorttext.substring(j - suffixLength, j) +
                    shorttext.substring(j, j + prefixLength);
                bestLongtextA = longtext.substring(0, i - suffixLength);
                bestLongtextB = longtext.substring(i + prefixLength);
                bestShorttextA = shorttext.substring(0, j - suffixLength);
                bestShorttextB = shorttext.substring(j + prefixLength);
            }
        }
        if (bestCommon.length * 2 >= longtext.length) {
            return Some([
                bestLongtextA,
                bestLongtextB,
                bestShorttextA,
                bestShorttextB,
                bestCommon
            ] as [string, string, string, string, string]);
        } else {
            return None;
        }
    }

    /**
     * Given two strings, compute a score representing whether the internal
     * boundary falls on logical boundaries.
     * Scores range from 6 (best) to 0 (worst).
     * Closure, but does not reference any external constiables.
     * @param {string} one First string.
     * @param {string} two Second string.
     * @return {number} The score.
     * @private
     */
    private diffCleanupSemanticScore(one: string, two: string): number {
        if (!one || !two) {
            // Edges are the best.
            return 6;
        }

        const nonAlphaNumericRegex_ = new RegExp("/[^a-zA-Z0-9]/");

        // Each port of this function behaves slightly differently due to
        // subtle differences in each language's definition of things like
        // 'whitespace'.  Since this function's purpose is largely cosmetic,
        // the choice has been made to use each language's native features
        // rather than force total conformity.
        const char1 = one.charAt(one.length - 1);
        const char2 = two.charAt(0);
        const nonAlphaNumeric1 = nonAlphaNumericRegex_.exec(char1);
        const nonAlphaNumeric2 = nonAlphaNumericRegex_.exec(char2);
        const whitespace1 = nonAlphaNumeric1 && char1.match(this._whitespaceRegex);
        const whitespace2 = nonAlphaNumeric2 && char2.match(this._whitespaceRegex);
        const lineBreak1 = whitespace1 && char1.match(this._linebreakRegex);
        const lineBreak2 = whitespace2 && char2.match(this._linebreakRegex);
        const blankLine1 = lineBreak1 && one.match(this._blanklineEndRegex);
        const blankLine2 = lineBreak2 && two.match(this._blanklineStartRegex);

        if (blankLine1 || blankLine2) {
            // Five points for blank lines.
            return 5;
        } else if (lineBreak1 || lineBreak2) {
            // Four points for line breaks.
            return 4;
        } else if (nonAlphaNumeric1 && !whitespace1 && whitespace2) {
            // Three points for end of sentences.
            return 3;
        } else if (whitespace1 || whitespace2) {
            // Two points for whitespace.
            return 2;
        } else if (nonAlphaNumeric1 || nonAlphaNumeric2) {
            // One point for non-alphanumeric.
            return 1;
        }
        return 0;
    }

    /**
     * Look for single edits surrounded on both sides by equalities
     * which can be shifted sideways to align the edit to a word boundary.
     * e.g: The c<ins>at c</ins>ame. -> The <ins>cat </ins>came.
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     */
    private diffCleanupSemanticLossless(diffs: DiffPair[]): void {
        let pointer = 1;
        // Intentionally ignore the first and last element (don't need checking).
        while (pointer < diffs.length - 1) {
            if (
                diffs[pointer - 1]![0] === DiffOp.EQUAL &&
                diffs[pointer + 1]![0] === DiffOp.EQUAL
            ) {
                // This is a single edit surrounded by equalities.
                let equality1 = diffs[pointer - 1]![1];
                let edit = diffs[pointer]![1];
                let equality2 = diffs[pointer + 1]![1];

                // First, shift the edit as far left as possible.
                const commonOffset = this.diffCommonSuffix(equality1, edit);
                if (commonOffset) {
                    const commonString = edit.substring(edit.length - commonOffset);
                    equality1 = equality1.substring(0, equality1.length - commonOffset);
                    edit = commonString + edit.substring(0, edit.length - commonOffset);
                    equality2 = commonString + equality2;
                }

                // Second, step character by character right, looking for the best fit.
                let bestEquality1 = equality1;
                let bestEdit = edit;
                let bestEquality2 = equality2;
                let bestScore =
                    this.diffCleanupSemanticScore(equality1, edit) +
                    this.diffCleanupSemanticScore(edit, equality2);
                while (edit.charAt(0) === equality2.charAt(0)) {
                    equality1 += edit.charAt(0);
                    edit = edit.substring(1) + equality2.charAt(0);
                    equality2 = equality2.substring(1);
                    const score =
                        this.diffCleanupSemanticScore(equality1, edit) +
                        this.diffCleanupSemanticScore(edit, equality2);
                    // The >= encourages trailing rather than leading whitespace on edits.
                    if (score >= bestScore) {
                        bestScore = score;
                        bestEquality1 = equality1;
                        bestEdit = edit;
                        bestEquality2 = equality2;
                    }
                }

                if (diffs[pointer - 1]![1] !== bestEquality1) {
                    // We have an improvement, save it back to the diff.
                    if (bestEquality1) {
                        diffs[pointer - 1]![1] = bestEquality1;
                    } else {
                        diffs.splice(pointer - 1, 1);
                        pointer--;
                    }
                    diffs[pointer]![1] = bestEdit;
                    if (bestEquality2) {
                        diffs[pointer + 1]![1] = bestEquality2;
                    } else {
                        diffs.splice(pointer + 1, 1);
                        pointer--;
                    }
                }
            }
            pointer++;
        }
    }

    /**
     * loc is a location in text1, compute and return the equivalent location in
     * text2.
     * e.g. 'The cat' vs 'The big cat', 1->1, 5->8
     * @param {!Array.<!diff_match_patch.Diff>} diffs Array of diff tuples.
     * @param {number} loc Location within text1.
     * @return {number} Location within text2.
     */
    private diffXIndex(diffs: DiffPair[], loc: number): number {
        let chars1 = 0;
        let chars2 = 0;
        let lastChars1 = 0;
        let lastChars2 = 0;
        let x;
        for (x = 0; x < diffs.length; x++) {
            if (diffs[x]![0] !== DiffOp.INSERT) {
                // Equality or deletion.
                chars1 += diffs[x]![1].length;
            }
            if (diffs[x]![0] !== DiffOp.DELETE) {
                // Equality or insertion.
                chars2 += diffs[x]![1].length;
            }
            if (chars1 > loc) {
                // Overshot the location.
                break;
            }
            lastChars1 = chars1;
            lastChars2 = chars2;
        }
        // Was the location was deleted?
        if (diffs.length !== x && diffs[x]![0] === DiffOp.DELETE) {
            return lastChars2;
        }
        // Add the remaining character length.
        return lastChars2 + (loc - lastChars1);
    }

    /**
     * Locate the best instance of 'pattern' in 'text' near 'loc'.
     * @param {string} text The text to search.
     * @param {string} pattern The pattern to search for.
     * @param {number} loc The location to search around.
     * @return {number} Best match index or -1.
     */
    private matchMain(text: string, pattern: string, loc: number): Result<number, StatusError> {
        loc = Math.max(0, Math.min(loc, text.length));
        if (text === pattern) {
            // Shortcut (potentially not guaranteed by the algorithm)
            return Ok(0);
        } else if (!text.length) {
            // Nothing to match.
            return Ok(-1);
        } else if (text.substring(loc, loc + pattern.length) === pattern) {
            // Perfect match at the perfect spot!  (Includes case of null pattern)
            return Ok(loc);
        } else {
            // Do a fuzzy compare.
            return this.matchBitap(text, pattern, loc);
        }
    }

    /**
     * Locate the best instance of 'pattern' in 'text' near 'loc' using the
     * Bitap algorithm.
     * @param {string} text The text to search.
     * @param {string} pattern The pattern to search for.
     * @param {number} loc The location to search around.
     * @return {number} Best match index or -1.
     * @private
     */
    private matchBitap(text: string, pattern: string, loc: number): Result<number, StatusError> {
        if (pattern.length > this.matchMaxBits) {
            return Err(InvalidArgumentError("Pattern too long for this browser."));
        }

        // Initialise the alphabet.
        const s = this.matchAlphabet(pattern);

        /**
         * Compute and return the score for a match with e errors and x location.
         * Accesses loc and pattern through being a closure.
         * @param {number} e Number of errors in match.
         * @param {number} x Location of match.
         * @return {number} Overall score for match (0.0 = good, 1.0 = bad).
         * @private
         */
        const matchBitapScore = (e: number, x: number): number => {
            const accuracy = e / pattern.length;
            const proximity = Math.abs(loc - x);
            if (!this.matchDistance) {
                // Dodge divide by zero error.
                return proximity ? 1.0 : accuracy;
            }
            return accuracy + proximity / this.matchDistance;
        };

        // Highest score beyond which we give up.
        let scoreThreshold = this.matchThreshold;
        // Is there a nearby exact match? (speedup)
        let bestLoc = text.indexOf(pattern, loc);
        if (bestLoc !== -1) {
            scoreThreshold = Math.min(matchBitapScore(0, bestLoc), scoreThreshold);
            // What about in the other direction? (speedup)
            bestLoc = text.lastIndexOf(pattern, loc + pattern.length);
            if (bestLoc !== -1) {
                scoreThreshold = Math.min(matchBitapScore(0, bestLoc), scoreThreshold);
            }
        }

        // Initialise the bit arrays.
        const matchmask = 1 << (pattern.length - 1);
        bestLoc = -1;

        let binMin;
        let binMid;
        let binMax = pattern.length + text.length;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let lastRd!: any[];
        for (let d = 0; d < pattern.length; d++) {
            // Scan for the best match; each iteration allows for one more error.
            // Run a binary search to determine how far from 'loc' we can stray at this
            // error level.
            binMin = 0;
            binMid = binMax;
            while (binMin < binMid) {
                if (matchBitapScore(d, loc + binMid) <= scoreThreshold) {
                    binMin = binMid;
                } else {
                    binMax = binMid;
                }
                binMid = Math.floor((binMax - binMin) / 2 + binMin);
            }
            // Use the result from this iteration as the maximum for the next.
            binMax = binMid;
            let start = Math.max(1, loc - binMid + 1);
            const finish = Math.min(loc + binMid, text.length) + pattern.length;

            const rd = Array(finish + 2);
            rd[finish + 1] = (1 << d) - 1;
            for (let j = finish; j >= start; j--) {
                // The alphabet (s) is a sparse hash, so the following line generates
                // warnings.
                const charMatch = s[text.charAt(j - 1)]!;
                if (d === 0) {
                    // First pass: exact match.
                    rd[j] = ((rd[j + 1] << 1) | 1) & charMatch;
                } else {
                    // Subsequent passes: fuzzy match.
                    rd[j] =
                        (((rd[j + 1] << 1) | 1) & charMatch) |
                        (((lastRd[j + 1] | lastRd[j]) << 1) | 1) |
                        lastRd[j + 1];
                }
                if (rd[j] & matchmask) {
                    const score = matchBitapScore(d, j - 1);
                    // This match will almost certainly be better than any existing match.
                    // But check anyway.
                    if (score <= scoreThreshold) {
                        // Told you so.
                        scoreThreshold = score;
                        bestLoc = j - 1;
                        if (bestLoc > loc) {
                            // When passing loc, don't exceed our current distance from loc.
                            start = Math.max(1, 2 * loc - bestLoc);
                        } else {
                            // Already passed loc, downhill from here on in.
                            break;
                        }
                    }
                }
            }
            // No hope for a (better) match at greater error levels.
            if (matchBitapScore(d + 1, loc) > scoreThreshold) {
                break;
            }
            lastRd = rd;
        }
        return Ok(bestLoc);
    }

    /**
     * Initialise the alphabet for the Bitap algorithm.
     * @param {string} pattern The text to encode.
     * @return {!Object} Hash of character locations.
     * @private
     */
    private matchAlphabet(pattern: string): Record<string, number> {
        const s: Record<string, number> = {};
        for (let i = 0; i < pattern.length; i++) {
            s[pattern.charAt(i)] = 0;
        }
        for (let i = 0; i < pattern.length; i++) {
            s[pattern.charAt(i)]! |= 1 << (pattern.length - i - 1);
        }
        return s;
    }

    /**
     * Increase the context until it is unique,
     * but don't let the pattern expand beyond Match_MaxBits.
     * @param {!diff_match_patch.PatchOperation} patch The patch to grow.
     * @param {string} text Source text.
     * @private
     */
    private patchAddContext(patch: PatchOperation, text: string): void {
        if (text.length === 0) {
            return;
        }
        let pattern = text.substring(patch.start2, patch.start2 + patch.length1);
        let padding = 0;

        // Look for the first and last matches of pattern in text.  If two different
        // matches are found, increase the pattern length.
        while (
            text.indexOf(pattern) !== text.lastIndexOf(pattern) &&
            pattern.length < this.matchMaxBits - this.patchMargin - this.patchMargin
        ) {
            padding += this.patchMargin;
            pattern = text.substring(
                patch.start2 - padding,
                patch.start2 + patch.length1 + padding
            );
        }
        // Add one chunk for good luck.
        padding += this.patchMargin;

        // Add the prefix.
        const prefix = text.substring(patch.start2 - padding, patch.start2);
        if (prefix) {
            patch.diffs.unshift([DiffOp.EQUAL, prefix]);
        }
        // Add the suffix.
        const suffix = text.substring(
            patch.start2 + patch.length1,
            patch.start2 + patch.length1 + padding
        );
        if (suffix) {
            patch.diffs.push([DiffOp.EQUAL, suffix]);
        }

        // Roll back the start points.
        patch.start1 -= prefix.length;
        patch.start2 -= prefix.length;
        // Extend the lengths.
        patch.length1 += prefix.length + suffix.length;
        patch.length2 += prefix.length + suffix.length;
    }

    /**
     * Given an array of patches, return another array that is identical.
     * @param {!Array.<!diff_match_patch.PatchOperation>} patches Array of Patch objects.
     * @return {!Array.<!diff_match_patch.PatchOperation>} Array of Patch objects.
     */
    private patchDeepCopy(patches: PatchOperation[]): PatchOperation[] {
        // Making deep copies is hard in JavaScript.
        const patchesCopy = [];
        for (let x = 0; x < patches.length; x++) {
            const patch = patches[x]!;
            const patchCopy = new PatchOperation();
            patchCopy.diffs = [];
            for (let y = 0; y < patch.diffs.length; y++) {
                patchCopy.diffs[y] = [patch.diffs[y]![0], patch.diffs[y]![1]];
            }
            patchCopy.start1 = patch.start1;
            patchCopy.start2 = patch.start2;
            patchCopy.length1 = patch.length1;
            patchCopy.length2 = patch.length2;
            patchesCopy[x] = patchCopy;
        }
        return patchesCopy;
    }

    /**
     * Add some padding on text start and end so that edges can match something.
     * Intended to be called only from within patch_apply.
     * @param {!Array.<!diff_match_patch.PatchOperation>} patches Array of Patch objects.
     * @return {string} The padding string added to each side.
     */
    private patchAddPadding(patches: PatchOperation[]): string {
        const paddingLength = this.patchMargin;
        let nullPadding = "";
        for (let x = 1; x <= paddingLength; x++) {
            nullPadding += String.fromCharCode(x);
        }

        // Bump all the patches forward.
        for (const patchElement of patches) {
            patchElement.start1 += paddingLength;
            patchElement.start2 += paddingLength;
        }

        // Add some padding on start of first diff.
        let patch = patches[0]!;
        let diffs = patch.diffs;
        if (diffs.length === 0 || diffs[0]![0] !== DiffOp.EQUAL) {
            // Add nullPadding equality.
            diffs.unshift([DiffOp.EQUAL, nullPadding]);
            patch.start1 -= paddingLength; // Should be 0.
            patch.start2 -= paddingLength; // Should be 0.
            patch.length1 += paddingLength;
            patch.length2 += paddingLength;
        } else if (paddingLength > diffs[0]![1].length) {
            // Grow first equality.
            const extraLength = paddingLength - diffs[0]![1].length;
            diffs[0]![1] = nullPadding.substring(diffs[0]![1].length) + diffs[0]![1];
            patch.start1 -= extraLength;
            patch.start2 -= extraLength;
            patch.length1 += extraLength;
            patch.length2 += extraLength;
        }

        // Add some padding on end of last diff.
        patch = patches[patches.length - 1]!;
        diffs = patch.diffs;
        if (diffs.length === 0 || diffs[diffs.length - 1]![0] !== DiffOp.EQUAL) {
            // Add nullPadding equality.
            diffs.push([DiffOp.EQUAL, nullPadding]);
            patch.length1 += paddingLength;
            patch.length2 += paddingLength;
        } else if (paddingLength > diffs[diffs.length - 1]![1].length) {
            // Grow last equality.
            const extraLength = paddingLength - diffs[diffs.length - 1]![1].length;
            diffs[diffs.length - 1]![1] += nullPadding.substring(0, extraLength);
            patch.length1 += extraLength;
            patch.length2 += extraLength;
        }

        return nullPadding;
    }

    /**
     * Look through the patches and break up any which are longer than the maximum
     * limit of the match algorithm.
     * Intended to be called only from within patch_apply.
     * @param {!Array.<!diff_match_patch.PatchOperation>} patches Array of Patch objects.
     */
    private patchSplitMax(patches: PatchOperation[]): void {
        const patchSize = this.matchMaxBits;
        for (let x = 0; x < patches.length; x++) {
            if (patches[x]!.length1 <= patchSize) {
                continue;
            }
            const bigpatch = patches[x]!;
            // Remove the big old patch.
            patches.splice(x--, 1);
            let start1 = bigpatch.start1;
            let start2 = bigpatch.start2;
            let precontext = "";
            while (bigpatch.diffs.length !== 0) {
                // Create one of several smaller patches.
                const patch = new PatchOperation();
                let empty = true;
                patch.start1 = start1 - precontext.length;
                patch.start2 = start2 - precontext.length;
                if (precontext !== "") {
                    patch.length1 = patch.length2 = precontext.length;
                    patch.diffs.push([DiffOp.EQUAL, precontext]);
                }
                while (
                    bigpatch.diffs.length !== 0 &&
                    patch.length1 < patchSize - this.patchMargin
                ) {
                    const diffType = bigpatch.diffs[0]![0];
                    let diffText = bigpatch.diffs[0]![1];
                    if (diffType === DiffOp.INSERT) {
                        // Insertions are harmless.
                        patch.length2 += diffText.length;
                        start2 += diffText.length;
                        patch.diffs.push(bigpatch.diffs.shift()!);
                        empty = false;
                    } else if (
                        diffType === DiffOp.DELETE &&
                        patch.diffs.length === 1 &&
                        patch.diffs[0]![0] === DiffOp.EQUAL &&
                        diffText.length > 2 * patchSize
                    ) {
                        // This is a large deletion.  Let it pass in one chunk.
                        patch.length1 += diffText.length;
                        start1 += diffText.length;
                        empty = false;
                        patch.diffs.push([diffType, diffText]);
                        bigpatch.diffs.shift();
                    } else {
                        // Deletion or equality.  Only take as much as we can stomach.
                        diffText = diffText.substring(
                            0,
                            patchSize - patch.length1 - this.patchMargin
                        );
                        patch.length1 += diffText.length;
                        start1 += diffText.length;
                        if (diffType === DiffOp.EQUAL) {
                            patch.length2 += diffText.length;
                            start2 += diffText.length;
                        } else {
                            empty = false;
                        }
                        patch.diffs.push([diffType, diffText]);
                        if (diffText === bigpatch.diffs[0]![1]) {
                            bigpatch.diffs.shift();
                        } else {
                            bigpatch.diffs[0]![1] = bigpatch.diffs[0]![1].substring(
                                diffText.length
                            );
                        }
                    }
                }
                // Compute the head context for the next patch.
                precontext = this.diffText2(patch.diffs);
                precontext = precontext.substring(precontext.length - this.patchMargin);
                // Append the end context for this patch.
                const postcontext = this.diffText1(bigpatch.diffs).substring(0, this.patchMargin);
                if (postcontext !== "") {
                    patch.length1 += postcontext.length;
                    patch.length2 += postcontext.length;
                    if (
                        patch.diffs.length !== 0 &&
                        patch.diffs[patch.diffs.length - 1]![0] === DiffOp.EQUAL
                    ) {
                        patch.diffs[patch.diffs.length - 1]![1] += postcontext;
                    } else {
                        patch.diffs.push([DiffOp.EQUAL, postcontext]);
                    }
                }
                if (!empty) {
                    patches.splice(++x, 0, patch);
                }
            }
        }
    }
}
