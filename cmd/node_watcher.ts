/**
 * Watches the synced directory with Node's recursive `fs.watch` and forwards
 * changes to the engine's watch pipeline. `src/watcher.ts` installs its fan-out
 * function on `adapter.handler`; we simply call that with the same
 * `HandlerFunc` shape the Obsidian watcher would produce.
 *
 * The engine only cares that a path is marked "touched" — the exact op type is
 * not distinguished downstream — so we map fs events coarsely.
 */

import * as fsWatch from "node:fs";
import * as nodePath from "node:path";
import type { NodeDataAdapter } from "./node_adapter";

export interface DirectoryWatcher {
    close(): void;
}

/** Starts watching `adapter.basePath`; returns a handle to stop it. */
export function StartDirectoryWatcher(adapter: NodeDataAdapter): DirectoryWatcher {
    let watcher: fsWatch.FSWatcher | undefined;
    try {
        watcher = fsWatch.watch(
            adapter.basePath,
            { recursive: true, persistent: true },
            (_eventType, filename) => {
                if (filename === null) {
                    return;
                }
                // Normalize to a vault-relative POSIX path.
                const relPath = filename.toString().split(nodePath.sep).join("/");
                void notify(adapter, relPath);
            }
        );
    } catch (e) {
        // Recursive watch is unsupported on some platforms/filesystems; surface
        // it clearly rather than silently missing local changes.

        console.warn(`[sync] directory watch unavailable, local changes may lag: ${e}`);
    }

    return {
        close(): void {
            watcher?.close();
        }
    };
}

async function notify(adapter: NodeDataAdapter, relPath: string): Promise<void> {
    const stat = await adapter.stat(relPath).catch(() => null);
    // Folders are surfaced by their children; ignore folder-only events.
    if (stat !== null && stat.type === "folder") {
        return;
    }
    const info = { ctime: stat?.ctime ?? 0, mtime: stat?.mtime ?? 0, size: stat?.size ?? 0 };
    const opType = stat === null ? "file-removed" : "modified";
    adapter.handler(opType, relPath, undefined, info);
}
