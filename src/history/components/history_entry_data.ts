import type { Option } from "../../lib/option";
import type { LocalNode } from "../../sync/file_node";
import type { HistoricFileNode } from "../history_file_node";

export interface HistoryEntryData {
    /** The file path of the given file. */
    filePath: string;
    /** The local file state if any exists. */
    localFile: Option<LocalNode>;
    /** The historical nodes ordered to most recent state to earliest state. */
    historyNodes: HistoricFileNode[];
    /** The latest modification time (ms from unix epoch). */
    latestModification: number;
}

export type HistoryArray = HistoryEntryData[];
