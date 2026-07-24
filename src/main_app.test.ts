import { describe, expect, test } from "@jest/globals";
import { SetThisApp, THIS_APP } from "./main_app";
import type { MainAppType } from "./main_app";

describe("main_app", () => {
    test("THIS_APP starts as None", () => {
        expect(THIS_APP.none).toBe(true);
    });

    test("SetThisApp stores the app as Some", () => {
        const app = { manifest: { id: "obsidian-drive-sync" } } as unknown as MainAppType;
        SetThisApp(app);
        expect(THIS_APP.some).toBe(true);
        if (THIS_APP.some) {
            expect(THIS_APP.safeValue()).toBe(app);
        }
    });

    test("SetThisApp replaces a previously set app", () => {
        const replacement = { manifest: { id: "replacement" } } as unknown as MainAppType;
        SetThisApp(replacement);
        expect(THIS_APP.some).toBe(true);
        if (THIS_APP.some) {
            expect(THIS_APP.safeValue()).toBe(replacement);
        }
    });
});
