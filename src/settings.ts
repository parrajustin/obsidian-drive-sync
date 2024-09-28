import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type TemplaterPlugin from "main";
import type { SyncerConfig } from "./sync/syncer";
import { RootSyncType } from "./sync/syncer";
import { uuidv7 } from "./lib/uuid";
import { SearchStringFuzzySearch } from "./ui/querySuggest";
import { GetAllFileNodes } from "./sync/file_node_util";
import { LogError } from "./log";

export interface FolderTemplate {
    folder: string;
    template: string;
}

function CreateAllFileConfig(): SyncerConfig {
    return {
        type: RootSyncType.ROOT_SYNCER,
        syncerId: uuidv7(),
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian",
        obsidianFileSyncQuery: "-f:^.obsidian",
        fileIdFileQuery: "-f:template",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vaultName: ((window as any).app as App).vault.getName() ?? ""
    };
}

function CreateDefaultSyncConfig(): SyncerConfig {
    return {
        type: RootSyncType.ROOT_SYNCER,
        syncerId: uuidv7(),
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian.*.(json|css)$ -f:obsidian-drive-sync/data.json",
        obsidianFileSyncQuery: "-f:^.obsidian",
        fileIdFileQuery: "-f:template",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vaultName: ((window as any).app as App).vault.getName() ?? ""
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
    private _settings: Settings;

    constructor(
        app: App,
        private _plugin: TemplaterPlugin
    ) {
        super(app, _plugin);
        this._settings = structuredClone(this._plugin.settings);
    }

    public override display(): void {
        this._settings = structuredClone(this._plugin.settings);
        this.containerEl.empty();

        this.addIdentifiers();
        this.addUserCredentials();
        this.addSyncerSettings();
    }

    public override async hide() {
        this._plugin.settings = this._settings;
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
                if (this._settings.clientId !== undefined) {
                    cb.setValue(this._settings.clientId);
                }
                cb.onChange((value) => {
                    this._settings.clientId = value;
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
                if (this._settings.email !== undefined) {
                    cb.setValue(this._settings.email);
                }
                cb.onChange((value) => {
                    this._settings.email = value;
                });
            });

        new Setting(this.containerEl)
            .setName("Firebase sync password")
            .setDesc("The password account used for the firebase sync.")
            .addText((cb) => {
                if (this._settings.password !== undefined) {
                    cb.setValue(this._settings.password);
                }
                cb.onChange((value) => {
                    this._settings.password = value;
                });
            });
    }

    /** Data syncer settings. */
    private addSyncerSettings(): void {
        const syncerSettingsContainer = this.containerEl.createDiv("sync-settings");
        syncerSettingsContainer.createEl("h1", { text: "File Syncers" });

        new Setting(syncerSettingsContainer).setName("Add new Syncer Config").addButton((cb) => {
            cb.setIcon("plus").onClick(() => {
                this._settings.syncers.push(CreateDefaultSyncConfig());
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
                        this._settings.syncers = this._settings.syncers.filter(
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

                let setSyncFilter: (data: string) => void = () => {};
                new Setting(liContainer)
                    .setName("Syncer Filter")
                    .setDesc(
                        "Gmail style filter. Based on https://github.com/mixmaxhq/search-string."
                    )
                    .addText((cb) => {
                        cb.disabled = true;
                        cb.setValue(elem.syncQuery);
                        setSyncFilter = (data: string) => {
                            cb.setValue(data);
                        };
                    });
                new Setting(liContainer).setName("Edit syncer filter query").addButton((cb) => {
                    cb.setIcon("pencil").onClick(() => {
                        void GetAllFileNodes(this.app, CreateDefaultSyncConfig()).then((nodes) => {
                            if (nodes.err) {
                                LogError(nodes.val);
                                return;
                            }
                            const searchStringChecker = new SearchStringFuzzySearch(
                                this.app,
                                nodes.safeUnwrap(),
                                elem.syncQuery,
                                (str) => {
                                    elem.syncQuery = str;
                                    setSyncFilter(str);
                                }
                            );
                            searchStringChecker.open();
                            return;
                        });
                    });
                });

                let rawFileFilterText: (data: string) => void = () => {};
                new Setting(liContainer)
                    .setName("Raw Filter")
                    .setDesc("Raw file locations. Gmail style filter.")
                    .addText((cb) => {
                        cb.disabled = true;
                        cb.setValue(elem.rawFileSyncQuery);
                        rawFileFilterText = (data: string) => {
                            cb.setValue(data);
                        };
                    });
                new Setting(liContainer).setName("Edit raw file query").addButton((cb) => {
                    cb.setIcon("pencil").onClick(() => {
                        void GetAllFileNodes(this.app, CreateAllFileConfig()).then((nodes) => {
                            if (nodes.err) {
                                LogError(nodes.val);
                                return;
                            }
                            const searchStringChecker = new SearchStringFuzzySearch(
                                this.app,
                                nodes.safeUnwrap(),
                                elem.rawFileSyncQuery,
                                (str) => {
                                    elem.rawFileSyncQuery = str;
                                    rawFileFilterText(str);
                                }
                            );
                            searchStringChecker.open();
                            return;
                        });
                    });
                });

                let setObsidianFileFilter: (data: string) => void = () => {};
                new Setting(liContainer)
                    .setName("Obisdian Filter")
                    .setDesc("Obisdian file locations. Gmail style filter.")
                    .addText((cb) => {
                        cb.disabled = true;
                        cb.setValue(elem.obsidianFileSyncQuery);
                        setObsidianFileFilter = (data: string) => {
                            cb.setValue(data);
                        };
                    });
                new Setting(liContainer).setName("Edit obsidian file query").addButton((cb) => {
                    cb.setIcon("pencil").onClick(() => {
                        void GetAllFileNodes(this.app, CreateAllFileConfig()).then((nodes) => {
                            if (nodes.err) {
                                LogError(nodes.val);
                                return;
                            }
                            const searchStringChecker = new SearchStringFuzzySearch(
                                this.app,
                                nodes.safeUnwrap(),
                                elem.obsidianFileSyncQuery,
                                (str) => {
                                    elem.obsidianFileSyncQuery = str;
                                    setObsidianFileFilter(str);
                                }
                            );
                            searchStringChecker.open();
                            return;
                        });
                    });
                });

                let setFileIdFilter: (data: string) => void = () => {};
                new Setting(liContainer)
                    .setName("File Id Auto write Filter")
                    .setDesc("Can be used to specify where file ids should be auto written to.")
                    .addText((cb) => {
                        cb.disabled = true;
                        cb.setValue(elem.fileIdFileQuery);
                        setFileIdFilter = (data: string) => {
                            cb.setValue(data);
                        };
                    });
                new Setting(liContainer)
                    .setName("Edit auto file id filter query")
                    .addButton((cb) => {
                        cb.setIcon("pencil").onClick(() => {
                            void GetAllFileNodes(this.app, CreateAllFileConfig()).then((nodes) => {
                                if (nodes.err) {
                                    LogError(nodes.val);
                                    return;
                                }
                                const searchStringChecker = new SearchStringFuzzySearch(
                                    this.app,
                                    nodes.safeUnwrap(),
                                    elem.fileIdFileQuery,
                                    (str) => {
                                        elem.fileIdFileQuery = str;
                                        setFileIdFilter(str);
                                    }
                                );
                                searchStringChecker.open();
                                return;
                            });
                        });
                    });
            };
            for (const setting of this._settings.syncers) {
                createElement(setting);
            }
        };
        resetList();
    }
}
