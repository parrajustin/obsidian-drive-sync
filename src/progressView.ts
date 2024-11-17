import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import { ConvergenceAction } from "./sync/converge_file_models";
import { None, Some, type Option } from "./lib/option";
import { ErrorCode, type StatusError } from "./lib/status_error";
import type { SyncerConfig } from "./settings/syncer_config_data";
import type { FirebaseHistory } from "./history/firebase_hist";
import type FirestoreSyncPlugin from "./main";
import type { FilePathType } from "./sync/file_node";
import { CreateIcon, IconName } from "./ui/icon";

export const PROGRESS_VIEW_TYPE = "drive-sync-progress-view";
const MAX_NUMBER_OF_CYCLES = 50;

interface SyncProgress {
    filePath: FilePathType;
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
    /** File Path to progress of upload. */
    mapOfCurrentCycleChanges: Map<FilePathType, SyncProgress>;
    /** Container for the entire element. */
    progressContainerDiv?: HTMLDivElement;
    /** The div of the list. */
    listDiv?: HTMLDivElement;
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
    /** Reference to the firebase history elements. */
    private _syncerHistory = new Map<string, FirebaseHistory>();
    /** The buttons to click to see a syncer history panel. */
    private _syncerHistBtn = new Map<string, HTMLDivElement>();
    /** firestore sync plugin. */
    private _plugin: FirestoreSyncPlugin;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.icon = "cloudy";
        const container = this.containerEl.children[1]!;
        container.empty();
        this._headerElement = container.createEl("h2", {
            text: "Sync Progress View (Need to login...)"
        });

        this._syncerDiv = container.createEl("div", "syncer-statuses");
        this._progressContainer = container.createEl("div", "progress-div");
        this._historicalDiv = container.createEl("div", "hsitorical-div");
        this._progressListContainer = this._progressContainer.createDiv("progress-list");
        this.updateProgressView();
    }

    public setSyncPlugin(plugin: FirestoreSyncPlugin) {
        this._plugin = plugin;
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
        this._syncerHistory = new Map<string, FirebaseHistory>();
        this._syncerHistBtn = new Map<string, HTMLDivElement>();
        this.updateProgressView();
    }

    /** Set all the syncer configs to setup the view. */
    public setSyncers(configs: SyncerConfig[]) {
        this._syncerConfigs = configs;
        this.updateProgressView();
        this.renderSyncers();
    }

    /** Sets the syncer history for a specific id. */
    public setSyncerHistory(config: SyncerConfig, history: FirebaseHistory) {
        this._syncerHistory.set(config.syncerId, history);
        const containerEl = this._syncerHistBtn.get(config.syncerId);
        if (containerEl !== undefined) {
            containerEl.empty();
            const btnEl = containerEl.createEl("button");
            btnEl.onclick = () => {
                void history.openPanel();
            };
            btnEl.innerText = "Open History";
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
     * @param filePath the file full path
     * @param actionTaken the action that is taken to converge
     */
    public addEntry(
        syncerId: string,
        filePath: FilePathType,
        actionTaken: Exclude<ConvergenceAction, ConvergenceAction.NULL_UPDATE>
    ) {
        const cycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        if (cycle === undefined) {
            return;
        }
        const syncProgress: SyncProgress = {
            filePath,
            actionTaken,
            progress: 0
        };
        cycle.changesInCycle.unshift(syncProgress);
        cycle.mapOfCurrentCycleChanges.set(filePath, syncProgress);
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
     * @param filePath
     * @param progress the progress [0, 1] to set it to.
     */
    public setEntryProgress(syncerId: string, filePath: FilePathType, progress: number) {
        const cycle = this._mapSyncerCycleToCurrentProgress.get(syncerId);
        if (cycle === undefined) {
            return;
        }
        const progressEntry = cycle.mapOfCurrentCycleChanges.get(filePath);
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

    public override onOpen() {
        this.updateProgressView();
        return Promise.resolve();
    }

    public override onClose() {
        CURRENT_PROGRESS_VIEW = None;
        return Promise.resolve();
    }

    /** Create a sync block information. */
    private createSyncBlock(container: HTMLDivElement, cycle: CycleProgress) {
        cycle.progressContainerDiv = container;
        container.classList.add("syncer-group");

        const header = container.createDiv("syncer-group-header");

        header.appendChild(CreateIcon(cycle.cycleId, IconName.FOLDER_SYNC));
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
        noProgress = false
    ) {
        const entryDiv = container.createDiv("progress-entry");
        entryDiv.style.display = "flex";
        entryDiv.style.flexDirection = "row";
        let iconName = IconName.FILE_QUESTION;
        switch (syncProgress.actionTaken) {
            case ConvergenceAction.USE_LOCAL_DELETE_CLOUD:
                iconName = IconName.TRASH_2;
                break;
            case ConvergenceAction.USE_CLOUD:
                iconName = IconName.CLOUD_DOWNLOAD;
                break;
            case ConvergenceAction.USE_CLOUD_DELETE_LOCAL:
                iconName = IconName.TRASH_2;
                break;
            case ConvergenceAction.USE_LOCAL:
                iconName = IconName.HARD_DRIVE_UPLOAD;
                break;
        }
        const iconSpan = CreateIcon(syncProgress.filePath, iconName);
        entryDiv.appendChild(iconSpan);

        const progressFields = entryDiv.createDiv("progress-fields");
        progressFields.style.display = "flex";
        progressFields.style.flexDirection = "column";
        progressFields.style.width = "100%";
        progressFields.createEl("span", {
            text: syncProgress.filePath
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

    private renderSyncers() {
        this._syncerDiv.empty();
        for (const config of this._syncerConfigs) {
            const container = this._syncerDiv.createDiv("progress-fields");
            container.style.display = "flex";
            container.style.flexDirection = "column";
            container.style.width = "100%";
            this._syncerStatuses.set(config.syncerId, container.createSpan());
            const btnEl = container.createEl("button");
            btnEl.onclick = () => {
                this._plugin.killSyncer(config.syncerId);
            };
            btnEl.innerText = "Kill Syncer";
            this._syncerHistBtn.set(config.syncerId, container.createDiv());
        }
        for (const config of this._syncerConfigs) {
            this.setSyncerStatus(config.syncerId, "No data");
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
            await workspace.revealLeaf(CURRENT_PROGRESS_VIEW.safeValue());
        }
        return CURRENT_PROGRESS_VIEW.safeValue().view as SyncProgressView;
    }

    // Remove any pre-existing leaves.
    const leaves = workspace.getLeavesOfType(PROGRESS_VIEW_TYPE);
    for (const rightLeaf of leaves) {
        rightLeaf.detach();
    }

    const leaf = workspace.getRightLeaf(false)!;
    await leaf.setViewState({ type: PROGRESS_VIEW_TYPE, active: true });

    if (reveal) {
        // "Reveal" the leaf in case it is in a collapsed sidebar
        await workspace.revealLeaf(leaf);
    }
    CURRENT_PROGRESS_VIEW = Some(leaf);
    return leaf.view as SyncProgressView;
}
