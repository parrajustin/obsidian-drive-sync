import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { HistoryArray } from "./history_entry_data";

@customElement("history-container")
export class HistoryContainer extends LitElement {
    // Define scoped styles right with your component, in plain CSS
    static styles = css`
        .history-entry-list {
            display: flex;
            flex-direction: column;
            width: 100%;
            gap: 4px;
        }
    `;

    // Vault name.
    @property()
    public vaultName = "No Vault";

    @property()
    public historyEntries: HistoryArray[] = [];

    // Render the UI as a function of component state
    public override render() {
        console.log("historyEntries", this.historyEntries);
        return html`<h1>History for ${this.vaultName}!</h1>
            <div class="history-entry-list">
                ${this.historyEntries.map(
                    (h) => html`<history-entry .historyEntry="${h}"></history-entry>`
                )}
            </div>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "history-container": HistoryContainer;
    }
}
