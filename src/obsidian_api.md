# Obsidian API Usage

This document outlines the usage of the Obsidian API in this plugin.

## File System APIs

The plugin uses two levels of the Obsidian file system API: the high-level `app.vault` API and the low-level `app.vault.adapter` API.

### High-Level API (`app.vault`)

The high-level API is used for most file operations within the vault. It is aware of the Obsidian cache and is generally safer to use.

*   **`app.vault.getAbstractFileByPath(filePath: string): TAbstractFile | null`**
    *   **Usage:** Used to get a file or folder from the vault.
    *   **Behavior:** Returns a `TFile` or `TFolder` object, or `null` if the file does not exist. This plugin uses it to check for the existence of files before reading or writing to them.

*   **`app.vault.readBinary(file: TFile): Promise<ArrayBuffer>`**
    *   **Usage:** Reads a file as a binary `ArrayBuffer`.
    *   **Behavior:** Returns a promise that resolves with the file's content as an `ArrayBuffer`. This plugin wraps this call in a `WrapPromise` to handle errors.

*   **`app.vault.createBinary(filePath: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<TFile>`**
    *   **Usage:** Creates a new file with binary content.
    *   **Behavior:** Returns a promise that resolves with the newly created `TFile` object. This plugin uses it to create new files when syncing from the cloud.

*   **`app.vault.modifyBinary(file: TFile, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>`**
    *   **Usage:** Modifies an existing file with binary content.
    *   **Behavior:** Returns a promise that resolves when the file has been modified. This plugin uses it to update existing files when syncing from the cloud.

*   **`app.vault.trash(file: TFile, system: boolean): Promise<void>`**
    *   **Usage:** Moves a file to the trash.
    *   **Behavior:** Returns a promise that resolves when the file has been moved to the trash. The `system` parameter determines whether to use the system trash or the local `.trash` folder. This plugin uses `system=true`.

### Low-Level API (`app.vault.adapter`)

The low-level API interacts directly with the file system. It is used for operations that need to bypass the Obsidian cache or that operate outside of the vault.

*   **`app.vault.adapter.readBinary(path: string): Promise<ArrayBuffer>`**
    *   **Usage:** Reads a file from the file system as a binary `ArrayBuffer`.
    *   **Behavior:** Returns a promise that resolves with the file's content as an `ArrayBuffer`. The path must be normalized.

*   **`app.vault.adapter.writeBinary(path: string, data: ArrayBuffer, options?: DataWriteOptions): Promise<void>`**
    *   **Usage:** Writes a binary `ArrayBuffer` to a file on the file system.
    *   **Behavior:** Returns a promise that resolves when the file has been written. The path must be normalized.

*   **`app.vault.adapter.mkdir(path: string): Promise<void>`**
    *   **Usage:** Creates a directory.
    *   **Behavior:** Returns a promise that resolves when the directory has been created. The path must be normalized. This plugin uses it to create parent directories before writing files.

*   **`app.vault.adapter.trashSystem(path: string): Promise<boolean>`**
    *   **Usage:** Moves a file to the system trash.
    *   **Behavior:** Returns a promise that resolves with a boolean indicating whether the operation was successful.

*   **`app.vault.adapter.trashLocal(path: string): Promise<void>`**
    *   **Usage:** Moves a file to the local `.trash` folder in the vault.
    *   **Behavior:** Returns a promise that resolves when the file has been moved.

*   **`app.vault.adapter.getFullPath(path: string): string`**
    *   **Usage:** Gets the full path of a file.
    *   **Behavior:** Returns the full, absolute path of a file.

## Other APIs

The plugin also uses other Obsidian APIs for UI and plugin management.

*   **`Plugin`**: The base class for an Obsidian plugin.
*   **`App`**: The main application object, which provides access to the vault, workspace, and other plugin resources.
*   **`PluginManifest`**: Contains the plugin's metadata.
*   **`this.registerView(type: string, factory: (leaf: WorkspaceLeaf) => T)`**: Registers a new view.
*   **`this.addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => any)`**: Adds an icon to the ribbon.
*   **`this.addSettingTab(tab: PluginSettingTab)`**: Adds a new settings tab.
*   **`this.loadData(): Promise<any>`**: Loads plugin data from `data.json`.
*   **`this.saveData(data: any): Promise<void>`**: Saves plugin data to `data.json`.
*   **`this.app.workspace.getLeaf(newLeaf?: boolean): WorkspaceLeaf`**: Gets a new leaf in the workspace.
*   **`this.app.workspace.revealLeaf(leaf: WorkspaceLeaf)`**: Reveals a leaf in the workspace.
*   **`AddWatchHandler`**: A custom function in `src/watcher.ts` that wraps the vault's `on` method to listen for file changes.

## Mocking Plan

For testing purposes, a mock of the Obsidian API is needed. The current mock is minimal and should be extended to cover the APIs used in this plugin.

### UI Mocking

All calls to the UI should be faked. This includes:

*   `this.registerView`
*   `this.addRibbonIcon`
*   `this.addSettingTab`
*   `this.app.workspace.getLeaf`
*   `this.app.workspace.revealLeaf`

These methods can be replaced with empty functions or functions that log the call for verification in tests.

### File System Mocking

The file system mock should be stateful and allow for manipulation in tests.

*   **In-Memory File System:** Use a `Map<string, {content: Uint8Array, mtime: number, ctime: number, size: number}>` to represent the file system. The key would be the file path, and the value would be an object containing the file's content and metadata.
*   **Mock `app.vault` and `app.vault.adapter`:**
    *   Implement the file system methods (`readBinary`, `writeBinary`, `createBinary`, `modifyBinary`, `trash`, `mkdir`, etc.) to operate on the in-memory file system.
    *   `trash` can move the file to a separate in-memory "trash" map.
*   **Test-Specific Helpers:**
    *   Provide helper functions to tests to easily add, modify, or delete files in the in-memory file system.
    *   Allow tests to modify file metadata like `mtime` to simulate user changes. This will allow testing the file watcher logic.
    *   For example, a test could call `mockFS.setFile("path/to/file.md", "new content", { mtime: Date.now() })` to trigger the file modification handlers in the plugin.
*   **`TFile` and `TFolder`:**
    *   Create mock `TFile` and `TFolder` classes that hold the path and a reference to the mock file system. This will allow methods like `file.path` to work as expected.
*   **Watcher Mock:**
    *   The `AddWatchHandler` mock should allow tests to manually trigger file change events (`create`, `modify`, `delete`, `rename`). This will allow for testing the `FileSyncer`'s reaction to file changes without relying on the real file system.
