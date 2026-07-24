import { describe, expect, it } from "@jest/globals";
import { CreateExternallyResolvablePromise } from "./external_promise";
import { UnknownError } from "standard-ts-lib/src/status_error";

describe("external_promise", () => {
    it("should resolve the promise externally", async () => {
        const { promise, resolve } = CreateExternallyResolvablePromise<string>();
        resolve("foo");
        const val = await promise;
        expect(val).toBe("foo");
    });

    it("should reject the promise externally", async () => {
        const { promise, reject } = CreateExternallyResolvablePromise<string>();
        const err = UnknownError("failed");
        reject(err);
        let caught: any;
        try {
            await promise;
        } catch (e) {
            caught = e;
        }
        expect(caught).toBe(err);
    });
});
