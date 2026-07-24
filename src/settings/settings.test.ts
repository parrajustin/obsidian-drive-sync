import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from "@jest/globals";
import type { App } from "obsidian";
import type { UserCredential } from "firebase/auth";
import { None, Some } from "standard-ts-lib/src/optional";
import { Err, Ok } from "standard-ts-lib/src/result";
import { InternalError } from "standard-ts-lib/src/status_error";
import * as obsidian from "obsidian";
import { FileAccess } from "../filesystem/file_access";
import { FirebaseCache } from "../sync/firebase_cache";
import { SearchStringFuzzySearch } from "../ui/querySuggest";
import { FolderFuzzySearch } from "../ui/folderFuzzySearch";
import { LogError } from "../logging/log";
import type { MainAppType } from "../main_app";
import type { LatestSettingsConfigVersion } from "../schema/settings/settings_config.schema";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { FirebaseSyncSettingTab } from "./settings";

jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        crit: jest.fn()
    })
}));
jest.mock("../logging/log", () => ({
    LogError: jest.fn(),
    LogUpdate: jest.fn(),
    CreateErrorNotice: jest.fn()
}));
jest.mock("../filesystem/file_access", () => ({
    FileAccess: {
        getAllFileNodes: jest.fn()
    }
}));
jest.mock("../sync/firebase_cache", () => ({
    FirebaseCache: {
        readFirebaseCache: jest.fn(),
        writeToFirebaseCache: jest.fn()
    }
}));
jest.mock("../ui/querySuggest", () => {
    class MockSearchStringFuzzySearch {
        public static instances: MockSearchStringFuzzySearch[] = [];
        public opened = false;
        constructor(
            public app: unknown,
            public files: unknown,
            public query: string,
            public cb: (str: string) => void
        ) {
            MockSearchStringFuzzySearch.instances.push(this);
        }
        public open(): void {
            this.opened = true;
        }
    }
    return { SearchStringFuzzySearch: MockSearchStringFuzzySearch };
});
jest.mock("../ui/folderFuzzySearch", () => {
    class MockFolderFuzzySearch {
        public static instances: MockFolderFuzzySearch[] = [];
        public opened = false;
        constructor(
            public app: unknown,
            public folders: unknown,
            public cb: (str: string) => void,
            public originalFolder: string
        ) {
            MockFolderFuzzySearch.instances.push(this);
        }
        public open(): void {
            this.opened = true;
        }
    }
    return { FolderFuzzySearch: MockFolderFuzzySearch };
});
jest.mock(
    "obsidian",
    () => {
        const settingRegistry: unknown[] = [];

        const createFakeEl = (tag: string): any => {
            const el: any = {
                tagName: tag,
                children: [] as any[],
                innerText: "",
                innerHTML: "",
                style: {},
                empty: () => {
                    el.children = [];
                },
                createEl: (childTag: string, opts?: unknown, cb?: (child: any) => void) => {
                    const child = createFakeEl(childTag);
                    if (
                        typeof opts === "object" &&
                        opts !== null &&
                        typeof (opts as { text?: string }).text === "string"
                    ) {
                        child.innerText = (opts as { text: string }).text;
                    }
                    el.children.push(child);
                    if (typeof cb === "function") {
                        cb(child);
                    }
                    return child;
                },
                createDiv: (_cls?: string) => el.createEl("div"),
                createSpan: (_cls?: string) => el.createEl("span")
            };
            return el;
        };

        class FakeTextComponent {
            public value = "";
            public disabled = false;
            public changeCb: ((value: string) => unknown) | undefined;
            public setValue(value: string): this {
                this.value = value;
                return this;
            }
            public onChange(cb: (value: string) => unknown): this {
                this.changeCb = cb;
                return this;
            }
        }
        class FakeToggleComponent {
            public value = false;
            public changeCb: ((value: boolean) => unknown) | undefined;
            public setValue(value: boolean): this {
                this.value = value;
                return this;
            }
            public onChange(cb: (value: boolean) => unknown): this {
                this.changeCb = cb;
                return this;
            }
        }
        class FakeButtonComponent {
            public icon = "";
            public clickCb: (() => unknown) | undefined;
            public setIcon(icon: string): this {
                this.icon = icon;
                return this;
            }
            public onClick(cb: () => unknown): this {
                this.clickCb = cb;
                return this;
            }
        }
        class FakeDropdownComponent {
            public options: Record<string, string> = {};
            public value = "";
            public changeCb: ((value: string) => unknown) | undefined;
            public addOption(key: string, display: string): this {
                this.options[key] = display;
                return this;
            }
            public setValue(value: string): this {
                this.value = value;
                return this;
            }
            public onChange(cb: (value: string) => unknown): this {
                this.changeCb = cb;
                return this;
            }
        }

        class Setting {
            public name = "";
            public desc = "";
            public texts: FakeTextComponent[] = [];
            public toggles: FakeToggleComponent[] = [];
            public buttons: FakeButtonComponent[] = [];
            public dropdowns: FakeDropdownComponent[] = [];
            constructor(public containerEl: unknown) {
                settingRegistry.push(this);
            }
            public setName(name: string): this {
                this.name = name;
                return this;
            }
            public setDesc(desc: string): this {
                this.desc = desc;
                return this;
            }
            public addText(cb: (component: FakeTextComponent) => void): this {
                const component = new FakeTextComponent();
                this.texts.push(component);
                cb(component);
                return this;
            }
            public addToggle(cb: (component: FakeToggleComponent) => void): this {
                const component = new FakeToggleComponent();
                this.toggles.push(component);
                cb(component);
                return this;
            }
            public addButton(cb: (component: FakeButtonComponent) => void): this {
                const component = new FakeButtonComponent();
                this.buttons.push(component);
                cb(component);
                return this;
            }
            public addDropdown(cb: (component: FakeDropdownComponent) => void): this {
                const component = new FakeDropdownComponent();
                this.dropdowns.push(component);
                cb(component);
                return this;
            }
        }

        class PluginSettingTab {
            public containerEl: unknown;
            constructor(
                public app: unknown,
                public plugin: unknown
            ) {
                this.containerEl = createFakeEl("div");
            }
        }

        return {
            Setting,
            PluginSettingTab,
            __registry: settingRegistry,
            __reset: () => {
                settingRegistry.length = 0;
            }
        };
    },
    { virtual: true }
);

