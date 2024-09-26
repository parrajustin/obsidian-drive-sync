import type { FSWatcher } from "fs";
import type { readdir, stat, readFile, writeFile, rm } from "fs/promises";

declare module "obsidian" {
    interface DataAdapterWathcer {
        resolvedPath: string;
        watcher: FSWatcher;
    }

    interface DataAdapter {
        /** Base path of the vault. */
        basePath: string;
        watchers: { [key: string]: DataAdapterWathcer };
        /** Returns the full system path to the file. */
        getFullPath: (path: string) => string;
        applyWriteOptions: (path: string, opts: DataWriteOptions) => Promise<void>;
        fsPromises: {
            readdir: typeof readdir;
            stat: typeof stat;
            readFile: typeof readFile;
            writeFile: typeof writeFile;
            rm: typeof rm;
        };
    }

    interface EventRef {
        e: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            off: (name: string, fn: (...args: any) => void) => void;
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fn: (...args: any) => void;
        name: string;
    }

    interface Vault {
        fileMap: Record<string, TAbstractFile>;
    }
}
