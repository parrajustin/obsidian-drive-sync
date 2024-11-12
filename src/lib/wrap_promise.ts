import { ConvertToUnknownError } from "../util";
import type { Result } from "./result";
import { Err, Ok } from "./result";
import { ErrorCode, StatusError } from "./status_error";

/** Wraps the given promise into a result type. No errors should be propogated. */
export async function WrapPromise<TInput>(
    promise: Promise<TInput>,
    textForUnknown: string,
    ...mutators: ((error: StatusError) => void)[]
): Promise<Result<TInput, StatusError>> {
    return new Promise<Result<TInput, StatusError>>((resolve) => {
        promise
            .then((v) => {
                resolve(Ok(v));
            })
            .catch((e: unknown) => {
                let outputError: StatusError;
                if (e instanceof StatusError) {
                    outputError = e;
                } else if (e instanceof Error) {
                    outputError = new StatusError(
                        ErrorCode.UNKNOWN,
                        `${textForUnknown} [${e.message}]`,
                        e
                    );
                    outputError.setPayload("error", e);
                } else {
                    outputError = ConvertToUnknownError(textForUnknown)(e);
                }
                for (const mutator of mutators) {
                    outputError.with(mutator);
                }
                resolve(Err(outputError));
            });
    });
}
