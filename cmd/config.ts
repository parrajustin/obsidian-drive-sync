/**
 * Loads and validates the CLI's YAML config and translates it into the sync
 * engine's internal `LatestSettingsConfigVersion`. Also generates the fully
 * commented example config emitted by `drive-sync init-config`.
 */

import { promises as fs } from "node:fs";
import * as nodePath from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import type { Result } from "standard-ts-lib/src/result";
import { Err, Ok } from "standard-ts-lib/src/result";
import { InvalidArgumentError, type StatusError } from "standard-ts-lib/src/status_error";
import { WrapPromise } from "standard-ts-lib/src/wrap_promise";
import { WrapToResult } from "standard-ts-lib/src/wrap_to_result";
import { uuidv7 } from "../src/lib/uuid";
import type { LatestSettingsConfigVersion } from "../src/schema/settings/settings_config.schema";
import type { LatestSyncConfigVersion } from "../src/schema/settings/syncer_config.schema";
import { rootSyncTypeEnum } from "../src/schema/settings/syncer_config.schema";

/** Routes every file through the "raw" (fs adapter) path, never the vault path. */
const RAW_ONLY_OBSIDIAN_QUERY = "-f:.";
const ALL_FILES_RAW_QUERY = "";

const cliConfigSchema = z
    .object({
        directory: z.string().min(1, "`directory` is required"),
        vaultName: z.string().min(1, "`vaultName` is required"),
        email: z.string().email("`email` must be a valid email").optional(),
        clientId: z.string().optional(),
        syncerId: z.string().optional(),
        syncQuery: z.string().optional(),
        maxUpdatesPerCycle: z.number().int().positive().optional(),
        firebaseCachePath: z.string().optional(),
        encryption: z
            .object({
                enabled: z.boolean().optional(),
                password: z.string().nullable().optional()
            })
            .optional()
    })
    .strict();

export type CliConfig = z.infer<typeof cliConfigSchema>;

export interface LoadedConfig {
    /** Absolute path of the directory to sync. */
    directory: string;
    /** The engine settings translated from the CLI config. */
    settings: LatestSettingsConfigVersion;
    /** Email from config, if any (password is prompted separately). */
    email: string | undefined;
}

/** Escapes a string so it matches literally when used as a filter regex. */
function escapeForFilter(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Translates a validated CLI config into engine settings. */
export function BuildSettings(config: CliConfig): LatestSettingsConfigVersion {
    const cachePath = config.firebaseCachePath ?? ".drive-sync-firebase-cache.json.gz";
    // Never sync our own cache file back to the cloud.
    const cacheExclude = `-f:${escapeForFilter(nodePath.basename(cachePath))}`;
    const userQuery = config.syncQuery?.trim() ?? "";
    const syncQuery = userQuery === "" ? cacheExclude : `${userQuery} ${cacheExclude}`;

    const syncer: LatestSyncConfigVersion = {
        type: rootSyncTypeEnum.root,
        vaultName: config.vaultName,
        syncerId: config.syncerId ?? uuidv7(),
        maxUpdatePerSyncer: config.maxUpdatesPerCycle ?? 50,
        dataStorageEncrypted: config.encryption?.enabled ?? false,
        encryptionPassword: config.encryption?.password ?? undefined,
        syncQuery,
        rawFileSyncQuery: ALL_FILES_RAW_QUERY,
        obsidianFileSyncQuery: RAW_ONLY_OBSIDIAN_QUERY,
        fileIdFileQuery: "",
        enableFileIdWriting: false,
        nestedRootPath: "",
        sharedSettings: { pathToFolder: "" },
        firebaseCachePath: cachePath,
        version: 0
    };

    return {
        clientId: config.clientId ?? uuidv7(),
        email: config.email,
        password: undefined, // Supplied at runtime (prompt/env), never from file.
        syncers: [syncer],
        version: 0
    };
}

/** Reads, parses, validates, and translates the YAML config at `filePath`. */
export async function LoadConfig(filePath: string): Promise<Result<LoadedConfig, StatusError>> {
    const raw = await WrapPromise(
        fs.readFile(filePath, "utf8"),
        /*textForUnknown=*/ `Failed to read config file "${filePath}"`
    );
    if (raw.err) {
        return raw;
    }

    const parsed = WrapToResult(
        () => parseYaml(raw.safeUnwrap()) as unknown,
        /*textForUnknown=*/ `Failed to parse YAML config "${filePath}"`
    );
    if (parsed.err) {
        return parsed;
    }

    const validated = cliConfigSchema.safeParse(parsed.safeUnwrap());
    if (!validated.success) {
        const issues = validated.error.issues
            .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
        return Err(InvalidArgumentError(`Invalid config "${filePath}":\n${issues}`));
    }

    const config = validated.data;
    const directory = nodePath.resolve(config.directory);
    return Ok({
        directory,
        settings: BuildSettings(config),
        email: config.email
    });
}

/** The fully commented example config emitted by `init-config`. */
export function GenerateExampleConfig(): string {
    return `# Obsidian Drive Sync — CLI configuration
#
# Syncs a local directory with your Firebase Drive Sync account, the same
# backend the Obsidian plugin uses. Pass this file with:  drive-sync --config sync.yaml
#
# ---------------------------------------------------------------------------

# REQUIRED. Absolute (or relative) path to the directory to sync.
# All files under it are synced except this tool's own cache file.
directory: /path/to/your/vault

# REQUIRED. Logical name of the vault. Every device syncing the SAME data must
# use the SAME vaultName. It scopes your files in the cloud.
vaultName: my-vault

# Firebase account email. If omitted you will be prompted for it at startup.
# The PASSWORD is never stored here — it is prompted interactively, or read from
# the DRIVE_SYNC_PASSWORD environment variable for unattended/daemon use.
email: you@example.com

# ---------------------------------------------------------------------------
# Everything below is OPTIONAL with sensible defaults.
# ---------------------------------------------------------------------------

# Stable identifier for THIS device. Auto-generated if omitted, but setting it
# keeps a consistent device id across restarts. Any unique string works.
# clientId: 018f3b2a-0000-7000-8000-000000000001

# Stable identifier for THIS syncer config. Auto-generated if omitted.
# syncerId: 018f3b2a-0000-7000-8000-000000000002

# Filter controlling which files sync. Uses the plugin's query language:
#   f:REGEX / file:REGEX   include only paths matching REGEX
#   -f:REGEX / -file:REGEX  exclude paths matching REGEX
# Empty (default) syncs everything. (The cache file is always excluded.)
# Example — only markdown, skip the .git folder:
#   syncQuery: "f:\\\\.md$ -f:^\\\\.git/"
syncQuery: ""

# Max number of file changes applied per sync cycle (per direction).
maxUpdatesPerCycle: 50

# Path (relative to 'directory') where the cloud metadata cache is stored.
# This file is always excluded from syncing.
firebaseCachePath: .drive-sync-firebase-cache.json.gz

# Optional at-rest encryption of file DATA (metadata stays visible). Every
# device syncing the same vault must use the SAME password.
encryption:
  enabled: false
  password: null
`;
}
