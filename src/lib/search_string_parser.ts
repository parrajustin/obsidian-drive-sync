import type { Option } from "./option";

// state tokens
enum State {
    RESET = "RESET",
    IN_OPERAND = "IN_OPERAND",
    IN_TEXT = "IN_TEXT",
    SINGLE_QUOTE = "SINGLE_QUOTE",
    DOUBLE_QUOTE = "DOUBLE_QUOTE"
}

interface QuotePairMap {
    single: Record<number, boolean>;
    double: Record<number, boolean>;
}

export type TextTransformer = (text: string) => Option<{ key: string; value: string }>;
export interface ParseQuery {
    exclude: Record<string, string[]>;
    include: Record<string, string[]>;
}

/** Condition search string like "to:justin" */
export interface Conditions {
    /** The keyword of the condition. */
    keyword: string;
    /** The value of the condition. */
    value: string;
    /** If this condition is negated. */
    negated: boolean;
}

/** Pure text search string like "justin" or "-parra" */
interface TextSegment {
    /** The text segment. */
    text: string;
    /** If this text search is negated. */
    negated: boolean;
}

/** Gets the quote pair map for every char index in the stirng.  */
function GetQuotePairMap(str?: string) {
    if (str === undefined) {
        str = "";
    }
    const quotePairMap: QuotePairMap = { single: {}, double: {} };

    const prevQuote = { single: -1, double: -1 };
    let prevChar = "";
    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        if (char === undefined) {
            continue;
        }
        if (prevChar !== "\\") {
            if (char === '"') {
                if (prevQuote.double >= 0) {
                    quotePairMap.double[prevQuote.double] = true;
                    quotePairMap.double[i] = true;
                    prevQuote.double = -1;
                } else {
                    prevQuote.double = i;
                }
            } else if (char === "'") {
                if (prevQuote.single >= 0) {
                    quotePairMap.single[prevQuote.single] = true;
                    quotePairMap.single[i] = true;
                    prevQuote.single = -1;
                } else {
                    prevQuote.single = i;
                }
            }
        }
        prevChar = char;
    }

    return quotePairMap;
}

/**
 * SearchString is a parsed search string which allows you to fetch conditions
 * and text being searched.
 */
export class SearchString {
    /** If the underlying string has changed. */
    public isStringDirty = true;
    // To string cached value.
    private _string = "";

    /**
     * Not intended for public use. API could change.
     */
    private constructor(
        private _conditionArray: Conditions[],
        private _textSegments: TextSegment[]
    ) {}

    /**
     * @param {String} str to parse e.g. 'to:me -from:joe@acme.com foobar'.
     * @param {Array} transformTextToConditions Array of functions to transform text into conditions
     * @returns {SearchString} An instance of this class SearchString.
     */
    public static parse(str: string, transformTextToConditions: TextTransformer[] = []) {
        const conditionArray: Conditions[] = [];
        const textSegments: TextSegment[] = [];

        const addCondition = (key: string, value: string, negated: boolean) => {
            const arrayEntry = { keyword: key, value, negated };
            conditionArray.push(arrayEntry);
        };

        const addTextSegment = (text: string, negated: boolean) => {
            let hasTransform = false;
            transformTextToConditions.forEach((transform) => {
                const transformedValue = transform(text);
                if (transformedValue.some) {
                    addCondition(
                        transformedValue.safeValue().key,
                        transformedValue.safeValue().value,
                        negated
                    );
                    hasTransform = true;
                }
            });
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!hasTransform) {
                textSegments.push({ text, negated });
            }
        };

        let state = State.RESET;
        let currentOperand = "";
        let isNegated = false;
        let currentText = "";
        let quoteState = State.RESET;
        let prevChar = "";

        const performReset = () => {
            state = State.RESET;
            quoteState = State.RESET;
            currentOperand = "";
            currentText = "";
            isNegated = false;
            prevChar = "";
        };

