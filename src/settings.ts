import type { App } from "obsidian";
import { PluginSettingTab, Setting } from "obsidian";
import type TemplaterPlugin from "main";
import { RootSyncType, type SyncerConfig } from "settings/syncer_config_data";
import type { Settings } from "settings/settings_data";
import { uuidv7 } from "./lib/uuid";
import { SearchStringFuzzySearch } from "./ui/querySuggest";
import { GetAllFileNodes } from "./sync/file_node_util";
import { LogError } from "./log";
import { FolderFuzzySearch } from "./ui/folderFuzzySearch";

declare const SYNCBUNDLEVERSION: string;

export interface FolderTemplate {
    folder: string;
    template: string;
}

function CreateAllFileConfig(): SyncerConfig {
    return {
        version: "v5",
        type: RootSyncType.ROOT_SYNCER,
        syncerId: uuidv7(),
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian",
        obsidianFileSyncQuery: "-f:^.obsidian",
        enableFileIdWriting: false,
        fileIdFileQuery: "-f:template",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        vaultName: ((window as any).app as App).vault.getName(),
        maxUpdatePerSyncer: 50,
        storedFirebaseCache: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
        nestedRootPath: "",
        storedFirebaseHistory: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
        sharedSettings: { pathToFolder: "" }
    };
}

function CreateDefaultSyncConfig(): SyncerConfig {
    return {
        version: "v5",
        type: RootSyncType.ROOT_SYNCER,
        syncerId: uuidv7(),
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian.*.(json)$ -f:.*obsidian-firebase-sync/data.json",
        obsidianFileSyncQuery: "-f:^.obsidian",
        enableFileIdWriting: false,
        fileIdFileQuery: "-f:template -f:templator",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        vaultName: ((window as any).app as App).vault.getName(),
        maxUpdatePerSyncer: 50,
        storedFirebaseCache: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
        nestedRootPath: "",
        storedFirebaseHistory: { lastUpdate: 0, cache: "", length: 0, versionOfData: null },
        sharedSettings: { pathToFolder: "" }
    };
}

