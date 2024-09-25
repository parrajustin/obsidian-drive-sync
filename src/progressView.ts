import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import { ConvergenceAction } from "./sync/converge_file_models";
import type { Option } from "./lib/option";
import type { StatusError } from "./lib/status_error";

export const PROGRESS_VIEW_TYPE = "drive-sync-progress-view";
const MAX_NUMBER_OF_CHANGES = 150;

interface SyncProgress {
    fileId: string;
    initalFileName: Option<string>;
    finalFileName: string;
    actionTaken: ConvergenceAction;
    progress: number;
    updateProgress?: (amount: number) => void;
}

class SyncerPublishedCycle {
    constructor(
        public numOfUpdates: number,
        public updateTime: number
    ) {}
}

class SyncerError {
    constructor(public error: StatusError) {}
}

export class SyncProgressView extends ItemView {
    private _progressDiv: Element;
    /** The list of in progress entries. */
    private _progressListDiv: HTMLDivElement;
    private _historicalDiv: Element;
    /** Past cycle of sync changes. */
    private _historicalChanges: (SyncProgress | SyncerPublishedCycle | SyncerError)[] = [];
    /** The current cycle of sync changes. */
    private _currentCycleChanges: SyncProgress[] = [];
    private _mapOfCurrentCycleChanges = new Map<string, SyncProgress>();

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        const container = this.containerEl.children[1] as Element;
        container.empty();
        container.createEl("h2", { text: "Sync Progress View" });

        this._progressDiv = container.createEl("div", "progress-div");
        this._historicalDiv = container.createEl("div", "hsitorical-div");
        this.updateProgressView();
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
     * Publish that a full sync cycle is done.
     * @param numOfUpdates number of updates that took place in the cycle.
     * @param updateTime the total number of MS that the update took.
     */
    public publishSyncerCycleDone(numOfUpdates: number, updateTime: number) {
        this._historicalChanges = [
            new SyncerPublishedCycle(numOfUpdates, updateTime),
            ...this._currentCycleChanges,
            ...this._historicalChanges
        ].slice(0, MAX_NUMBER_OF_CHANGES);
        this._currentCycleChanges = [];
        this._mapOfCurrentCycleChanges = new Map<string, SyncProgress>();
        this.updateProgressView();
    }

    /** Publishes a syncer error to the progress view. */
    public publishSyncerError(error: StatusError) {
        this._historicalChanges = [
            new SyncerError(error),
            ...this._currentCycleChanges,
            ...this._historicalChanges
        ].slice(0, MAX_NUMBER_OF_CHANGES);
        this._currentCycleChanges = [];
        this._mapOfCurrentCycleChanges = new Map<string, SyncProgress>();
        this.updateProgressView();
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

        this.createInProgressEntry(this._progressListDiv, syncProgress);
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
        entry.progress = Math.max(entry.progress, Math.min(1, progress));
        if (entry.updateProgress) {
            entry.updateProgress(entry.progress);
        }
    }

    /** Updates the progress viewer. */
    public updateProgressView() {
        this._progressDiv.empty();
        this._progressDiv.createEl("h4", { text: "In Progress Sync:" });
        this._progressListDiv = this._progressDiv.createDiv("progress-list");
        this._progressListDiv.style.display = "flex";
        this._progressListDiv.style.flexDirection = "column";

        for (const entry of this._currentCycleChanges) {
            this.createInProgressEntry(this._progressListDiv, entry);
        }

        this._historicalDiv.empty();
        this._historicalDiv.createEl("h4", { text: "Historical Sync:" });
        const historicalContainer = this._historicalDiv.createDiv("history-list");
        historicalContainer.style.display = "flex";
        historicalContainer.style.flexDirection = "column";

        for (const entry of this._historicalChanges) {
            if (entry instanceof SyncerPublishedCycle) {
                console.log("Finish entry", entry);
                continue;
            }
            if (entry instanceof SyncerError) {
                console.error("Syncer error", entry);
                continue;
            }
            this.createInProgressEntry(historicalContainer, entry);
        }
    }

    public async onOpen() {
        this.updateProgressView();
    }

    public async onClose() {
        // Nothing to clean up.
    }

    private createInProgressEntry(
        container: HTMLDivElement,
        syncProgress: SyncProgress,
        noProgress: boolean = false
    ) {
        const entryDiv = container.createDiv("progress-entry");
        entryDiv.style.display = "flex";
        entryDiv.style.flexDirection = "row";
        const iconName =
            syncProgress.actionTaken === ConvergenceAction.USE_CLOUD
                ? "cloud-download"
                : "hard-drive-upload";
        const iconSpan = createSpan({
            cls: "progress-icons",
            attr: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-label": syncProgress.fileId,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "data-icon": iconName,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-hidden": "true"
            }
        });
        if (syncProgress.actionTaken === ConvergenceAction.USE_CLOUD) {
            iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-download"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>`;
        } else {
            iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-drive-upload"><path d="m16 6-4-4-4 4"/><path d="M12 2v8"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>`;
        }
        entryDiv.appendChild(iconSpan);

        const progressFields = entryDiv.createDiv("progress-fields");
        progressFields.style.display = "flex";
        progressFields.style.flexDirection = "column";
        progressFields.style.width = "100%";
        progressFields.createEl("span", {
            text: `${syncProgress.finalFileName}${syncProgress.initalFileName.andThen((v) => ` from: ${v}`).valueOr("")}`
        });

        if (!noProgress) {
            const progressBar = progressFields.createDiv("entry-progress-bar");
            progressBar.style.backgroundColor = "#e0e0e0";
            progressBar.style.borderRadius = "3px";
            progressBar.style.boxShadow = "inset 0 1px 3px rgba(0, 0, 0, .2)";
            const progressBarFill = progressBar.createDiv("entry-progress-bar-fill");
            progressBarFill.style.height = "8px";
            progressBarFill.style.backgroundColor = "#659cef";
            progressBarFill.style.borderRadius = "3px";
            progressBarFill.style.width = `${syncProgress.progress * 100}%`;
            syncProgress.updateProgress = (amount: number) => {
                progressBarFill.style.width = `${amount * 100}%`;
            };
        }
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
