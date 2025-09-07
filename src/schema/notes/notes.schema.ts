import { Bytes } from "firebase/firestore";
import { z } from "zod";
import { SchemaManager, type VersionedSchema } from "../schema";

const FileDataDbModelSchema = z.object({
    // Full filepath.
    path: z.string(),
    // The file creation time.
    cTime: z.number(),
    // The file modification time.
    mTime: z.number(),
    /** Size of the file in bytes. */
    size: z.number(),
    /** File name without the extension. */
    baseName: z.string(),
    /** File extension (example ".md"). */
    ext: z.string(),
    /** The id of the user. */
    userId: z.string(),
    /** If the file has been deleted. */
    deleted: z.boolean(),
    /** The hash of the file contents. */
    fileHash: z.string(),

    //
    // Metadata.
    //

    /** The name of the vault. */
    vaultName: z.string(),
    /** The id of the device. */
    deviceId: z.string(),
    /** The syncer config id that pushed the update. */
    syncerConfigId: z.string(),
    /** Time of the change of this file, in ms from unix epoch. */
    entryTime: z.number(),
});

const NotesDataModelSchema = z.union([
    FileDataDbModelSchema.extend({
        type: z.literal("Raw"),
        data: z.instanceof(Bytes),
        fileStorageRef: z.null(),
    }),
    FileDataDbModelSchema.extend({
        type: z.literal("Ref"),
        data: z.null(),
        fileStorageRef: z.string(),
    })
]);

type NotesDataModel = z.infer<typeof NotesDataModelSchema>;

export type Version0NotesSchema = VersionedSchema<NotesDataModel, 0>;

export const Version0NotesZodSchema = NotesDataModelSchema.extend({
    version: z.literal(0)
});

export type AnyVersionNotesSchema = Version0NotesSchema;

export type LatestNotesSchema = Version0NotesSchema;

// Latest schema but with the data field removed. Only fetched on updates.
export type LatestNotesSchemaWithoutData = Omit<LatestNotesSchema, "data">;

export const NOTES_SCHEMA_MANAGER = new SchemaManager<[Version0NotesSchema], 0>(
    "Firebase Notes",
    [Version0NotesZodSchema],
    []
);
