import type { Bytes } from "firebase/firestore";
import { SchemaManager, type VersionedSchema } from "../schema";

/** Data for the file. */
export interface FileDataDbModel {
    // Full filepath.
    path: string;
    // The file creation time.
    cTime: number;
    // The file modification time.
    mTime: number;
    /** Size of the file in bytes. */
    size: number;
    /** File name without the extension. */
    baseName: string;
    /** File extension (example ".md"). */
    ext: string;
    /** The id of the user. */
    userId: string;
    /** If the file has been deleted. */
    deleted: boolean;
    /** The hash of the file contents. */
    fileHash: string;

    //
    // Metadata.
    //

    /** The name of the vault. */
    vaultName: string;
    /** The id of the device. */
    deviceId: string;
    /** The syncer config id that pushed the update. */
    syncerConfigId: string;
    /** Time of the change of this file, in ms from unix epoch. */
    entryTime: number;
}
interface DataFieldModel extends FileDataDbModel {
    type: "Raw";
    /** The data of the file if less than 100Kb */
    data: Bytes;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef: null;
}
interface StorageFieldModel extends FileDataDbModel {
    type: "Ref";
    /** The data of the file if less than 100Kb */
    data: null;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef: string;
}

export type Version0NotesSchema = VersionedSchema<StorageFieldModel | DataFieldModel, 0>;

export type AnyVersionNotesSchema = Version0NotesSchema;

export type LatestNotesSchema = Version0NotesSchema;

// Latest schema but with the data field removed. Only fetched on updates.
export type LatestNotesSchemaWithoutData = Omit<LatestNotesSchema, "data">;

export const NOTES_SCHEMA_MANAGER = new SchemaManager<[Version0NotesSchema], 0>(
    "Firebase Notes",
    []
);
