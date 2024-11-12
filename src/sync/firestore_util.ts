import type { Firestore, Transaction } from "firebase/firestore";
import { doc } from "firebase/firestore";
import { HistoricFileNode } from "../history/history_file_node";
import { GetHistorySchemaConverter } from "../history/history_schema";
import { uuidv7 } from "../lib/uuid";
import type { UploadFileNode, CloudNode, FirestoreNodes } from "./file_node";
import type { FileDbModel } from "./firestore_schema";
import { GetFileSchemaConverter } from "./firestore_schema";
import { GetFileCollectionPath } from "../firestore/file_db_util";
import type { UserCredential } from "firebase/auth";
import type { Option } from "../lib/option";

/** Upload the file to firestore. Also uploads the data to history. */
export async function UploadFileToFirestore(
    db: Firestore,
    transaction: Transaction,
    node: UploadFileNode,
    cloudNode: Option<CloudNode>,
    user: UserCredential,
    fileId: string
) {
    const entry = `${GetFileCollectionPath(user)}/${fileId}`;
    // Upload the cloud node which is the old one, to the history. If any.
    if (cloudNode.some) {
        const result = await transaction.get(
            doc(db, entry).withConverter<FirestoreNodes, FileDbModel>(GetFileSchemaConverter())
        );
        const fetchedCloudNode = result.data() as CloudNode;
        const histEntry = `hist/${uuidv7()}`;
        const histDocumentRef = doc(db, histEntry).withConverter(GetHistorySchemaConverter());
        transaction.set(histDocumentRef, HistoricFileNode.constructFromCloudNode(fetchedCloudNode));
    }

    // Upload the new file.
    const documentRef = doc(db, entry).withConverter<FirestoreNodes, FileDbModel>(
        GetFileSchemaConverter()
    );
    transaction.set(documentRef, node);
}

/** Update firestore to mark a file as deleted. */
export async function MarkFirestoreAsDeleted(
    db: Firestore,
    transaction: Transaction,
    user: UserCredential,
    fileId: string
) {
    const entry = `${GetFileCollectionPath(user)}/${fileId}`;
    // Upload the cloud node which is the old one, to the history. If any.
    const result = await transaction.get(
        doc(db, entry).withConverter<FirestoreNodes, FileDbModel>(GetFileSchemaConverter())
    );
    const fetchedCloudNode = result.data() as CloudNode;
    const histEntry = `hist/${uuidv7()}`;
    const histDocumentRef = doc(db, histEntry).withConverter(GetHistorySchemaConverter());
    transaction.set(histDocumentRef, HistoricFileNode.constructFromCloudNode(fetchedCloudNode));

    transaction.update(doc(db, entry), { deleted: true });
}
