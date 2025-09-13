import type { UserCredential } from "firebase/auth";
import type { Option } from "./lib/option";
import { None, Some } from "./lib/option";

export interface MainAppType {
    userCreds: Option<UserCredential>;

    killSyncer: (syncerId: string) => void;
}

export let THIS_APP: Option<MainAppType> = None;

export function SetThisApp(app: MainAppType) {
    THIS_APP = Some(app);
}
