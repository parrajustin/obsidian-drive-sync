import { openobserveRum } from "@openobserve/browser-rum";
import { openobserveLogs } from "@openobserve/browser-logs";
import type { UserCredential } from "firebase/auth";
import { PLUGIN_ENVIRONMENT, PLUGIN_VERSION } from "../constants";

const options = {
    clientToken: "rumLptTINIkyX8yEEfT",
    applicationId: "web-application-id",
    site: "openobserve.parrajustin.com",
    service: "obsidian-firebase-sync",
    env: PLUGIN_ENVIRONMENT,
    version: PLUGIN_VERSION,
    organizationIdentifier: "default",
    insecureHTTP: false,
    apiVersion: "v1"
};

export function InitializeOpenObserve(user: UserCredential, clientId: string, email: string) {
    openobserveRum.init({
        applicationId: options.applicationId, // required, any string identifying your application
        clientToken: options.clientToken,
        site: options.site,
        organizationIdentifier: options.organizationIdentifier,
        service: options.service,
        env: options.env,
        version: options.version,
        trackResources: true,
        trackLongTasks: true,
        trackUserInteractions: true,
        apiVersion: options.apiVersion,
        insecureHTTP: options.insecureHTTP,
        defaultPrivacyLevel: "allow" // 'allow' or 'mask-user-input' or 'mask'. Use one of the 3 values.
    });

    openobserveLogs.init({
        clientToken: options.clientToken,
        site: options.site,
        organizationIdentifier: options.organizationIdentifier,
        service: options.service,
        env: options.env,
        version: options.version,
        forwardErrorsToLogs: true,
        insecureHTTP: options.insecureHTTP,
        apiVersion: options.apiVersion,
        sessionSampleRate: 100
    });

    // You can set a user context
    openobserveRum.setUser({
        id: user.user.uid,
        clientId: clientId,
        email: email
    });

    openobserveLogs.setUser({
        id: user.user.uid,
        clientId: clientId,
        email: email
    });
}
