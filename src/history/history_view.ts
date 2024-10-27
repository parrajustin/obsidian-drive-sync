import type { App, WorkspaceLeaf } from "obsidian";
import { ItemView } from "obsidian";
import { None, Some } from "../lib/option";
import type { Option } from "../lib/option";
import type { FirebaseHistory } from "./firebase_hist";
import type { RootPart } from "lit";
import { html, render } from "lit";
import type { HistoryEntryData } from "./components/history_entry_data";
import { createContext } from "@lit/context";
import type { Firestore } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import "./components/history_container";
import "./components/history_entry";
import "./components/history_change_entry";

let CURRENT_HISTORY_VIEW: Option<WorkspaceLeaf> = None;
export const HISTORY_VIEW_TYPE = "drive-sync-history-view";

export interface AppContext {
    app: App;
    db: Firestore;
    creds: UserCredential;
}

const CONTEXT_KEY = Symbol.for("AppContext");
export const appContext = createContext<AppContext, typeof CONTEXT_KEY>(CONTEXT_KEY);

export class HistoryProgressView extends ItemView {
    private _container: HTMLElement;
    private _history: Option<FirebaseHistory> = None;
    private _rootPart: Option<RootPart> = None;

    constructor(leaf: WorkspaceLeaf) {
        super(leaf);
        this.icon = "file-clock";
        const elem = this.containerEl.children[1]!;
        elem.empty();
        this._container = elem.createDiv();
    }

    public setHistory(history: FirebaseHistory) {
        if (this._history.some) {
            this._history.safeValue().activeHistoryView = None;
        }
        this._history = Some(history);
        history.activeHistoryView = Some(this);
        this.updateView();
    }

    public clearHistory() {
        this._history = None;
        this.updateView();
    }

    public getViewType() {
        return HISTORY_VIEW_TYPE;
    }

    public getDisplayText() {
        return "History View";
    }

    public override onOpen() {
        this.updateView();
        return Promise.resolve();
    }

    public override onClose() {
        CURRENT_HISTORY_VIEW = None;
        return Promise.resolve();
    }

    public updateView() {
        if (this._rootPart.some) {
            this._rootPart.safeValue().setConnected(false);
            this._rootPart = None;
        }
        if (this._history.none) {
            this._container.empty();
            return;
        }

        // Convert history nodes to a format for the lit html.
        const history = this._history.safeValue().getHistoricNodes();
        const mapFileIdToNodes = new Map<string, HistoryEntryData>();
        for (const [_, entry] of history) {
            let mapEntry = mapFileIdToNodes.get(entry.data.fileId.safeValue());
            if (mapEntry === undefined) {
                const localFileNode = this._history
                    .safeValue()
                    .getLocalFileNodeFromId(entry.data.fileId.safeValue());
                mapEntry = {
                    fileId: entry.data.fileId.safeValue(),
                    localFile: localFileNode,
                    historyNodes: [entry],
                    latestModification: Math.max(
                        localFileNode.andThen((n) => n.data.mtime).valueOr(0),
                        entry.data.mtime
                    )
                };
                mapFileIdToNodes.set(entry.data.fileId.safeValue(), mapEntry);
            } else {
                mapEntry.latestModification = Math.max(
                    mapEntry.latestModification,
                    entry.data.mtime
                );
                mapEntry.historyNodes.push(entry);
            }
        }
        const historyEntries = [...mapFileIdToNodes.entries()].map((x) => x[1]);
        // Sorts descending by latest modification time.
        historyEntries.sort((a, b) => b.latestModification - a.latestModification);
        historyEntries.forEach((n) => {
            n.historyNodes.sort((a, b) => b.data.mtime - a.data.mtime);
        });

        render(
            html`<history-container
                .context="${{
                    app: this.app,
                    db: this._history.safeValue().db,
                    creds: this._history.safeValue().creds
                }}"
                .vaultName="${this._history.safeValue().getVaultName()}"
                .historyEntries="${historyEntries}"
            ></history-container>`,
            this._container,
            { isConnected: true, host: this }
        );
    }
}

/**
 * Get or creates the `HistoryProgressView`.
 * @param app obsidian app
 * @param reveal if the leaf should be brougth to focus.
 */
export async function GetOrCreateHistoryProgressView(
    app: App,
    reveal = true
): Promise<HistoryProgressView> {
    // Wait for layout ready.
    await new Promise<void>((resolve) => {
        app.workspace.onLayoutReady(() => {
            resolve();
        });
    });

    const { workspace } = app;
    if (CURRENT_HISTORY_VIEW.some) {
        if (reveal) {
            // "Reveal" the leaf in case it is in a collapsed sidebar
            await workspace.revealLeaf(CURRENT_HISTORY_VIEW.safeValue());
        }
        return CURRENT_HISTORY_VIEW.safeValue().view as HistoryProgressView;
    }

    // Remove any pre-existing leaves.
    const leaves = workspace.getLeavesOfType(HISTORY_VIEW_TYPE);
    for (const rightLeaf of leaves) {
        rightLeaf.detach();
    }

    const leaf = workspace.getRightLeaf(false)!;
    await leaf.setViewState({ type: HISTORY_VIEW_TYPE, active: true });

    if (reveal) {
        // "Reveal" the leaf in case it is in a collapsed sidebar
        await workspace.revealLeaf(leaf);
    }
    CURRENT_HISTORY_VIEW = Some(leaf);
    return leaf.view as HistoryProgressView;
}
