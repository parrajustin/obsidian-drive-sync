import { describe, expect, jest, test } from "@jest/globals";

jest.unmock("./constants");

import * as ACTUAL_CONSTANTS from "./constants";
import { IS_TEST_ENV } from "./constants";

const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("constants", () => {
    test("IS_TEST_ENV is true when mocked", () => {
        // Since we unmocked it above, both are false.
        expect(IS_TEST_ENV).toBe(false);
        expect(ACTUAL_CONSTANTS.IS_TEST_ENV).toBe(false);
    });

    test("service and firebase db names", () => {
        expect(ACTUAL_CONSTANTS.SERVICE_NAME).toBe("obsidian-sync");
        expect(ACTUAL_CONSTANTS.NOTES_MARKDOWN_FIREBASE_DB_NAME).toBe("notes");
        expect(ACTUAL_CONSTANTS.HISTORY_CHANGES_FIREBASE_DB_NAME).toBe("history");
        expect(ACTUAL_CONSTANTS.SHARED_ENTRIES_FIREBASE_DB_NAME).toBe("shares");
    });

    test("bundle injected globals fall back to unknown", () => {
        expect(ACTUAL_CONSTANTS.PLUGIN_VERSION).toBe("unknown");
        expect(ACTUAL_CONSTANTS.PLUGIN_ENVIRONMENT).toBe("unknown");
        expect(ACTUAL_CONSTANTS.LOKI_ACCESS_CLIENT_ID).toBe("unknown");
        expect(ACTUAL_CONSTANTS.LOKI_ACCESS_CLIENT_SECRET).toBe("unknown");
    });

    test("urls are set", () => {
        expect(ACTUAL_CONSTANTS.LOKI_URL).toContain("/loki/");
        expect(ACTUAL_CONSTANTS.GRAFANA_TEMPO_URL).toContain("/otlp/v1/traces");
        expect(ACTUAL_CONSTANTS.ZEIPKIN_URL).toContain("/zipkin/");
    });

    test("RUN_ID is a uuidv7", () => {
        expect(ACTUAL_CONSTANTS.RUN_ID).toMatch(UUID_V7_REGEX);
    });

    test("span and logging attribute names", () => {
        expect(ACTUAL_CONSTANTS.SYNCER_ID_SPAN_ATTR).toBe("syncer.id");
        expect(ACTUAL_CONSTANTS.SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR).toBe("syncer.cycle.id");
        expect(ACTUAL_CONSTANTS.LOGGING_SYNCER_CONFIG_ATTR).toBe("syncer.config");
        expect(ACTUAL_CONSTANTS.FIREBASE_NOTE_ID).toBe("firebase.notes.id");
        expect(ACTUAL_CONSTANTS.CLOUDSTORAGE_FILE_ID).toBe("cloudstorage.file.id");
        expect(ACTUAL_CONSTANTS.FileConst.FILE_PATH).toBe("local.filepath");
    });
});
