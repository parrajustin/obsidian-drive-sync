import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import type { Context, Span as OtelSpan, Tracer } from "@opentelemetry/api";
import { ROOT_CONTEXT, context } from "@opentelemetry/api";
import { Span, StartActiveSpan } from "./span.decorator";

// Mutable state read lazily by the module mocks below.
let isTestEnv = false;
let mockTracer: Tracer | undefined;
let lastSpan: { end: jest.Mock; setAttribute: jest.Mock } | undefined;

jest.mock("../../constants", () => ({
    get IS_TEST_ENV() {
        return isTestEnv;
    }
}));

jest.mock("./tracer", () => ({
    get TRACER() {
        return mockTracer;
    }
}));

function MakeTracer(): { tracer: Tracer; startSpan: jest.Mock } {
    const startSpan = jest.fn((_name: string, _options?: unknown, _context?: Context) => {
        lastSpan = { end: jest.fn(), setAttribute: jest.fn() };
        return lastSpan as unknown as OtelSpan;
    });
    return { tracer: { startSpan } as unknown as Tracer, startSpan };
}

describe("StartActiveSpan", () => {
    let startSpan: jest.Mock;

    beforeEach(() => {
        isTestEnv = false;
        lastSpan = undefined;
        const made = MakeTracer();
        mockTracer = made.tracer;
        startSpan = made.startSpan;
    });

    it("runs the callback with the created span and returns its result", () => {
        const result = StartActiveSpan("my-span", (span) => {
            expect(span).toBe(lastSpan);
            return 42;
        });

        expect(result).toBe(42);
        expect(startSpan).toHaveBeenCalledTimes(1);
        expect(startSpan.mock.calls[0]![0]).toBe("my-span");
    });

    it("uses the root context when newContext is requested", () => {
        StartActiveSpan("root-span", () => undefined, { newContext: true });

        expect(startSpan.mock.calls[0]![2]).toBe(ROOT_CONTEXT);
    });

    it("uses the active context by default", () => {
        StartActiveSpan("child-span", () => undefined, {});

        expect(startSpan.mock.calls[0]![2]).toBe(context.active());
    });
});

describe("Span decorator", () => {
    let startSpan: jest.Mock;

    beforeEach(() => {
        isTestEnv = false;
        lastSpan = undefined;
        const made = MakeTracer();
        mockTracer = made.tracer;
        startSpan = made.startSpan;
    });

    class TestClass {
        @Span()
        public double(value: number): number {
            return value * 2;
        }

        @Span("custom-name")
        public named(): string {
            return "named-result";
        }

        @Span({ newContext: true })
        public withOptions(): string {
            return "options-result";
        }

        @Span()
        public throws(): never {
            throw new Error("sync failure");
        }

        @Span()
        public async resolves(value: string): Promise<string> {
            return value;
        }

        @Span()
        public async rejects(): Promise<never> {
            return Promise.reject(new Error("async failure"));
        }
    }

    it("wraps a sync method, names the span ClassName::method and ends it", () => {
        const instance = new TestClass();

        expect(instance.double(21)).toBe(42);

        expect(startSpan).toHaveBeenCalledTimes(1);
        expect(startSpan.mock.calls[0]![0]).toBe("TestClass::double");
        expect(lastSpan!.end).toHaveBeenCalledTimes(1);
    });

    it("uses the provided span name", () => {
        const instance = new TestClass();

        expect(instance.named()).toBe("named-result");
        expect(startSpan.mock.calls[0]![0]).toBe("custom-name");
    });

    it("accepts options as the first argument", () => {
        const instance = new TestClass();

        expect(instance.withOptions()).toBe("options-result");
        expect(startSpan.mock.calls[0]![0]).toBe("TestClass::withOptions");
        expect(startSpan.mock.calls[0]![2]).toBe(ROOT_CONTEXT);
    });

    it("ends the span even when the sync method throws", () => {
        const instance = new TestClass();

        expect(() => instance.throws()).toThrow("sync failure");
        expect(lastSpan!.end).toHaveBeenCalledTimes(1);
    });

    it("ends the span after an async method resolves", async () => {
        const instance = new TestClass();

        const pending = instance.resolves("done");
        // The span only ends once the promise settles.
        expect(lastSpan!.end).not.toHaveBeenCalled();

        await expect(pending).resolves.toBe("done");
        expect(lastSpan!.end).toHaveBeenCalledTimes(1);
    });

    it("ends the span after an async method rejects", async () => {
        const instance = new TestClass();

        await expect(instance.rejects()).rejects.toThrow("async failure");
        expect(lastSpan!.end).toHaveBeenCalledTimes(1);
    });

    it("invokes the method directly when the tracer is unavailable", () => {
        mockTracer = undefined;
        const instance = new TestClass();

        expect(instance.double(2)).toBe(4);
        expect(startSpan).not.toHaveBeenCalled();
    });

    it("invokes the method directly in a test environment", () => {
        isTestEnv = true;
        const instance = new TestClass();

        expect(instance.double(3)).toBe(6);
        expect(startSpan).not.toHaveBeenCalled();
    });
});
