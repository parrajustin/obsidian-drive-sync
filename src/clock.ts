export interface Clock {
    // Gets the milliseconds elapsed since midnight, January 1, 1970 Universal Coordinated Time (UTC).
    now(): number;

    // A method returns a high resolution timestamp in milliseconds.
    performanceNow(): number;

    // Sets a function to run after ms milliseconds have passed.
    setTimeout(func: () => void, ms: number): number;

    // Remove a function scheduled timeout.
    clearTimeout(id: number): void;
}

export class FakeClock implements Clock {
    private _timeouts = new Map<number, [number, () => void]>();
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

    public setTimeout(func: () => void, ms: number): number {
        const id = this._timeId++;
        this._timeouts.set(id, [this._now + ms, func]);
        return id;
    }

    public clearTimeout(id: number): void {
        this._timeouts.delete(id);
    }

    public executeTimeoutFuncs(): void {
        const now = this._now;
        this._timeouts.forEach((value, key) => {
            if (value[0] <= now) {
                value[1]();
                this._timeouts.delete(key);
            }
        });
    }
}

export class RealTimeClock implements Clock {
    public now(): number {
        return Date.now();
    }

    public performanceNow(): number {
        return window.performance.now();
    }

    public setTimeout(func: () => void, ms: number): number {
        return window.setTimeout(func, ms);
    }

    public clearTimeout(id: number): void {
        window.clearTimeout(id);
    }
}
