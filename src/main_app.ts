import type { UserCredential } from "firebase/auth";
import type { Option } from "./lib/option";
import { None, Some } from "./lib/option";
import type { App, Plugin } from "obsidian";
import type { FirebaseApp } from "firebase/app";
import type { LatestSettingsConfigVersion } from "./schema/settings/settings_config.schema";
import type { Result, StatusResult } from "./lib/result";
import type { StatusError } from "./lib/status_error";

export interface MainAppType extends Plugin {
    app: App;

    userCreds: Option<UserCredential>;

    firebaseApp: Option<FirebaseApp>;

    loggedIn: Promise<UserCredential>;

    settings: LatestSettingsConfigVersion;

    saveSettings: () => Promise<void>;

    loadSettings: () => Promise<void>;

    loginForSettings: () => Promise<StatusResult<StatusError>>;

    tryLogin: () => Promise<Result<Option<UserCredential>, StatusError>>;

    killSyncer: (syncerId: string) => void;
}

export let THIS_APP: Option<MainAppType> = None;

export function SetThisApp(app: MainAppType) {
    THIS_APP = Some(app);
}
