import type { StatusError } from "./status_error";

/**
 * Creates a promise that can be resolved externally.
 * @returns
 */
export function CreateExternallyResolvablePromise<T>(): {
    promise: Promise<T>;
    resolve: (arg: T | PromiseLike<T>) => void;
    reject: (error: StatusError) => void;
} {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let func: (arg: T | PromiseLike<T>) => void = () => {};
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let err: (error: StatusError) => void = () => {};
    const promise = new Promise<T>((resolve, reject) => {
        func = resolve;
        err = reject;
    });
    return { promise, resolve: func, reject: err };
}
