import type { FSWatcher } from "fs";

declare module "obsidian" {
    interface DataAdapterWathcer {
        resolvedPath: string;
        watcher: FSWatcher;
    }

    interface DataAdapter {
        watchers: { [key: string]: DataAdapterWathcer };
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
