import type { Result } from "./result";
import { Err, Ok } from "./result";

/** Wraps the given promise into a result type. No erros should be propogated. */
export async function WrapPromise<TInput, TError = unknown>(
    promise: Promise<TInput>
): Promise<Result<TInput, TError>> {
    return new Promise<Result<TInput, TError>>((resolve) => {
        promise
            .then((v) => {
                resolve(Ok(v));
            })
            .catch((e) => {
                resolve(Err(e));
            });
    });
}
