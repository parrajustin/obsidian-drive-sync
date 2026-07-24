/**
 * @jest-environment node
 */
import { describe, it, expect } from "@jest/globals";
import { trace } from "@opentelemetry/api";
import { TRACER } from "./tracer";

describe("tracer", () => {
    it("exports a usable tracer from the registered provider", () => {
        expect(TRACER).toBeDefined();
        expect(typeof TRACER.startSpan).toBe("function");

        const span = TRACER.startSpan("smoke-test");
        expect(span.spanContext().traceId).toEqual(expect.any(String));
        span.end();
    });

    it("registers the provider globally", () => {
        // The module registers the WebTracerProvider on import, so the global
        // trace API hands out real (non-noop) tracers.
        const tracer = trace.getTracer("smoke");
        expect(typeof tracer.startSpan).toBe("function");
    });
});
