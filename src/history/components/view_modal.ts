import type { App } from "obsidian";
import { Modal } from "obsidian";
import { ReadFileNode } from "../../sync/file_util";
import type { Firestore } from "firebase/firestore";
import type { UserCredential } from "firebase/auth";
import type { HistoricFileNode } from "../history_file_node";

export class ViewModal extends Modal {
    constructor(
        app: App,
        private _db: Firestore,
        private _creds: UserCredential,
        private _fileNode: HistoricFileNode
    ) {
        super(app);
        this.setTitle(`Viewing ${_fileNode.data.fullPath}`);
    }

    public override onOpen(): void {
        void (async () => {
            const rawFileContent = await ReadFileNode(
                this.app,
                this._db,
                this._creds,
                this._fileNode
            );
            if (rawFileContent.err) {
                this.contentEl.createSpan().innerText = rawFileContent.val.toString();
                return;
            }
            const wrapper = this.contentEl.createEl("pre");
            wrapper.innerText = new window.TextDecoder("utf-8").decode(rawFileContent.safeUnwrap());
        })();
    }
}
