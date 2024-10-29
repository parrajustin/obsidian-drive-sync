interface BaseOption<T> {
    /** `true` when the Option is Some */ readonly some: boolean;
    /** `true` when the Option is None */ readonly none: boolean;

    /**
     * Returns the contained `Some` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    valueOr<T2>(val: T2): T | T2;

    /**
     * Calls `mapper` if the Option is `Some`, otherwise returns `None`.
     * This function can be used for control flow based on `Option` values.
     */
    andThen<T2>(mapper: ((val: T) => Option<T2>) | ((val: T) => T2)): Option<T2>;

    /**
     * Maps an `Option<T>` to `Option<U>` by applying a function to a contained `Some` value,
     * leaving a `None` value untouched.
     *
     * This function can be used to compose the Options of two functions.
     */
    map<U>(mapper: (val: T) => U): Option<U>;

    /** Checks if both options are the same. */
    equals<U>(other: Option<U>): boolean;

    clone(): BaseOption<T>;
}

/**
 * Contains the None value
 */
export class NoneImpl implements BaseOption<never> {
    readonly some = false;
    readonly none = true;

    /**
     * Returns the contained `Some` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    public valueOr<T2>(val: T2): T2 {
        return val;
    }

    /**
     * Maps an `Option<T>` to `Option<U>` by applying a function to a contained `Some` value,
     * leaving a `None` value untouched.
     *
     * This function can be used to compose the Options of two functions.
     */
    public map(_mapper: unknown): None {
        return this;
    }

    /**
     * Calls `mapper` if the Option is `Some`, otherwise returns `None`.
     * This function can be used for control flow based on `Option` values.
     */
    public andThen(_op: unknown): None {
        return this;
    }

    public equals<T>(other: Option<T>): boolean {
        if (other instanceof NoneImpl) {
            return true;
        }
        return false;
    }

    public clone() {
        return None;
    }
}

// Export None as a singleton, then freeze it so it can't be modified
// eslint-disable-next-line @typescript-eslint/naming-convention
export const None = new NoneImpl();
export type None = NoneImpl;
Object.freeze(None);

/**
 * Contains the success value
 */
export class SomeImpl<T> implements BaseOption<T> {
    readonly some!: true;
    readonly none!: false;
    readonly val!: T;

    constructor(val: T) {
        if (!(this instanceof SomeImpl)) {
            return new SomeImpl(val);
        }

        this.some = true;
        this.none = false;
        this.val = val;
    }

    /**
     * Returns the contained `Some` value or a provided default.
     *
     *  (This is the `unwrap_or` in rust)
     */
    public valueOr(_val: unknown): T {
        return this.val;
    }

    /**
     * Maps an `Option<T>` to `Option<U>` by applying a function to a contained `Some` value,
     * leaving a `None` value untouched.
     *
     * This function can be used to compose the Options of two functions.
     */
    public map<T2>(mapper: (val: T) => T2): Some<T2> {
        return Some(mapper(this.val));
    }

    /**
     * Calls `mapper` if the Option is `Some`, otherwise returns `None`.
     * This function can be used for control flow based on `Option` values.
     */
    public andThen<T2>(mapper: ((val: T) => Option<T2>) | ((val: T) => T2)): Option<T2> {
        const result = mapper(this.val);
        if (result instanceof SomeImpl || result instanceof NoneImpl) {
            return result;
        }
        return Some(result);
    }

    /**
     * Returns the contained `Some` value, but never throws.
     * Unlike `unwrap()`, this method doesn't throw and is only callable on an Some<T>
     *
     * Therefore, it can be used instead of `unwrap()` as a maintainability safeguard
     * that will fail to compile if the type of the Option is later changed to a None that can actually occur.
     *
     * (this is the `into_Some()` in rust)
     */
    public safeValue(): T {
        return this.val;
    }

    public equals(other: Option<unknown>): boolean {
        if (other instanceof NoneImpl) {
            return false;
        }
        return other.safeValue() === this.val;
    }

    public clone() {
        return Some(this.val);
    }
}

// This allows Some to be callable - possible because of the es5 compilation target
export function Some<T>(val: T): SomeImpl<T> {
    return new SomeImpl<T>(val);
}
export type Some<T> = SomeImpl<T>;

export type Option<T> = Some<T> | None;

export function IsOption<T = unknown>(value: unknown): value is Option<T> {
    return value instanceof SomeImpl || value === None;
}

export function WrapOptional<T = unknown>(value: T | null | undefined): Option<T> {
    if (value === undefined) {
        return None;
    }
    if (value === null) {
        return None;
    }
    return Some(value);
}
