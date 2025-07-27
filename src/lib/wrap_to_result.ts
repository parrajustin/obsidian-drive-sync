import type { Result } from "./result";
import { Err, ErrImpl, Ok } from "./result";
import { ConvertToUnknownError } from "../util";
import { ErrorCode, StatusError } from "./status_error";

/**
 * Wraps a function that may possibly throw an error in a `Result`.
 * @param func function that may throw an error
 * @param textForUnknown Text for when an unknown error comes up.
 * @param mutators Makes changes to the error.
 * @returns
 */
export function WrapToResult<T>(
    func: () => T,
    textForUnknown: string,
    ...mutators: ((error: StatusError) => void)[]
): Result<T, StatusError> {
    try {
        return Ok(func());
    } catch (e) {
        let outputError: StatusError;
        if (e instanceof ErrImpl) {
            if (e.val instanceof StatusError) {
                outputError = e.val;
            } else {
                outputError = new StatusError(ErrorCode.UNKNOWN, textForUnknown);
                outputError.setPayload("original_error", e.val);
            }
        } else if (e instanceof StatusError) {
            outputError = e;
        } else if (e instanceof Error) {
            outputError = new StatusError(ErrorCode.UNKNOWN, `${textForUnknown} [${e.message}]`, e);
            outputError.setPayload("error", e);
        } else {
            outputError = ConvertToUnknownError(textForUnknown)(e);
        }
        for (const mutator of mutators) {
            outputError.with(mutator);
        }
        return Err(outputError);
    }
}
