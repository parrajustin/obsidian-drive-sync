import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { App, TFolder } from "obsidian";
import { InstallObsidianDomHelpers } from "../../tests/obsidian_dom";

jest.mock(
    "obsidian",
    () => ({
        FuzzySuggestModal: class {
            public app: unknown;
            public inputEl: HTMLInputElement;
            public limit = 0;
            public emptyStateText = "";
            public placeholder = "";

            constructor(app: unknown) {
                this.app = app;
                this.inputEl = document.createElement("input");
            }

            public setPlaceholder(placeholder: string): void {
                this.placeholder = placeholder;
            }

            public open(): void {
                // no-op for tests.
            }
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

jest.mock("../logging/log", () => ({
    LogError: jest.fn()
}));

import { LogError } from "../logging/log";
import { FolderFuzzySearch } from "./folderFuzzySearch";

InstallObsidianDomHelpers();

function MakeFolder(path: string): TFolder {
    return { path } as TFolder;
}

const APP = {} as App;

describe("FolderFuzzySearch", () => {
    let folders: TFolder[];
    let chosen: ReturnType<typeof jest.fn<(str: string) => void>>;

    beforeEach(() => {
        folders = [MakeFolder("zeta"), MakeFolder("alpha/notes"), MakeFolder("beta")];
        chosen = jest.fn<(str: string) => void>();
    });

    it("initializes the modal from the original folder", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "f:notes");
        expect((search as any).placeholder).toBe("f:notes");
        expect(search.inputEl.value).toBe("f:notes");
        expect(search.limit).toBe(5000);
    });

    it("returns the folders as items with their path as text", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        expect(search.getItems()).toBe(folders);
        expect(search.getItemText(MakeFolder("some/path"))).toBe("some/path");
    });

    it("ranks folders matching the include filter first, sorted by path", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        const suggestions = search.getSuggestions("f:notes");
        expect(suggestions.map((s) => s.item.path)).toEqual(["alpha/notes", "beta", "zeta"]);
        expect(suggestions.map((s) => s.match.score)).toEqual([1, 0, 0]);
    });

    it("supports the file: filter alias", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        const suggestions = search.getSuggestions("file:notes");
        expect(suggestions.map((s) => s.item.path)).toEqual(["alpha/notes", "beta", "zeta"]);
        expect(suggestions.map((s) => s.match.score)).toEqual([1, 0, 0]);
    });

    it("falls back to the original folder query when the query is empty", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "f:beta");
        const emptyQuery = search.getSuggestions("");
        expect(emptyQuery.map((s) => s.item.path)).toEqual(["beta", "alpha/notes", "zeta"]);
        expect(emptyQuery[0]!.match.score).toBe(1);

        const undefinedQuery = search.getSuggestions(undefined);
        expect(undefinedQuery.map((s) => s.item.path)).toEqual(["beta", "alpha/notes", "zeta"]);
    });

    it("returns all folders unranked when there is no include filter", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        const suggestions = search.getSuggestions("");
        expect(suggestions.map((s) => s.item.path)).toEqual(["alpha/notes", "beta", "zeta"]);
        expect(suggestions.every((s) => s.match.score === 0)).toBe(true);
    });

    it("renders a suggestion as a span containing the folder path", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        const el = document.createElement("div");
        search.renderSuggestion(
            { item: MakeFolder("alpha/notes"), match: { score: 1, matches: [] } },
            el
        );
        const span = el.querySelector("span");
        expect(span).not.toBeNull();
        expect(span!.textContent).toBe("alpha/notes");
    });

    it("invokes the callback with the chosen folder path", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        search.onChooseItem(MakeFolder("beta"), new MouseEvent("click"));
        expect(chosen).toHaveBeenCalledWith("beta");
    });

    it("opens the modal on start", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        const openSpy = jest.spyOn(search, "open").mockImplementation(() => undefined);
        search.start();
        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(LogError).not.toHaveBeenCalled();
    });

    it("logs an error when opening the modal fails", () => {
        const search = new FolderFuzzySearch(APP, folders, chosen, "");
        jest.spyOn(search, "open").mockImplementation(() => {
            throw new Error("boom");
        });
        search.start();
        expect(LogError).toHaveBeenCalledTimes(1);
    });
});
