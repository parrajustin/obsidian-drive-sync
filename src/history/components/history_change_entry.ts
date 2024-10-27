import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { Option } from "../../lib/option";
import { FileNode } from "../../sync/file_node";
import type { HistoryFileNodeExtra } from "../history_schema";
import { CreateIcon, IconName } from "../../ui/icon";

@customElement("history-change-entry")
export class HistoryChangeEntry extends LitElement {
    // Define scoped styles right with your component, in plain CSS
    static styles = css`
        .change-container {
            display: flex;
            flex-direction: row;
            border: 1px dotted;
        }
        .property-container {
            display: flex;
            flex: 1 1 auto;
            flex-direction: column;
            overflow-x: auto;
        }
        .actions-container {
            display: flex;
            flex: 0 0 auto;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .icon-btn {
            cursor: pointer;
        }
        .icon-btn:active {
            border: 1px dotted white;
        }
        .row {
            display: flex;
            flex-direction: row;
        }
        .row .trim {
            overflow: hidden;
            text-overflow: ellipsis;
        }
    `;

    @property()
    public changeFileNode: FileNode<Option<string>, HistoryFileNodeExtra>;

    @property()
    public isActive = false;

    // Render the UI as a function of component state
    public override render() {
        const diffIcon = CreateIcon("Dif", IconName.DIFF);
        const setActive = CreateIcon("Set Active", IconName.ASTERICK);
        return html`<div class="change-container">
            <div class="property-container">
                <span>${this.changeFileNode.data.fullPath}</span>
                <span
                    >${window
                        .moment(this.changeFileNode.data.mtime)
                        .format("MMMM Do YYYY, h:mm:ss a")}</span
                >
                ${this.changeFileNode.data.deviceId
                    .andThen((n) => html`<span>${n}</span>`)
                    .valueOr(html``)}
                <span>Size: ${this.changeFileNode.data.size}</span>
                ${this.changeFileNode.data.fileHash
                    .andThen(
                        (n) =>
                            html`<div class="row">
                                <span>Hash:</span><span class="trim">${n}</span>
                            </div>`
                    )
                    .valueOr(html``)}
            </div>
            <div class="actions-container">
                <div class="icon-btn">${diffIcon}</div>
                ${!this.isActive ? html`<div class="icon-btn">${setActive}</div>` : html``}
            </div>
        </div>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "history-change-entry": HistoryChangeEntry;
    }
}
