import type { SpanStatus } from "@opentelemetry/api";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { type StatusError } from "../../lib/status_error";
import type { Result } from "../../lib/result";

/**
 * Sets status on active span
 * @param status
 */
export const setSpanStatus = (status: SpanStatus) => {
    trace.getActiveSpan()?.setStatus(status);
};

/**
 * Sets span status to OK on active span
 * @param message
 */
export const setSpanOk = (message?: SpanStatus["message"]) => {
    setSpanStatus({ code: SpanStatusCode.OK, message });
};

/**
 * Sets span status to ERROR on active span
 * @param message
 */
export const setSpanError = (message?: SpanStatus["message"]) => {
    setSpanStatus({ code: SpanStatusCode.ERROR, message });
};

export function SetSpanStatusFromResult<T>(err: Result<T, StatusError>) {
    if (err.ok) {
        setSpanOk();
        return;
    }

    setSpanError(err.val.toString(/*printStack*/ false));
}
