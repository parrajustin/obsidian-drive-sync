import { describe, expect, jest, it, beforeEach } from "@jest/globals";

describe("watcher", () => {
    let mockApp: any;
    let originalHandler: any;

    beforeEach(() => {
        // Reset ORIGINAL_OBISDIAN_HANDLER logic using isolateModules
        jest.isolateModules(() => {
            originalHandler = jest.fn((_type, _path, _oldPath, _info) => "result");
            mockApp = {
                vault: {
                    adapter: {
                        handler: originalHandler
                    }
                }
            };
        });
    });

    it("should add a watch handler and call it via queueMicrotask", async () => {
        // unused addedHandler
        const { AddWatchHandler } = require("./watcher");

        const watcher = jest.fn();
        const unsub = AddWatchHandler(mockApp, watcher);

        // the original handler should have been replaced
        expect(mockApp.vault.adapter.handler).not.toBe(originalHandler);

        const res = mockApp.vault.adapter.handler("modify", "path/to/file", "", null);
        expect(res).toBe("result");
        expect(originalHandler).toHaveBeenCalledWith("modify", "path/to/file", "", null);

        // wait for queueMicrotask
        await Promise.resolve();

        expect(watcher).toHaveBeenCalledWith("modify", "path/to/file", "", null);

        unsub();

        mockApp.vault.adapter.handler("modify", "path2", "", null);
        await Promise.resolve();
        // Should not have been called a second time
        expect(watcher).toHaveBeenCalledTimes(1);
    });

    it("should only replace the handler once", () => {
        const { AddWatchHandler } = require("./watcher");

        const watcher1 = jest.fn();
        const watcher2 = jest.fn();

        AddWatchHandler(mockApp, watcher1);
        const replacedHandler = mockApp.vault.adapter.handler;

        AddWatchHandler(mockApp, watcher2);
        expect(mockApp.vault.adapter.handler).toBe(replacedHandler);
    });
});
