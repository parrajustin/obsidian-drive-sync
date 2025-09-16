import type { App, FuzzyMatch } from "obsidian";
import { FuzzySuggestModal } from "obsidian";
import { SearchString } from "../lib/search_string_parser";
import { GetQueryString } from "../sync/query_util";
import { LogError } from "../logging/log";
import { ConvertToUnknownError } from "../util";
import type { LocalCloudFileNode, LocalOnlyFileNode } from "../filesystem/file_node";

export class SearchStringFuzzySearch
    extends FuzzySuggestModal<LocalOnlyFileNode | LocalCloudFileNode>
{
    private _searchString: SearchString;
    private _originalQuery: string;
    constructor(
        app: App,
        private _files: (LocalOnlyFileNode | LocalCloudFileNode)[],
        private _query: string,
        private _cb: (str: string) => void
    ) {
        super(app);
        this.setPlaceholder(_query);
        this._searchString = SearchString.parse(_query);
        this._originalQuery = _query;
        this.emptyStateText = _query;
        this.inputEl.value = this._query;
        this.limit = 5000;
    }

    /**
     * @public
     */
    public override getSuggestions(
        query: string
    ): FuzzyMatch<LocalOnlyFileNode | LocalCloudFileNode>[] {
        if (query === "") {
            query = this._originalQuery;
        }
        this._searchString = GetQueryString(query);
        this._query = query;
        const parsedQuery = this._searchString.getParsedQuery();
        // check if any of the exclude filters match.
        const fileExcludeFilters = [
            ...(parsedQuery.exclude.f ?? []),
            ...(parsedQuery.exclude.file ?? [])
        ];
        // Check if any include filters match if any.
        const fileIncludeFilter = [
            ...(parsedQuery.include.f ?? []),
            ...(parsedQuery.include.file ?? [])
        ];

        // Create list of nodes.
        const includedNodes: FuzzyMatch<LocalOnlyFileNode | LocalCloudFileNode>[] = [];
        const excludedNodes: FuzzyMatch<LocalOnlyFileNode | LocalCloudFileNode>[] = [];
        const restNodes: FuzzyMatch<LocalOnlyFileNode | LocalCloudFileNode>[] = [];
        for (const item of this.getItems()) {
            let excluded = false;
            for (const filter of fileExcludeFilters) {
                if (item.fileData.fullPath.match(filter)) {
                    excludedNodes.push({
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
                includedNodes.push({
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
                if (item.fileData.fullPath.match(filter)) {
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

        includedNodes.sort((a, b) =>
            a.item.fileData.fullPath.localeCompare(b.item.fileData.fullPath)
        );
        excludedNodes.sort((a, b) =>
            a.item.fileData.fullPath.localeCompare(b.item.fileData.fullPath)
        );
        restNodes.sort((a, b) => a.item.fileData.fullPath.localeCompare(b.item.fileData.fullPath));

        return [...includedNodes, ...excludedNodes, ...restNodes];
    }

    /**
     * @public
     */
    public override renderSuggestion(
        item: FuzzyMatch<LocalOnlyFileNode | LocalCloudFileNode>,
        el: HTMLElement
    ): void {
        const text = el.createEl("span");
        text.innerText = item.item.fileData.fullPath;

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
    public override getItems(): (LocalOnlyFileNode | LocalCloudFileNode)[] {
        return this._files;
    }
    /**
     * @public
     */
    public override getItemText(item: LocalOnlyFileNode | LocalCloudFileNode): string {
        return item.fileData.fullPath;
    }
    /**
     * @public
     */
    public override onChooseItem(
        _item: LocalOnlyFileNode | LocalCloudFileNode,
        _evt: MouseEvent | KeyboardEvent
    ): void {
        this._cb(this._query);
    }

    public start(): void {
        try {
            this.open();
        } catch (e) {
            LogError(ConvertToUnknownError("Query Suggest View")(e));
        }
    }
}
