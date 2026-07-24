/**
 * Builds an Obsidian-`App`-shaped object backed by the Node filesystem. The
 * sync engine threads this `app` everywhere; only the members the "raw" path
 * and the progress-view factory touch are implemented:
 *
 * - `app.vault.adapter` — the Node fs adapter (stat/list/read/write/…).
 * - `app.vault.getName()` — directory name.
 * - `app.workspace.onLayoutReady/getLeavesOfType/getRightLeaf/revealLeaf` — just
 *   enough for `GetOrCreateSyncProgressView` to hand back our console view.
 * - `app.register()` — teardown-callback registration.
 */

import type { App } from "obsidian";
import { NodeDataAdapter } from "./node_adapter";
import type { ConsoleProgressView } from "./console_progress_view";

interface FakeLeaf {
    view: ConsoleProgressView;
    setViewState(state: unknown): Promise<void>;
    detach(): void;
}

export class NodeApp {
    public readonly adapter: NodeDataAdapter;
    public readonly progressView: ConsoleProgressView;
    private readonly _cleanupCallbacks: (() => unknown)[] = [];
    private readonly _leaf: FakeLeaf;

    constructor(rootDir: string, progressView: ConsoleProgressView) {
        this.adapter = new NodeDataAdapter(rootDir);
        this.progressView = progressView;
        this._leaf = {
            view: progressView,
            setViewState: async (): Promise<void> => Promise.resolve(),
            detach: (): void => undefined
        };
    }

    /** Runs and clears all registered teardown callbacks. */
    public runCleanup(): void {
        for (const cb of this._cleanupCallbacks.splice(0)) {
            cb();
        }
    }

    /** The object handed to the sync engine as its Obsidian `App`. */
    public asObsidianApp(): App {
        const leaf = this._leaf;
        const adapter = this.adapter;
        const cleanup = this._cleanupCallbacks;
        const app = {
            vault: {
                // getName is only read by the default-config factory, which the
                // CLI does not use, but provide it for completeness.
                getName: (): string => adapter.getName(),
                adapter
            },
            workspace: {
                onLayoutReady: (cb: () => void): void => {
                    cb();
                },
                on: (): void => undefined,
                getLeavesOfType: (): FakeLeaf[] => [],
                getRightLeaf: (): FakeLeaf => leaf,
                revealLeaf: async (): Promise<void> => Promise.resolve()
            },
            register: (cb: () => unknown): void => {
                cleanup.push(cb);
            }
        };
        return app as unknown as App;
    }
}
