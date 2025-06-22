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

declare const SYNCBUNDLEVERSION: string | undefined;
// The version of this plugin.
export const PLUGIN_VERSION = SYNCBUNDLEVERSION ?? "unknown";
declare const SYNCBUNDLEENV: string | undefined;
// The environment of the plugin, e.g. "production" or "development".
export const PLUGIN_ENVIRONMENT = SYNCBUNDLEENV ?? "unknown";

// The url of the Loki Instance.
export const LOKI_URL = "https://loki.parrajustin.com/";
// export const LOKI_URL = "http://192.168.0.49:9980/";
declare const LOKIACCESSCLIENTID: string | undefined;
// The loki service account access id.
export const LOKI_ACCESS_CLIENT_ID = LOKIACCESSCLIENTID;
declare const LOKIACCESSCLIENTSECRET: string | undefined;
// The loki service account access secret.
export const LOKI_ACCESS_CLIENT_SECRET = LOKIACCESSCLIENTSECRET;

// Unique run id.
export const RUN_ID = uuidv7();
