import type { Option, Some } from "../../lib/option";
import type { FileNode } from "../../sync/file_node";
import type { HistoryFileNodeExtra } from "../history_schema";

export interface HistoryEntryData {
    /** The file id of the given file. */
    fileId: string;
    /** The local file state if any exists. */
    localFile: Option<FileNode>;
    /** The historical nodes ordered to most recent state to earliest state. */
    historyNodes: FileNode<Some<string>, HistoryFileNodeExtra>[];
    /** The latest modification time (ms from unix epoch). */
    latestModification: number;
}

export type HistoryArray = HistoryEntryData[];