const obsidianMock = obsidian as any;
const mockGetAllFileNodes = FileAccess.getAllFileNodes as any;
const mockReadCache = FirebaseCache.readFirebaseCache as any;
const mockWriteCache = FirebaseCache.writeToFirebaseCache as any;
const mockSearchStringFuzzySearch = SearchStringFuzzySearch as any;
const mockFolderFuzzySearch = FolderFuzzySearch as any;
const mockLogError = LogError as any;

interface FakeText {
    value: string;
    disabled: boolean;
    changeCb?: (value: string) => unknown;
}
interface FakeToggle {
    value: boolean;
    changeCb?: (value: boolean) => unknown;
}
interface FakeButton {
    icon: string;
    clickCb?: () => unknown;
}
interface FakeDropdown {
    options: Record<string, string>;
    value: string;
    changeCb?: (value: string) => unknown;
}
interface FakeSetting {
    name: string;
    desc: string;
    texts: FakeText[];
    toggles: FakeToggle[];
    buttons: FakeButton[];
    dropdowns: FakeDropdown[];
}

const GetRegistry = (): FakeSetting[] => obsidianMock.__registry as FakeSetting[];
const SettingsByName = (name: string): FakeSetting[] =>
    GetRegistry().filter((setting) => setting.name === name);
const LastSettingByName = (name: string): FakeSetting => {
    const matches = SettingsByName(name);
    expect(matches.length).toBeGreaterThan(0);
    return matches[matches.length - 1]!;
};

