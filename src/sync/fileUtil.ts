import type { DataAdapterWathcer, EventRef, Vault } from "obsidian";
import type { Result } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { NotFoundError } from "../lib/status_error";

/**
 * Watches root settings folder attaching the callback.
 * @param vault the obsidian vault
 * @param callback the watcher callback
 * @returns error if any issue finding obsidian root settings
 */
export async function WatchRootSettingsFolder(
    vault: Vault,
    callback: (event: string, fileName: string, path: string) => Promise<void>
): Promise<Result<EventRef[], StatusError>> {
    const watcherRefs: EventRef[] = [];
    for (const watcherName in vault.adapter.watchers) {
        if (!watcherName.startsWith(".obsidian")) {
            continue;
        }

        const watcher = vault.adapter.watchers[watcherName] as DataAdapterWathcer;
        const watcherCb = (event: string, fileName: string) => {
            void callback(event, fileName, watcherName);
        };
        const watcherEventName = "change";
        watcher.watcher.on(watcherEventName, watcherCb);
        watcherRefs.push({
            e: watcher.watcher,
            fn: watcherCb,
            name: watcherEventName
        });
    }

    if (watcherRefs.length <= 0) {
        return Err(NotFoundError("No .obsidian fs found."));
    }

    return Ok(watcherRefs);
}