export const DEFAULT_SETTINGS: Settings = {
    clientId: uuidv7(),
    syncers: [],
    version: "v6"
};

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
        this.resetSettings();
        this.versionEnd();
    }

    public override hide() {
        void (async () => {
            this._plugin.settings = this._settings;
            await this._plugin.saveSettings();
            await this._plugin.loginForSettings();
        })();
    }

    /* Adds button to reset the settings. */
    private resetSettings(): void {
        const heading = this.containerEl.createEl("h2");
        heading.innerText = "Reset Settings";
        new Setting(this.containerEl).setName("click to reset settings").addButton((cb) => {
            cb.setIcon("list-restart").onClick(() => {
                this._plugin.settings = structuredClone(DEFAULT_SETTINGS);
                this.display();
            });
        });
    }

    private versionEnd(): void {
        const heading = this.containerEl.createEl("h2");
        heading.innerText = "Sync Plugin";
        const version = this.containerEl.createSpan();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        version.innerText = `Version: ${SYNCBUNDLEVERSION ?? "unknown"}`;
    }

    /** Add the device identifier. */
    private addIdentifiers(): void {
        const heading = this.containerEl.createEl("h1");
        heading.innerText = "Device Identifier";

        new Setting(this.containerEl)
            .setName("Device ID")
            .setDesc("Used to identify changes to the device (should be unique).")
            .addText((cb) => {
                cb.setValue(this._settings.clientId);
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

        const loginStatusContainer = this.containerEl.createDiv("login-status");
        loginStatusContainer.createEl("span", "", (el) => {
            el.innerText = "Login Status: ";
        });
        const statusSpan = loginStatusContainer.createEl("span", "", (el) => {
            if (this._plugin.userCreds.some) {
                el.innerText = "Logged in!";
                el.style.color = "green";
            } else {
                el.innerText = "not logged in";
                el.style.color = "white";
            }
        });
        new Setting(this.containerEl)
            .setName("Try to login")
            .setDesc(
                "Click this button to check if your credentials are correct. Warning! clicking this can start any file syncers if you have any defined."
            )
            .addButton((cb) => {
                cb.setIcon("key").onClick(async () => {
                    if (this._plugin.userCreds.some) {
                        return;
                    }

                    this._plugin.settings = this._settings;
                    const loginAttempt = await this._plugin.tryLogin();
                    if (loginAttempt.err) {
                        statusSpan.innerText = `Error: ${loginAttempt.val.toString()}`;
                        statusSpan.style.color = "red";
                        return;
                    }

                    const possibleCreds = loginAttempt.safeUnwrap();
                    if (possibleCreds.none) {
                        statusSpan.innerText = `Failed to login`;
                        statusSpan.style.color = "red";
                        return;
                    }
                    statusSpan.innerText = "Logged in!";
                    statusSpan.style.color = "green";
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
                    .setDesc("Id for the change to identify sycner config origin.")
                    .addText((cb) => {
                        cb.setValue(elem.syncerId).onChange((val) => {
                            elem.syncerId = val;
                        });
                    });
                new Setting(liContainer)
                    .setName("Syncer Type")
                    .setDesc("The type of syncer. (default: Root)")
                    .addDropdown((cb) => {
                        cb.addOption(RootSyncType.ROOT_SYNCER, "Root")
                            .addOption(RootSyncType.FOLDER_TO_ROOT, "Nested")
                            .addOption(RootSyncType.SHARED, "Shared")
                            .setValue(elem.type)
                            .onChange((value: RootSyncType) => {
                                elem.type = value;
                                resetList();
                            });
                    });
                if (elem.type === RootSyncType.SHARED) {
                    if (!elem.vaultName.startsWith("___SHAREDSYNCER___")) {
                        elem.vaultName = `___SHAREDSYNCER___-${uuidv7()}`;
                    }
                    // eslint-disable-next-line @typescript-eslint/no-empty-function
                    let sharedFolderText: (data: string) => void = () => {};
                    new Setting(liContainer)
                        .setName("Shared Folder")
                        .setDesc("The folder to put the shared files into.")
                        .addText((cb) => {
                            cb.disabled = true;
                            cb.setValue(elem.sharedSettings.pathToFolder);
                            sharedFolderText = (data: string) => {
                                cb.setValue(data);
                                elem.sharedSettings.pathToFolder = data;
                            };
                        });
                    new Setting(liContainer).setName("Select Shared Folder").addButton((cb) => {
                        cb.setIcon("pencil").onClick(() => {
                            const searchStringChecker = new FolderFuzzySearch(
                                this.app,
                                this.app.vault.getAllFolders(/*includeRoot=*/ true),
                                (str) => {
                                    if (str === "/") {
                                        str = "";
                                    }
                                    elem.rawFileSyncQuery = str;
                                    sharedFolderText(str);
                                },
                                elem.sharedSettings.pathToFolder
                            );
                            searchStringChecker.open();
                        });
                    });
                } else {
                    new Setting(liContainer)
                        .setName("Vault Name")
                        .setDesc("Syncing remote devices is done through vault name.")
                        .addText((cb) => {
                            cb.setValue(elem.vaultName).onChange((val) => {
                                elem.vaultName = val;
                            });
                        });
                }

                new Setting(liContainer)
                    .setName("Nested Vault Path")
                    .setDesc("(only valid for nested type) The nested vault's start path.")
                    .addText((cb) => {
                        cb.setValue(elem.nestedRootPath).onChange((val) => {
                            elem.nestedRootPath = val;
                        });
                    });
                new Setting(liContainer)
                    .setName("Max updates per cycle")
                    .setDesc(
                        "The maximum updates per a sync cycle, a number too high will cause obsidian crashes."
                    )
                    .addText((cb) => {
                        cb.setValue(`${elem.maxUpdatePerSyncer}`).onChange((val) => {
                            const parsedVal = Number.parseInt(val);
                            if (!Number.isNaN(parsedVal)) {
                                elem.maxUpdatePerSyncer = Math.max(1, elem.maxUpdatePerSyncer);
                            }
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

                // eslint-disable-next-line @typescript-eslint/no-empty-function
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

                // eslint-disable-next-line @typescript-eslint/no-empty-function
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

                // eslint-disable-next-line @typescript-eslint/no-empty-function
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

                new Setting(liContainer)
                    .setName("Enable File Id writing")
                    .setDesc("The the file ids will be written")
                    .addToggle((cb) => {
                        cb.setValue(elem.enableFileIdWriting).onChange((val) => {
                            elem.enableFileIdWriting = val;
                        });
                    });
                // eslint-disable-next-line @typescript-eslint/no-empty-function
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
                const cacheSize = liContainer.createEl("span");
                cacheSize.innerText = `Cache size: ${elem.storedFirebaseCache.length}`;
                new Setting(liContainer)
                    .setName("Clear firestore cache")
                    .setDesc("Clear the cache of firestore entries")
                    .addButton((cb) => {
                        cb.setIcon("eraser").onClick(() => {
                            elem.storedFirebaseCache = {
                                lastUpdate: 0,
                                cache: "",
                                length: 0,
                                versionOfData: null
                            };
                            cacheSize.innerText = `Cache size: ${elem.storedFirebaseCache.length}`;
                        });
                    });
                const cacheHistorySize = liContainer.createEl("span");
                cacheHistorySize.innerText = `Cache size: ${elem.storedFirebaseHistory.length}`;
                new Setting(liContainer)
                    .setName("Clear firestore history cache")
                    .setDesc("Clear the cache of firestore history entries")
                    .addButton((cb) => {
                        cb.setIcon("eraser").onClick(() => {
                            elem.storedFirebaseHistory = {
                                lastUpdate: 0,
                                cache: "",
                                length: 0,
                                versionOfData: null
                            };
                            cacheHistorySize.innerText = `Cache size: ${elem.storedFirebaseHistory.length}`;
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
