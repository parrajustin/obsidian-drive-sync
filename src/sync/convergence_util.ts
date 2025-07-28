import { App } from "obsidian";
import { FileAccess } from "../filesystem/file_access";
import type { MapOfFileNodes } from "../filesystem/file_map_util";
import {
    RemoteOnlyNode,
    FileNodeType,
    FilePathType,
    AllFileNodeTypes,
    AllValidFileNodeTypes,
    LocalFileNode,
    AllExistingFileNodeTypes
} from "../filesystem/file_node";
import { Span } from "../logging/tracing/span.decorator";
import { LatestNotesSchema } from "../schema/notes/notes.schema";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import type { Result } from "../lib/result";
import { Ok } from "../lib/result";
import { StatusError } from "../lib/status_error";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { Some, WrapOptional } from "../lib/option";
import { SchemaWithId } from "./firebase_cache";
import { CreateLogger } from "../logging/logger";
import { MsFromEpoch } from "../types";

const LOGGER = CreateLogger("convergence_util");

export enum ConvergenceActionType {
    NEW_LOCAL_FILE = "NEW_LOCAL_FILE",
    UPDATE_CLOUD = "UPDATE_CLOUD",
    DELETE_LOCAL = "DELETE_LOCAL_FILE",
    UPDATE_LOCAL = "UPDATE_LOCAL"
}

// Action to create a firebase entry for a new file.
export interface NewLocalFileAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.NEW_LOCAL_FILE;
    localNode: LocalFileNode;
}

// Action to update the firebase data entry for a local file.
export interface UpdateCloudAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.UPDATE_CLOUD;
    localNode: LocalFileNode;
    cloudData: SchemaWithId<LatestNotesSchema>;
}

// Action to delete local file based on cloud data.
export interface DeleteLocalFileAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.DELETE_LOCAL;
    localNode: LocalFileNode;
    cloudData: SchemaWithId<LatestNotesSchema>;
}

// Action to update local data fetching from the cloud.
export interface UpdateLocalFileAction {
    fullPath: FilePathType;
    action: ConvergenceActionType.UPDATE_LOCAL;
    localNode: LocalFileNode | RemoteOnlyNode;
    cloudData: SchemaWithId<LatestNotesSchema>;
}

// interface ConvergenceAction {
//     file: FilePathType;
//     action: ConvergenceActionType;
//     localNode: AllValidFileNodeTypes;
//     cloudData: SchemaWithId<LatestNotesSchema>;
// }
export type ConvergenceAction =
    | NewLocalFileAction
    | UpdateCloudAction
    | DeleteLocalFileAction
    | UpdateLocalFileAction;

interface ConvergenceStateReturnType {
    mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes>;
    actions: ConvergenceAction[];
}

export class ConvergenceUtil {
    @Span()
    @PromiseResultSpanError
    public static async createStateConvergenceActions(
        app: App,
        config: LatestSyncConfigVersion,
        mapOfFileNodes: MapOfFileNodes<AllValidFileNodeTypes>,
        touchedFiles: Map<FilePathType, MsFromEpoch>,
        mapOfCloudData: Map<string, SchemaWithId<LatestNotesSchema>>
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
        const actions: ConvergenceAction[] = [];
        const fileMapOfFileNodes = new Map<FilePathType, AllExistingFileNodeTypes>();
        for (const [fullPath, entry] of mapWithCloudData) {
            switch (entry.type) {
                case FileNodeType.LOCAL_FILE: {
                    // The file only needs to be updated:
                    // - if there is no remote data (new file).
                    // - if the hash states don't match
                    // - if remote is marked as deleted

                    // Check if there is any remote data.
                    const remoteData = entry.firebaseData;
                    if (remoteData.none) {
                        const newFileAction: NewLocalFileAction = {
                            action: ConvergenceActionType.NEW_LOCAL_FILE,
                            fullPath,
                            localNode: entry
                        };
                        actions.push(newFileAction);
                        break;
                    }

                    // Check if any action is even necessary.
                    const isActionNecessary =
                        remoteData.safeValue().data.deleted ||
                        remoteData.safeValue().data.fileHash != entry.fileData.fileHash;
                    if (!isActionNecessary) {
                        break;
                    }

                    // Check if the local node is newer than the cloud node.
                    const isLocalNewer = entry.localTime > remoteData.safeValue().data.entryTime;
                    if (isLocalNewer) {
                        const action: UpdateCloudAction = {
                            action: ConvergenceActionType.UPDATE_CLOUD,
                            fullPath,
                            localNode: entry,
                            cloudData: remoteData.safeValue()
                        };
                        actions.push(action);
                        break;
                    }

                    // Check if the cloud node says the local node has been deleted.
                    if (remoteData.safeValue().data.deleted) {
                        const action: DeleteLocalFileAction = {
                            action: ConvergenceActionType.DELETE_LOCAL,
                            fullPath,
                            localNode: entry,
                            cloudData: remoteData.safeValue()
                        };
                        actions.push(action);
                        break;
                    }

                    // Finally last case is to update the local data.
                    const action: UpdateLocalFileAction = {
                        action: ConvergenceActionType.UPDATE_LOCAL,
                        fullPath,
                        localNode: entry,
                        cloudData: remoteData.safeValue()
                    };
                    actions.push(action);
                    break;
                }
                case FileNodeType.LOCAL_MISSING: {
                    // The local file is missing and not connected to any remote data.
                    // We can just ignore this file, who cares...
                    break;
                }
                case FileNodeType.REMOTE_ONLY: {
                    // We only update the data if the cloud marks it no longer deleted.
                    if (entry.firebaseData.data.deleted) {
                        break;
                    }
                    const action: UpdateLocalFileAction = {
                        action: ConvergenceActionType.UPDATE_LOCAL,
                        fullPath,
                        localNode: entry,
                        cloudData: entry.firebaseData
                    };
                    actions.push(action);
                    break;
                }
            }
        }

        return Ok({ mapOfFileNodes: fileMapOfFileNodes, actions });
    }

