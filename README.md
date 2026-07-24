# A firebase file syncer for Obsidian.

## How to commit

- Write commit messages according to https://www.conventionalcommits.org/en/v1.0.0/
- commit release

```bash
git commit --allow-empty -m "chore: release 2.0.0" -m "Release-As: 2.0.0"
```

## Known bugs

- If there are multiple files with overlapping file paths then it is a race to see who reads and writes first.

- For encrpytion only the file data is encrypted. The size, modification and creation time, full file name, and other metadata is stored in plain text.

- if you move selected files to filereed file path it will still be synced.

## Headless CLI (`drive-sync`)

The same sync engine also runs as a standalone Node binary that syncs a plain
directory with your Firebase Drive Sync account — no Obsidian required. Useful
for servers, cron jobs, or non-Obsidian machines.

### Build

```bash
npm run build:binary          # → dist-bin/drive-sync.cjs (a self-contained Node executable)
node dist-bin/drive-sync.cjs --help
```

### Configure

Generate a fully commented example config, then edit it:

```bash
node dist-bin/drive-sync.cjs init-config > sync.yaml
$EDITOR sync.yaml             # set `directory`, `vaultName`, `email`
```

Only `directory` and `vaultName` are required; everything else has defaults
(`init-config` documents them all).

### Run

```bash
# Daemon: initial sync, then watch for local + remote changes continuously.
node dist-bin/drive-sync.cjs --config sync.yaml

# One-shot: sync current state to convergence, then exit (good for cron).
node dist-bin/drive-sync.cjs --config sync.yaml --once
```

The account **password is prompted interactively** (masked). For unattended /
daemon use, set it via the `DRIVE_SYNC_PASSWORD` environment variable instead.

### Notes

- Every device syncing the same data must use the same `vaultName`.
- The CLI never sends logs or traces to any remote telemetry endpoint (unlike
  the in-app plugin), and Firestore runs with an in-memory cache.
- Remote deletions are applied by permanently removing the local file.
- Implementation lives in [`cmd/`](cmd/); it reuses the plugin's engine via a
  small Node-fs-backed `App`/adapter shim (esbuild aliases `obsidian` to it).
