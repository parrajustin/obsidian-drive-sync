import { App } from "obsidian";
import { FileAccess } from "../filesystem/file_access";
import type { MapOfFileNodes } from "../filesystem/file_map_util";
import {
    RemoteOnlyNode,
    FileNodeType,
    FilePathType,
    LocalOnlyFileNode,
    AllExistingFileNodeTypes,
    LocalCloudFileNode
} from "../filesystem/file_node";
import { Span } from "../logging/tracing/span.decorator";
import { LatestNotesSchema, LatestNotesSchemaWithoutData } from "../schema/notes/notes.schema";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import { StatusError } from "../lib/status_error";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { None, Optional, Some, WrapOptional } from "../lib/option";
import { SchemaWithId } from "./firebase_cache";
import { CreateLogger } from "../logging/logger";
import { MsFromEpoch } from "../types";
import { SYNCER_ID_SPAN_ATTR } from "../constants";

const LOGGER = CreateLogger("convergence_util");

export enum ConvergenceActionType {
    NEW_LOCAL_FILE = "NEW_LOCAL_FILE",
    UPDATE_CLOUD = "UPDATE_CLOUD",
    DELETE_LOCAL = "DELETE_LOCAL_FILE",
    MARK_CLOUD_DELETED = "MARK_CLOUD_DELETED",
    UPDATE_LOCAL = "UPDATE_LOCAL"
}

// Action to state we have a new local file, thus need a new cloud entry.
export interface NewLocalFileAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.NEW_LOCAL_FILE;
    localNode: LocalOnlyFileNode;
}

// Action to update the firebase data entry with new local file data.
export interface UpdateCloudAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.UPDATE_CLOUD;
    localNode: LocalCloudFileNode;
}

// Action to delete local file based on cloud data. Cloud marked is deleted.
export interface DeleteLocalFileAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.DELETE_LOCAL;
    localNode: LocalCloudFileNode;
}

// Action to update local data fetching from the cloud.
export interface UpdateLocalFileAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.UPDATE_LOCAL;
    localNode: LocalCloudFileNode | RemoteOnlyNode;
}

// Action to mark the cloud data as deleted. Local file removed.
export interface MarkCloudDeletedAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.MARK_CLOUD_DELETED;
    localNode: RemoteOnlyNode;
}

export type ConvergenceAction =
    | NewLocalFileAction
    | UpdateCloudAction
    | DeleteLocalFileAction
    | UpdateLocalFileAction
    | MarkCloudDeletedAction;

export interface ConvergenceStateReturnType {
    // Updated file nodes based on checking local file changes and merging cloud data.
    mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>;
    // Actions necessary to make both local and cloud states align.
    actions: ConvergenceAction[];
}

export class ConvergenceUtil {
    /**
     * Creates the convergence actions necessary to align the states of the local files and cloud state.
     * @param app The obsidian app api
     * @param config The config of the syncer calling this convergence
     * @param mapOfFileNodes The currently believed state of local files and cloud connections
     * @param touchedFiles The files believed to have been modified by the user since last execution
     * @param mapOfCloudData The current up to date cloud connectsion
     * @returns Update of convergence
     */
    @Span()
    @PromiseResultSpanError
    public static async createStateConvergenceActions(
        app: App,
        config: LatestSyncConfigVersion,
        mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>,
        touchedFiles: Map<FilePathType, MsFromEpoch>,
        mapOfCloudData: Map<string, SchemaWithId<LatestNotesSchema | LatestNotesSchemaWithoutData>>
    ): Promise<Result<ConvergenceStateReturnType, StatusError>> {
        // First update the file node map with updated local data from `touchedFiles`.
        const mapWithNewNodes = await this.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );
        if (mapWithNewNodes.err) {
            return mapWithNewNodes;
        }

        // Now update them with updated data from cloud.
        const mapWithCloudData = this.updateWithCloudData(
            mapWithNewNodes.safeUnwrap(),
            mapOfCloudData
        );

