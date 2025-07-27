import type { AnyVersionNotesSchema } from "../notes/notes.schema";
import { SchemaManager, type VersionedSchema } from "../schema";

export interface HistoryDbModelV0 {
    /** File data version. */
    file: AnyVersionNotesSchema;
    /** the uid of the file. */
    fileId: string;
    /** Time of the creation of this entry, in ms from unix epoch. */
    entryTime: number;
}

export type Version0HistorySchema = VersionedSchema<HistoryDbModelV0, 0>;

export type AnyVerionHistorySchema = Version0HistorySchema;

export type LatestHistorySchema = Version0HistorySchema;

export const HISTORY_SCHEMA_MANAGER = new SchemaManager<[Version0HistorySchema], 0>(
    "Firebase history",
    []
);
