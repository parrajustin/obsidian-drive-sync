/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @typescript-eslint/no-inferrable-types */
import { uuidv7 } from "./lib/uuid";

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
export const LOKI_URL: string = "https://loki.parrajustin.com/";
// export const LOKI_URL = "http://192.168.0.49:9980/";
// The loki service account access id.
export const LOKI_ACCESS_CLIENT_ID: string = globalThis.LOKIACCESSCLIENTID ?? "unknown";
// The loki service account access secret.
export const LOKI_ACCESS_CLIENT_SECRET: string = globalThis.LOKIACCESSCLIENTSECRET ?? "unknown";

// Unique run id.
export const RUN_ID = uuidv7();
