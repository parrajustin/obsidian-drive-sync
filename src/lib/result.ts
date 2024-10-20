interface BaseResult<T, E> {
    /** `true` when the result is Ok */ readonly ok: boolean;
    /** `true` when the result is Err */ readonly err: boolean;

    /**
     * Returns the contained `Ok` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    unwrapOr<T2>(val: T2): T | T2;

    /**
     * Returns the contained `Ok` value.
     * Because this function may throw, its use is generally discouraged.
     * Instead, prefer to handle the `Err` case explicitly.
     *
     * Throws if the value is an `Err`, with a message provided by the `Err`'s value.
     */
    unsafeUnwrap(): T;

    /**
     * Calls `mapper` if the result is `Ok`, otherwise returns the `Err` value of self.
     * This function can be used for control flow based on `Result` values.
     */
    andThen<T2>(mapper: (val: T) => Ok<T2>): Result<T2, E>;
    andThen<E2>(mapper: (val: T) => Err<E2>): Result<T, E | E2>;
    andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E | E2>;
    andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E | E2>;

    /**
     * Maps a `Result<T, E>` to `Result<U, E>` by applying a function to a contained `Ok` value,
     * leaving an `Err` value untouched.
     *
     * This function can be used to compose the results of two functions.
     */
    map<U>(mapper: (val: T) => U): Result<U, E>;

    /**
     * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a contained `Err` value,
     * leaving an `Ok` value untouched.
     *
     * This function can be used to pass through a successful result while handling an error.
     */
    mapErr<F>(mapper: (val: E) => F): Result<T, F>;
}

/**
 * Contains the error value
 */
export class ErrImpl<E> implements BaseResult<never, E> {
    /** An empty Err */
    static readonly empty = new ErrImpl<void>(undefined);

    readonly ok!: false;
    readonly err!: true;
    readonly val!: E;

    constructor(val: E) {
        if (!(this instanceof ErrImpl)) {
            return new ErrImpl(val);
        }

        this.ok = false;
        this.err = true;
        this.val = val;
    }

    /**
     * Returns the contained `Ok` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    public unwrapOr<T2>(val: T2): T2 {
        return val;
    }

    /**
     * Returns the contained `Ok` value.
     * Because this function may throw, its use is generally discouraged.
     * Instead, prefer to handle the `Err` case explicitly.
     *
     * Throws if the value is an `Err`, with a message provided by the `Err`'s value.
     */
    public unsafeUnwrap(): never {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Error UnsafeUnwrap "${this.val}"`);
    }

    /**
     * Maps a `Result<T, E>` to `Result<U, E>` by applying a function to a contained `Ok` value,
     * leaving an `Err` value untouched.
     *
     * This function can be used to compose the results of two functions.
     */
    public map(): Err<E> {
        return this;
    }

    /**
     * Calls `mapper` if the result is `Ok`, otherwise returns the `Err` value of self.
     * This function can be used for control flow based on `Result` values.
     */
    public andThen(): Err<E> {
        return this;
    }

    /**
     * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a contained `Err` value,
     * leaving an `Ok` value untouched.
     *
     * This function can be used to pass through a successful result while handling an error.
     */
    public mapErr<E2>(mapper: (err: E) => E2): Err<E2> {
        return Err(mapper(this.val));
    }
}

// This allows Err to be callable - possible because of the es5 compilation target
export function Err<T>(val: T): ErrImpl<T> {
    return new ErrImpl<T>(val);
}
export type Err<E> = ErrImpl<E>;

/**
 * Contains the success value
 */
export class OkImpl<T> implements BaseResult<T, never> {
    static readonly empty = new OkImpl<undefined>(undefined);

    readonly ok!: true;
    readonly err!: false;
    readonly val!: T;

    constructor(val: T) {
        if (!(this instanceof OkImpl)) {
            return new OkImpl(val);
        }

        this.ok = true;
        this.err = false;
        this.val = val;
    }

    /**
     * Returns the contained `Ok` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    public unwrapOr(): T {
        return this.val;
    }

    /**
     * Returns the contained `Ok` value.
     * Because this function may throw, its use is generally discouraged.
     * Instead, prefer to handle the `Err` case explicitly.
     *
     * Throws if the value is an `Err`, with a message provided by the `Err`'s value.
     */
    public unsafeUnwrap(): T {
        return this.val;
    }

    /**
     * Maps a `Result<T, E>` to `Result<U, E>` by applying a function to a contained `Ok` value,
     * leaving an `Err` value untouched.
     *
     * This function can be used to compose the results of two functions.
     */
    public map<T2>(mapper: (val: T) => T2): Ok<T2> {
        return Ok(mapper(this.val));
    }

    /**
     * Calls `mapper` if the result is `Ok`, otherwise returns the `Err` value of self.
     * This function can be used for control flow based on `Result` values.
     */
    public andThen<T2>(mapper: (val: T) => Ok<T2>): Ok<T2>;
    public andThen<E2>(mapper: (val: T) => Err<E2>): Result<T, E2>;
    public andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E2>;
    public andThen<T2, E2>(mapper: (val: T) => Result<T2, E2>): Result<T2, E2> {
        return mapper(this.val);
    }

    /**
     * Maps a `Result<T, E>` to `Result<T, F>` by applying a function to a contained `Err` value,
     * leaving an `Ok` value untouched.
     *
     * This function can be used to pass through a successful result while handling an error.
     */
    public mapErr(): Ok<T> {
        return this;
    }

    /**
     * Returns the contained `Ok` value, but never throws.
     * Unlike `unwrap()`, this method doesn't throw and is only callable on an Ok<T>
     *
     * Therefore, it can be used instead of `unwrap()` as a maintainability safeguard
     * that will fail to compile if the error type of the Result is later changed to an error that can actually occur.
     *
     * (this is the `into_ok()` in rust)
     */
    public safeUnwrap(): T {
        return this.val;
    }
}

// This allows Ok to be callable - possible because of the es5 compilation target
// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
export function Ok<T>(val: T = undefined as any): OkImpl<T> {
    return new OkImpl<T>(val);
}
export type Ok<T> = OkImpl<T>;

export type Result<T, E> = Ok<T> | Err<E>;
/** A special type of result where we don't care about the ok result but just that it is ok or err. */
export type StatusResult<E> = Result<unknown, E>;

export function IsResult<T, E>(val: unknown): val is Result<T, E> {
    return val instanceof ErrImpl || val instanceof OkImpl;
}

/**
 * Checks if a result is an Ok.
 * @param val
 * @returns true if val is Ok.
 */
// deno-lint-ignore no-explicit-any
export function IsOk<T>(val: unknown): val is Ok<T> {
    return IsResult(val) && val.ok;
}

// deno-lint-ignore no-explicit-any
export function IsErr(val: unknown): val is Err<unknown> {
    return IsResult(val) && val.err;
}

// deno-lint-ignore no-explicit-any
export function IsErrWithError<E>(val: unknown, error: E): val is ErrImpl<E> {
    return IsResult(val) && val.err && val.val === error;
}
