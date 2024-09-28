import { ConvertToUnknownError } from "../util";
import type { Result } from "./result";
import { Err, Ok } from "./result";
import { ErrorCode, StatusError } from "./status_error";

/** Wraps the given promise into a result type. No erros should be propogated. */
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
            .catch((e) => {
                let outputError: StatusError;
                if (e instanceof StatusError) {
                    outputError = e;
                } else if (e instanceof Error) {
                    outputError = new StatusError(
                        ErrorCode.UNKNOWN,
                        `${textForUnknown} [${e.message}]`,
                        e
                    );
                } else {
                    outputError = ConvertToUnknownError(textForUnknown)(e);
                }
                if (mutators !== undefined) {
                    for (const mutator of mutators) {
                        outputError.with(mutator);
                    }
                }
                resolve(Err(outputError));
            });
    });
}
