import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { App, WorkspaceLeaf } from "obsidian";
import { InstallObsidianDomHelpers } from "../../tests/obsidian_dom";

jest.mock(
    "obsidian",
    () => ({
        ItemView: class {
            public leaf: unknown;
            public containerEl: HTMLElement;
            public icon = "";

            constructor(leaf: unknown) {
                this.leaf = leaf;
                this.containerEl = document.createElement("div");
                // Obsidian views have a header child and a content child.
                this.containerEl.appendChild(document.createElement("div"));
                this.containerEl.appendChild(document.createElement("div"));
            }
        },

        TFile: class {},

        TFolder: class {},

        Vault: class {},
        normalizePath: (path: string) => path,

        Notice: class {
            public messageEl = {
                innerHTML: ""
            };
        }
    }),
    { virtual: true }
);

jest.mock("../logging/logger", () => ({
    CreateLogger: () => ({
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        crit: jest.fn()
    })
}));

import type { FilePathType } from "../filesystem/file_node";
import type { MainAppType } from "../main_app";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { ConvergenceActionType } from "../sync/convergence_util";
import { NotFoundError } from "standard-ts-lib/src/status_error";
import { GetOrCreateSyncProgressView, PROGRESS_VIEW_TYPE, SyncProgressView } from "./progressView";

InstallObsidianDomHelpers();

function MakeView(): SyncProgressView {
    return new SyncProgressView({} as WorkspaceLeaf);
}

function MakeConfig(syncerId: string): LatestSyncConfigVersion {
    return { syncerId } as LatestSyncConfigVersion;
}

function AsFilePath(path: string): FilePathType {
    return path as FilePathType;
}

/** The content element (`children[1]`) that the view renders into. */
function GetContent(view: SyncProgressView): Element {
    return view.containerEl.children[1]!;
}