const AllEls = (root: any): any[] => {
    const out: any[] = [];
    const walk = (el: any) => {
        out.push(el);
        for (const child of el.children as any[]) {
            walk(child);
        }
    };
    walk(root);
    return out;
};
const FindElByTextPrefix = (root: any, prefix: string): any =>
    AllEls(root).find(
        (el) => typeof el.innerText === "string" && (el.innerText as string).startsWith(prefix)
    );

function CreateSyncerConfig(): LatestSyncConfigVersion {
    return {
        type: "root",
        vaultName: "my-vault",
        syncerId: "syncer-1",
        maxUpdatePerSyncer: 50,
        dataStorageEncrypted: false,
        syncQuery: "*",
        rawFileSyncQuery: "f:^.obsidian",
        obsidianFileSyncQuery: "-f:^.obsidian",
        fileIdFileQuery: "-f:template",
        enableFileIdWriting: false,
        nestedRootPath: "",
        sharedSettings: { pathToFolder: "" },
        firebaseCachePath: ".cache.json.gz",
        version: 0
    };
}

function CreateSettings(syncers: LatestSyncConfigVersion[] = []): LatestSettingsConfigVersion {
    return {
        clientId: "client-1",
        email: "user@example.com",
        password: "hunter2",
        syncers,
        version: 0
    };
}

function CreatePlugin(settings: LatestSettingsConfigVersion): any {
    return {
        settings,
        userCreds: None,
        saveSettings: jest.fn(async () => undefined),
        loadSettings: jest.fn(async () => undefined),
        loginForSettings: jest.fn(async () => Ok()),
        tryLogin: jest.fn(async () => Ok(None)),
        killSyncer: jest.fn(),
        app: {
            vault: {
                getName: () => "my-vault",
                getAllFolders: jest.fn(() => [{ path: "folder-a" }])
            }
        }
    };
}

function CreateTab(plugin: any): FirebaseSyncSettingTab {
    return new FirebaseSyncSettingTab(plugin.app as App, plugin as MainAppType);
}

const TabSettings = (tab: FirebaseSyncSettingTab): LatestSettingsConfigVersion =>
    (tab as any)._settings as LatestSettingsConfigVersion;

const Flush = async (): Promise<void> => {
    await new Promise((resolve) => {
        setTimeout(resolve, 0);
    });
};

beforeAll(() => {
    (window as any).app = {
        vault: {
            getName: () => "my-vault"
        }
    };
});

afterAll(() => {
    delete (window as any).app;
});

beforeEach(() => {
    obsidianMock.__reset();
    mockSearchStringFuzzySearch.instances = [];
    mockFolderFuzzySearch.instances = [];
    mockGetAllFileNodes.mockImplementation(async () => Ok([]));
    mockReadCache.mockImplementation(async () =>
        Ok({ lastUpdate: 0, cache: ["entry-1", "entry-2"], versionOfData: null })
    );
    mockWriteCache.mockImplementation(async () => Ok());
});

