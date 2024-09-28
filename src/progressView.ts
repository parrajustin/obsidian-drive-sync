import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import { ConvergenceAction } from "./sync/converge_file_models";
import { None, Some, type Option } from "./lib/option";
import { ErrorCode, type StatusError } from "./lib/status_error";
import type { SyncerConfig } from "./sync/syncer";

export const PROGRESS_VIEW_TYPE = "drive-sync-progress-view";
const MAX_NUMBER_OF_CYCLES = 50;

interface SyncProgress {
    fileId: string;
    initalFileName: Option<string>;
    finalFileName: string;
    actionTaken: Exclude<ConvergenceAction, ConvergenceAction.NULL_UPDATE>;
    progress: number;
    updateProgress?: (amount: number) => void;
}

class SyncerPublishedCycle {
    constructor(
        public numOfUpdates: number,
        public leftOverUpdates: number,
        public updateTime: number
    ) {}
}

class SyncerError {
    constructor(public error: StatusError) {}
}

interface CycleProgress {
    /** Id of the syncer. */
    syncerId: string;
    /** Id of this cycle. */
    cycleId: string;
    /** Last update ms from unix epoch for sorting. */
    lastUpdate: number;
    /** Final publishing entry. */
    publishedEntry: Option<SyncerPublishedCycle>;
    /** Changes that have been published. */
    changesInCycle: (SyncProgress | SyncerError)[];
    /** File id to progress of upload. */
    mapOfCurrentCycleChanges: Map<string, SyncProgress>;
    /** Container for the entire element. */
    progressContainerDiv?: HTMLDivElement;
    /** The div of the list. */
    listDiv?: HTMLDivElement;
}

enum IconName {
    FOLDER_SYNC = "folder-sync",
    CLOUD_DOWNLOAD = "cloud-download",
    TRASH_2 = "trash-2",
    HARD_DRIVE_UPLOAD = "hard-drive-upload",
    ROUTE = "route"
}

