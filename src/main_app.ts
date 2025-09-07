import type { UserCredential } from "firebase/auth";
import type { Option } from "./lib/option";
import { None, Some } from "./lib/option";

interface MainAppCreds {
    userCreds: Option<UserCredential>;
}

export let THIS_APP: Option<MainAppCreds> = None;

export function SetThisApp(app: MainAppCreds) {
    THIS_APP = Some(app);
}
