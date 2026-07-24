/**
 * Headless CLI entrypoint for Obsidian Drive Sync.
 *
 * Reuses the exact sync engine the Obsidian plugin runs, wired to the Node
 * filesystem instead of an Obsidian vault. Commands:
 *
 *   drive-sync --config sync.yaml            # daemon: watch + sync continuously
 *   drive-sync --config sync.yaml --once     # sync current state, then exit
 *   drive-sync init-config                   # print a commented example config
 *   drive-sync --help
 */

import type { StatusError } from "standard-ts-lib/src/status_error";
import { CreateLogger } from "../src/logging/logger";
import { FileSyncer } from "../src/sync/syncer";
import { SetThisApp } from "../src/main_app";
import type { MainAppType } from "../src/main_app";
import type { LatestSyncConfigVersion } from "../src/schema/settings/syncer_config.schema";
import { ConsoleProgressView } from "./console_progress_view";
import { NodeApp } from "./node_app";
import { NodeClock } from "./node_clock";
import { NodePlugin } from "./node_plugin";
import { GenerateExampleConfig, LoadConfig } from "./config";
import { IdleTracker } from "./idle_tracker";
import { PromptHidden, PromptLine } from "./prompt";
import { StartDirectoryWatcher } from "./node_watcher";

declare const __BINARY_VERSION__: string;
const VERSION = typeof __BINARY_VERSION__ === "string" ? __BINARY_VERSION__ : "dev";

const LOGGER = CreateLogger("cli");

interface ParsedArgs {
    command: "sync" | "init-config" | "help" | "version";
    configPath: string | undefined;
    once: boolean;
    verbose: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
    const args: ParsedArgs = {
        command: "sync",
        configPath: undefined,
        once: false,
        verbose: false
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!;
        switch (arg) {
            case "init-config":
            case "example-config":
                args.command = "init-config";
                break;
            case "sync":
                args.command = "sync";
                break;
            case "--once":
                args.once = true;
                break;
            case "--verbose":
                args.verbose = true;
                break;
            case "-h":
            case "--help":
                args.command = "help";
                break;
            case "-v":
            case "--version":
                args.command = "version";
                break;
            case "-c":
            case "--config":
                args.configPath = argv[++i];
                break;
            default:
                if (arg.startsWith("--config=")) {
                    args.configPath = arg.slice("--config=".length);
                }
                break;
        }
    }
    return args;
}

const HELP_TEXT = `Obsidian Drive Sync (headless CLI) v${VERSION}

Usage:
  drive-sync --config <file.yaml> [--once] [--verbose]
  drive-sync init-config
  drive-sync --help | --version

Commands:
  sync (default)   Sync a directory with your Firebase Drive Sync account.
  init-config      Print a fully commented example YAML config to stdout.

Options:
  -c, --config <path>   Path to the YAML config file (required for sync).
      --once            Sync current state to convergence, then exit.
      --verbose         Log per-file progress.
  -h, --help            Show this help.
  -v, --version         Show version.

Credentials:
  The account password is prompted interactively. For unattended/daemon use,
  set the DRIVE_SYNC_PASSWORD environment variable instead.
`;

/** Resolves email (config or prompt) and password (env or prompt). */
async function resolveCredentials(
    emailFromConfig: string | undefined
): Promise<{ email: string; password: string }> {
    const email =
        emailFromConfig !== undefined && emailFromConfig !== ""
            ? emailFromConfig
            : await PromptLine("Firebase email: ");
    const envPassword = process.env.DRIVE_SYNC_PASSWORD;
    const password =
        envPassword !== undefined && envPassword !== ""
            ? envPassword
            : await PromptHidden("Firebase password: ");
    return { email, password };
}

