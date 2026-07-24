/**
 * A console-backed stand-in for `SyncProgressView`. The sync engine drives a
 * `SyncProgressView` to report status; in Obsidian that renders a sidebar. The
 * CLI supplies this instead (via the Node workspace shim) so the DOM-based view
 * is never constructed. It implements exactly the methods the engine calls.
 */

import type { StatusError } from "standard-ts-lib/src/status_error";
import type { LatestSyncConfigVersion } from "../src/schema/settings/syncer_config.schema";
import type { ConvergenceActionType } from "../src/sync/convergence_util";
import type { FilePathType } from "../src/filesystem/file_node";

export class ConsoleProgressView {
    /** When false, per-file progress ticks are suppressed (only actions logged). */
    private readonly _verbose: boolean;
    private readonly _log: (msg: string) => void;
    /** Invoked at the end of every sync cycle (used by --once to detect idle). */
    private readonly _onCycleDone?: (
        syncerId: string,
        numberOfUpdates: number,
        leftOverUpdates: number
    ) => void;

    constructor(
        opts: {
            verbose?: boolean;
            log?: (msg: string) => void;
            onCycleDone?: (syncerId: string, numberOfUpdates: number, leftOver: number) => void;
        } = {}
    ) {
        this._verbose = opts.verbose ?? false;
        this._log =
            opts.log ??
            ((msg: string): void => {
                console.info(msg);
            });
        this._onCycleDone = opts.onCycleDone;
    }

    public setStatus(status: string): void {
        this._log(`[sync] ${status}`);
    }

    public setSyncers(configs: LatestSyncConfigVersion[]): void {
        this._log(`[sync] configured ${configs.length} syncer(s)`);
    }

    public setSyncPlugin(_plugin: unknown): void {
        // No-op: the CLI owns the plugin lifecycle directly.
    }

    public setSyncerStatus(syncerId: string, status: string, _color?: string): void {
        // Status color is not meaningful on a plain console; genuine failures
        // are reported separately via publishSyncerError, so don't tag benign
        // status changes (e.g. "TearDown!") as errors.
        this._log(`[${short(syncerId)}] ${status}`);
    }

    public newSyncerCycle(_syncerId: string, _cycleId: string): void {
        // Cycles are frequent; only the summary (publishSyncerCycleDone) logs.
    }

    public addEntry(syncerId: string, filePath: FilePathType, action: ConvergenceActionType): void {
        this._log(`[${short(syncerId)}] ${action} ${filePath}`);
    }

    public setEntryProgress(syncerId: string, filePath: FilePathType, amount: number): void {
        if (!this._verbose) {
            return;
        }
        if (amount < 0) {
            this._log(`[${short(syncerId)}] failed ${filePath}`);
        } else if (amount >= 1) {
            this._log(`[${short(syncerId)}] done ${filePath}`);
        }
    }

    public publishSyncerCycleDone(
        syncerId: string,
        numberOfUpdates: number,
        leftOverUpdates: number,
        updateTimeMs: number
    ): void {
        this._onCycleDone?.(syncerId, numberOfUpdates, leftOverUpdates);
        if (numberOfUpdates === 0 && leftOverUpdates === 0) {
            return; // Quiet: nothing changed this cycle.
        }
        const leftover = leftOverUpdates > 0 ? `, ${leftOverUpdates} queued` : "";
        this._log(
            `[${short(syncerId)}] cycle: ${numberOfUpdates} change(s)${leftover} in ${Math.round(
                updateTimeMs
            )}ms`
        );
    }

    public publishSyncerError(syncerId: string, error: StatusError): void {
        this._log(`[${short(syncerId)}] ERROR: ${error.toString(/*includeStack=*/ false)}`);
    }

    public resetView(): void {
        // Nothing to reset for console output.
    }
}

function short(syncerId: string): string {
    return syncerId.length > 8 ? syncerId.slice(0, 8) : syncerId;
}