        // Now we have an updated state of what all the nodes should be.
        // Go through them and check for any necessary convergence actions.
        const actions: ConvergenceAction[] = [];
        for (const [fullPath, entry] of mapWithCloudData) {
            switch (entry.type) {
                case FileNodeType.LOCAL_ONLY_FILE: {
                    // There is only local data, we need to push it to the cloud.
                    const newFileAction: NewLocalFileAction = {
                        action: ConvergenceActionType.NEW_LOCAL_FILE,
                        fullPath,
                        localNode: entry
                    };
                    actions.push(newFileAction);
                    break;
                }
                case FileNodeType.LOCAL_CLOUD_FILE: {
                    // The file only needs to be updated:
                    // - if the hash states don't match
                    // - if remote is marked as deleted

                    // Check if any action is even necessary.
                    const isActionNecessary =
                        entry.firebaseData.data.deleted ||
                        entry.firebaseData.data.fileHash != entry.fileData.fileHash;
                    if (!isActionNecessary) {
                        break;
                    }

                    // Check if the local node is newer than the cloud node.
                    const isLocalNewer = entry.localTime > entry.firebaseData.data.entryTime;
                    if (isLocalNewer) {
                        const action: UpdateCloudAction = {
                            action: ConvergenceActionType.UPDATE_CLOUD,
                            fullPath,
                            localNode: entry
                        };
                        actions.push(action);
                        break;
                    }

                    // Check for deletion update state.
                    if (entry.firebaseData.data.deleted) {
                        // Cloud node marked deleted but we still have local data, we need to remove it.
                        const action: DeleteLocalFileAction = {
                            action: ConvergenceActionType.DELETE_LOCAL,
                            fullPath,
                            localNode: entry
                        };
                        actions.push(action);
                        break;
                    }

                    // Finally last case is to update the local data.
                    const action: UpdateLocalFileAction = {
                        action: ConvergenceActionType.UPDATE_LOCAL,
                        fullPath,
                        localNode: entry
                    };
                    actions.push(action);
                    break;
                }
                case FileNodeType.REMOTE_ONLY: {
                    // If the localtime is newer than the firebasedata the local file was
                    // recently deleted.
                    if (entry.localTime > entry.firebaseData.data.entryTime) {
                        const action: MarkCloudDeletedAction = {
                            action: ConvergenceActionType.MARK_CLOUD_DELETED,
                            fullPath,
                            localNode: entry
                        };
                        actions.push(action);
                        break;
                    }

                    // We only need to do an update if the remote data isn't marked deleted.
                    if (entry.firebaseData.data.deleted) {
                        break;
                    }
                    const action: UpdateLocalFileAction = {
                        action: ConvergenceActionType.UPDATE_LOCAL,
                        fullPath,
                        localNode: entry
                    };
                    actions.push(action);
                    break;
                }
            }
        }