async function runSync(args: ParsedArgs): Promise<number> {
    if (args.configPath === undefined) {
        process.stderr.write("Error: --config <file.yaml> is required.\n\n" + HELP_TEXT);
        return 2;
    }

    const loaded = await LoadConfig(args.configPath);
    if (loaded.err) {
        process.stderr.write(`Error: ${loaded.val.toString(/*includeStack=*/ false)}\n`);
        return 1;
    }
    const { directory, settings, email } = loaded.safeUnwrap();

    // Idle tracking: --once resolves once fully converged; the daemon announces
    // "up to date" once per idle transition.
    const idle = new IdleTracker(new Set(settings.syncers.map((s) => s.syncerId)));
    let resolveConverged: () => void = () => undefined;
    const convergedPromise = new Promise<void>((resolve) => {
        resolveConverged = resolve;
    });

    const progressView = new ConsoleProgressView({
        verbose: args.verbose,
        onCycleDone: (syncerId, numberOfUpdates, leftOver): void => {
            const becameIdle = idle.record(syncerId, numberOfUpdates, leftOver);
            if (args.once) {
                if (idle.allIdle) {
                    resolveConverged();
                }
            } else if (becameIdle) {
                process.stdout.write("[sync] ✓ up to date.\n");
            }
        }
    });

    const nodeApp = new NodeApp(directory, progressView);
    const app = nodeApp.asObsidianApp();
    const plugin = new NodePlugin(app, settings);
    SetThisApp(plugin.asMainApp());

    // Authenticate.
    const { email: resolvedEmail, password } = await resolveCredentials(email);
    process.stdout.write(`[sync] signing in as ${resolvedEmail}...\n`);
    const loginResult = await plugin.login(resolvedEmail, password);
    if (loginResult.err) {
        process.stderr.write(
            `Error: login failed: ${loginResult.val.toString(/*includeStack=*/ false)}\n`
        );
        return 1;
    }
    process.stdout.write(`[sync] signed in (uid ${loginResult.safeUnwrap().user.uid}).\n`);

    // Build and start a syncer per config.
    const clock = new NodeClock();
    const syncers: FileSyncer[] = [];
    plugin.setKillHandler((syncerId) => {
        for (const s of syncers) {
            if (s.getId() === syncerId) {
                s.teardown();
            }
        }
    });

    const mainApp: MainAppType = plugin.asMainApp();
    for (const config of settings.syncers) {
        const started = await startSyncer(app, mainApp, config, clock);
        if (started.err) {
            process.stderr.write(
                `Error: syncer ${config.syncerId} failed: ${started.val.toString(false)}\n`
            );
            for (const s of syncers) {
                s.teardown();
            }
            clock.clearAll();
            return 1;
        }
        syncers.push(started.value);
    }

    // Graceful shutdown wiring.
    const watcher = args.once ? undefined : StartDirectoryWatcher(nodeApp.adapter);
    // Keep the event loop alive independently of the (unref'd) tick timers while
    // the daemon runs; harmless (and unused) in --once mode.
    const heartbeat = args.once ? undefined : setInterval(() => undefined, 60_000);
    const shutdown = (): void => {
        for (const s of syncers) {
            s.teardown();
        }
        clock.clearAll();
        watcher?.close();
        nodeApp.runCleanup();
        if (heartbeat !== undefined) {
            clearInterval(heartbeat);
        }
    };

    if (args.once) {
        process.stdout.write("[sync] --once: syncing to convergence...\n");
        await convergedPromise;
        shutdown();
        process.stdout.write("[sync] converged. Exiting.\n");
        return 0;
    }

    // Daemon: run until interrupted.
    process.stdout.write("[sync] watching for changes. Press Ctrl+C to stop.\n");
    await new Promise<void>((resolve) => {
        let shuttingDown = false;
        const onSignal = (): void => {
            if (shuttingDown) {
                // A second Ctrl+C forces an immediate exit.
                process.exit(130);
            }
            shuttingDown = true;
            process.stdout.write("\n[sync] shutting down...\n");
            shutdown();
            resolve();
        };
        process.on("SIGINT", onSignal);
        process.on("SIGTERM", onSignal);
    });
    return 0;
}

async function startSyncer(
    app: ReturnType<NodeApp["asObsidianApp"]>,
    mainApp: MainAppType,
    config: LatestSyncConfigVersion,
    clock: NodeClock
): Promise<{ err: false; value: FileSyncer } | { err: true; val: StatusError }> {
    const constructed = await FileSyncer.constructFileSyncer(app, mainApp, config, clock);
    if (constructed.err) {
        return { err: true, val: constructed.val };
    }
    const syncer = constructed.safeUnwrap();
    const initResult = await syncer.init();
    if (initResult.err) {
        return { err: true, val: initResult.val };
    }
    return { err: false, value: syncer };
}

async function main(): Promise<number> {
    const args = parseArgs(process.argv.slice(2));
    switch (args.command) {
        case "help":
            process.stdout.write(HELP_TEXT);
            return 0;
        case "version":
            process.stdout.write(`${VERSION}\n`);
            return 0;
        case "init-config":
            process.stdout.write(GenerateExampleConfig());
            return 0;
        case "sync":
            return runSync(args);
    }
}

main()
    .then((code) => {
        // The Firebase SDK (Firestore listener, auth) keeps the event loop
        // alive, so a returned exit code alone would hang the process forever
        // after a graceful shutdown. Exit explicitly. stdout is flushed
        // synchronously for TTYs/pipes, so pending output is not lost.
        process.exit(code);
    })
    .catch((e: unknown) => {
        LOGGER.crit("Fatal CLI error", { error: e });
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        process.stderr.write(`Fatal: ${e}\n`);
        process.exit(1);
    });