export class SyncProgressView extends ItemView {
    /** Container for all progress elements. */
    private _progressContainer: Element;
    /** The list of in progress entries. */
    private _progressListContainer: HTMLDivElement;
    private _historicalDiv: Element;
    /** Past cycle of sync changes. */
    private _historicalChanges: CycleProgress[] = [];
    /** The current cycle of sync changes. */
    private _currentCycleChanges: CycleProgress[] = [];
    /** Syncer Id to progress. */
    private _mapSyncerCycleToCurrentProgress = new Map<string, CycleProgress>();
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
        this._progressContainer = container.createEl("div", "progress-div");
        this._historicalDiv = container.createEl("div", "hsitorical-div");
        this.updateProgressView();
    }

    public getViewType() {
        return PROGRESS_VIEW_TYPE;
    }

    public getDisplayText() {
        return "Sync Progress View";
    }

    public resetView() {
        this._historicalChanges.unshift(...this._currentCycleChanges);
        this._historicalChanges.sort((a, b) => b.lastUpdate - a.lastUpdate);
        this._historicalChanges = this._historicalChanges.slice(0, MAX_NUMBER_OF_CYCLES);
        this._currentCycleChanges = [];
        this._mapSyncerCycleToCurrentProgress = new Map();
        this._syncerConfigs = [];
        this.updateProgressView();
    }

    /** Set all the syncer configs to setup the view. */
    public setSyncers(configs: SyncerConfig[]) {
        this._syncerDiv.empty();
        this._syncerConfigs = configs;
        for (const config of this._syncerConfigs) {
            this._syncerStatuses.set(config.syncerId, this._syncerDiv.createSpan());
        }
        this.updateProgressView();
        for (const config of this._syncerConfigs) {
            this.setSyncerStatus(config.syncerId, "No data");
        }
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
        this.updateProgressView();
    }

    /** Set the status of the syncer plugin overall. */
    public setStatus(status: string) {
        this._headerElement.innerText = `Sync Progress View (${status})`;
    }

    /** Tell the progress viewer that a new syncer cycle has started. */
    public newSyncerCycle(syncerId: string, cycleId: string) {
        const lastCycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        let hasChange = false;
        if (lastCycle !== undefined && lastCycle.changesInCycle.length > 0) {
            hasChange = true;
            this._historicalChanges.unshift(lastCycle);
            this._historicalChanges.sort((a, b) => b.lastUpdate - a.lastUpdate);
            this._historicalChanges = this._historicalChanges.slice(0, MAX_NUMBER_OF_CYCLES);
        }
        this._currentCycleChanges = this._currentCycleChanges.filter((p) => p !== lastCycle);

        const newCycle: CycleProgress = {
            syncerId,
            cycleId,
            lastUpdate: Date.now(),
            publishedEntry: None,
            changesInCycle: [],
            mapOfCurrentCycleChanges: new Map(),
            listDiv: undefined,
            progressContainerDiv: undefined
        };
        this._mapSyncerCycleToCurrentProgress.set(syncerId, newCycle);
        this._currentCycleChanges.push(newCycle);
        this._historicalChanges.sort((a, b) => b.lastUpdate - a.lastUpdate);
        newCycle.lastUpdate = Date.now();
        if (hasChange) {
            this.updateProgressView();
        }
    }

    /**
     * Publish that a full sync cycle is done.
     * @param numOfUpdates number of updates that took place in the cycle.
     * @param updateTime the total number of MS that the update took.
     */
    public publishSyncerCycleDone(
        syncerId: string,
        numOfUpdates: number,
        leftOverUpdates: number,
        updateTime: number
    ) {
        const cycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        if (cycle === undefined) {
            return;
        }
        cycle.publishedEntry = Some(
            new SyncerPublishedCycle(numOfUpdates, leftOverUpdates, updateTime)
        );
        cycle.lastUpdate = Date.now();
        this.updateProgressView();
    }

    /** Publishes a syncer error to the progress view. */
    public publishSyncerError(syncerId: string, error: StatusError) {
        const cycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        if (cycle === undefined) {
            return;
        }
        cycle.changesInCycle.push(new SyncerError(error));
        cycle.lastUpdate = Date.now();
        this.updateProgressView();
    }

    /**
     * Adds a progress entry to the view.
     * @param syncerId the syncer id
     * @param fileId the file id
     * @param initalFileName the initial file path if it differs
     * @param finalFileName the final file path
     * @param actionTaken the action that is taken to converge
     */
    public addEntry(
        syncerId: string,
        fileId: string,
        initalFileName: Option<string>,
        finalFileName: string,
        actionTaken: Exclude<ConvergenceAction, ConvergenceAction.NULL_UPDATE>
    ) {
        const cycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        if (cycle === undefined) {
            return;
        }
        const syncProgress: SyncProgress = {
            fileId,
            initalFileName,
            finalFileName,
            actionTaken,
            progress: 0
        };
        cycle.changesInCycle.unshift(syncProgress);
        cycle.mapOfCurrentCycleChanges.set(syncProgress.fileId, syncProgress);
        cycle.lastUpdate = Date.now();

        const listDiv = cycle.listDiv;
        if (listDiv === undefined) {
            this.updateProgressView();
            return;
        }
        this.createInProgressEntry(listDiv, syncProgress);
    }

    /**
     * Sets an entries progress on the view.
     * @param fileId the file id of the entry
     * @param progress the progress [0, 1] to set it to.
     */
    public setEntryProgress(syncerId: string, fileId: string, progress: number) {
        const cycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        if (cycle === undefined) {
            return;
        }
        const progressEntry = cycle.mapOfCurrentCycleChanges.get(fileId);
        if (progressEntry === undefined) {
            return;
        }
        progressEntry.progress = progress;
        cycle.lastUpdate = Date.now();

        // If the update progress function exists use that.
        if (progressEntry.updateProgress !== undefined) {
            progressEntry.updateProgress(progress);
            return;
        }

        // If not try to just re create the progress div.
        const listDiv = cycle.listDiv;
        if (listDiv === undefined) {
            // Fail just update the whole panel.
            this.updateProgressView();
            return;
        }
        this.createInProgressEntry(listDiv, progressEntry);
    }

    /** Updates the progress viewer. */
    public updateProgressView() {
        this._progressContainer.empty();
        this._progressContainer.createEl("h4", { text: "In Progress Sync:" });
        this._progressListContainer = this._progressContainer.createDiv("progress-list");
        this._progressListContainer.style.display = "flex";
        this._progressListContainer.style.flexDirection = "column";

        for (const entry of this._currentCycleChanges) {
            if (entry.changesInCycle.length === 0) {
                continue;
            }
            const containerForProgressEntry = this._progressListContainer.createDiv(entry.cycleId);
            this.createSyncBlock(containerForProgressEntry, entry);
        }

        this._historicalDiv.empty();
        this._historicalDiv.createEl("h4", { text: "Historical Sync:" });
        const historicalContainer = this._historicalDiv.createDiv("history-list");
        historicalContainer.style.display = "flex";
        historicalContainer.style.flexDirection = "column";

        for (const entry of this._historicalChanges) {
            const containerForProgressEntry = historicalContainer.createDiv(entry.cycleId);
            this.createSyncBlock(containerForProgressEntry, entry);
        }
    }

    public async onOpen() {
        this.updateProgressView();
    }

    public async onClose() {
        CURRENT_PROGRESS_VIEW = None;
    }

    /** Create a sync block information. */
    private createSyncBlock(container: HTMLDivElement, cycle: CycleProgress) {
        cycle.progressContainerDiv = container;
        container.classList.add("syncer-group");

        const header = container.createDiv("syncer-group-header");
        this.createIcon(header, cycle.cycleId, IconName.FOLDER_SYNC);
        const headerText = header.createDiv("group-header-text");
        const syncerIdText = headerText.createEl("span");
        syncerIdText.innerText = `syncer: ${cycle.syncerId}`;
        const cycleId = headerText.createEl("span");
        cycleId.innerText = `cycle: ${cycle.cycleId}`;

        const body = container.createDiv("syncer-group-body");
        body.createDiv("group-body-border");
        cycle.listDiv = body.createDiv("group-body-list");

        if (cycle.publishedEntry.some) {
            this.createPublishStats(cycle.listDiv, cycle.publishedEntry.safeValue());
        }
        for (const entry of cycle.changesInCycle) {
            if (entry instanceof SyncerError) {
                this.createErrorEntry(cycle.listDiv, entry);
                continue;
            }
            this.createInProgressEntry(cycle.listDiv, entry);
        }
    }

    /** Create an icon span. */
    private createIcon(container: Element, hoverToolTip: string, iconName: IconName) {
        const iconSpan = createSpan({
            cls: "progress-icons",
            attr: {
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-label": hoverToolTip,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "data-icon": iconName,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "aria-hidden": "true"
            }
        });
        switch (iconName) {
            case IconName.FOLDER_SYNC:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-sync"><path d="M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5"/><path d="M12 10v4h4"/><path d="m12 14 1.535-1.605a5 5 0 0 1 8 1.5"/><path d="M22 22v-4h-4"/><path d="m22 18-1.535 1.605a5 5 0 0 1-8-1.5"/></svg>`;
                break;
            case IconName.CLOUD_DOWNLOAD:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-download"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>`;
                break;
            case IconName.TRASH_2:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
                break;
            case IconName.HARD_DRIVE_UPLOAD:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-drive-upload"><path d="m16 6-4-4-4 4"/><path d="M12 2v8"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>`;
                break;
            case IconName.ROUTE:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-route"><circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/></svg>`;
                break;
        }
        container.appendChild(iconSpan);
    }

    private createPublishStats(container: HTMLDivElement, cycle: SyncerPublishedCycle) {
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
        if (cycle.leftOverUpdates > 0) {
            cycleStats.createEl("span").innerText = `#updatesleft: ${cycle.leftOverUpdates}`;
        }
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
            case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
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
            case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
            case ConvergenceAction.USE_CLOUD:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-cloud-download"><path d="M12 13v8l-4-4"/><path d="m12 21 4-4"/><path d="M4.393 15.269A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.436 8.284"/></svg>`;
                break;
            case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-trash-2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`;
                break;
            case ConvergenceAction.USE_LOCAL:
            case ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID:
                iconSpan.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-hard-drive-upload"><path d="m16 6-4-4-4 4"/><path d="M12 2v8"/><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>`;
                break;
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

let CURRENT_PROGRESS_VIEW: Option<WorkspaceLeaf> = None;
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
    if (CURRENT_PROGRESS_VIEW.some) {
        if (reveal) {
            // "Reveal" the leaf in case it is in a collapsed sidebar
            workspace.revealLeaf(CURRENT_PROGRESS_VIEW.safeValue());
        }
        return CURRENT_PROGRESS_VIEW.safeValue().view as SyncProgressView;
    }

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
    CURRENT_PROGRESS_VIEW = Some(leaf);
    return leaf.view as SyncProgressView;
}
