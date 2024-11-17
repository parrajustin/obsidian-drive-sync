import type { App, FuzzyMatch, TFolder } from "obsidian";
import { FuzzySuggestModal } from "obsidian";
import { SearchString } from "../lib/search_string_parser";
import { GetQueryString } from "../sync/query_util";
import { LogError } from "../log";
import { ConvertToUnknownError } from "../util";

export class FolderFuzzySearch extends FuzzySuggestModal<TFolder> {
    private _searchString: SearchString;
    constructor(
        app: App,
        private _folders: TFolder[],
        private _cb: (str: string) => void,
        private _originalFolder: string
    ) {
        super(app);
        this._searchString = SearchString.parse(_originalFolder === "" ? "*" : _originalFolder);
        this.setPlaceholder(_originalFolder);
        this.inputEl.value = _originalFolder;
        this.limit = 5000;
    }

    /**
     * @public
     */
    public override getSuggestions(query: string | undefined): FuzzyMatch<TFolder>[] {
        if (query === "" || query === undefined) {
            query = this._originalFolder;
        }
        this._searchString = GetQueryString(query);
        const parsedQuery = this._searchString.getParsedQuery();
        // Check if any include filters match if any.
        const fileIncludeFilter = [
            ...(parsedQuery.include.f ?? []),
            ...(parsedQuery.include.file ?? [])
        ];

        // Create list of nodes.
        const includedNodes: FuzzyMatch<TFolder>[] = [];
        const restNodes: FuzzyMatch<TFolder>[] = [];
        for (const item of this.getItems()) {
            let included = false;
            for (const filter of fileIncludeFilter) {
                if (item.path.match(filter)) {
                    included = true;
                    break;
                }
            }
            if (included) {
                includedNodes.push({
                    item,
                    match: {
                        score: 1,
                        matches: []
                    }
                });
            } else {
                restNodes.push({
                    item,
                    match: {
                        score: 0,
                        matches: []
                    }
                });
            }
        }

        includedNodes.sort((a, b) => a.item.path.localeCompare(b.item.path));
        restNodes.sort((a, b) => a.item.path.localeCompare(b.item.path));

        return [...includedNodes, ...restNodes];
    }

    /**
     * @public
     */
    public override renderSuggestion(item: FuzzyMatch<TFolder>, el: HTMLElement): void {
        const text = el.createEl("span");
        text.innerText = item.item.path;
    }
    /**
     * @public
     */
    public override getItems(): TFolder[] {
        return this._folders;
    }
    /**
     * @public
     */
    public override getItemText(item: TFolder): string {
        return item.path;
    }
    /**
     * @public
     */
    public override onChooseItem(_item: TFolder, _evt: MouseEvent | KeyboardEvent): void {
        this._cb(_item.path);
    }

    public start(): void {
        try {
            this.open();
        } catch (e) {
            LogError(ConvertToUnknownError("Query Suggest View")(e));
        }
    }
}
