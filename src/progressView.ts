import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import type { ConvergenceUpdate } from "./sync/converge_file_models";
import { ConvergenceAction } from "./sync/converge_file_models";

export const PROGRESS_VIEW_TYPE = "drive-sync-progress-view";

export class SyncProgressView extends ItemView {
    private _detectedChanges: Element;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
    }

    public getViewType() {
        return PROGRESS_VIEW_TYPE;
    }

    public getDisplayText() {
        return "Sync Progress View";
    }

    /**
     * Adds the following as updates to the system.
     * @param updates convergence updates that will take place soon.
     */
    public addDetectedChanges(updates: ConvergenceUpdate[]) {
        this._detectedChanges.createEl("h4", { text: "Detected Changes:" });
        const convertToString = (update: ConvergenceUpdate): string => {
            switch (update.action) {
                case ConvergenceAction.USE_CLOUD:
                    return `[${update.action}] ${update.localState.andThen((v) => v.fullPath).valueOr("Creating new local file")} <- ${update.cloudState.safeValue().fileId.safeValue()}`;
                case ConvergenceAction.USE_LOCAL:
                case ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID:
                    return `[${update.action}] ${update.localState.safeValue().fullPath} -> ${update.cloudState.andThen((s) => s.fileId.safeValue()).valueOr("Creating new cloud item")}`;
            }
        };
        const listOfChanges = this._detectedChanges.createEl("ul");
        updates.map(convertToString).forEach((value) => {
            listOfChanges.createEl("li", { text: value });
        });
    }

    public async onOpen() {
        console.log(this.containerEl);
        const container = this.containerEl.children[1] as Element;
        container.empty();
        container.createEl("h2", { text: "Sync Progress View" });

        this._detectedChanges = container.createEl("div");
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
