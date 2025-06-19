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
