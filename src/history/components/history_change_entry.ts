import { LitElement, css, html } from "lit";
import { customElement, property } from "lit/decorators.js";
import { None, Some } from "../../lib/option";
import { LocalNode } from "../../sync/file_node";
import { CreateIcon, IconName } from "../../ui/icon";
import { ViewModal } from "./view_modal";
import { ContextConsumer } from "@lit/context";
import { appContext, DIFF_SIGNAL } from "../history_view";
import { SignalWatcher } from "@lit-labs/signals";
import { styleMap } from "lit/directives/style-map.js";
import { HistoricFileNode } from "../history_file_node";

@customElement("history-change-entry")
export class HistoryChangeEntry extends SignalWatcher(LitElement) {
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
    public changeFileNode: LocalNode | HistoricFileNode;

    @property()
    public isActive = false;

    private _appContext = new ContextConsumer(this, {
        subscribe: true,
        context: appContext
    });

    // Render the UI as a function of component state
    public override render() {
        const diffIcon = CreateIcon("Dif", IconName.DIFF);
        const viewIcon = CreateIcon("View Icon", IconName.EYE);

        const diffSelected = DIFF_SIGNAL.get();
        const firstSelected = diffSelected[0].some
            ? diffSelected[0].safeValue() === this.changeFileNode
            : false;
        const secondSelected = diffSelected[1].some
            ? diffSelected[1].safeValue() === this.changeFileNode
            : false;
        const styleSelected = {
            // eslint-disable-next-line no-nested-ternary
            border: firstSelected
                ? "1px dotted green"
                : secondSelected
                  ? "1px dotted red"
                  : undefined
        };

        return html`<div class="change-container" style=${styleMap(styleSelected)}>
            <div class="property-container">
                <span>${this.changeFileNode.data.fullPath}</span>
                <span
                    >${window
                        .moment(this.changeFileNode.data.mTime)
                        .format("MMMM Do YYYY, h:mm:ss a")}</span
                >
                ${this.changeFileNode.metadata.deviceId
                    .andThen((n) => html`<span>${n}</span>`)
                    .valueOr(html``)}
                <span>Size: ${this.changeFileNode.data.size}</span>
                <div class="row">
                    <span>Hash:</span><span class="trim">${this.changeFileNode.data.fileHash}</span>
                </div>
            </div>
            <div class="actions-container">
                <div
                    class="icon-btn"
                    @click="${() => {
                        this.modifyDiffSignal();
                    }}"
                >
                    ${diffIcon}
                </div>
                ${!this.isActive
                    ? html`<div
                          class="icon-btn"
                          @click="${() => {
                              if (!(this.changeFileNode instanceof HistoricFileNode)) {
                                  return;
                              }
                              if (this._appContext.value === undefined) {
                                  return;
                              }
                              const modal = new ViewModal(
                                  this._appContext.value.app,
                                  this._appContext.value.db,
                                  this._appContext.value.creds,
                                  this.changeFileNode
                              );
                              modal.open();
                          }}"
                      >
                          ${viewIcon}
                      </div>`
                    : html``}
            </div>
        </div>`;
    }

    private modifyDiffSignal() {
        const diffs = DIFF_SIGNAL.get();
        const hasDiffOfDifferentPath =
            diffs[0].some &&
            diffs[0].safeValue().data.fullPath !== this.changeFileNode.data.fullPath;
        if (hasDiffOfDifferentPath) {
            DIFF_SIGNAL.set([Some(this.changeFileNode), None]);
            return;
        }
        if (diffs[0].some && diffs[0].safeValue() === this.changeFileNode) {
            DIFF_SIGNAL.set([diffs[1], None]);
            return;
        }
        if (diffs[1].some && diffs[1].safeValue() === this.changeFileNode) {
            DIFF_SIGNAL.set([diffs[0], None]);
            return;
        }
        if (diffs[0].some && diffs[1].some) {
            // Both differ values set we need to reset it.
            DIFF_SIGNAL.set([Some(this.changeFileNode), None]);
        } else if (diffs[0].some) {
            // Only a single differ is set, set the other.
            DIFF_SIGNAL.set([diffs[0], Some(this.changeFileNode)]);
        } else {
            // Nothing set...
            DIFF_SIGNAL.set([Some(this.changeFileNode), None]);
        }
    }
}

declare global {
    interface HTMLElementTagNameMap {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "history-change-entry": HistoryChangeEntry;
    }
}
