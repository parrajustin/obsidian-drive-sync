import { describe, it, expect, jest, afterEach } from "@jest/globals";
import type { Span } from "@opentelemetry/api";
import { trace } from "@opentelemetry/api";
import {
    setAttributeOnActiveSpan,
    setAttributesOnActiveSpan
} from "./set-attributes-on-active-span";

describe("set-attributes-on-active-span", () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("sets a single attribute on the active span", () => {
        const setAttribute = jest.fn();
        jest.spyOn(trace, "getActiveSpan").mockReturnValue({
            setAttribute
        } as unknown as Span);

        setAttributeOnActiveSpan("key", "value");

        expect(setAttribute).toHaveBeenCalledWith("key", "value");
    });

    it("sets multiple attributes on the active span", () => {
        const setAttributes = jest.fn();
        jest.spyOn(trace, "getActiveSpan").mockReturnValue({
            setAttributes
        } as unknown as Span);

        setAttributesOnActiveSpan({ a: 1, b: "two" });

        expect(setAttributes).toHaveBeenCalledWith({ a: 1, b: "two" });
    });

    it("does nothing when there is no active span", () => {
        jest.spyOn(trace, "getActiveSpan").mockReturnValue(undefined);

        expect(() => {
            setAttributeOnActiveSpan("key", "value");
            setAttributesOnActiveSpan({ a: 1 });
        }).not.toThrow();
    });
});