describe("SyncProgressView", () => {
    let view: SyncProgressView;
    let content: Element;

    beforeEach(() => {
        view = MakeView();
        content = GetContent(view);
    });

    it("renders the initial layout on construction", () => {
        expect(view.getViewType()).toBe(PROGRESS_VIEW_TYPE);
        expect(view.getDisplayText()).toBe("Sync Progress View");
        expect(view.icon).toBe("cloudy");
        expect(content.querySelector("h2")!.textContent).toBe(
            "Sync Progress View (Need to login...)"
        );
        expect(content.querySelector(".syncer-statuses")).not.toBeNull();
        expect(content.querySelector(".progress-div")).not.toBeNull();
        expect(content.querySelector(".hsitorical-div")).not.toBeNull();
        expect(content.querySelector(".progress-div h4")!.textContent).toBe("In Progress Sync:");
        expect(content.querySelector(".hsitorical-div h4")!.textContent).toBe("Historical Sync:");
    });

    it("updates the header on setStatus", () => {
        view.setStatus("logged in");
        expect(content.querySelector("h2")!.textContent).toBe("Sync Progress View (logged in)");
    });

    it("renders syncer statuses and kill buttons for each config", () => {
        view.setSyncers([MakeConfig("syncer-a"), MakeConfig("syncer-b")]);
        const statuses = content.querySelectorAll(".syncer-statuses > div > span");
        expect(statuses).toHaveLength(2);
        expect(statuses[0]!.textContent).toBe("syncer-a: No data");
        expect(statuses[1]!.textContent).toBe("syncer-b: No data");

        const plugin = { killSyncer: jest.fn() } as unknown as MainAppType;
        view.setSyncPlugin(plugin);
        const buttons = content.querySelectorAll(".syncer-statuses button");
        expect(buttons).toHaveLength(2);
        expect(buttons[1]!.textContent).toBe("Kill Syncer");
        (buttons[1] as HTMLButtonElement).click();
        expect(plugin.killSyncer).toHaveBeenCalledWith("syncer-b");
    });

    it("updates an individual syncer status with an optional color", () => {
        view.setSyncers([MakeConfig("syncer-a")]);
        view.setSyncerStatus("syncer-a", "Running", "red");
        const status = content.querySelector(".syncer-statuses span")! as HTMLElement;
        expect(status.textContent).toBe("syncer-a: Running");
        expect(status.style.color).toBe("red");

        view.setSyncerStatus("syncer-a", "Stopped");
        expect(status.textContent).toBe("syncer-a: Stopped");
        expect(status.style.color).toBe("red");
    });

    it("ignores status updates for unknown syncers", () => {
        expect(() => {
            view.setSyncerStatus("unknown", "Running");
        }).not.toThrow();
    });

    it("renders an entry added to the current cycle", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("notes/a.md"), ConvergenceActionType.UPDATE_CLOUD);

        const group = content.querySelector(".progress-div .syncer-group")!;
        expect(group.textContent).toContain("syncer: s1");
        expect(group.textContent).toContain("cycle: cycle-1");

        const entry = group.querySelector(".progress-entry")!;
        expect(entry.textContent).toContain("notes/a.md");
        expect(entry.querySelector("[data-icon='hard-drive-upload']")).not.toBeNull();
        const fill = entry.querySelector(".entry-progress-bar-fill")! as HTMLElement;
        expect(fill.style.width).toBe("0%");
    });

    it("appends entries directly once the cycle list is rendered", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.NEW_LOCAL_FILE);
        view.addEntry("s1", AsFilePath("b.md"), ConvergenceActionType.DELETE_LOCAL);
        view.addEntry("s1", AsFilePath("c.md"), ConvergenceActionType.UPDATE_LOCAL);
        view.addEntry("s1", AsFilePath("d.md"), ConvergenceActionType.MARK_CLOUD_DELETED);

        const entries = content.querySelectorAll(".progress-div .progress-entry");
        expect(entries).toHaveLength(4);
        expect(content.querySelector("[data-icon='trash-2']")).not.toBeNull();
        expect(content.querySelector("[data-icon='cloud-download']")).not.toBeNull();
    });

    it("ignores entries for unknown syncers", () => {
        view.addEntry("unknown", AsFilePath("a.md"), ConvergenceActionType.NEW_LOCAL_FILE);
        expect(content.querySelectorAll(".progress-entry")).toHaveLength(0);
    });

    it("updates the progress bar fill when entry progress changes", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("notes/a.md"), ConvergenceActionType.UPDATE_CLOUD);

        view.setEntryProgress("s1", AsFilePath("notes/a.md"), 0.5);
        const fill = content.querySelector(
            ".progress-div .entry-progress-bar-fill"
        )! as HTMLElement;
        expect(fill.style.width).toBe("50%");

        view.setEntryProgress("s1", AsFilePath("notes/a.md"), 1);
        expect(fill.style.width).toBe("100%");
    });

    it("ignores progress updates for unknown syncers or files", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_CLOUD);
        expect(() => {
            view.setEntryProgress("unknown", AsFilePath("a.md"), 0.5);
            view.setEntryProgress("s1", AsFilePath("unknown.md"), 0.5);
        }).not.toThrow();
    });

    it("re-renders the view when updateProgress and listDiv are missing in setEntryProgress", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_CLOUD);

        // Artificially clear the rendered state to hit the fallback branches
        const cycle = (view as any)._mapSyncerCycleToCurrentProgress.get("s1");
        cycle.listDiv = undefined;
        cycle.mapOfCurrentCycleChanges.get("a.md").updateProgress = undefined;

        const updateSpy = jest.spyOn(view, "updateProgressView");
        view.setEntryProgress("s1", AsFilePath("a.md"), 0.5);
        expect(updateSpy).toHaveBeenCalled();
        expect(cycle.mapOfCurrentCycleChanges.get("a.md").progress).toBe(0.5);
    });

    it("re-creates the progress div when updateProgress is missing but listDiv exists in setEntryProgress", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_CLOUD);

        const cycle = (view as any)._mapSyncerCycleToCurrentProgress.get("s1");
        cycle.mapOfCurrentCycleChanges.get("a.md").updateProgress = undefined;

        const createSpy = jest.spyOn(view as any, "createInProgressEntry");
        view.setEntryProgress("s1", AsFilePath("a.md"), 0.5);
        expect(createSpy).toHaveBeenCalledWith(
            cycle.listDiv,
            cycle.mapOfCurrentCycleChanges.get("a.md")
        );
        expect(cycle.mapOfCurrentCycleChanges.get("a.md").progress).toBe(0.5);
    });

    it("renders the published cycle stats", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_CLOUD);
        view.publishSyncerCycleDone("s1", 3, 2, 1500);

        const text = content.querySelector(".progress-div")!.textContent!;
        expect(text).toContain("#updates: 3");
        expect(text).toContain("#Seconds: 1.5");
        expect(text).toContain("#updatesleft: 2");
    });

    it("omits leftover updates when there are none", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_CLOUD);
        view.publishSyncerCycleDone("s1", 1, 0, 500);

        const text = content.querySelector(".progress-div")!.textContent!;
        expect(text).toContain("#updates: 1");
        expect(text).toContain("#Seconds: 0.5");
        expect(text).not.toContain("#updatesleft");
    });

    it("ignores published cycles for unknown syncers", () => {
        expect(() => {
            view.publishSyncerCycleDone("unknown", 1, 0, 500);
        }).not.toThrow();
        expect(content.querySelector(".progress-div")!.textContent).not.toContain("#updates");
    });

    it("renders syncer errors in the cycle", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.publishSyncerError("s1", NotFoundError("file missing"));

        const entry = content.querySelector(".progress-div .progress-entry")!;
        expect(entry.querySelector("[data-icon='circle-alert']")).not.toBeNull();
        expect(entry.querySelector("[aria-label='NOT_FOUND']")).not.toBeNull();
        expect(entry.textContent).toContain("file missing");
    });

    it("ignores errors for unknown syncers", () => {
        expect(() => {
            view.publishSyncerError("unknown", NotFoundError("file missing"));
        }).not.toThrow();
        expect(content.querySelectorAll(".progress-entry")).toHaveLength(0);
    });

    it("moves finished cycles with changes into the historical section", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_LOCAL);
        view.newSyncerCycle("s1", "cycle-2");

        const historical = content.querySelector(".hsitorical-div")!;
        expect(historical.textContent).toContain("cycle: cycle-1");
        const progress = content.querySelector(".progress-div")!;
        expect(progress.textContent).not.toContain("cycle: cycle-1");
        // The new cycle has no changes yet so no group is rendered for it.
        expect(progress.querySelectorAll(".syncer-group")).toHaveLength(0);
    });

    it("drops finished cycles without changes", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.newSyncerCycle("s1", "cycle-2");

        const historical = content.querySelector(".hsitorical-div")!;
        expect(historical.querySelectorAll(".syncer-group")).toHaveLength(0);
    });

    it("caps the historical cycles at 50", () => {
        for (let i = 0; i < 60; i++) {
            view.newSyncerCycle("s1", `cycle-${i}`);
            view.addEntry("s1", AsFilePath(`file-${i}.md`), ConvergenceActionType.NEW_LOCAL_FILE);
        }
        const historical = content.querySelector(".hsitorical-div")!;
        expect(historical.querySelectorAll(".syncer-group")).toHaveLength(50);
    });

    it("moves current cycles to the historical section on resetView", () => {
        view.newSyncerCycle("s1", "cycle-1");
        view.addEntry("s1", AsFilePath("a.md"), ConvergenceActionType.UPDATE_CLOUD);
        view.resetView();

        expect(content.querySelectorAll(".progress-div .syncer-group")).toHaveLength(0);
        expect(content.querySelector(".hsitorical-div")!.textContent).toContain("cycle: cycle-1");
    });

    it("re-renders on open", async () => {
        await expect(view.onOpen()).resolves.toBeUndefined();
        expect(content.querySelector(".progress-div h4")).not.toBeNull();
    });
});