describe("FirebaseSyncSettingTab display", () => {
    test("builds all sections", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const names = GetRegistry().map((setting) => setting.name);
        for (const expected of [
            "Device ID",
            "Firebase sync email",
            "Firebase sync password",
            "Try to login",
            "Add new Syncer Config",
            "Remove Syncer",
            "Syncer Id",
            "Syncer Type",
            "Vault Name",
            "Nested Vault Path",
            "Max updates per cycle",
            "Enable Encryption",
            "Encryption Password",
            "Syncer Filter",
            "Edit syncer filter query",
            "Raw Filter",
            "Edit raw file query",
            "Obisdian Filter",
            "Edit obsidian file query",
            "Enable File Id writing",
            "File Id Auto write Filter",
            "Edit auto file id filter query",
            "Clear firestore cache",
            "click to reset settings"
        ]) {
            expect(names).toContain(expected);
        }
        const versionEl = FindElByTextPrefix(tab.containerEl, "Version:");
        expect(versionEl.innerText).toBe("Version: unknown");
    });

    test("display clones plugin settings so edits do not leak until hide", async () => {
        const plugin = CreatePlugin(CreateSettings());
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const deviceId = LastSettingByName("Device ID");
        expect(deviceId.texts[0]!.value).toBe("client-1");
        deviceId.texts[0]!.changeCb?.("new-client-id");
        expect(TabSettings(tab).clientId).toBe("new-client-id");
        expect(plugin.settings.clientId).toBe("client-1");
    });

    test("email and password fields prefill and update", async () => {
        const plugin = CreatePlugin(CreateSettings());
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const email = LastSettingByName("Firebase sync email");
        const password = LastSettingByName("Firebase sync password");
        expect(email.texts[0]!.value).toBe("user@example.com");
        expect(password.texts[0]!.value).toBe("hunter2");
        email.texts[0]!.changeCb?.("other@example.com");
        password.texts[0]!.changeCb?.("new-password");
        expect(TabSettings(tab).email).toBe("other@example.com");
        expect(TabSettings(tab).password).toBe("new-password");
    });

    test("email and password fields stay empty when unset", async () => {
        const settings = CreateSettings();
        settings.email = undefined;
        settings.password = undefined;
        const plugin = CreatePlugin(settings);
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        expect(LastSettingByName("Firebase sync email").texts[0]!.value).toBe("");
        expect(LastSettingByName("Firebase sync password").texts[0]!.value).toBe("");
    });

    test("login status shows logged in when user creds exist", async () => {
        const plugin = CreatePlugin(CreateSettings());
        plugin.userCreds = Some({} as UserCredential);
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const statusEl = FindElByTextPrefix(tab.containerEl, "Logged in!");
        expect(statusEl).toBeDefined();
        expect(statusEl.style.color).toBe("green");
    });
});

describe("FirebaseSyncSettingTab hide", () => {
    test("persists settings and logs in", async () => {
        const plugin = CreatePlugin(CreateSettings());
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Device ID").texts[0]!.changeCb?.("persisted-id");
        tab.hide();
        await Flush();

        expect(plugin.settings.clientId).toBe("persisted-id");
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
        expect(plugin.loginForSettings).toHaveBeenCalledTimes(1);
    });
});

describe("login button", () => {
    test("does nothing when already logged in", async () => {
        const plugin = CreatePlugin(CreateSettings());
        plugin.userCreds = Some({} as UserCredential);
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        await LastSettingByName("Try to login").buttons[0]!.clickCb?.();
        expect(plugin.tryLogin).not.toHaveBeenCalled();
    });

    test("shows error when login fails", async () => {
        const plugin = CreatePlugin(CreateSettings());
        plugin.tryLogin.mockImplementation(async () => Err(InternalError("bad creds")));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        await LastSettingByName("Try to login").buttons[0]!.clickCb?.();
        const statusEl = FindElByTextPrefix(tab.containerEl, "Error:");
        expect(statusEl.innerText).toContain("bad creds");
        expect(statusEl.style.color).toBe("red");
    });

    test("shows failed to login when no creds returned", async () => {
        const plugin = CreatePlugin(CreateSettings());
        plugin.tryLogin.mockImplementation(async () => Ok(None));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        await LastSettingByName("Try to login").buttons[0]!.clickCb?.();
        const statusEl = FindElByTextPrefix(tab.containerEl, "Failed to login");
        expect(statusEl).toBeDefined();
        expect(statusEl.style.color).toBe("red");
    });

    test("shows logged in on success", async () => {
        const plugin = CreatePlugin(CreateSettings());
        plugin.tryLogin.mockImplementation(async () => Ok(Some({} as UserCredential)));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const statusBefore = FindElByTextPrefix(tab.containerEl, "not logged in");
        expect(statusBefore).toBeDefined();
        await LastSettingByName("Try to login").buttons[0]!.clickCb?.();
        expect(statusBefore.innerText).toBe("Logged in!");
        expect(statusBefore.style.color).toBe("green");
        expect(plugin.settings.clientId).toBe("client-1");
    });
});

