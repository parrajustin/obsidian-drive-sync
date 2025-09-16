import type { App, PluginManifest } from "obsidian";
import { Plugin } from "obsidian";
import type { FirebaseApp } from "firebase/app";
import { initializeApp } from "firebase/app";
import type { Option } from "./lib/option";
import { None, Some } from "./lib/option";
import { FirebaseSyncSettingTab } from "./settings/settings";
import type { UserCredential, Auth } from "firebase/auth";
import {
    signInWithEmailAndPassword,
    browserLocalPersistence,
    initializeAuth,
    indexedDBLocalPersistence,
    debugErrorMap
} from "firebase/auth";
import type { StatusError } from "./lib/status_error";
import { InternalError, InvalidArgumentError } from "./lib/status_error";
import type { Result, StatusResult } from "./lib/result";
import { Err, Ok } from "./lib/result";
import { WrapPromise } from "./lib/wrap_promise";
import { LogError } from "./logging/log";
import { CreateExternallyResolvablePromise } from "./lib/external_promise";
import { FileSyncer } from "./sync/syncer";
import {
    GetOrCreateSyncProgressView,
    PROGRESS_VIEW_TYPE,
    SyncProgressView
} from "./sidepanel/progressView";
// import { SetFileSchemaConverter } from "./sync/firestore_schema";
// import { SetHistorySchemaConverter } from "./history/history_schema";
// import { HISTORY_VIEW_TYPE, HistoryProgressView } from "./history/history_view";
import type { LatestSettingsConfigVersion } from "./schema/settings/settings_config.schema";
import { SETTINGS_CONFIG_SCHEMA_MANAGER } from "./schema/settings/settings_config.schema";
import { CreateLogger } from "./logging/logger";
import "disposablestack/auto";
import { Span } from "./logging/tracing/span.decorator";
import { SetThisApp } from "./main_app";

const LOGGER = CreateLogger("main");

/** Plugin to add an image for user profiles. */
export default class FirestoreSyncPlugin extends Plugin {
    public firebaseApp: Option<FirebaseApp> = None;
    public userCreds: Option<UserCredential> = None;
    public auth: Option<Auth> = None;
    public settings: LatestSettingsConfigVersion;
    public loggedIn: Promise<UserCredential>;
    public loggedInResolve: (user: UserCredential) => void;
    /** Root file syncers. */
    private _syncers: FileSyncer[] = [];
    /** If a microtask has been created to load syncers. */
    private _loadingSyncers = false;

    constructor(app: App, manifest: PluginManifest) {
        super(app, manifest);
        this.settings = SETTINGS_CONFIG_SCHEMA_MANAGER.getDefault().unsafeUnwrap();
        const { promise, resolve } = CreateExternallyResolvablePromise<UserCredential>();
        this.loggedIn = promise;
        this.loggedInResolve = resolve;
        SetThisApp(this);
    }

