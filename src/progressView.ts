import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import type { ConvergenceAction } from "./sync/converge_file_models";
import type { Option } from "./lib/option";

export const PROGRESS_VIEW_TYPE = "drive-sync-progress-view";
const MAX_NUMBER_OF_CHANGES = 150;

interface SyncProgress {
    fileId: string;
    initalFileName: Option<string>;
    finalFileName: string;
    actionTaken: ConvergenceAction;
    progress: number;
    updateProgress?: () => void;
}

export class SyncProgressView extends ItemView {
    private _progressDiv: Element;
    private _historicalDiv: Element;
    /** Past cycle of sync changes. */
    private _historicalChanges: SyncProgress[] = [];
    /** The current cycle of sync changes. */
    private _currentCycleChanges: SyncProgress[] = [];
    private _mapOfCurrentCycleChanges = new Map<string, SyncProgress>();
    private _queuedUpdateTask = false;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    public getViewType() {
        return PROGRESS_VIEW_TYPE;
    }

    public getDisplayText() {
        return "Sync Progress View";
    }

    /** Tell the progress viewer that a new syncer cycle has started. */
    public newSyncerCycle() {
        // If there are current cycle changes the progress view needs to be updated.
        const hasCurrentCycle = this._currentCycleChanges.length > 0;
        this._historicalChanges = [...this._currentCycleChanges, ...this._historicalChanges].slice(
            0,
            MAX_NUMBER_OF_CHANGES
        );
        this._currentCycleChanges = [];
        this._mapOfCurrentCycleChanges = new Map<string, SyncProgress>();
        if (hasCurrentCycle) {
            this.updateProgressView();
        }
    }

    /**
     * Adds a progress entry to the view.
     * @param fileId the file id
     * @param initalFileName the initial file path if it differs
     * @param finalFileName the final file path
     * @param actionTaken the action that is taken to converge
     */
    public addEntry(
        fileId: string,
        initalFileName: Option<string>,
        finalFileName: string,
        actionTaken: ConvergenceAction
    ) {
        const syncProgress: SyncProgress = {
            fileId,
            initalFileName,
            finalFileName,
            actionTaken,
            progress: 0
        };
        this._currentCycleChanges.unshift(syncProgress);
        this._mapOfCurrentCycleChanges.set(fileId, syncProgress);
    }

    /**
     * Sets an entries progress on the view.
     * @param fileId the file id of the entry
     * @param progress the progress [0, 1] to set it to.
     */
    public setEntryProgress(fileId: string, progress: number) {
        const entry = this._mapOfCurrentCycleChanges.get(fileId);
        if (entry === undefined) {
            return;
        }
        if (progress === -1) {
            entry.progress = -1;
        }
        if (entry.progress === -1) {
            return;
        }
        entry.progress = Math.max(0, Math.min(1, progress));
        if (!this._queuedUpdateTask) {
            this.register(
                (() => {
                    const timeout = window.setTimeout(() => {
                        this.updateProgressView();
                        this._queuedUpdateTask = false;
                    }, 0);
                    return () => {
                        this._queuedUpdateTask = false;
                        window.clearTimeout(timeout);
                    };
                })()
            );
        }
    }

    /** Updates the progress viewer. */
    public updateProgressView() {
        this._progressDiv.empty();
        this._progressDiv.createEl("h4", { text: "In Progress Sync:" });
        const progressContainer = this._progressDiv.createDiv("progress-list");
        progressContainer.style.display = "flex";
        progressContainer.style.flexDirection = "column";

        for (const entry of this._currentCycleChanges) {
            const entryDiv = progressContainer.createDiv("progress-entry");
            progressContainer.style.display = "flex";
            progressContainer.style.flexDirection = "row";
            entryDiv.createEl("span", {
                text: `[${entry.actionTaken}] ${entry.fileId} final: ${entry.finalFileName} inital: ${entry.initalFileName.valueOr("N/A")}`
            });
            const progress = entryDiv.createEl("span", {
                text: `Progress: ${entry.progress}`
            });
            entry.updateProgress = () => {
                progress.innerText = `Progress: ${entry.progress}`;
            };
        }

        this._historicalDiv.empty();
        this._historicalDiv.createEl("h4", { text: "Historical Sync:" });
        const historicalContainer = this._progressDiv.createDiv("history-list");
        historicalContainer.style.display = "flex";
        historicalContainer.style.flexDirection = "column";

        for (const entry of this._historicalChanges) {
            const entryDiv = historicalContainer.createDiv("progress-entry");
            historicalContainer.style.display = "flex";
            historicalContainer.style.flexDirection = "row";
            entryDiv.createEl("span", {
                text: `[${entry.actionTaken}] ${entry.fileId} final: ${entry.finalFileName} inital: ${entry.initalFileName.valueOr("N/A")}`
            });
            entryDiv.createEl("span", {
                text: `Progress: ${entry.progress}`
            });
            entry.updateProgress = undefined;
        }
    }

    public async onOpen() {
        const container = this.containerEl.children[1] as Element;
        container.empty();
        container.createEl("h2", { text: "Sync Progress View" });

        this._progressDiv = container.createEl("div");
        this._historicalDiv = container.createEl("div");
    }

    public async onClose() {
        // Nothing to clean up.
    }
}

/**
 * Get or creates the `SyncProgressView`.
 * @param app obsidian app
 * @param reveal if the leaf should be brougth to focus.
 */
export async function GetOrCreateSyncProgressView(
    app: App,
    reveal = true
): Promise<SyncProgressView> {
    const { workspace } = app;

    let leaf: WorkspaceLeaf | null = null;
    const leaves = workspace.getLeavesOfType(PROGRESS_VIEW_TYPE);

    if (leaves.length > 0) {
        // A leaf with our view already exists, use that
        leaf = leaves[0] as WorkspaceLeaf;
    } else {
        // Our view could not be found in the workspace, create a new leaf
        // in the right sidebar for it
        leaf = workspace.getRightLeaf(false) as WorkspaceLeaf;
        await leaf.setViewState({ type: PROGRESS_VIEW_TYPE, active: true });
    }

    if (reveal) {
        // "Reveal" the leaf in case it is in a collapsed sidebar
        workspace.revealLeaf(leaf);
    }
    return leaf.view as SyncProgressView;
}
