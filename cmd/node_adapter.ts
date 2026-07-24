/**
 * A Node `fs`-backed implementation of the slice of Obsidian's `DataAdapter`
 * the sync engine's "raw file" path uses. All paths are vault-relative, POSIX
 * style (forward slashes); they are resolved against `rootDir`.
 *
 * The CLI configures its syncer so every file routes through this adapter (see
 * cmd/config.ts), so the Obsidian/`TFile` vault path is never exercised.
 */

import { promises as fs } from "node:fs";
import type { Dirent } from "node:fs";
import * as nodePath from "node:path";
import { normalizePath } from "obsidian";
import type { HandlerFunc } from "../src/types";

export interface NodeStat {
    type: "file" | "folder";
    ctime: number;
    mtime: number;
    size: number;
}

export interface ListedFiles {
    files: string[];
    folders: string[];
}

/** Resolves the given `data` (ArrayBuffer/Uint8Array) into a Node Buffer. */
function toBuffer(data: ArrayBuffer | Uint8Array): Buffer {
    return data instanceof Uint8Array
        ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
        : Buffer.from(data);
}

export class NodeDataAdapter {
    /** Absolute path of the synced directory (the "vault"). */
    public readonly basePath: string;

    /**
     * File-change hook. `src/watcher.ts` swaps this out to fan events to the
     * registered watchers; the CLI's fs watcher (cmd/node_watcher.ts) invokes
     * whatever is installed here. Starts as a no-op.
     */
    public handler: HandlerFunc = () => undefined;

    constructor(rootDir: string) {
        this.basePath = nodePath.resolve(rootDir);
    }

    /** Obsidian vaults are named; the CLI uses the directory's base name. */
    public getName(): string {
        return nodePath.basename(this.basePath);
    }

    /** Absolute filesystem path for a vault-relative path. */
    public getFullPath(relPath: string): string {
        const normalized = normalizePath(relPath);
        return normalized === "" ? this.basePath : nodePath.join(this.basePath, normalized);
    }

    public async stat(relPath: string): Promise<NodeStat | null> {
        const full = this.getFullPath(relPath);
        try {
            const s = await fs.stat(full);
            return {
                type: s.isDirectory() ? "folder" : "file",
                // birthtime is the closest analogue to Obsidian's ctime; fall
                // back to ctime where the platform doesn't track birthtime.
                ctime: Math.floor(s.birthtimeMs || s.ctimeMs),
                mtime: Math.floor(s.mtimeMs),
                size: s.size
            };
        } catch (e) {
            if (isNotFound(e)) {
                return null;
            }
            throw e;
        }
    }

    public async list(relPath: string): Promise<ListedFiles> {
        const normalized = normalizePath(relPath);
        const dir = normalized === "" ? this.basePath : nodePath.join(this.basePath, normalized);
        const files: string[] = [];
        const folders: string[] = [];

        let entries: Dirent[];
        try {
            entries = await fs.readdir(dir, { withFileTypes: true });
        } catch (e) {
            if (isNotFound(e)) {
                return { files, folders };
            }
            throw e;
        }

        for (const entry of entries) {
            const childRel = normalized === "" ? entry.name : `${normalized}/${entry.name}`;
            if (entry.isDirectory()) {
                folders.push(childRel);
            } else if (entry.isFile()) {
                files.push(childRel);
            }
        }
        return { files, folders };
    }

    public async readBinary(relPath: string): Promise<ArrayBuffer> {
        const buf = await fs.readFile(this.getFullPath(relPath));
        // Return a standalone ArrayBuffer (not the pooled Node buffer's).
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    public async writeBinary(
        relPath: string,
        data: ArrayBuffer | Uint8Array,
        opts?: { ctime?: number; mtime?: number }
    ): Promise<void> {
        const full = this.getFullPath(relPath);
        await fs.mkdir(nodePath.dirname(full), { recursive: true });
        await fs.writeFile(full, toBuffer(data));
        // Honor the requested mtime so files written from cloud data are not
        // seen as newer-than-cloud local edits on the next convergence pass.
        if (opts?.mtime !== undefined) {
            const seconds = opts.mtime / 1000;
            await fs.utimes(full, seconds, seconds);
        }
    }

    public async mkdir(relPath: string): Promise<void> {
        await fs.mkdir(this.getFullPath(relPath), { recursive: true });
    }

    /**
     * "Trash" a file. There is no cross-platform OS trash from Node without a
     * dependency, so this permanently removes the file (the point of a delete
     * propagated from the cloud). Returns true so the engine never falls back
     * to `trashLocal`.
     */
    public async trashSystem(relPath: string): Promise<boolean> {
        const full = this.getFullPath(relPath);
        try {
            await fs.rm(full, { recursive: true, force: true });
        } catch (e) {
            if (!isNotFound(e)) {
                throw e;
            }
        }
        return true;
    }

    public async trashLocal(relPath: string): Promise<void> {
        await this.trashSystem(relPath);
    }
}

function isNotFound(e: unknown): boolean {
    return (
        typeof e === "object" &&
        e !== null &&
        "code" in e &&
        (e as { code?: string }).code === "ENOENT"
    );
}