        // Terminology, in this example: 'to:joe@acme.com'
        // 'to' is the operator
        // 'joe@acme.com' is the operand
        // 'to:joe@acme.com' is the condition

        // Possible states:
        const inText = () => state === State.IN_TEXT; // could be inside raw text or operator
        const inOperand = () => state === State.IN_OPERAND;
        const inSingleQuote = () => quoteState === State.SINGLE_QUOTE;
        const inDoubleQuote = () => quoteState === State.DOUBLE_QUOTE;
        const inQuote = () => inSingleQuote() || inDoubleQuote();

        const quotePairMap = GetQuotePairMap(str);

        // Iterate through all the chars of the string.
        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            if (char === undefined) {
                continue;
            }
            if (char === " ") {
                if (inOperand()) {
                    if (inQuote()) {
                        currentOperand += char;
                    } else {
                        addCondition(currentText, currentOperand, isNegated);
                        performReset();
                    }
                } else if (inText()) {
                    if (inQuote()) {
                        currentText += char;
                    } else {
                        addTextSegment(currentText, isNegated);
                        performReset();
                    }
                }
            } else if (char === "," && inOperand() && !inQuote()) {
                addCondition(currentText, currentOperand, isNegated);
                // No reset here because we are still evaluating operands for the same operator
                currentOperand = "";
            } else if (char === "-" && !inOperand() && !inText()) {
                isNegated = true;
            } else if (char === ":" && !inQuote()) {
                if (inOperand()) {
                    // If we're in an operand, just push the string on.
                    currentOperand += char;
                } else if (inText()) {
                    // Skip this char, move states into IN_OPERAND,
                    state = State.IN_OPERAND;
                }
            } else if (char === '"' && prevChar !== "\\" && !inSingleQuote()) {
                if (inDoubleQuote()) {
                    quoteState = State.RESET;
                } else if (quotePairMap.double[i] ?? false) {
                    quoteState = State.DOUBLE_QUOTE;
                } else if (inOperand()) {
                    currentOperand += char;
                } else {
                    currentText += char;
                }
            } else if (char === "'" && prevChar !== "\\" && !inDoubleQuote()) {
                if (inSingleQuote()) {
                    quoteState = State.RESET;
                } else if (quotePairMap.single[i] ?? false) {
                    quoteState = State.SINGLE_QUOTE;
                } else if (inOperand()) {
                    currentOperand += char;
                } else {
                    currentText += char;
                }
            } else if (char !== "\\") {
                // Regular character..
                if (inOperand()) {
                    currentOperand += char;
                } else {
                    currentText += char;
                    state = State.IN_TEXT;
                }
            }
            prevChar = char;
        }
        // End of string, add any last entries
        if (inText()) {
            addTextSegment(currentText, isNegated);
        } else if (inOperand()) {
            addCondition(currentText, currentOperand, isNegated);
        }

        return new SearchString(conditionArray, textSegments);
    }

    /**
     * @return {Array} conditions, may contain multiple conditions for a particular key.
     */
    public getConditionArray() {
        return this._conditionArray;
    }

    /**
     * @return {Object} map of conditions and includes a special key 'excludes'.
     *                  Excludes itself is a map of conditions which were negated.
     */
    public getParsedQuery(): ParseQuery {
        const parsedQuery: ParseQuery = { exclude: {}, include: {} };
        this._conditionArray.forEach((condition) => {
            if (condition.negated) {
                const array = parsedQuery.exclude[condition.keyword];
                if (array !== undefined) {
                    array.push(condition.value);
                } else {
                    parsedQuery.exclude[condition.keyword] = [condition.value];
                }
            } else {
                const array = parsedQuery.include[condition.keyword];
                if (array !== undefined) {
                    array.push(condition.value);
                } else {
                    parsedQuery.include[condition.keyword] = [condition.value];
                }
            }
        });
        return parsedQuery;
    }

    /**
     * @return {String} All text segments concateted together joined by a space.
     *                  If a text segment is negated, it is preceded by a `-`.
     */
    public getAllText() {
        return this._textSegments.length > 0
            ? this._textSegments.map(({ text, negated }) => (negated ? `-${text}` : text)).join(" ")
            : "";
    }

    /**
     * @return {Array} all text segment objects, negative or positive
     *                 e.g. { text: 'foobar', negated: false }
     */
    public getTextSegments() {
        return this._textSegments;
    }

    /**
     * Removes keyword-negated pair that matches inputted.
     * Only removes if entry has same keyword/negated combo.
     * @param {String} keywordToRemove Keyword to remove.
     * @param {Boolean} negatedToRemove Whether or not the keyword removed is negated.
     */
    public removeKeyword(keywordToRemove: string, negatedToRemove: boolean) {
        this._conditionArray = this._conditionArray.filter(
            ({ keyword, negated }) => keywordToRemove !== keyword || negatedToRemove !== negated
        );
        this.isStringDirty = true;
    }

    /**
     * Adds a new entry to search string. Does not dedupe against existing entries.
     * @param {String} keyword  Keyword to add.
     * @param {String} value    Value for respective keyword.
     * @param {Boolean} negated Whether or not keyword/value pair should be negated.
     */
    public addEntry(keyword: string, value: string, negated: boolean) {
        this._conditionArray.push({
            keyword,
            value,
            negated
        });
        this.isStringDirty = true;
    }

    /**
     * Removes an entry from the search string. If more than one entry with the same settings is found,
     * it removes the first entry matched.
     *
     * @param {String} keyword  Keyword to remove.
     * @param {String} value    Value for respective keyword.
     * @param {Boolean} negated Whether or not keyword/value pair is be negated.
     */
    public removeEntry(keyword: string, value: string, negated: boolean) {
        const index = this._conditionArray.findIndex((entry) => {
            return entry.keyword === keyword && entry.value === value && entry.negated === negated;
        });

        if (index === -1) return;

        this._conditionArray.splice(index, 1);
        this.isStringDirty = true;
    }

    /**
     * @return {SearchString} A new instance of this class based on current data.
     */
    public clone() {
        return new SearchString(this._conditionArray.slice(0), this._textSegments.slice(0));
    }

    /**
     * @return {String} Returns this instance synthesized to a string format.
     *                  Example string: `to:me -from:joe@acme.com foobar`
     */
    public toString() {
        if (this.isStringDirty) {
            // Group keyword, negated pairs as keys
            const conditionGroups: Record<string, string[]> = {};
            this._conditionArray.forEach(({ keyword, value, negated }) => {
                const negatedStr = negated ? "-" : "";
                const conditionGroupKey = `${negatedStr}${keyword}`;
                if (conditionGroups[conditionGroupKey]) {
                    conditionGroups[conditionGroupKey].push(value);
                } else {
                    conditionGroups[conditionGroupKey] = [value];
                }
            });
            // Build conditionStr
            let conditionStr = "";
            Object.keys(conditionGroups).forEach((conditionGroupKey) => {
                const values = conditionGroups[conditionGroupKey]!;
                const safeValues = values
                    .filter((v) => v)
                    .map((v) => {
                        let newV = "";
                        let shouldQuote = false;
                        for (const char of v) {
                            if (char === '"') {
                                newV += '\\"';
                            } else {
                                if (char === " " || char === ",") {
                                    shouldQuote = true;
                                }
                                newV += char;
                            }
                        }
                        return shouldQuote ? `"${newV}"` : newV;
                    });
                if (safeValues.length > 0) {
                    conditionStr += ` ${conditionGroupKey}:${safeValues.join(",")}`;
                }
            });
            this._string = `${conditionStr} ${this.getAllText()}`.trim();
            this.isStringDirty = false;
        }
        return this._string;
    }
}
