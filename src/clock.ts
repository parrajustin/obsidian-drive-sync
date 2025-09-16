import { THIS_APP } from "./main_app";
import { CreateLogger } from "./logging/logger";
import { LogError } from "./logging/log";
import { NotFoundError } from "./lib/status_error";
import { Err } from "./lib/result";

const LOGGER = CreateLogger("clock");

export interface Clock {
    // Gets the milliseconds elapsed since midnight, January 1, 1970 Universal Coordinated Time (UTC).
    now(): number;

    // A method returns a high resolution timestamp in milliseconds.
    performanceNow(): number;

    // Sets a function to run after ms milliseconds have passed.
    setTimeout(func: () => Promise<unknown>, ms: number): number;

    // Remove a function scheduled timeout.
    clearTimeout(id: number): void;
}

export class FakeClock implements Clock {
    private _timeouts = new Map<number, [number, () => Promise<unknown>]>();
    private _timeId = 0;
    private _now: number;

    constructor(now: number) {
        this._now = now;
    }

    public addMillis(ms: number): void {
        this._now += ms;
    }

    public addSeconds(s: number): void {
        this.addMillis(s * 1000);
    }

    public setNow(now: number): void {
        this._now = now;
    }

    public now(): number {
        return this._now;
    }

    public performanceNow(): number {
        return this._now;
    }

    public setTimeout(func: () => Promise<unknown>, ms: number): number {
        const id = this._timeId++;
        this._timeouts.set(id, [this._now + ms, func]);
        return id;
    }

    public clearTimeout(id: number): void {
        this._timeouts.delete(id);
    }

    public async executeTimeoutFuncs(): Promise<void> {
        const now = this._now;
        for (const entry of this._timeouts.entries()) {
            if (entry[1][0] <= now) {
                const callback = entry[1][1];
                void (await callback());
                this._timeouts.delete(entry[0]);
            }
        }
    }
}

export class RealTimeClock implements Clock {
    private get _app() {
        if (THIS_APP.none) {
            const err = NotFoundError("found no app in realtime clock!");
            LogError(LOGGER, err);
            throw Err(err);
        }
        return THIS_APP.safeValue();
    }

    public now(): number {
        return Date.now();
    }

    public performanceNow(): number {
        return window.performance.now();
    }

    public setTimeout(func: () => void, ms: number): number {
        const timeoutId = window.setTimeout(func, ms);
        this._app.register(() => {
            window.clearTimeout(timeoutId);
        });
        return timeoutId;
    }

    public clearTimeout(id: number): void {
        window.clearTimeout(id);
    }
}
