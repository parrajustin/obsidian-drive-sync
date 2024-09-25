import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type TemplaterPlugin from "main";
import type { SyncerConfig } from "./sync/syncer";
import { RootSyncType } from "./sync/syncer";
import { uuidv7 } from "./lib/uuid";

export interface FolderTemplate {
    folder: string;
    template: string;
}

function CreateDefaultSyncConfig(): SyncerConfig {
    return {
        type: RootSyncType.ROOT_SYNCER,
        syncerId: uuidv7(),
        dataStorageEncrypted: false,
        syncQuery: "",
        // eslint-disable-next-line prettier/prettier, no-useless-escape
        rawFileSyncQuery: "^.obsidian"
    };
}

export const DEFAULT_SETTINGS: Settings = {
    clientId: uuidv7(),
    syncers: [CreateDefaultSyncConfig()]
};

export interface Settings {
    /** Unique client id for each device. */
    clientId: string;
    /** Firestore email. */
    email?: string;
    /** Firestore password. */
    password?: string;
    /** Individual syncer configs. */
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

        this.addIdentifiers();
        this.addUserCredentials();
        this.addSyncerSettings();
    }

    public override async hide() {
        await this._plugin.saveSettings();
        await this._plugin.loginForSettings();
    }

    /** Add the device identifier. */
    private addIdentifiers(): void {
        const heading = this.containerEl.createEl("h1");
        heading.innerText = "Device Identifier";

        new Setting(this.containerEl)
            .setName("Device ID")
            .setDesc("Used to identify changes to the device (should be unique).")
            .addText((cb) => {
                if (this._plugin.settings.clientId !== undefined) {
                    cb.setValue(this._plugin.settings.clientId);
                }
                cb.onChange((value) => {
                    this._plugin.settings.clientId = value;
                });
            });
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

    /** Data syncer settings. */
    private addSyncerSettings(): void {
        const syncerSettingsContainer = this.containerEl.createDiv("sync-settings");
        syncerSettingsContainer.createEl("h1", { text: "File Syncers" });

        new Setting(syncerSettingsContainer).setName("Add new Syncer Config").addButton((cb) => {
            cb.setIcon("plus").onClick(() => {
                this._plugin.settings.syncers.push(CreateDefaultSyncConfig());
                resetList();
            });
        });

        const syncerSettingsList = syncerSettingsContainer.createDiv("settings-list");
        const resetList = () => {
            syncerSettingsList.innerHTML = "";

            const ulContainer = syncerSettingsList.createEl("ul");
            const createElement = (elem: SyncerConfig) => {
                const liContainer = ulContainer.createEl("li");

                new Setting(liContainer).setName("Remove Syncer").addButton((cb) => {
                    cb.setIcon("x").onClick(() => {
                        this._plugin.settings.syncers = this._plugin.settings.syncers.filter(
                            (config) => config !== elem
                        );
                        resetList();
                    });
                });
                new Setting(liContainer)
                    .setName("Syncer Id")
                    .setDesc("Id for the change to identify file change origin.")
                    .addText((cb) => {
                        cb.setValue(elem.syncerId).onChange((val) => {
                            elem.syncerId = val;
                        });
                    });
                new Setting(liContainer)
                    .setName("Enable Encryption")
                    .setDesc("The data will be stored through encryption")
                    .addToggle((cb) => {
                        cb.setValue(elem.dataStorageEncrypted).onChange((val) => {
                            elem.dataStorageEncrypted = val;
                        });
                    });
                new Setting(liContainer)
                    .setName("Encryption Password")
                    .setDesc("The password used for encryption, must be set on all devices.")
                    .addText((cb) => {
                        if (elem.encryptionPassword !== undefined) {
                            cb.setValue(elem.encryptionPassword);
                        }
                        cb.onChange((val) => {
                            elem.encryptionPassword = val;
                        });
                    });
                new Setting(liContainer)
                    .setName("Syncer Filter")
                    .setDesc(
                        "Gmail style filter. Based on https://github.com/mixmaxhq/search-string."
                    )
                    .addText((cb) => {
                        cb.setValue(elem.syncQuery).onChange((val) => {
                            elem.encryptionPassword = val;
                        });
                    });
            };
            for (const setting of this._plugin.settings.syncers) {
                createElement(setting);
            }
        };
        resetList();
    }
}