        return Ok({ mapOfFileNodes: mapWithCloudData, actions });
    }

    @Span()
    public static updateWithCloudData(
        mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>,
        mapOfCloudData: Map<string, SchemaWithId<LatestNotesSchema | LatestNotesSchemaWithoutData>>
    ): MapOfFileNodes<AllExistingFileNodeTypes> {
        const outputMap = new Map<FilePathType, AllExistingFileNodeTypes>();
        const visitedPaths = new Set<FilePathType>();
        for (const [filePath, cloudData] of mapOfCloudData.entries()) {
            const fullPath = filePath as FilePathType;
            visitedPaths.add(fullPath);

            // Get the local information of this cloud entry.
            const originalFileNodeOpt = WrapOptional(mapOfFileNodes.get(fullPath));

            // There is no local entry, so it is a remote only node.
            if (originalFileNodeOpt.none) {
                const node: RemoteOnlyNode = {
                    type: FileNodeType.REMOTE_ONLY,
                    firebaseData: cloudData,
                    localTime: cloudData.data.entryTime,
                    fileData: { fullPath }
                };
                outputMap.set(fullPath, node);
                continue;
            }
            const originalFileNode = originalFileNodeOpt.safeValue();

            switch (originalFileNode.type) {
                case FileNodeType.LOCAL_ONLY_FILE:
                // Current state only has the local data, addin cloud data.
                // eslint-disable-next-line no-fallthrough
                case FileNodeType.LOCAL_CLOUD_FILE: {
                    // Update file node with new cloud data.
                    const node: LocalCloudFileNode = {
                        type: FileNodeType.LOCAL_CLOUD_FILE,
                        fileData: originalFileNode.fileData,
                        localTime: originalFileNode.localTime,
                        firebaseData: { id: cloudData.id, data: cloudData.data }
                    };
                    outputMap.set(fullPath, node);
                    break;
                }
                case FileNodeType.REMOTE_ONLY: {
                    // Update the cloud data.
                    const node: RemoteOnlyNode = {
                        type: FileNodeType.REMOTE_ONLY,
                        fileData: originalFileNode.fileData,
                        localTime: originalFileNode.localTime,
                        firebaseData: { id: cloudData.id, data: cloudData.data }
                    };
                    outputMap.set(fullPath, node);
                    break;
                }
            }
        }

        // Add all the untouched file nodes.
        for (const [filePath, oldFileNode] of mapOfFileNodes.entries()) {
            if (visitedPaths.has(filePath)) {
                continue;
            }
            outputMap.set(filePath, oldFileNode);
        }
        return outputMap;
    }

    /**
     * Updates the current file nodes by looking at all touched file nodes to find changes.
     * @param app obsidian app
     * @param config the syncer config
     * @param mapOfFileNodes the current state of file nodes we have
     * @param touchedFiles the files that were monitored with a change
     * @returns the new state of files nodes
     */
    @Span()
    @PromiseResultSpanError
    public static async updateWithNewNodes(
        app: App,
        config: LatestSyncConfigVersion,
        mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>,
        touchedFiles: Map<FilePathType, MsFromEpoch>
    ): Promise<Result<MapOfFileNodes<AllExistingFileNodeTypes>, StatusError>> {
        // First get the new file nodes based on the file handlers.
        const newFileNodes = await FileAccess.getTouchedFileNodes(app, config, touchedFiles);
        if (newFileNodes.err) {
            return newFileNodes;
        }

        // Now first combine the new file nodes.
        const outputMap = new Map<FilePathType, AllExistingFileNodeTypes>();
        const visitedPaths = new Set<FilePathType>();
        for (const [filePath, newFileNode] of newFileNodes.safeUnwrap().entries()) {
            // Filter out invalid file node types.
            if (newFileNode.type === FileNodeType.INVALID) {
                LOGGER.debug(`Found invalid file node: "${filePath}"`, {
                    node: JSON.stringify(newFileNode),
                    [SYNCER_ID_SPAN_ATTR]: config.syncerId
                });
                continue;
            }
            visitedPaths.add(filePath);

            // Check to see if we have a file node of this path already.
            const originalFileNodeOpt = WrapOptional(mapOfFileNodes.get(filePath));
            if (originalFileNodeOpt.none) {
                switch (newFileNode.type) {
                    case FileNodeType.LOCAL_ONLY_FILE:
                        // There isn't an original file to merge data with.
                        outputMap.set(filePath, newFileNode);
                        break;
                    case FileNodeType.LOCAL_MISSING:
                        // There isn't an original file and we didn't find new data, don't need to continue.
                        break;
                }
                continue;
            }
            const originalFileNode = originalFileNodeOpt.safeValue();

            // Combine the two file data.
            let finalNode: Optional<AllExistingFileNodeTypes> = None;
            switch (newFileNode.type) {
                case FileNodeType.LOCAL_ONLY_FILE:
                    // The new file node was found.
                    switch (originalFileNode.type) {
                        case FileNodeType.LOCAL_ONLY_FILE:
                            // File existed before, maybe a change in data?
                            finalNode = Some(newFileNode);
                            break;
                        case FileNodeType.LOCAL_CLOUD_FILE: {
                            // File existed before and connected to remote data, update with local data.
                            const newNode: LocalCloudFileNode = {
                                type: FileNodeType.LOCAL_CLOUD_FILE,
                                localTime: newFileNode.localTime,
                                fileData: newFileNode.fileData,
                                firebaseData: originalFileNode.firebaseData
                            };
                            finalNode = Some(newNode);
                            break;
                        }
                        case FileNodeType.REMOTE_ONLY: {
                            // File didn't exist locally but is connected remote and now exists locally.
                            const newNode: LocalCloudFileNode = {
                                type: FileNodeType.LOCAL_CLOUD_FILE,
                                localTime: newFileNode.localTime,
                                fileData: newFileNode.fileData,
                                firebaseData: originalFileNode.firebaseData
                            };
                            finalNode = Some(newNode);
                            break;
                        }
                    }
                    break;
                case FileNodeType.LOCAL_MISSING:
                    switch (originalFileNode.type) {
                        case FileNodeType.LOCAL_ONLY_FILE: {
                            // File existed before but now is deleted locally.
                            // Was never synced to cloud so we no longer needs this file node.
                            break;
                        }
                        case FileNodeType.LOCAL_CLOUD_FILE:
                        case FileNodeType.REMOTE_ONLY: {
                            // Either way file is connected to cloud only.
                            const newNode: RemoteOnlyNode = {
                                type: FileNodeType.REMOTE_ONLY,
                                localTime: newFileNode.localTime,
                                fileData: newFileNode.fileData,
                                firebaseData: originalFileNode.firebaseData
                            };
                            finalNode = Some(newNode);
                            break;
                        }
                    }
                    break;
            }
            if (finalNode.some) {
                outputMap.set(filePath, finalNode.safeValue());
            }
        }

        // Add all the untouched file nodes.
        for (const [filePath, oldFileNode] of mapOfFileNodes.entries()) {
            if (visitedPaths.has(filePath)) {
                continue;
            }
            outputMap.set(filePath, oldFileNode);
        }

        return Ok(outputMap);
    }
}
