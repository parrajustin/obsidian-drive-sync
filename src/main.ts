import { Plugin } from "obsidian";
import type { FirebaseApp } from "firebase/app";
import { initializeApp } from "firebase/app";
import type { Option } from "./lib/option";
import { None, Some } from "./lib/option";
import type { Settings } from "./settings";
import { DEFAULT_SETTINGS, FirebaseSyncSettingTab } from "./settings";
import type { UserCredential, Auth } from "firebase/auth";
import {
    signInWithEmailAndPassword,
    browserLocalPersistence,
    initializeAuth,
    indexedDBLocalPersistence,
    debugErrorMap
} from "firebase/auth";
import type { StatusError } from "./lib/status_error";
import { InternalError, InvalidArgumentError, UnknownError } from "./lib/status_error";
import type { Result, StatusResult } from "./lib/result";
import { Err, Ok } from "./lib/result";
import { WrapPromise } from "./lib/wrap_promise";
import { LogError } from "./log";
import { CreateExternallyResolvablePromise } from "./lib/external_promise";
import { FileSyncer } from "./sync/syncer";
import { GetOrCreateSyncProgressView, PROGRESS_VIEW_TYPE, SyncProgressView } from "./progressView";
import { compress, decompress } from "brotli-compress";

/** Plugin to add an image for user profiles. */
export default class FirestoreSyncPlugin extends Plugin {
    public firebaseApp: Option<FirebaseApp> = None;
    public userCreds: Option<UserCredential> = None;
    public auth: Option<Auth> = None;
    public settings: Settings;
    public loggedIn: Promise<UserCredential>;
    public loggedInResolve: (user: UserCredential) => void;
    /** Root file syncers. */
    private _syncers: FileSyncer[] = [];
    /** If a microtask has been created to load syncers. */
    private _loadingSyncers = false;

    public override async onload(): Promise<void> {
        console.log(compress, decompress);
        // Register the sync progress view.
        this.registerView(PROGRESS_VIEW_TYPE, (leaf) => new SyncProgressView(leaf));
        this.addRibbonIcon("cloud", "Show sync view", async () => {
            await GetOrCreateSyncProgressView(this.app);
        });
        // Your web app's Firebase configuration
        // For Firebase JS SDK v7.20.0 and later, measurementId is optional
        const firebaseConfig = {
            apiKey: "AIzaSyAlfdzEyPC3PuGW84bIomMBQRrKz2aSUy4",
            authDomain: "obsidiandrivesync-5b3f2.firebaseapp.com",
            projectId: "obsidiandrivesync-5b3f2",
            storageBucket: "obsidiandrivesync-5b3f2.appspot.com",
            messagingSenderId: "266270660375",
            appId: "1:266270660375:web:14712bd324bcadccdb0952",
            measurementId: "G-9X9LPZQGWV"
        };

        // Initialize Firebase
        const firebaseApp = initializeApp(firebaseConfig);
        this.firebaseApp = Some(firebaseApp);

        const { promise, resolve } = CreateExternallyResolvablePromise<UserCredential>();
        this.loggedIn = promise;
        this.loggedInResolve = resolve;
        await this.loadSettings();
        // TODO: Add SDKs for Firebase products that you want to use
        // https://firebase.google.com/docs/web/setup#available-libraries

        // Try to login into firebase.
        const tryLoginResult = await this.tryLogin();
        if (tryLoginResult.err) {
            LogError(tryLoginResult.val);
        } else {
            this.userCreds = tryLoginResult.val;

            // If there are actually any user creds resolve the promise.
            if (this.userCreds.some) {
                this.loggedInResolve(this.userCreds.safeValue());
            }
        }

        this.addSettingTab(new FirebaseSyncSettingTab(this.app, this));
    }

    public override async onunload(): Promise<void> {
        await this.teardownSyncers();
    }

    public async saveSettings(): Promise<void> {
        await this.saveData(this.settings);
        await this.startupSyncers();
    }

    public async loadSettings(): Promise<void> {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        await this.startupSyncers();
    }

    /** Attempts to login from the settings tab. */
    public async loginForSettings(): Promise<StatusResult<StatusError>> {
        if (this.userCreds.some) {
            return Ok();
        }

        const cred = await this.tryLogin();
        if (cred.err) {
            return cred;
        }
        this.userCreds = cred.safeUnwrap();
        if (this.userCreds.some) {
            this.loggedInResolve(this.userCreds.safeValue());
        }
        return Ok();
    }

    /** Login to firebase. */
    public async login(
        email?: string,
        password?: string
    ): Promise<Result<UserCredential, StatusError>> {
        if (this.firebaseApp.none) {
            return Err(InternalError("Firebase app hasn't been initalized!"));
        }
        const auth = initializeAuth(this.firebaseApp.safeValue(), {
            persistence: [indexedDBLocalPersistence, browserLocalPersistence],
            errorMap: debugErrorMap
        });
        this.auth = Some(auth);

        if (email === undefined || password === undefined) {
            return Err(InvalidArgumentError("Email and password must be defined."));
        }
        const loginResult = await WrapPromise<UserCredential, unknown>(
            signInWithEmailAndPassword(auth, email, password)
        );
        return loginResult.mapErr((err) => {
            console.error("Uknown login error", err);
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            return UnknownError(`Unknown Error "${err}"`);
        });
    }

    /** Attempts to login to the firebase infra. */
    private async tryLogin(): Promise<Result<Option<UserCredential>, StatusError>> {
        if (this.settings.email === undefined || this.settings.password === undefined) {
            return Ok(None);
        }

        return (await this.login(this.settings.email, this.settings.password)).andThen((result) =>
            Ok(Some(result))
        );
    }

    private async teardownSyncers(): Promise<void> {
        for (const syncer of this._syncers) {
            console.log("tearing down ", syncer);
            await syncer.teardown();
        }
        console.log("finish teardown");
    }

    /**
     * Sets up all the syncers based on their configs. Will shutdown them all if any have an error.
     */
    private async startupSyncers() {
        console.log("startup microtask");
        if (this._loadingSyncers) {
            console.log("startup microtask");
            return;
        }

        this._loadingSyncers = true;
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        queueMicrotask(async () => {
            console.log("startup microtask");
            // Make sure there are no syncers already running.
            await this.teardownSyncers();
            console.log("after teardownSyncers");

            // Create setup pipelines for all syncers.
            const setupStatuses: Promise<StatusResult<StatusError>>[] = [];
            for (const config of this.settings.syncers) {
                // Create promise to construct the file syncer and set it up.
                setupStatuses.push(
                    FileSyncer.constructFileSyncer(this, config).then((syncerResult) => {
                        console.log("hi");
                        if (syncerResult.err) {
                            return Promise.resolve(syncerResult);
                        }
                        console.log("hi2");
                        this._syncers.push(syncerResult.safeUnwrap());
                        return syncerResult.safeUnwrap().init();
                    })
                );
            }
            console.log("after setupStatuses", setupStatuses);

            // Check if any of the syncers had an error.
            let tearDown = false;
            const results = await Promise.all(setupStatuses);
            for (const result of results) {
                if (result.err) {
                    LogError(result.val);
                    tearDown = true;
                    break;
                }
            }
            console.log("after Promise.all", setupStatuses);

            // If any did teardown all syncers.
            if (tearDown) {
                console.log("after Promise.all tearDown", tearDown);
                await this.teardownSyncers();
            }
            this._loadingSyncers = false;
        });
    }
}
