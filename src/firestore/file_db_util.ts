import type { UserCredential } from "firebase/auth";
import { NOTES_MARKDOWN_FIREBASE_DB_NAME } from "../constants";

/** Gets the file collection root path. */
export function GetFileCollectionPath(_creds: UserCredential): string {
    // For dev account.
    // if (creds.user.uid === "GJC32RdD0VU7TMgl2hikR3bZZKF2") {
    //     return "GJC32RdD0VU7TMgl2hikR3bZZKF2";
    // }
    // For normal account.
    // if (creds.user.uid === "lgppj2II6sYqwcLxCvjfIJLCS8Q2") {
    //     return "lgppj2II6sYqwcLxCvjfIJLCS8Q2";
    // }
    return NOTES_MARKDOWN_FIREBASE_DB_NAME;
}
