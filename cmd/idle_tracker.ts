/**
 * Tracks per-syncer "idle" state across sync cycles. A syncer is idle when a
 * cycle applied no changes and has none queued; when every configured syncer is
 * idle the whole run is converged (fully up to date).
 *
 * `--once` uses `allIdle` to know when to exit; the daemon uses the `record`
 * return value to announce "up to date" exactly once per idle transition
 * (re-arming after any subsequent activity).
 */
export class IdleTracker {
    private readonly _idle = new Set<string>();
    private readonly _allIds: Set<string>;
    private _announced = false;

    constructor(allIds: Set<string>) {
        this._allIds = new Set(allIds);
    }

    /** True once every configured syncer has reported an idle cycle. */
    public get allIdle(): boolean {
        return this._idle.size >= this._allIds.size && this._allIds.size > 0;
    }

    /**
     * Records a cycle result. Returns true exactly on the transition into the
     * fully-idle state (so the daemon announces "up to date" once), and false
     * otherwise. Any non-idle cycle re-arms the announcement.
     */
    public record(syncerId: string, numberOfUpdates: number, leftOver: number): boolean {
        const isIdle = numberOfUpdates === 0 && leftOver === 0;
        if (!isIdle) {
            this._idle.delete(syncerId);
            this._announced = false;
            return false;
        }
        this._idle.add(syncerId);
        if (!this.allIdle || this._announced) {
            return false;
        }
        this._announced = true;
        return true;
    }
}
