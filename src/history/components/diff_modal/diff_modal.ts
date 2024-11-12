import type { App } from "obsidian";
import { Modal } from "obsidian";
import type { LocalNode } from "../../../sync/file_node";
import { ReadFileNode } from "../../../sync/file_util";
import type { Firestore } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import { DiffMatchPatch } from "../../../lib/diff_merge_patch";
import { LogError } from "../../../log";
import { None, Some, type Option } from "../../../lib/option";
import type { HistoricFileNode } from "../../history_file_node";

export class DiffModal extends Modal {
    constructor(
        app: App,
        private _db: Firestore,
        private _creds: UserCredential,
        private _baseNode: Option<HistoricFileNode>,
        private _aFileNode: LocalNode | HistoricFileNode,
        private _bFileNode: LocalNode | HistoricFileNode
    ) {
        super(app);
        this.setTitle(`Diff Viewer`);
    }

    public override onOpen(): void {
        void (async () => {
            const baseFileContent = (
                await this._baseNode
                    .andThen<Promise<Option<string>>>((n) => {
                        return new Promise((resolve) => {
                            void (async () => {
                                const baseReadResult = await ReadFileNode(
                                    this.app,
                                    this._db,
                                    this._creds,
                                    n
                                );
                                if (baseReadResult.err) {
                                    resolve(None);
                                    return;
                                }
                                resolve(
                                    Some(
                                        new window.TextDecoder("utf-8").decode(
                                            baseReadResult.safeUnwrap()
                                        )
                                    )
                                );
                            })();
                        });
                    })
                    .valueOr(Promise.resolve(None))
            ).valueOr("");
            const aRawFileContent = await ReadFileNode(
                this.app,
                this._db,
                this._creds,
                this._aFileNode
            );
            if (aRawFileContent.err) {
                this.contentEl.createSpan().innerText = aRawFileContent.val.toString();
                return;
            }
            const bRawFileContent = await ReadFileNode(
                this.app,
                this._db,
                this._creds,
                this._bFileNode
            );
            if (bRawFileContent.err) {
                this.contentEl.createSpan().innerText = bRawFileContent.val.toString();
                return;
            }

            const aSideString = new window.TextDecoder("utf-8").decode(
                aRawFileContent.safeUnwrap()
            );
            const bSideString = new window.TextDecoder("utf-8").decode(
                bRawFileContent.safeUnwrap()
            );

            const patcher = new DiffMatchPatch();
            const diffResult = patcher.diffMain(aSideString, bSideString);
            if (diffResult.err) {
                LogError(diffResult.val);
                return;
            }
            const diff = diffResult.safeUnwrap();
            patcher.diffCleanupSemantic(diff);
            this.contentEl.createSpan().innerHTML = patcher.diffPrettyHtml(diff);
            this.contentEl.createDiv().innerText = "TEST";
            const patchResult = patcher.patchMake(diff);
            if (patchResult.err) {
                LogError(patchResult.val);
                return;
            }
            console.log("patchResult", patchResult, baseFileContent);
            this.contentEl.createSpan().innerText = JSON.stringify(patchResult.safeUnwrap());

            //   var dmp = new diff_match_patch();
            //   var diff = dmp.diff_main('Hello World.', 'Goodbye World.');
            //   // Result: [(-1, "Hell"), (1, "G"), (0, "o"), (1, "odbye"), (0, " World.")]
            //   dmp.diff_cleanupSemantic(diff);
            //   // Result: [(-1, "Hello"), (1, "Goodbye"), (0, " World.")]
        })();
    }
}
