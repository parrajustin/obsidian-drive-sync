import { LitElement, css, html } from "lit";
import { customElement, property, query, state } from "lit/decorators.js";
import type { HistoryEntryData } from "./history_entry_data";
import { CreateIcon, IconName } from "../../ui/icon";

@customElement("history-entry")
export class HistoryEntry extends LitElement {
    // Define scoped styles right with your component, in plain CSS
    static styles = css`
        .history-entry-container {
            display: flex;
            flex-direction: column;
            border-bottom: 1px solid white;
        }
        .header-entry-header {
            display: flex;
            flex-direction: row;
        }
        .left-history-entry {
            display: flex;
            flex-direction: column;
            width: 100%;
        }
        .right-history-entry {
            cursor: pointer;
            width: 16px;
        }
        .header-entry-list {
            display: flex;
            flex-direction: column;
            max-height: 0px;
            transition: max-height 0.25s ease-out;
            overflow-y: auto;
            border-left: 2px solid white;
            padding-left: 4px;
            gap: 4px;
        }
    `;

    @property()
    public historyEntry: HistoryEntryData;

    @state()
    private _isOpen = false;

    @query(".header-entry-list")
    private _entryList: HTMLDivElement;

    // Render the UI as a function of component state
    public override render() {
        if (this.historyEntry.historyNodes.length === 0) {
            return html`<span>No historic nodes... "${this.historyEntry.filePath}"</span>`;
        }
        const icon = this._isOpen
            ? CreateIcon("Close", IconName.CIRCLE_CHEVRON_UP)
            : CreateIcon("Open", IconName.CIRCLE_CHEVRON_DOWN);
        return html`<div class="history-entry-container">
            <div class="header-entry-header">
                <div class="left-history-entry">
                    <span>${this.getLatestPath()}</span>
                    <span>File Path: ${this.historyEntry.filePath}</span>
                </div>
                <div
                    class="right-history-entry"
                    @click="${() => {
                        this.toggleOpen();
                    }}"
                >
                    ${icon}
                </div>
            </div>
            <div class="header-entry-list">
                ${this.historyEntry.localFile.some
                    ? html`<span>Current File:</span>
                          <history-change-entry
                              .isActive="${true}"
                              .changeFileNode="${this.historyEntry.localFile.safeValue()}"
                          ></history-change-entry>`
                    : html``}
                <span>Historic Changes:</span>
                ${this.historyEntry.historyNodes.map(
                    (n) =>
                        html`<history-change-entry .changeFileNode="${n}"></history-change-entry>`
                )}
            </div>
        </div>`;
    }

    private toggleOpen() {
        if (this._isOpen) {
            this._entryList.style.maxHeight = "0px";
        } else {
            this._entryList.style.maxHeight = "800px";
        }
        this._isOpen = !this._isOpen;
    }

    /** Get the full file path. */
    private getLatestPath(): string {
        if (this.historyEntry.localFile.some) {
            return this.historyEntry.localFile.safeValue().data.fullPath;
        }
        return this.historyEntry.historyNodes[0]!.data.fullPath;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "history-entry": HistoryEntry;
    }
}
