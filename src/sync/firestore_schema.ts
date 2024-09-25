import type {
    Bytes,
    DocumentData,
    FirestoreDataConverter,
    QueryDocumentSnapshot,
    SnapshotOptions,
    WithFieldValue
} from "firebase/firestore";
import { FileNode } from "./file_node";
import type { UserCredential } from "firebase/auth";
import { None, Some } from "../lib/option";

export interface FileDbModel {
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
    /** The data of the file if less than 100Kb */
    data?: Bytes;
    /** The location of the file in cloud storage if not in `data`. */
    fileStorageRef?: string;
}

// Firestore data converter
export class FileSchemaConverter implements FirestoreDataConverter<FileNode, FileDbModel> {
    constructor(private _userCreds: UserCredential) {}

    public toFirestore(node: WithFieldValue<FileNode>): WithFieldValue<FileDbModel> {
        return {
            path: node.fullPath,
            cTime: node.ctime,
            mTime: node.mtime,
            size: node.size,
            baseName: node.baseName,
            ext: node.extension,
            userId: this._userCreds.user.uid,
            deleted: false
        };
    }

    public fromFirestore(
        _snapshot: QueryDocumentSnapshot<FileDbModel, DocumentData>,
        _options: SnapshotOptions
    ): FileNode<Some<string>> {
        const data = _snapshot.data();

        return new FileNode({
            fullPath: data.path,
            ctime: data.cTime,
            mtime: data.mTime,
            size: data.size,
            baseName: data.baseName,
            extension: data.ext,
            fileId: Some(_snapshot.id),
            userId: Some(data.userId),
            deleted: data.deleted,
            data: data.data !== undefined ? data.data.toUint8Array() : undefined,
            fileStorageRef: data.fileStorageRef,
            localDataType: None
        });
    }
}
