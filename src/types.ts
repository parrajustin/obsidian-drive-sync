export type OpType =
    | "folder-created"
    | "file-created"
    | "modified"
    | "file-removed"
    | "renamed"
    | "closed"
    | "raw";

export type HandlerFunc = (
    type: OpType,
    path: string,
    oldPath: string | undefined,
    info: { ctime: number; mtime: number; size: number }
) => unknown;

declare module "obsidian" {
    interface DataAdapter {
        /** Base path of the vault. */
        basePath: string;
        /** Returns the full system path to the file. */
        getFullPath: (path: string) => string;
        applyWriteOptions: (path: string, opts: DataWriteOptions) => Promise<void>;
        handler: HandlerFunc;
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
