export interface Clock {
    // Gets the milliseconds elapsed since midnight, January 1, 1970 Universal Coordinated Time (UTC).
    now(): number;
}

export class FakeClock implements Clock {
    private _now: number;

    constructor(now: number) {
        this._now = now;
    }

    public setNow(now: number): void {
        this._now = now;
    }

    public now(): number {
        return this._now;
    }
}

export class RealTimeClock implements Clock {
    public now(): number {
        return Date.now();
    }
}