describe("reset settings", () => {
    test("resets plugin settings to defaults and redisplays", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const registrySizeBefore = GetRegistry().length;
        LastSettingByName("click to reset settings").buttons[0]!.clickCb?.();
        await Flush();

        expect(plugin.settings.clientId).not.toBe("client-1");
        expect(plugin.settings.syncers).toEqual([]);
        expect(plugin.settings.version).toBe(0);
        expect(GetRegistry().length).toBeGreaterThan(registrySizeBefore);
    });
});

describe("syncer list", () => {
    test("add syncer button appends a default config", async () => {
        const plugin = CreatePlugin(CreateSettings());
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        expect(TabSettings(tab).syncers).toHaveLength(0);
        LastSettingByName("Add new Syncer Config").buttons[0]!.clickCb?.();
        await Flush();

        expect(TabSettings(tab).syncers).toHaveLength(1);
        const added = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;
        expect(added.type).toBe("root");
        expect(added.vaultName).toBe("my-vault");
        expect(SettingsByName("Syncer Id").length).toBeGreaterThan(0);
    });

    test("remove syncer button deletes the config", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Remove Syncer").buttons[0]!.clickCb?.();
        expect(TabSettings(tab).syncers).toHaveLength(0);
    });

    test("text and toggle fields mutate the syncer config", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Syncer Id").texts[0]!.changeCb?.("new-syncer-id");
        LastSettingByName("Vault Name").texts[0]!.changeCb?.("new-vault");
        LastSettingByName("Nested Vault Path").texts[0]!.changeCb?.("nested/path");
        LastSettingByName("Enable Encryption").toggles[0]!.changeCb?.(true);
        LastSettingByName("Encryption Password").texts[0]!.changeCb?.("crypt-pass");
        LastSettingByName("Enable File Id writing").toggles[0]!.changeCb?.(true);

        const syncer = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;
        expect(syncer.syncerId).toBe("new-syncer-id");
        expect(syncer.vaultName).toBe("new-vault");
        expect(syncer.nestedRootPath).toBe("nested/path");
        expect(syncer.dataStorageEncrypted).toBe(true);
        expect(syncer.encryptionPassword).toBe("crypt-pass");
        expect(syncer.enableFileIdWriting).toBe(true);
    });

    test("max updates per cycle parses numbers and clamps to at least 1", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const maxUpdates = LastSettingByName("Max updates per cycle");
        expect(maxUpdates.texts[0]!.value).toBe("50");
        const syncer = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;

        maxUpdates.texts[0]!.changeCb?.("7");
        expect(syncer.maxUpdatePerSyncer).toBe(7);
        maxUpdates.texts[0]!.changeCb?.("0");
        expect(syncer.maxUpdatePerSyncer).toBe(1);
        maxUpdates.texts[0]!.changeCb?.("not-a-number");
        expect(syncer.maxUpdatePerSyncer).toBe(1);
    });

    test("syncer type dropdown lists all options", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const dropdown = LastSettingByName("Syncer Type").dropdowns[0]!;
        expect(dropdown.options).toEqual({
            root: "Root",
            nested: "Nested",
            shared: "shares"
        });
        expect(dropdown.value).toBe("root");
    });

    test("switching to shared type renames vault and shows folder picker", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Syncer Type").dropdowns[0]!.changeCb?.("shared");
        await Flush();

        const syncer = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;
        expect(syncer.type).toBe("shared");
        expect(syncer.vaultName.startsWith("___SHAREDSYNCER___")).toBe(true);
        expect(SettingsByName("Shared Folder").length).toBeGreaterThan(0);
        expect(SettingsByName("Select Shared Folder").length).toBeGreaterThan(0);
        expect(LastSettingByName("Shared Folder").texts[0]!.disabled).toBe(true);
    });

    test("shared folder picker uses folder fuzzy search", async () => {
        const sharedSyncer = { ...CreateSyncerConfig(), type: "shared" as const };
        const plugin = CreatePlugin(CreateSettings([sharedSyncer]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Select Shared Folder").buttons[0]!.clickCb?.();
        expect(mockFolderFuzzySearch.instances).toHaveLength(1);
        const search = mockFolderFuzzySearch.instances[0];
        expect(search.opened).toBe(true);
        expect(plugin.app.vault.getAllFolders).toHaveBeenCalledWith(true);

        const syncer = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;
        search.cb("Notes/Shared");
        expect(syncer.sharedSettings.pathToFolder).toBe("Notes/Shared");
        expect(syncer.rawFileSyncQuery).toBe("Notes/Shared");

        search.cb("/");
        expect(syncer.sharedSettings.pathToFolder).toBe("");
        expect(syncer.rawFileSyncQuery).toBe("");
    });

    test("query edit buttons open search string fuzzy search", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Edit syncer filter query").buttons[0]!.clickCb?.();
        LastSettingByName("Edit raw file query").buttons[0]!.clickCb?.();
        LastSettingByName("Edit obsidian file query").buttons[0]!.clickCb?.();
        LastSettingByName("Edit auto file id filter query").buttons[0]!.clickCb?.();
        await Flush();

        expect(mockSearchStringFuzzySearch.instances).toHaveLength(4);
        const queries = mockSearchStringFuzzySearch.instances.map(
            (instance: any) => instance.query
        );
        expect(queries).toEqual(["*", "f:^.obsidian", "-f:^.obsidian", "-f:template"]);
        for (const instance of mockSearchStringFuzzySearch.instances) {
            expect(instance.opened).toBe(true);
        }

        const syncer = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;
        mockSearchStringFuzzySearch.instances[0].cb("f:updated-sync");
        mockSearchStringFuzzySearch.instances[1].cb("f:updated-raw");
        mockSearchStringFuzzySearch.instances[2].cb("f:updated-obsidian");
        mockSearchStringFuzzySearch.instances[3].cb("f:updated-fileid");
        expect(syncer.syncQuery).toBe("f:updated-sync");
        expect(syncer.rawFileSyncQuery).toBe("f:updated-raw");
        expect(syncer.obsidianFileSyncQuery).toBe("f:updated-obsidian");
        expect(syncer.fileIdFileQuery).toBe("f:updated-fileid");
    });

    test("query edit button logs error when file nodes fail to load", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();
        mockGetAllFileNodes.mockImplementation(async () => Err(InternalError("fs broken")));

        LastSettingByName("Edit syncer filter query").buttons[0]!.clickCb?.();
        await Flush();

        expect(mockSearchStringFuzzySearch.instances).toHaveLength(0);
        expect(mockLogError).toHaveBeenCalled();
    });
});

