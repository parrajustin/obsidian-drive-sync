/**
 * A headless implementation of `MainAppType` (the object the sync engine reads
 * off the plugin). It provides the Firebase app, email/password auth, settings,
 * and the `loggedIn` gate the engine awaits before syncing — without any
 * Obsidian `Plugin` runtime.
 */

import type { App } from "obsidian";
import { initializeApp, type FirebaseApp } from "firebase/app";
import type { Auth, UserCredential } from "firebase/auth";
import { initializeAuth, inMemoryPersistence, signInWithEmailAndPassword } from "firebase/auth";
import { None, Some, type Optional } from "standard-ts-lib/src/optional";
import type { Result, StatusResult } from "standard-ts-lib/src/result";
import { Err, Ok } from "standard-ts-lib/src/result";
import {
    InternalError,
    InvalidArgumentError,
    type StatusError
} from "standard-ts-lib/src/status_error";
import { WrapPromise } from "standard-ts-lib/src/wrap_promise";
import { CreateExternallyResolvablePromise } from "../src/lib/external_promise";
import type { LatestSettingsConfigVersion } from "../src/schema/settings/settings_config.schema";
import type { MainAppType } from "../src/main_app";

/** The plugin's Firebase project config (mirrors src/main.ts). */
export const DEFAULT_FIREBASE_CONFIG = {
    apiKey: "AIzaSyAlfdzEyPC3PuGW84bIomMBQRrKz2aSUy4",
    authDomain: "obsidiandrivesync-5b3f2.firebaseapp.com",
    projectId: "obsidiandrivesync-5b3f2",
    storageBucket: "obsidiandrivesync-5b3f2.appspot.com",
    messagingSenderId: "266270660375",
    appId: "1:266270660375:web:14712bd324bcadccdb0952",
    measurementId: "G-9X9LPZQGWV"
} as const;

export class NodePlugin {
    public readonly app: App;
    public firebaseApp: Optional<FirebaseApp> = None;
    public auth: Optional<Auth> = None;
    public userCreds: Optional<UserCredential> = None;
    public settings: LatestSettingsConfigVersion;
    public readonly loggedIn: Promise<UserCredential>;
    private readonly _loggedInResolve: (user: UserCredential) => void;
    private _killHandler: (syncerId: string) => void = () => undefined;

    constructor(
        app: App,
        settings: LatestSettingsConfigVersion,
        firebaseConfig: Record<string, string> = DEFAULT_FIREBASE_CONFIG
    ) {
        this.app = app;
        this.settings = settings;
        this.firebaseApp = Some(initializeApp(firebaseConfig));
        const { promise, resolve } = CreateExternallyResolvablePromise<UserCredential>();
        this.loggedIn = promise;
        this._loggedInResolve = resolve;
    }

    /** Signs in to Firebase with email/password (in-memory persistence). */
    public async login(
        email: string,
        password: string
    ): Promise<Result<UserCredential, StatusError>> {
        if (this.firebaseApp.none) {
            return Err(InternalError("Firebase app hasn't been initialized!"));
        }
        if (email === "" || password === "") {
            return Err(InvalidArgumentError("Email and password must be provided."));
        }
        const auth = initializeAuth(this.firebaseApp.safeValue(), {
            persistence: inMemoryPersistence
        });
        this.auth = Some(auth);

        const loginResult = await WrapPromise<UserCredential>(
            signInWithEmailAndPassword(auth, email, password),
            /*textForUnknown=*/ "Failed signInWithEmailAndPassword"
        );
        if (loginResult.err) {
            return loginResult;
        }
        const creds = loginResult.safeUnwrap();
        this.userCreds = Some(creds);
        this._loggedInResolve(creds);
        return loginResult;
    }

    public async tryLogin(): Promise<Result<Optional<UserCredential>, StatusError>> {
        if (this.settings.email === undefined || this.settings.password === undefined) {
            return Ok(None);
        }
        return (await this.login(this.settings.email, this.settings.password)).andThen((creds) =>
            Ok(Some(creds))
        );
    }

    public async loginForSettings(): Promise<StatusResult<StatusError>> {
        if (this.userCreds.some) {
            return Ok();
        }
        return (await this.tryLogin()).andThen(() => Ok());
    }

    public async saveSettings(): Promise<void> {
        // The CLI's settings come from a config file and are not persisted back.
        return Promise.resolve();
    }

    public async loadSettings(): Promise<void> {
        return Promise.resolve();
    }

    /** Registers the callback the engine invokes to tear down a syncer by id. */
    public setKillHandler(handler: (syncerId: string) => void): void {
        this._killHandler = handler;
    }

    public killSyncer(syncerId: string): void {
        this._killHandler(syncerId);
    }

    public register(_cb: () => unknown): void {
        // Obsidian teardown hook; the CLI manages its own lifecycle.
    }

    /** Typed view of this plugin as the engine's `MainAppType`. */
    public asMainApp(): MainAppType {
        return this as unknown as MainAppType;
    }
}