describe("GetOrCreateSyncProgressView", () => {
    interface FakeSetup {
        app: App;
        staleLeaf: { detach: ReturnType<typeof jest.fn> };
        newLeaf: any;
        workspace: any;
    }

    function MakeFakeApp(): FakeSetup {
        const staleLeaf = { detach: jest.fn() };
        const newLeaf: any = {
            detach: jest.fn(),
            view: undefined,
            setViewState: jest.fn(async () => undefined)
        };
        newLeaf.view = new SyncProgressView(newLeaf as WorkspaceLeaf);
        const workspace = {
            onLayoutReady: (cb: () => void) => {
                cb();
            },
            getLeavesOfType: jest.fn(() => [staleLeaf]),
            getRightLeaf: jest.fn(() => newLeaf),
            revealLeaf: jest.fn(async () => undefined)
        };
        return { app: { workspace } as unknown as App, staleLeaf, newLeaf, workspace };
    }

    beforeEach(async () => {
        // `onClose` resets the module-level cached leaf.
        await MakeView().onClose();
    });

    it("creates a new right leaf and reveals it", async () => {
        const { app, staleLeaf, newLeaf, workspace } = MakeFakeApp();
        const result = await GetOrCreateSyncProgressView(app);

        expect(workspace.getLeavesOfType).toHaveBeenCalledWith(PROGRESS_VIEW_TYPE);
        expect(staleLeaf.detach).toHaveBeenCalledTimes(1);
        expect(newLeaf.setViewState).toHaveBeenCalledWith({
            type: PROGRESS_VIEW_TYPE,
            active: true
        });
        expect(workspace.revealLeaf).toHaveBeenCalledWith(newLeaf);
        expect(result).toBe(newLeaf.view);
    });

    it("does not reveal the leaf when reveal is false", async () => {
        const { app, workspace } = MakeFakeApp();
        await GetOrCreateSyncProgressView(app, false);
        expect(workspace.revealLeaf).not.toHaveBeenCalled();
    });

    it("reuses the cached leaf on subsequent calls", async () => {
        const first = MakeFakeApp();
        const view = await GetOrCreateSyncProgressView(first.app);

        const second = MakeFakeApp();
        const cached = await GetOrCreateSyncProgressView(second.app);
        expect(cached).toBe(view);
        expect(second.workspace.getRightLeaf).not.toHaveBeenCalled();
        // The cached leaf (from the first app) is revealed.
        expect(second.workspace.revealLeaf).toHaveBeenCalledWith(first.newLeaf);
    });

    it("creates a fresh leaf after the view is closed", async () => {
        const first = MakeFakeApp();
        const view = await GetOrCreateSyncProgressView(first.app);
        await view.onClose();

        const second = MakeFakeApp();
        const recreated = await GetOrCreateSyncProgressView(second.app, false);
        expect(second.workspace.getRightLeaf).toHaveBeenCalledTimes(1);
        expect(recreated).toBe(second.newLeaf.view);
    });
});
