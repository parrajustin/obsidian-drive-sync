import { z } from "zod";
import { version0NotesZodSchema } from "../notes/notes.schema";
import { SchemaManager, type VersionedSchema } from "../schema";

const historyDataModelSchema = z.object({
    /** File data version. */
    file: version0NotesZodSchema,
    /** the uid of the file. */
    fileId: z.string(),
    /** Time of the creation of this entry, in ms from unix epoch. */
    entryTime: z.number()
});

type HistoryDataModel = z.infer<typeof historyDataModelSchema>;

export type Version0HistorySchema = VersionedSchema<HistoryDataModel, 0>;

const version0HistoryZodSchema = historyDataModelSchema.extend({
    version: z.literal(0)
});

export type AnyVerionHistorySchema = Version0HistorySchema;

export type LatestHistorySchema = Version0HistorySchema;

export const HISTORY_SCHEMA_MANAGER = new SchemaManager<[Version0HistorySchema], 0>(
    "Firebase history",
    [version0HistoryZodSchema],
    []
);
