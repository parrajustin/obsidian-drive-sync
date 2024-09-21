import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type TemplaterPlugin from "main";
import { RootSyncType } from "./sync/rootSyncer";

export interface FolderTemplate {
    folder: string;
    template: string;
}

export const DEFAULT_SETTINGS: Settings = {
    syncers: [
        {
            type: RootSyncType.ROOT_SYNCER
        }
    ]
};

export interface SyncerConfig {
    type: RootSyncType;
}

export interface Settings {
    email?: string;
    password?: string;
    syncers: SyncerConfig[];
}

/** The firebase sync settings. */
export class FirebaseSyncSettingTab extends PluginSettingTab {
    constructor(
        private _app: App,
        private _plugin: TemplaterPlugin
    ) {
        super(_app, _plugin);
    }

    public override display(): void {
        console.log("serttings");
        this.containerEl.empty();

        this.addUserCredentials();
        this.addSyncerSettings();
    }

    public override async hide() {
        console.log("hidding settings");
        await this._plugin.saveSettings();
        await this._plugin.loginForSettings();
    }

    /** Add the user credential settings. */
    private addUserCredentials(): void {
        const heading = this.containerEl.createEl("h1");
        heading.innerText = "User Credentials";

        new Setting(this.containerEl)
            .setName("Firebase sync email")
            .setDesc("The email account used for the firebase sync.")
            .addText((cb) => {
                if (this._plugin.settings.email !== undefined) {
                    cb.setValue(this._plugin.settings.email);
                }
                cb.onChange((value) => {
                    this._plugin.settings.email = value;
                });
            });

        new Setting(this.containerEl)
            .setName("Firebase sync password")
            .setDesc("The password account used for the firebase sync.")
            .addText((cb) => {
                if (this._plugin.settings.password !== undefined) {
                    cb.setValue(this._plugin.settings.password);
                }
                cb.onChange((value) => {
                    this._plugin.settings.password = value;
                });
            });
    }

    private addSyncerSettings(): void {
        const syncerSettingsContainer = this.containerEl.createDiv("sync-settings");
        syncerSettingsContainer.createEl("h1", { text: "File Syncers" });

        new Setting(this.containerEl)
            .setName("Firebase sync password")
            .setDesc("The password account used for the firebase sync.");
    }
}
