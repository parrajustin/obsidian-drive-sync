/**
 * A `Clock` implementation for Node. The engine's default `RealTimeClock` uses
 * `window.performance`/`window.setTimeout`, which don't exist headless, so the
 * CLI injects this into `FileSyncer.constructFileSyncer`.
 */

import type { Clock } from "../src/clock";

export class NodeClock implements Clock {
    private _timeouts = new Map<number, NodeJS.Timeout>();
    private _nextId = 1;

    public now(): number {
        return Date.now();
    }

    public performanceNow(): number {
        return performance.now();
    }

    public setTimeout(func: () => Promise<unknown>, ms: number): number {
        const id = this._nextId++;
        const timer = setTimeout(() => {
            this._timeouts.delete(id);
            void func();
        }, ms);
        // Do not keep the process alive solely for a pending sync tick.
        timer.unref();
        this._timeouts.set(id, timer);
        return id;
    }

    public clearTimeout(id: number): void {
        const timer = this._timeouts.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this._timeouts.delete(id);
        }
    }

    /** Cancels every pending timeout (used on shutdown). */
    public clearAll(): void {
        for (const timer of this._timeouts.values()) {
            clearTimeout(timer);
        }
        this._timeouts.clear();
    }
}
