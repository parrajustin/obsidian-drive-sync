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
    // Node/headless has no IndexedDB, so `persistentLocalCache` would throw.
    // Fall back to the in-memory default cache there; keep the persistent
    // multi-tab cache in the browser (Obsidian) where it works.
    if (typeof window === "undefined") {
        return initializeFirestore(app, {});
    }
    return initializeFirestore(app, {
        localCache: persistentLocalCache(
            /*settings*/ { tabManager: persistentMultipleTabManager() }
        )
    });
}
