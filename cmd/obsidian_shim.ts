/**
 * A minimal Node stand-in for the `obsidian` module.
 *
 * The sync engine is written against Obsidian's API. For the headless CLI
 * binary we bundle it with esbuild and alias `obsidian` to this file, so the
 * engine's `import { ... } from "obsidian"` resolves here. Only the values the
 * bundled sync path actually references at runtime need real behavior:
 *
 * - `normalizePath` — path normalization (POSIX identity-ish).
 * - `TFile` / `App` / `ItemView` / `Notice` / `FileSystemAdapter` — classes that
 *   exist so `instanceof` checks and `extends` clauses resolve. Because the CLI
 *   routes every file through the "raw" (adapter) path, the Obsidian/`TFile`
 *   branch is never taken; these mostly need to *exist*, not *work*.
 *
 * The remaining exports are inert stubs so any stray import resolves. This file
 * is Node-only and never ships inside the Obsidian plugin bundle.
 */

/** Normalizes a vault path the way Obsidian's `normalizePath` does (POSIX). */
export function normalizePath(path: string): string {
    // Collapse backslashes, strip a leading "./", collapse duplicate slashes,
    // and trim surrounding slashes. Empty stays empty (means the vault root).
    const cleaned = path
        .replace(/\\/g, "/")
        .replace(/^\.\//, "")
        .replace(/\/+/g, "/")
        .replace(/^\/+|\/+$/g, "");
    return cleaned;
}

export interface DataWriteOptions {
    ctime?: number;
    mtime?: number;
}

export interface Stat {
    type: "file" | "folder";
    ctime: number;
    mtime: number;
    size: number;
}

export interface ListedFiles {
    files: string[];
    folders: string[];
}

/** Base class for vault items; concrete kinds below extend it. */
export class TAbstractFile {
    public path = "";
    public name = "";
    public parent: TFolder | null = null;
    public vault!: Vault;
}

export class TFile extends TAbstractFile {
    public basename = "";
    public extension = "";
    public stat: { ctime: number; mtime: number; size: number } = {
        ctime: 0,
        mtime: 0,
        size: 0
    };
}

export class TFolder extends TAbstractFile {
    public children: TAbstractFile[] = [];
    public isRoot(): boolean {
        return this.path === "" || this.path === "/";
    }
}

/**
 * Structural stand-in for Obsidian's `DataAdapter`. The concrete Node
 * implementation lives in `cmd/node_adapter.ts`; this only pins the type.
 */
export interface DataAdapter {
    getName(): string;
}

/** Structural stand-in for Obsidian's `Vault`. */
export class Vault {
    public adapter!: DataAdapter;
}

/** Structural stand-in for Obsidian's `FileSystemAdapter` (desktop). */
export class FileSystemAdapter {
    public getFullPath(_path: string): string {
        return _path;
    }
}

/** Structural stand-in for the `App`. Concrete impl in `cmd/node_app.ts`. */
export class App {
    public vault!: Vault;
}

/** Obsidian shows a toast; headless just no-ops (logging handles output). */
export class Notice {
    public noticeEl = { innerHTML: "" };
    public messageEl = { innerHTML: "" };
    constructor(_message?: string | DocumentFragment, _timeout?: number) {}
    public setMessage(_message: string | DocumentFragment): this {
        return this;
    }
    public hide(): void {}
}

/** Inert view base so `class X extends ItemView` resolves. Never instantiated. */
export class ItemView {
    public leaf: WorkspaceLeaf;
    public containerEl: unknown = {};
    constructor(leaf: WorkspaceLeaf) {
        this.leaf = leaf;
    }
    public getViewType(): string {
        return "";
    }
    public getDisplayText(): string {
        return "";
    }
}

export interface WorkspaceLeaf {
    view: unknown;
    setViewState(state: unknown): Promise<void>;
    detach(): void;
}

/** Inert plugin base. The CLI uses its own MainAppType impl, not this. */
export class Plugin {
    public app: App;
    constructor(app: App, _manifest?: unknown) {
        this.app = app;
    }
    public register(_cb: () => unknown): void {}
    public addRibbonIcon(): unknown {
        return {};
    }
    public addSettingTab(): void {}
    public registerView(): void {}
    public async loadData(): Promise<unknown> {
        return Promise.resolve(null);
    }
    public async saveData(_data: unknown): Promise<void> {
        return Promise.resolve();
    }
}

export class PluginSettingTab {
    constructor(_app: App, _plugin: unknown) {}
    public display(): void {}
    public hide(): void {}
}

export class Setting {
    constructor(_containerEl: unknown) {}
    public setName(): this {
        return this;
    }
    public setDesc(): this {
        return this;
    }
    public addText(): this {
        return this;
    }
    public addButton(): this {
        return this;
    }
    public addToggle(): this {
        return this;
    }
}

export class Modal {
    constructor(_app: App) {}
    public open(): void {}
    public close(): void {}
}

export class FuzzySuggestModal<T> {
    constructor(_app: App) {}
    public getItems(): T[] {
        return [];
    }
    public getItemText(_item: T): string {
        return "";
    }
}

export interface FuzzyMatch<T> {
    item: T;
    match: { score: number; matches: [number, number][] };
}

export function addIcon(_iconId: string, _svgContent: string): void {}
export function setIcon(_parent: unknown, _iconId: string): void {}
export function getIcon(_iconId: string): null {
    return null;
}
