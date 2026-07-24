import { describe, expect, jest, it, beforeEach, afterEach } from "@jest/globals";
import { FakeClock, RealTimeClock } from "./clock";
import { SetThisApp } from "./main_app";

jest.mock("./main_app", () => {
    let app: any = { none: true };
    return {
        get THIS_APP() {
            return app;
        },
        SetThisApp: (newApp: any) => {
            app = newApp;
        }
    };
});
jest.mock("./logging/logger", () => ({
    CreateLogger: () => ({})
}));
jest.mock("./logging/log", () => ({
    LogError: jest.fn()
}));

describe("FakeClock", () => {
    it("should initialize and return now", () => {
        const clock = new FakeClock(100);
        expect(clock.now()).toBe(100);
        expect(clock.performanceNow()).toBe(100);
    });

    it("should addMillis", () => {
        const clock = new FakeClock(100);
        clock.addMillis(50);
        expect(clock.now()).toBe(150);
    });

    it("should addSeconds", () => {
        const clock = new FakeClock(100);
        clock.addSeconds(1);
        expect(clock.now()).toBe(1100);
    });

    it("should setNow", () => {
        const clock = new FakeClock(100);
        clock.setNow(200);
        expect(clock.now()).toBe(200);
    });

    it("should execute timeout funcs", async () => {
        const clock = new FakeClock(100);
        let run = false;
        clock.setTimeout(async () => {
            run = true;
        }, 50);

        await clock.executeTimeoutFuncs();
        expect(run).toBe(false);

        clock.addMillis(50);
        await clock.executeTimeoutFuncs();
        expect(run).toBe(true);
    });

    it("should clearTimeout", async () => {
        const clock = new FakeClock(100);
        let run = false;
        const id = clock.setTimeout(async () => {
            run = true;
        }, 50);
        clock.clearTimeout(id);
        clock.addMillis(50);
        await clock.executeTimeoutFuncs();
        expect(run).toBe(false);
    });
});

describe("RealTimeClock", () => {
    beforeEach(() => {
        SetThisApp({ none: true } as any); // Reset app
        jest.useFakeTimers();
    });
    afterEach(() => {
        jest.useRealTimers();
        jest.clearAllMocks();
    });

    it("should return now", () => {
        const clock = new RealTimeClock();
        jest.setSystemTime(100);
        expect(clock.now()).toBe(100);
    });

    it("should return performanceNow", () => {
        const clock = new RealTimeClock();
        const origPerf = window.performance;
        (window as any).performance = { now: () => 100 };
        try {
            expect(clock.performanceNow()).toBe(100);
        } finally {
            window.performance = origPerf;
        }
    });

    it("should log error if setTimeout is called without an app", () => {
        const { LogError } = require("./logging/log");
        const clock = new RealTimeClock();
        clock.setTimeout(() => {}, 10);
        expect(LogError).toHaveBeenCalled();
    });

    it("should register timeout cleanup if app is set", () => {
        const { LogError } = require("./logging/log");
        const clock = new RealTimeClock();
        let registeredCleanup: () => void;
        SetThisApp({
            some: true,
            safeValue: () => ({
                register: (cleanup: () => void) => {
                    registeredCleanup = cleanup;
                }
            })
        } as any);

        const id = clock.setTimeout(() => {}, 10);
        expect(LogError).not.toHaveBeenCalled();

        const spy = jest.spyOn(window, "clearTimeout");
        registeredCleanup!();
        expect(spy).toHaveBeenCalledWith(id);
        spy.mockRestore();
    });

    it("should clearTimeout", () => {
        const clock = new RealTimeClock();
        const spy = jest.spyOn(window, "clearTimeout");
        clock.clearTimeout(123);
        expect(spy).toHaveBeenCalledWith(123);
        spy.mockRestore();
    });
});
