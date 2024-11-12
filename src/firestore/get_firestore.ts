import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import {
    getFirestore,
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager
} from "firebase/firestore";

let HAS_BEEN_INIT = false;

export function GetFirestore(app: FirebaseApp): Firestore {
    if (HAS_BEEN_INIT) {
        return getFirestore(app);
    }

    HAS_BEEN_INIT = true;
    return initializeFirestore(app, {
        localCache: persistentLocalCache(
            /*settings*/ { tabManager: persistentMultipleTabManager() }
        )
    });
}
