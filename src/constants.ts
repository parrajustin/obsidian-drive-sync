/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-inferrable-types */
import { uuidv7 } from "./lib/uuid";

// If this environment is a test.
// eslint-disable-next-line prefer-const
export let IS_TEST_ENV = false;

export const SERVICE_NAME = "obsidian-sync";

/**
 * The firebase db name holding the synced content of the markdown files.
 */
export const NOTES_MARKDOWN_FIREBASE_DB_NAME = "notes";
/**
 * The firebase db name holding the history of markdown changes. Contains the full contents.
 */
export const HISTORY_CHANGES_FIREBASE_DB_NAME = "history";
/**
 * The firebase db name holding the syncing sharing.
 */
export const SHARED_ENTRIES_FIREBASE_DB_NAME = "shares";

declare const globalThis: {
    SYNCBUNDLEVERSION?: string;
    SYNCBUNDLEENV?: string;
    LOKIACCESSCLIENTID?: string;
    LOKIACCESSCLIENTSECRET?: string;
};

// The version of this plugin.
export const PLUGIN_VERSION: string = globalThis.SYNCBUNDLEVERSION ?? "unknown";
// The environment of the plugin, e.g. "production" or "development".

export const PLUGIN_ENVIRONMENT: string = globalThis.SYNCBUNDLEENV ?? "unknown";

// The url of the Loki Instance.
export const LOKI_URL: string = "https://nginx.parrajustin.com/loki/";
// export const LOKI_URL = "http://192.168.0.49:9980/loki/";
export const GRAFANA_TEMPO_URL: string = "https://nginx.parrajustin.com/otlp/v1/traces";
// export const GRAFANA_TEMPO_URL: string = "http://192.168.0.49:9980/otlp/v1/traces";
export const ZEIPKIN_URL: string = "http://192.168.0.49:9980/zipkin/api/v2/spans";
// The loki service account access id.
export const LOKI_ACCESS_CLIENT_ID: string = globalThis.LOKIACCESSCLIENTID ?? "unknown";
// The loki service account access secret.
export const LOKI_ACCESS_CLIENT_SECRET: string = globalThis.LOKIACCESSCLIENTSECRET ?? "unknown";

// Unique run id.
export const RUN_ID = uuidv7();

// The trace span id to contain the syncer id.
export const SYNCER_ID_SPAN_ATTR = "syncer.id";
// The trace span id of the current active cycle for this syncer.
export const SYNCER_ACTIVE_CYCLE_ID_SPAN_ATTR = "syncer.cycle.id";

// Logging attribute name for the full syncer config.
export const LOGGING_SYNCER_CONFIG_ATTR = "syncer.config";

// The file id.
export const FIREBASE_NOTE_ID = "firebase.notes.id";
export const CLOUDSTORAGE_FILE_ID = "cloudstorage.file.id";

export class FileConst {
    // The local file path of a file.
    public static FILE_PATH = "local.filepath";
}