    @Span()
    public override async onload(): Promise<void> {
        // Register the sync progress view.
        // this.registerView(HISTORY_VIEW_TYPE, (leaf) => new HistoryProgressView(leaf));
        this.registerView(PROGRESS_VIEW_TYPE, (leaf) => new SyncProgressView(leaf));
        this.addRibbonIcon("cloud", "Show sync view", async () => {
            const view = await GetOrCreateSyncProgressView(this.app, /*reveal=*/ true);
            view.setSyncPlugin(this);
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

        await this.loadSettings();
        // TODO: Add SDKs for Firebase products that you want to use
        // https://firebase.google.com/docs/web/setup#available-libraries

        // Try to login into firebase.
        const tryLoginResult = await this.tryLogin();
        if (tryLoginResult.err) {
            LogError(LOGGER, tryLoginResult.val);
        }

        this.addSettingTab(new FirebaseSyncSettingTab(this.app, this));
    }

    @Span()
    public override onunload() {
        void (async () => {
            await this.teardownSyncers();
        })();
    }

    @Span()
    public async saveSettings(startupSyncer = true): Promise<void> {
        LOGGER.debug("saving settings", { settings: this.settings, startupSyncer });
        await this.saveData(this.settings);
        if (startupSyncer) {
            this.startupSyncers();
        }
    }

    @Span()
    public async loadSettings(): Promise<void> {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const dataFromObsidian = Object.assign(
            {},
            SETTINGS_CONFIG_SCHEMA_MANAGER.getDefault().unsafeUnwrap(),
            await this.loadData()
        );
        const settingUpdated = SETTINGS_CONFIG_SCHEMA_MANAGER.updateSchema(dataFromObsidian);
        if (settingUpdated.err) {
            this.onunload();
            LogError(LOGGER, settingUpdated.val);
            return;
        }
        this.settings = settingUpdated.safeUnwrap();
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        LOGGER.debug("loaded settings", { dataFromObsidian, parsedSettings: this.settings });
        this.startupSyncers();
    }

    /** Attempts to login from the settings tab. */
    @Span()
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
    @Span()
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
        const loginResult = await WrapPromise<UserCredential>(
            signInWithEmailAndPassword(auth, email, password),
            /*textForUnknown=*/ "Unknown signInWithEmailAndPassword"
        );
        if (loginResult.err) {
            return loginResult;
        }

        const creds = loginResult.safeUnwrap();
        this.userCreds = Some(creds);
        LOGGER.info(`${email} logged in!`, { uid: creds.user.uid, email });

        this.loggedInResolve(creds);
        return loginResult;
    }

    /** Attempts to login to the firebase infra. */
    @Span()
    public async tryLogin(): Promise<Result<Option<UserCredential>, StatusError>> {
        if (this.settings.email === undefined || this.settings.password === undefined) {
            return Ok(None);
        }

        return (await this.login(this.settings.email, this.settings.password)).andThen((result) =>
            Ok(Some(result))
        );
    }

    @Span()
    public killSyncer(syncerId: string) {
        LOGGER.debug("killing syncer", { syncerId });
        for (const syncer of this._syncers) {
            if (syncer.getId() === syncerId) {
                syncer.teardown();
            }
        }
    }

    @Span()
    private async teardownSyncers(): Promise<void> {
        for (const syncer of this._syncers) {
            syncer.teardown();
        }
        const view = await GetOrCreateSyncProgressView(this.app, /*reveal=*/ false);
        view.resetView();
        view.setSyncPlugin(this);
    }

    /**
     * Sets up all the syncers based on their configs. Will shutdown them all if any have an error.
     */
    @Span()
    private startupSyncers() {
        if (this._loadingSyncers) {
            return;
        }

        this._loadingSyncers = true;
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        const timeoutId = window.setTimeout(async () => {
            const view = await GetOrCreateSyncProgressView(this.app, /*reveal=*/ false);
            view.setSyncPlugin(this);
            view.setStatus("Waiting for login");
            await this.loggedIn;

            view.setStatus("Cleaning up old syncers");
            // Make sure there are no syncers already running.
            await this.teardownSyncers();

            view.setStatus("Init syncers...");
            view.setSyncers(this.settings.syncers);
            // Create setup pipelines for all syncers.
            const setupStatuses: Promise<StatusResult<StatusError>>[] = [];
            for (const config of this.settings.syncers) {
                // Create promise to construct the file syncer and set it up.
                setupStatuses.push(
                    FileSyncer.constructFileSyncer(this.app, this, config)
                        .then((syncerResult) => {
                            if (syncerResult.err) {
                                return Promise.resolve(syncerResult);
                            }
                            this._syncers.push(syncerResult.safeUnwrap());
                            return syncerResult.safeUnwrap().init();
                        })
                        .then((status) => {
                            if (status.err) {
                                view.setSyncerStatus(config.syncerId, status.val.message, "red");
                            }
                            return status;
                        })
                );
            }

            // Check if any of the syncers had an error.
            let tearDown = false;
            const results = await Promise.all(setupStatuses);
            for (let i = 0; i < setupStatuses.length; i++) {
                const result = results[i]!;
                if (result.err) {
                    const config = this.settings.syncers[i];
                    if (config !== undefined) {
                        view.publishSyncerError(config.syncerId, result.val);
                    }
                    LogError(LOGGER, result.val);
                    tearDown = true;
                    break;
                }
            }

            // If any did teardown all syncers.
            if (tearDown) {
                view.setStatus("Error...");
                await this.teardownSyncers();
            } else {
                view.setStatus("Ready");
            }
            this._loadingSyncers = false;
        }, 0);
        this.register(() => {
            window.clearTimeout(timeoutId);
        });
    }
}
