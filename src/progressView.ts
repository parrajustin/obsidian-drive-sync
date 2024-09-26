import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import { ConvergenceAction } from "./sync/converge_file_models";
import type { Option } from "./lib/option";
import { ErrorCode, type StatusError } from "./lib/status_error";
import type { SyncerConfig } from "./sync/syncer";

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
    private _currentCycleChanges: (SyncProgress | SyncerError)[] = [];
    /** File Id to progress. */
    private _mapOfCurrentCycleChanges = new Map<string, SyncProgress>();
    /** The header element. */
    private _headerElement: HTMLHeadingElement;
    private _syncerDiv: HTMLDivElement;
    private _syncerConfigs: SyncerConfig[] = [];
    /** Statuses of individal syncers. */
    private _syncerStatuses = new Map<string, HTMLSpanElement>();

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        const container = this.containerEl.children[1] as Element;
        container.empty();
        this._headerElement = container.createEl("h2", {
            text: "Sync Progress View (Need to login...)"
        });

        this._syncerDiv = container.createEl("div", "syncer-statuses");
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

    /** Set all the syncer configs to setup the view. */
    public setSyncers(configs: SyncerConfig[]) {
        this._syncerConfigs = configs;
        this.updateProgressView();
    }

    /** Set an individual syncer status text. */
    public setSyncerStatus(syncerId: string, status: string, color?: string) {
        const statusDiv = this._syncerStatuses.get(syncerId);
        if (statusDiv === undefined) {
            return;
        }

        statusDiv.innerText = `${syncerId}: ${status}`;
        if (color !== undefined) {
            statusDiv.style.color = color;
        }
    }

    public setStatus(status: string) {
        this._headerElement.innerText = `Sync Progress View (${status})`;
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
        this._syncerDiv.empty();
        for (const config of this._syncerConfigs) {
            this._syncerStatuses.set(config.syncerId, this._syncerDiv.createSpan());
        }

        this._progressDiv.empty();
        this._progressDiv.createEl("h4", { text: "In Progress Sync:" });
        this._progressListDiv = this._progressDiv.createDiv("progress-list");
        this._progressListDiv.style.display = "flex";
        this._progressListDiv.style.flexDirection = "column";

        for (const entry of this._currentCycleChanges) {
            if (entry instanceof SyncerError) {
                this.createErrorEntry(this._progressListDiv, entry);
                continue;
            }
            this.createInProgressEntry(this._progressListDiv, entry);
        }

        this._historicalDiv.empty();
        this._historicalDiv.createEl("h4", { text: "Historical Sync:" });
        const historicalContainer = this._historicalDiv.createDiv("history-list");
        historicalContainer.style.display = "flex";
        historicalContainer.style.flexDirection = "column";

        for (const entry of this._historicalChanges) {
            if (entry instanceof SyncerPublishedCycle) {
                this.createHistoricalCycleStats(historicalContainer, entry);
                continue;
            }
            if (entry instanceof SyncerError) {
                this.createErrorEntry(historicalContainer, entry);
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

    private createHistoricalCycleStats(container: HTMLDivElement, cycle: SyncerPublishedCycle) {
        const progressDiv = container.createDiv("progress-cycle");
        progressDiv.style.display = "flex";
        progressDiv.style.flexDirection = "row";
        const iconName = "route";
        const iconSpan = createSpan({
            cls: "progress-icons",
            attr: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-label": iconName,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "data-icon": iconName,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-hidden": "true"
            }
        });
        iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-route"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`;
        progressDiv.appendChild(iconSpan);

        const cycleStats = progressDiv.createDiv("progress-fields");
        cycleStats.style.display = "flex";
        cycleStats.style.flexDirection = "column";
        cycleStats.style.width = "100%";

        cycleStats.createEl("span").innerText = `#updates: ${cycle.numOfUpdates}`;
        cycleStats.createEl("span").innerText = `#Seconds: ${cycle.updateTime / 1000}`;
    }

    private createErrorEntry(container: HTMLDivElement, error: SyncerError) {
        const errorDiv = container.createDiv("progress-entry");
        errorDiv.style.display = "flex";
        errorDiv.style.flexDirection = "row";
        const iconSpan = createSpan({
            cls: "progress-icons",
            attr: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-label": ErrorCode[error.error.errorCode],
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "data-icon": "circle-alert",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-hidden": "true"
            }
        });
        iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-circle-alert"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>`;
        errorDiv.appendChild(iconSpan);

        const errorContent = errorDiv.createDiv("progress-fields");
        errorContent.style.display = "flex";
        errorContent.style.flexDirection = "column";
        errorContent.style.width = "100%";
        errorContent.createEl("span", {
            text: error.error.toString()
        });
    }

    private createInProgressEntry(
        container: HTMLDivElement,
        syncProgress: SyncProgress,
        noProgress: boolean = false
    ) {
        const entryDiv = container.createDiv("progress-entry");
        entryDiv.style.display = "flex";
        entryDiv.style.flexDirection = "row";
        let iconName = "file-question";
        switch (syncProgress.actionTaken) {
            case ConvergenceAction.USE_CLOUD:
                iconName = "cloud-download";
                break;
            case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                iconName = "trash-2";
                break;
            case ConvergenceAction.USE_LOCAL:
            case ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID:
                iconName = "hard-drive-upload";
                break;
        }
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
        switch (syncProgress.actionTaken) {
            case ConvergenceAction.USE_CLOUD:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-download"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>`;
                break;
            case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
                break;
            case ConvergenceAction.USE_LOCAL:
            case ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID:
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
    // Wait for layout ready.
    await new Promise<void>((resolve) => {
        app.workspace.onLayoutReady(() => {
            resolve();
        });
    });
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
