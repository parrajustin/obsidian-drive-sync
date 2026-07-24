import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { App } from "obsidian";
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
import type { LocalOnlyFileNode } from "../filesystem/file_node";
import { SearchStringFuzzySearch } from "./querySuggest";

InstallObsidianDomHelpers();

function MakeFile(fullPath: string): LocalOnlyFileNode {
    return { fileData: { fullPath } } as unknown as LocalOnlyFileNode;
}

const APP = {} as App;

describe("SearchStringFuzzySearch", () => {
    let files: LocalOnlyFileNode[];
    let chosen: ReturnType<typeof jest.fn<(str: string) => void>>;

    beforeEach(() => {
        files = [MakeFile("zeta.md"), MakeFile("alpha/secret.md"), MakeFile("beta/notes.md")];
        chosen = jest.fn<(str: string) => void>();
    });

    it("initializes the modal from the given query", () => {
        const search = new SearchStringFuzzySearch(APP, files, "f:notes", chosen);
        expect((search as any).placeholder).toBe("f:notes");
        expect(search.emptyStateText).toBe("f:notes");
        expect(search.inputEl.value).toBe("f:notes");
        expect(search.limit).toBe(5000);
    });

    it("returns the files as items with their full path as text", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);
        expect(search.getItems()).toBe(files);
        expect(search.getItemText(MakeFile("a/b.md"))).toBe("a/b.md");
    });

    it("includes everything when there are no include filters", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);
        const suggestions = search.getSuggestions("word");
        expect(suggestions.map((s) => s.item.fileData.fullPath)).toEqual([
            "alpha/secret.md",
            "beta/notes.md",
            "zeta.md"
        ]);
        expect(suggestions.every((s) => s.match.score === 1)).toBe(true);
    });

    it("marks excluded files with a negative score after included ones", () => {
        const allFiles = [...files, MakeFile("gamma/secret.md")];
        const search = new SearchStringFuzzySearch(APP, allFiles, "", chosen);
        const suggestions = search.getSuggestions("-f:secret");
        expect(suggestions.map((s) => s.item.fileData.fullPath)).toEqual([
            "beta/notes.md",
            "zeta.md",
            "alpha/secret.md",
            "gamma/secret.md"
        ]);
        expect(suggestions.map((s) => s.match.score)).toEqual([1, 1, -1, -1]);
    });

    it("supports the file: filter alias", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);
        const suggestions = search.getSuggestions("file:notes -file:secret");
        expect(suggestions.map((s) => s.match.score)).toEqual([1, -1, 0]);
    });

    it("orders included, excluded then unmatched files", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);
        const suggestions = search.getSuggestions("f:notes -f:secret");
        expect(suggestions.map((s) => s.item.fileData.fullPath)).toEqual([
            "beta/notes.md",
            "alpha/secret.md",
            "zeta.md"
        ]);
        expect(suggestions.map((s) => s.match.score)).toEqual([1, -1, 0]);
    });

    it("falls back to the original query when the query is empty", () => {
        const search = new SearchStringFuzzySearch(APP, files, "-f:secret", chosen);
        const suggestions = search.getSuggestions("");
        expect(suggestions.map((s) => s.match.score)).toEqual([1, 1, -1]);
    });

    it("renders suggestions with score-dependent highlighting", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);

        const includedEl = document.createElement("div");
        search.renderSuggestion(
            { item: MakeFile("beta/notes.md"), match: { score: 1, matches: [] } },
            includedEl
        );
        const includedSpan = includedEl.querySelector("span")!;
        expect(includedSpan.textContent).toBe("beta/notes.md");
        expect(includedSpan.style.backgroundColor).toBe("rgb(102, 255, 153)");
        expect(includedSpan.style.color).toBe("black");

        const excludedEl = document.createElement("div");
        search.renderSuggestion(
            { item: MakeFile("alpha/secret.md"), match: { score: -1, matches: [] } },
            excludedEl
        );
        const excludedSpan = excludedEl.querySelector("span")!;
        expect(excludedSpan.style.backgroundColor).toBe("coral");
        expect(excludedSpan.style.color).toBe("black");

        const neutralEl = document.createElement("div");
        search.renderSuggestion(
            { item: MakeFile("zeta.md"), match: { score: 0, matches: [] } },
            neutralEl
        );
        const neutralSpan = neutralEl.querySelector("span")!;
        expect(neutralSpan.style.backgroundColor).toBe("");
        expect(neutralSpan.style.color).toBe("");
    });

    it("invokes the callback with the latest query when an item is chosen", () => {
        const search = new SearchStringFuzzySearch(APP, files, "f:start", chosen);
        search.getSuggestions("f:updated");
        search.onChooseItem(MakeFile("zeta.md"), new MouseEvent("click"));
        expect(chosen).toHaveBeenCalledWith("f:updated");
    });

    it("invokes the callback with the original query if never changed", () => {
        const search = new SearchStringFuzzySearch(APP, files, "f:start", chosen);
        search.onChooseItem(MakeFile("zeta.md"), new MouseEvent("click"));
        expect(chosen).toHaveBeenCalledWith("f:start");
    });

    it("opens the modal on start", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);
        const openSpy = jest.spyOn(search, "open").mockImplementation(() => undefined);
        search.start();
        expect(openSpy).toHaveBeenCalledTimes(1);
        expect(LogError).not.toHaveBeenCalled();
    });

    it("logs an error when opening the modal fails", () => {
        const search = new SearchStringFuzzySearch(APP, files, "", chosen);
        jest.spyOn(search, "open").mockImplementation(() => {
            throw new Error("boom");
        });
        search.start();
        expect(LogError).toHaveBeenCalledTimes(1);
    });
});
