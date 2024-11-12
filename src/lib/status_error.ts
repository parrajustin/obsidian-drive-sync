/** Status error enum codes. */
export enum ErrorCode {
    /** Not an error; returned on success. */
    OK,
    /** The operation was cancelled, typically by the caller. */
    CANCELLED,
    /** Unknown error. For example, this error may be returned when a Status value received from another address space belongs to an error space that is not known in this address space. Also errors raised by APIs that do not return enough error information may be converted to this error. */
    UNKNOWN,
    /** The client specified an invalid argument. Note that this differs from FAILED_PRECONDITION. INVALID_ARGUMENT indicates arguments that are problematic regardless of the state of the system (e.g., a malformed file name). */
    INVALID_ARGUMENT,
    /** The deadline expired before the operation could complete. For operations that change the state of the system, this error may be returned even if the operation has completed successfully. For example, a successful response from a server could have been delayed long */
    DEADLINE_EXCEEDED,
    /** Some requested entity (e.g., file or directory) was not found. Note to server developers: if a request is denied for an entire class of users, such as gradual feature rollout or undocumented allowlist, NOT_FOUND may be used. If a request is denied for some users within a class of users, such as user-based access control, PERMISSION_DENIED must be used. */
    NOT_FOUND,
    /** The entity that a client attempted to create (e.g., file or directory) already exists. */
    ALREADY_EXISTS,
    /** The caller does not have permission to execute the specified operation. PERMISSION_DENIED must not be used for rejections caused by exhausting some resource (use RESOURCE_EXHAUSTED instead for those errors). PERMISSION_DENIED must not be used if the caller can not be identified (use UNAUTHENTICATED instead for those errors). This error code does not imply the request is valid or the requested entity exists or satisfies other pre-conditions. */
    PERMISSION_DENIED,
    /** Some resource has been exhausted, perhaps a per-user quota, or perhaps the entire file system is out of space. */
    RESOURCE_EXHAUSTED,
    /** The operation was rejected because the system is not in a state required for the operation's execution. For example, the directory to be deleted is non-empty, an rmdir operation is applied to a non-directory, etc. Service implementors can use the following guidelines to decide between FAILED_PRECONDITION, ABORTED, and UNAVAILABLE: (a) Use UNAVAILABLE if the client can retry just the failing call. (b) Use ABORTED if the client should retry at a higher level (e.g., when a client-specified test-and-set fails, indicating the client should restart a read-modify-write sequence). (c) Use FAILED_PRECONDITION if the client should not retry until the system state has been explicitly fixed. E.g., if an "rmdir" fails because the directory is non-empty, FAILED_PRECONDITION should be returned since the client should not retry unless the files are deleted from the directory. */
    FAILED_PRECONDITION,
    /** The operation was aborted, typically due to a concurrency issue such as a sequencer check failure or transaction abort. See the guidelines above for deciding between FAILED_PRECONDITION, ABORTED, and UNAVAILABLE. */
    ABORTED,
    /** The operation was attempted past the valid range. E.g., seeking or reading past end-of-file. Unlike INVALID_ARGUMENT, this error indicates a problem that may be fixed if the system state changes. For example, a 32-bit file system will generate INVALID_ARGUMENT if asked to read at an offset that is not in the range [0,2^32-1], but it will generate OUT_OF_RANGE if asked to read from an offset past the current file size. There is a fair bit of overlap between FAILED_PRECONDITION and OUT_OF_RANGE. We recommend using OUT_OF_RANGE (the more specific error) when it applies so that callers who are iterating through a space can easily look for an OUT_OF_RANGE error to detect when they are done. */
    OUT_OF_RANGE,
    /** The operation is not implemented or is not supported/enabled in this service. */
    UNIMPLEMENTED,
    /** Internal errors. This means that some invariants expected by the underlying system have been broken. This error code is reserved for serious errors. */
    INTERNAL,
    /** The service is currently unavailable. This is most likely a transient condition, which can be corrected by retrying with a backoff. Note that it is not always safe to retry non-idempotent operations. */
    UNAVAILABLE,
    /** Unrecoverable data loss or corruption. */
    DATA_LOSS,
    /** The request does not have valid authentication credentials for the operation. */
    UNAUTHENTICATED
}

/** An error holder. */
export class StatusError {
    private readonly _stack!: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private readonly _additionalData = new Map<string, any>();

    constructor(
        /* The status error code. */
        public errorCode: ErrorCode,
        /* The attached message for the error. */
        public message: string,
        error?: Error
    ) {
        // const stackLines = (error ?? new Error()).stack!.split("\n");
        const stackLines = (error ?? new Error()).stack!.split("\n").slice(2);
        if (stackLines.length > 0 && stackLines[0]!.includes("StatusError")) {
            stackLines.shift();
        }

        this._stack = stackLines.join("\n");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    public setPayload(name: string, payload: any): this {
        this._additionalData.set(name, payload);
        return this;
    }

    public toString(): string {
        const data: string[] = [];
        for (const entry of this._additionalData.entries()) {
            data.push(`${entry[0]}: ${entry[1]}`);
        }
        return `[${new Date().toISOString()}] ${ErrorCode[this.errorCode]}: ${this.message} at stack:\n${this._stack}${data.length > 0 ? `\n\n[Additional Data:]\n ${data.join("\n")}` : ""}`;
    }

    public with(func: (error: StatusError) => void): this {
        func(this);
        return this;
    }
}

export function CancelledError(message: string): StatusError {
    return new StatusError(ErrorCode.CANCELLED, message);
}
export function UnknownError(message: string): StatusError {
    return new StatusError(ErrorCode.UNKNOWN, message);
}
export function InvalidArgumentError(message: string): StatusError {
    return new StatusError(ErrorCode.INVALID_ARGUMENT, message);
}
export function DeadlineExceededError(message: string): StatusError {
    return new StatusError(ErrorCode.DEADLINE_EXCEEDED, message);
}
export function NotFoundError(message: string): StatusError {
    return new StatusError(ErrorCode.NOT_FOUND, message);
}
export function AlreadyExistsError(message: string): StatusError {
    return new StatusError(ErrorCode.ALREADY_EXISTS, message);
}
export function PermissionDeniedError(message: string): StatusError {
    return new StatusError(ErrorCode.PERMISSION_DENIED, message);
}
export function ResourceExhaustedError(message: string): StatusError {
    return new StatusError(ErrorCode.RESOURCE_EXHAUSTED, message);
}
export function FailedPreconditionError(message: string): StatusError {
    return new StatusError(ErrorCode.FAILED_PRECONDITION, message);
}
export function AbortedError(message: string): StatusError {
    return new StatusError(ErrorCode.ABORTED, message);
}
export function OutOfRangeError(message: string): StatusError {
    return new StatusError(ErrorCode.OUT_OF_RANGE, message);
}
export function UnimplementedError(message: string): StatusError {
    return new StatusError(ErrorCode.UNIMPLEMENTED, message);
}
export function InternalError(message: string): StatusError {
    return new StatusError(ErrorCode.INTERNAL, message);
}
export function UnavailableError(message: string): StatusError {
    return new StatusError(ErrorCode.UNAVAILABLE, message);
}
export function DataLossError(message: string): StatusError {
    return new StatusError(ErrorCode.DATA_LOSS, message);
}
export function UnauthenticatedError(message: string): StatusError {
    return new StatusError(ErrorCode.UNAUTHENTICATED, message);
}
