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
import { Signal, signal } from "@lit-labs/signals";
import type { FilePathType, LocalNode } from "../sync/file_node";
import { DiffModal } from "./components/diff_modal/diff_modal";
import { HistoricFileNode } from "./history_file_node";
import "./components/history_container";
import "./components/history_entry";
import "./components/history_change_entry";

let CURRENT_HISTORY_VIEW: Option<WorkspaceLeaf> = None;
export const HISTORY_VIEW_TYPE = "drive-sync-history-view";

export const DIFF_SIGNAL = signal<
    [Option<LocalNode | HistoricFileNode>, Option<LocalNode | HistoricFileNode>]
>([None, None]);

export interface AppContext {
    app: App;
    db: Firestore;
    creds: UserCredential;
    diff: typeof DIFF_SIGNAL;
}

const CONTEXT_KEY = Symbol.for("AppContext");
export const appContext = createContext<AppContext, typeof CONTEXT_KEY>(CONTEXT_KEY);

/** The right leaf history view. */
export class HistoryProgressView extends ItemView {
    private _container: HTMLElement;
    private _history: Option<FirebaseHistory> = None;
    private _rootPart: Option<RootPart> = None;
    private _entries: Option<HistoryEntryData[]> = None;
    private _watcher = new Signal.subtle.Watcher(() => {
        void (async () => {
            // Wait to let the signals notification phase pass.
            await Promise.resolve();

            const data = DIFF_SIGNAL.get();
            if (this._history.some && data[0].some && data[1].some && this._entries.some) {
                const filePath = data[0].safeValue().data.fullPath;
                const historyIds = data
                    .map((n) => {
                        if (n instanceof HistoricFileNode) {
                            return n.extra.historyDocId;
                        }
                        return "";
                    })
                    .filter((n) => n !== "");
                let countFound = 0;
                let baseNode: Option<HistoricFileNode> = None;
                const thisHistoryDocNodes = this._entries
                    .safeValue()
                    .find((v) => v.filePath === filePath);
                for (const entry of thisHistoryDocNodes?.historyNodes ?? []) {
                    if (countFound === historyIds.length) {
                        baseNode = Some(entry);
                        break;
                    }
                    if (historyIds.contains(entry.extra.historyDocId)) {
                        countFound++;
                    }
                }
                const modal = new DiffModal(
                    this.app,
                    this._history.safeValue().db,
                    this._history.safeValue().creds,
                    baseNode,
                    data[0].safeValue(),
                    data[1].safeValue()
                );
                modal.open();
            }
        })();
        this._watcher.watch();
    });

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
        this._watcher.watch(DIFF_SIGNAL);
        return Promise.resolve();
    }

    public override onClose() {
        CURRENT_HISTORY_VIEW = None;
        this._watcher.unwatch(DIFF_SIGNAL);
        return Promise.resolve();
    }

    /** Update the history view content. */
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
        const nodesByFilePath = new Map<FilePathType, HistoryEntryData>();
        for (const [_, entry] of history) {
            let mapEntry = nodesByFilePath.get(entry.data.fullPath);
            if (mapEntry === undefined) {
                const localFileNode = this._history
                    .safeValue()
                    .getLocalFileNodeFromFilePath(entry.data.fullPath);
                mapEntry = {
                    filePath: entry.data.fullPath,
                    localFile: localFileNode,
                    historyNodes: [entry],
                    latestModification: Math.max(
                        localFileNode.andThen((n) => n.metadata.firestoreTime).valueOr(0),
                        entry.metadata.firestoreTime.safeValue()
                    )
                };
                nodesByFilePath.set(entry.data.fullPath, mapEntry);
            } else {
                mapEntry.latestModification = Math.max(
                    mapEntry.latestModification,
                    entry.metadata.firestoreTime.safeValue()
                );
                mapEntry.historyNodes.push(entry);
            }
        }
        this._entries = Some([...nodesByFilePath.entries()].map((x) => x[1]));
        // Sorts descending by latest modification time.
        this._entries.safeValue().sort((a, b) => b.latestModification - a.latestModification);
        this._entries.safeValue().forEach((n) => {
            n.historyNodes.sort(
                (a, b) =>
                    b.metadata.firestoreTime.safeValue() - a.metadata.firestoreTime.safeValue()
            );
        });

        const context: AppContext = {
            app: this.app,
            db: this._history.safeValue().db,
            creds: this._history.safeValue().creds,
            diff: DIFF_SIGNAL
        };
        render(
            html`<history-container
                .context="${context}"
                .vaultName="${this._history.safeValue().getVaultName()}"
                .historyEntries="${this._entries.safeValue()}"
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
