import { context, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import type { SpanOptions as OTELSpanOptions, Span } from "@opentelemetry/api";
import { TRACER } from "./tracer";
import { IS_TEST_ENV } from "../../constants";

export interface SpanOptions extends OTELSpanOptions {
    /**
     * If true, the span will be a root span, even if there is a parent span.
     * Useful for message handlers.
     */
    newContext?: boolean;
}

/**
 * Starts an active span.
 * @param name
 * @param fn
 * @param options
 */
export function StartActiveSpan<T>(
    name: string,
    fn: (parentSpan: Span) => T,
    options?: SpanOptions
): T {
    const tracer = TRACER;
    const parentContext = context.active();
    const currentSpan = tracer.startSpan(
        name,
        options,
        options?.newContext === true ? ROOT_CONTEXT : context.active()
    );

    return context.with(trace.setSpan(parentContext, currentSpan), fn, undefined, currentSpan);
}

/**
 * Decorator to start a span around a method.
 * To avoid less clutter within methods, this decorator can be used instead of startSpan.
 * The span naT extends any extends anye will be ClassName::methodName if no name is provided.
 * @example
 * ```typescript
 *  class MyClass {
 *    @span('my-method', { myAttribute: 'myValue' })
 *    myMethod() {
 *    // do something
 *    }
 *   }
 * ```
 * @example
 * ```typescript
 *  class MyClass {
 *    @span()
 *    myMethod() {
 *      // do something
 *    }
 *   }
 * ```
 * @param options
 */
export function Span(options?: SpanOptions): MethodDecorator;
/**
 * Decorator to start a span around a method.
 * To avoid less clutter within methods, this decorator can be used instead of startSpan.
 * The span name will be ClassName::methodName if no name is provided.
 * @example
 * ```typescript
 *  class MyClass {
 *    @span('my-method', { myAttribute: 'myValue' })
 *    myMethod() {
 *    // do something
 *    }
 *   }
 * ```
 * @example
 * ```typescript
 *  class MyClass {
 *    @span()
 *    myMethod() {
 *      // do something
 *    }
 *   }
 * ```
 */
export function Span(name?: string, options?: SpanOptions): MethodDecorator;
export function Span(nameOrOptions?: string | SpanOptions, options?: SpanOptions): MethodDecorator {
    return (_target: unknown, _propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const name = typeof nameOrOptions === "string" ? nameOrOptions : undefined;

        if (typeof nameOrOptions === "object") {
            options = nameOrOptions;
        }

        let spanName = name ?? String(_propertyKey);
        if (name === undefined) {
            const className = String(_target?.constructor.name);
            if (className !== "") {
                spanName = className + "::" + spanName;
            }
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const originalMethod = descriptor.value;

        descriptor.value = function (...args: unknown[]) {
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (TRACER === undefined) {
                // OTEL is disabled. Probably running in a test environment.
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                return originalMethod.apply(this, args);
            }

            if (IS_TEST_ENV) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                return originalMethod.apply(this, args);
            }

            return StartActiveSpan(
                spanName,
                (span) => {
                    let result: unknown;
                    try {
                        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                        result = originalMethod.apply(this, args);
                        if (result instanceof Promise) {
                            return result.finally(() => {
                                span.end();
                            });
                        }

                        return result;
                    } finally {
                        if (!(result instanceof Promise)) {
                            span.end();
                        }
                    }
                },
                options ?? {}
            );
        };

        return descriptor;
    };
}