    @Span()
    public static updateWithCloudData(
        mapOfFileNodes: MapOfFileNodes<AllValidFileNodeTypes>,
        mapOfCloudData: Map<string, SchemaWithId<LatestNotesSchema>>
    ): MapOfFileNodes<AllValidFileNodeTypes> {
        for (const [filePath, cloudData] of mapOfCloudData.entries()) {
            const fullPath = filePath as FilePathType;

            // Get the local information of this cloud entry.
            const originalFileNodeOpt = WrapOptional(mapOfFileNodes.get(filePath as FilePathType));

            // There is no local entry, so it is a remote only node.
            if (originalFileNodeOpt.none) {
                const node: RemoteOnlyNode = {
                    type: FileNodeType.REMOTE_ONLY,
                    firebaseData: cloudData,
                    localTime: cloudData.data.entryTime,
                    fileData: { fullPath }
                };
                mapOfFileNodes.set(filePath as FilePathType, node);
                continue;
            }
            const originalFileNode = originalFileNodeOpt.safeValue();

            switch (originalFileNode.type) {
                case FileNodeType.LOCAL_FILE:
                    originalFileNode.firebaseData = Some(cloudData);
                    break;
                case FileNodeType.LOCAL_MISSING:
                case FileNodeType.REMOTE_ONLY: {
                    const node: RemoteOnlyNode = {
                        type: FileNodeType.REMOTE_ONLY,
                        fileData: originalFileNode.fileData,
                        localTime: cloudData.data.entryTime,
                        firebaseData: cloudData
                    };
                    mapOfFileNodes.set(originalFileNode.fileData.fullPath, node);
                    break;
                }
            }
        }
        return mapOfFileNodes;
    }

    @Span()
    @PromiseResultSpanError
    public static async updateWithNewNodes(
        app: App,
        config: LatestSyncConfigVersion,
        mapOfFileNodes: MapOfFileNodes<AllValidFileNodeTypes>,
        touchedFiles: Map<FilePathType, MsFromEpoch>
    ): Promise<Result<MapOfFileNodes<AllValidFileNodeTypes>, StatusError>> {
        // First get the new file nodes based on the file handlers.
        const newFileNodes = await FileAccess.getTouchedFileNodes(app, config, touchedFiles);
        if (newFileNodes.err) {
            return newFileNodes;
        }

        // Now first combine the new file nodes.
        for (const [filePath, newFileNode] of newFileNodes.safeUnwrap().entries()) {
            if (newFileNode.type === FileNodeType.INVALID) {
                LOGGER.debug(`Found invalid file node: "${filePath}"`, {
                    node: JSON.stringify(newFileNode)
                });
                continue;
            }

            const originalFileNodeOpt = WrapOptional(mapOfFileNodes.get(filePath));
            if (originalFileNodeOpt.none) {
                mapOfFileNodes.set(filePath, newFileNode);
                continue;
            }
            const originalFileNode = originalFileNodeOpt.safeValue();

            // Combine the two file data.
            switch (newFileNode.type) {
                case FileNodeType.LOCAL_FILE:
                    mapOfFileNodes.set(filePath, newFileNode);
                    switch (originalFileNode.type) {
                        case FileNodeType.LOCAL_MISSING:
                            // There is no connected remote, but now there is a local file.
                            break;
                        case FileNodeType.LOCAL_FILE:
                            // File existed before, maybe a change in data?
                            newFileNode.firebaseData = originalFileNode.firebaseData;
                            break;
                        case FileNodeType.REMOTE_ONLY:
                            // File didn't exist locally but is connected remote and now exists locally.
                            newFileNode.firebaseData = Some(originalFileNode.firebaseData);
                            break;
                    }
                    break;
                case FileNodeType.LOCAL_MISSING:
                    switch (originalFileNode.type) {
                        case FileNodeType.LOCAL_FILE: {
                            // File existed before but now is deleted locally.
                            // Convert the file to a remote_only type.
                            let finalNode: AllFileNodeTypes;
                            if (originalFileNode.firebaseData.some) {
                                finalNode = {
                                    type: FileNodeType.REMOTE_ONLY,
                                    fileData: { fullPath: originalFileNode.fileData.fullPath },
                                    localTime: newFileNode.localTime,
                                    firebaseData: originalFileNode.firebaseData.safeValue()
                                };
                            } else {
                                finalNode = newFileNode;
                            }
                            mapOfFileNodes.set(filePath, finalNode);
                            break;
                        }
                        case FileNodeType.LOCAL_MISSING:
                            // Missing in the past and now.
                            mapOfFileNodes.set(filePath, newFileNode);
                            break;
                        case FileNodeType.REMOTE_ONLY:
                            // File is still missing locally but connected to cloud.
                            break;
                    }
                    break;
            }
        }

        return Ok(mapOfFileNodes);
    }
}
