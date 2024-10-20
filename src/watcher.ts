import type { App } from "obsidian";
import type { HandlerFunc } from "./types";

export type UnsubFunc = () => void;

const WATCHERS = new Set<HandlerFunc>();
let ORIGINAL_OBISDIAN_HANDLER: HandlerFunc | undefined = undefined;

function ReplaceHandler(app: App) {
    if (ORIGINAL_OBISDIAN_HANDLER !== undefined) {
        return;
    }
    ORIGINAL_OBISDIAN_HANDLER = app.vault.adapter.handler;
    app.vault.adapter.handler = (type, path, oldPath, info) => {
        const result = ORIGINAL_OBISDIAN_HANDLER!(type, path, oldPath, info);
        for (const watcher of WATCHERS) {
            queueMicrotask(() => {
                watcher(type, path, oldPath, info);
            });
        }
        return result;
    };
}

/** Add a handler that watches for file changes.  */
export function AddWatchHandler(app: App, handler: HandlerFunc): UnsubFunc {
    ReplaceHandler(app);
    WATCHERS.add(handler);
    return () => {
        WATCHERS.delete(handler);
    };
}