describe("firebase cache", () => {
    test("shows cache size after display", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const cacheEl = FindElByTextPrefix(tab.containerEl, "Cache size:");
        expect(cacheEl.innerText).toBe("Cache size: 2");
    });

    test("logs error when cache read fails", async () => {
        mockReadCache.mockImplementation(async () => Err(InternalError("read failed")));
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        const cacheEl = FindElByTextPrefix(tab.containerEl, "Cache size:");
        expect(cacheEl.innerText).toBe("Cache size: calculating....");
        expect(mockLogError).toHaveBeenCalled();
    });

    test("clear cache button writes an empty cache", async () => {
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Clear firestore cache").buttons[0]!.clickCb?.();
        await Flush();

        const syncer = TabSettings(tab).syncers[0] as LatestSyncConfigVersion;
        expect(mockWriteCache).toHaveBeenCalledWith(plugin.app, syncer, []);
        const cacheEl = FindElByTextPrefix(tab.containerEl, "Cache size:");
        expect(cacheEl.innerText).toBe("Cache size: 0");
    });

    test("clear cache button logs error when write fails", async () => {
        mockWriteCache.mockImplementation(async () => Err(InternalError("write failed")));
        const plugin = CreatePlugin(CreateSettings([CreateSyncerConfig()]));
        const tab = CreateTab(plugin);
        tab.display();
        await Flush();

        LastSettingByName("Clear firestore cache").buttons[0]!.clickCb?.();
        await Flush();

        const cacheEl = FindElByTextPrefix(tab.containerEl, "Cache size:");
        expect(cacheEl.innerText).toBe("Cache size: 2");
        expect(mockLogError).toHaveBeenCalled();
    });
});
