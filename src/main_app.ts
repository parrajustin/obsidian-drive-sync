import type { UserCredential } from "firebase/auth";
import type { Optional } from "standard-ts-lib/src/optional";
import { None, Some } from "standard-ts-lib/src/optional";
import type { App, Plugin } from "obsidian";
import type { FirebaseApp } from "firebase/app";
import type { LatestSettingsConfigVersion } from "./schema/settings/settings_config.schema";
import type { Result, StatusResult } from "standard-ts-lib/src/result";
import type { StatusError } from "standard-ts-lib/src/status_error";

export interface MainAppType extends Plugin {
    app: App;

    userCreds: Optional<UserCredential>;

    firebaseApp: Optional<FirebaseApp>;

    loggedIn: Promise<UserCredential>;

    settings: LatestSettingsConfigVersion;

    saveSettings: () => Promise<void>;

    loadSettings: () => Promise<void>;

    loginForSettings: () => Promise<StatusResult<StatusError>>;

    tryLogin: () => Promise<Result<Optional<UserCredential>, StatusError>>;

    killSyncer: (syncerId: string) => void;
}

export let THIS_APP: Optional<MainAppType> = None;

export function SetThisApp(app: MainAppType) {
    THIS_APP = Some(app);
}
