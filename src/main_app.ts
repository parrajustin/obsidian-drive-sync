import type { UserCredential } from "firebase/auth";
import type { Option } from "./lib/option";
import { None, Some } from "./lib/option";
import type { App } from "obsidian";
import type { FirebaseApp } from "firebase/app";
import type { LatestSettingsConfigVersion } from "./schema/settings/settings_config.schema";

export interface MainAppType {
    app: App;

    userCreds: Option<UserCredential>;

    firebaseApp: Option<FirebaseApp>;

    loggedIn: Promise<UserCredential>;

    settings: LatestSettingsConfigVersion;

    killSyncer: (syncerId: string) => void;
}

export let THIS_APP: Option<MainAppType> = None;

export function SetThisApp(app: MainAppType) {
    THIS_APP = Some(app);
}
