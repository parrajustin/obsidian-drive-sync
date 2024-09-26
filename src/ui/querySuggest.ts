import type { App, FuzzyMatch } from "obsidian";
import { FuzzySuggestModal } from "obsidian";
import type { FileNode } from "../sync/file_node";
import { SearchString } from "../lib/search_string_parser";
import { GetQueryString } from "../sync/query_util";

export class SearchStringFuzzySearch extends FuzzySuggestModal<FileNode> {
    private _searchString: SearchString;
    private _originalQuery: string;
    constructor(
        app: App,
        private _files: FileNode[],
        private _query: string,
        private _cb: (str: string) => void
    ) {
        super(app);
        this.setPlaceholder(_query);
        this._searchString = SearchString.parse(_query);
        this._originalQuery = _query;
    }

    /**
     * @public
     */
    public override getSuggestions(query: string): FuzzyMatch<FileNode>[] {
        if (query === "") {
            query = this._originalQuery;
        }
        this._searchString = GetQueryString(query);
        this._query = query;
        const parsedQuery = this._searchString.getParsedQuery();
        // check if any of the exclude filters match.
        const fileExcludeFilters = [
            ...(parsedQuery.exclude["f"] ?? []),
            ...(parsedQuery.exclude["file"] ?? [])
        ];
        // Check if any include filters match if any.
        const fileIncludeFilter = [
            ...(parsedQuery.include["f"] ?? []),
            ...(parsedQuery.include["file"] ?? [])
        ];
        const nodes: FuzzyMatch<FileNode>[] = [];
        for (const item of this.getItems()) {
            let excluded = false;
            for (const filter of fileExcludeFilters) {
                if (item.fullPath.match(filter)) {
                    nodes.push({
                        item,
                        match: {
                            score: -1,
                            matches: []
                        }
                    });
                    excluded = true;
                    break;
                }
            }
            if (excluded) {
                continue;
            }

            // If there are no include filters all are included.
            if (fileIncludeFilter.length === 0) {
                nodes.push({
                    item,
                    match: {
                        score: 1,
                        matches: []
                    }
                });
                continue;
            }

            let included = false;
            for (const filter of fileIncludeFilter) {
                if (item.fullPath.match(filter)) {
                    included = true;
                    break;
                }
            }
            if (included) {
                nodes.push({
                    item,
                    match: {
                        score: 1,
                        matches: []
                    }
                });
            } else {
                nodes.push({
                    item,
                    match: {
                        score: 0,
                        matches: []
                    }
                });
            }
        }
        return nodes;
    }

    /**
     * @public
     */
    public override renderSuggestion(item: FuzzyMatch<FileNode>, el: HTMLElement): void {
        const text = el.createEl("span");
        text.innerText = item.item.fullPath;

        if (item.match.score < 0) {
            text.style.backgroundColor = "coral";
            text.style.color = "black";
        }
        if (item.match.score > 0) {
            text.style.backgroundColor = "#66FF99";
            text.style.color = "black";
        }
    }
    /**
     * @public
     */
    public override getItems(): FileNode[] {
        return this._files;
    }
    /**
     * @public
     */
    public override getItemText(item: FileNode): string {
        return item.fullPath;
    }
    /**
     * @public
     */
    public override onChooseItem(_item: FileNode, _evt: MouseEvent | KeyboardEvent): void {
        this._cb(this._query);
    }

    public start(): void {
        try {
            this.open();
        } catch (e) {
            console.error(e);
        }
    }
}
