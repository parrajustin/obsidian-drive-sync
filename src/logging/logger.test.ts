import { describe, it, expect, jest, beforeEach } from "@jest/globals";

beforeEach(() => {
    jest.resetModules();
});

function setupMock(isTest: boolean, pluginEnv: string, appNone = true) {
    jest.doMock("../constants", () => ({
        IS_TEST_ENV: isTest,

        PLUGIN_ENVIRONMENT: pluginEnv,

        LOKI_ACCESS_CLIENT_ID: "client_id",

        LOKI_ACCESS_CLIENT_SECRET: "client_secret",

        LOKI_URL: "http://loki",

        PLUGIN_VERSION: "1.0.0",

        RUN_ID: "run-123",

        SERVICE_NAME: "obsidian-sync"
    }));

    jest.doMock("../main_app", () => ({
        THIS_APP: {
            none: appNone,
            safeValue: () => ({
                userCreds: {
                    map: () => ({
                        valueOr: (def: unknown) => (appNone ? def : "mocked_value")
                    })
                }
            })
        }
    }));
}

/**
 * `jest.resetModules()` gives the dynamically imported `./logger` a fresh
 * module registry, so the transport classes it instantiates have a different
 * identity than a static top-level import would. Resolve the classes from the
 * same fresh registry so `instanceof` matches.
 */
async function loadModule() {
    const { CreateLogger } = await import("./logger");
    const { LokiTransport } = await import("./loki/transport");
    const BrowserConsole = (await import("./browser_transport")).default;
    return { CreateLogger, LokiTransport, BrowserConsole };
}

describe("logger", () => {
    it("creates a Logger with both Loki and BrowserConsole in development", async () => {
        setupMock(false, "development");
        const { CreateLogger, LokiTransport, BrowserConsole } = await loadModule();

        const logger = CreateLogger("test-label");
        expect(logger).toBeDefined();

        const transports = (logger as unknown as { transports: unknown[] }).transports;
        expect(transports.length).toBeGreaterThanOrEqual(1);

        const hasLoki = transports.some((t) => t instanceof LokiTransport);
        expect(hasLoki).toBe(true);
        const hasBrowser = transports.some((t) => t instanceof BrowserConsole);
        expect(hasBrowser).toBe(true);
    });

    it("creates a Logger with only Loki in production", async () => {
        setupMock(false, "production");
        const { CreateLogger, LokiTransport, BrowserConsole } = await loadModule();

        const logger = CreateLogger("test-label-prod");
        const transports = (logger as unknown as { transports: unknown[] }).transports;

        const hasLoki = transports.some((t) => t instanceof LokiTransport);
        expect(hasLoki).toBe(true);
        const hasBrowser = transports.some((t) => t instanceof BrowserConsole);
        expect(hasBrowser).toBe(false);
    });

    it("creates a Logger with no transports in test environment", async () => {
        setupMock(true, "development");
        const { CreateLogger } = await loadModule();

        const logger = CreateLogger("test-label-test");
        const transports = (logger as unknown as { transports: unknown[] }).transports;

        expect(transports.length).toBe(0);
    });

    it("formats user id when THIS_APP is populated", async () => {
        setupMock(true, "development", false);
        const { CreateLogger } = await loadModule();

        const logger = CreateLogger("test-label-user");
        const info = (
            logger as unknown as {
                format: { transform: (i: Record<string, unknown>) => Record<string, unknown> };
            }
        ).format.transform({ level: "info", message: "test" });
        expect(info.uid).toBe("mocked_value");
        expect(info.email).toBe("mocked_value");
    });
});
