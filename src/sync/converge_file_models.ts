/**
 * This file handles the converges of differeing file node representations, and returning what
 * changes have to be done to make them the same.
 */

import type { UploadTask } from "firebase/storage";
import type { Option } from "../lib/option";
import { None, Some } from "../lib/option";
import type { Result, StatusResult } from "../lib/result";
import { Err, Ok } from "../lib/result";
import type { StatusError } from "../lib/status_error";
import { AlreadyExistsError, InvalidArgumentError, UnknownError } from "../lib/status_error";
import type { FileMapOfNodes } from "./file_node_util";
import { FlattenFileNodes, GetNonDeletedByFilePath, MapByFileId } from "./file_node_util";
import type { FileNode } from "./file_node";

// Denotes the action that should be taken to sync the two states.
export enum ConvergenceAction {
    /** Use cloud to update local file. */
    USE_CLOUD = "using_cloud",
    /** Use cloud to update local file. */
    USE_CLOUD_DELETE_LOCAL = "using_cloud_to_remove_local",
    /** Use local file to update cloud. */
    USE_LOCAL = "using_local",
    /** Uses the local state but repalces local id with the cloud id. */
    USE_LOCAL_BUT_REPLACE_ID = "using_local_need_to_change_id",
    /** Uses the local state to mark cloud as deleted. */
    USE_LOCAL_DELETE_CLOUD = "using_local_delete_cloud",
    /** No update needed just update the local file id and other metadata. */
    NULL_UPDATE = "null_update"
}

interface SharedUpdateData {
    /** Cloud upload data. */
    fileUploadTask?: UploadTask;
}

export interface NullUpdate {
    action: ConvergenceAction.NULL_UPDATE;
    localState: Some<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
}

export interface LocalConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL;
    localState: Some<FileNode>;
    cloudState: Option<FileNode<Some<string>>>;
}

export interface LocalReplaceIdConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID;
    localState: Some<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
}

export interface LocalDeleteCloudConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL_DELETE_CLOUD;
    localState: Some<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
}

export interface CloudConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_CLOUD;
    localState: Option<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
    /** A full file path of a possible left over local file. */
    leftOverLocalFile: Option<string>;
}

/** An update that trashes the local file. */
export interface CloudDeleteLocalConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_CLOUD_DELETE_LOCAL;
    localState: Some<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
    leftOverLocalFile: Option<string>;
}

export type ConvergenceUpdate =
    | NullUpdate
    | CloudConvergenceUpdate
    | CloudDeleteLocalConvergenceUpdate
    | LocalConvergenceUpdate
    | LocalReplaceIdConvergenceUpdate
    | LocalDeleteCloudConvergenceUpdate;

/**
 * Ensures that there is only a single update for a path.
 * @param reservedOutPaths set to keep track of used output paths.
 * @param node the file node the update will take from.
 * @returns Result of validating path
 */
export function EnsureReservedPathValidity(
    reservedOutPaths: Set<string>,
    node: FileNode
): StatusResult<StatusError> {
    if (reservedOutPaths.has(node.data.fullPath)) {
        return Err(
            AlreadyExistsError(
                `There is a conflict between synced files and local ones having multiple resolving to the path "${node.data.fullPath}". Recommend complete local removal of file ids.`
            )
        );
    }
    reservedOutPaths.add(node.data.fullPath);
    return Ok();
}

/**
 * Creates the convergence update for the case where there is only a local node to consider. Can
 * return None if the local node has already been used in another convergence update.
 * @param localNode the node to create the convergence update from
 * @param localVisisted set to keep track of visited nodes.
 * @param reservedFullPath set to keep track of used output paths.
 * @returns Convergence update if an update is needed.
 */
function CreateConvergenceForOnlyLocalNode(
    localNode: FileNode,
    localVisisted: Set<FileNode>,
    reservedFullPath: Set<string>
): Result<Option<ConvergenceUpdate>, StatusError> {
    // The local node has been visited
    if (localVisisted.has(localNode)) {
        return Ok(None);
    }

    // Make sure the final output path hasn't been reserved by another convergence.
    const result = EnsureReservedPathValidity(reservedFullPath, localNode);
    if (result.err) {
        return result;
    }

    localVisisted.add(localNode);
    const update: LocalConvergenceUpdate = {
        action: ConvergenceAction.USE_LOCAL,
        localState: Some(localNode),
        cloudState: None
    };
    return Ok(Some(update));
}

/**
 * Creates the convergence update for the case where there is only a cloud node to consider. Can
 * return None if the cloud node has already been used in another convergence update.
 * @param cloudNode the node to create convergence update from
 * @param cloudVisitedByFileId set to keep track of visited nodes.
 * @param reservedFullPath set to keep track of used output paths.
 * @returns Convergence update if an update is needed.
 */
function CreateConvergenceForOnlyCloudNode(
    cloudNode: FileNode<Some<string>>,
    cloudVisitedByFileId: Set<string>,
    reservedFullPath: Set<string>
): Result<Option<ConvergenceUpdate>, StatusError> {
    // The local node has been visited
    if (cloudVisitedByFileId.has(cloudNode.data.fileId.safeValue())) {
        return Ok(None);
    }

    // Make sure the final output path hasn't been reserved by another convergence.
    const result = EnsureReservedPathValidity(reservedFullPath, cloudNode);
    if (result.err) {
        return result;
    }

    cloudVisitedByFileId.add(cloudNode.data.fileId.safeValue());
    const update: CloudConvergenceUpdate = {
        action: ConvergenceAction.USE_CLOUD,
        localState: None,
        cloudState: Some(cloudNode),
        leftOverLocalFile: None
    };
    return Ok(Some(update));
}

/**
 * Compares the two nodes and creats an update action if necessary to converge the states.
 * @param localNode the possible local node
 * @param cloudNode the possible cloud node
 * @param cloudVisitedByFileId set of visited cloud nodes
 * @param localVisisted set of visited local nodes
 * @param reservedFullPath set of the paths used by an update or existing files
 * @param overrideUseLocalIfSame an option to use the local file if the only change is the fullpath.
 * @returns Result of a possible update if necessary or error
 */
export function CompareNodesAndGetUpdate(
    localNode: Option<FileNode>,
    cloudNode: Option<FileNode<Some<string>>>,
    cloudVisitedByFileId: Set<string>,
    localVisisted: Set<FileNode>,
    reservedFullPath: Set<string>,
    overrideUseLocalIfSame: boolean
): Result<Option<ConvergenceUpdate>, StatusError> {
    if (localNode.none && cloudNode.none) {
        // Both nodes empty.
        return Err(InvalidArgumentError(`Requires either local/cloud node to be non null.`));
    }

    // First check cases where only a single node is passed in.
    if (localNode.none && cloudNode.some) {
        // Only cloud node not empty.
        return CreateConvergenceForOnlyCloudNode(
            cloudNode.safeValue(),
            cloudVisitedByFileId,
            reservedFullPath
        );
    } else if (localNode.some && cloudNode.none) {
        // Only local node not empty.
        return CreateConvergenceForOnlyLocalNode(
            localNode.safeValue(),
            localVisisted,
            reservedFullPath
        );
    }
    if (!localNode.some || !cloudNode.some) {
        return Err(
            UnknownError(`This shouldn't be able to happen, both localNode and cloudNode are None.`)
        );
    }

    // Now check cases where only a single node hasn't been used.
    const localVisited = localVisisted.has(localNode.safeValue());
    const cloudVisited = cloudVisitedByFileId.has(cloudNode.safeValue().data.fileId.safeValue());
    if (localVisited && cloudVisited) {
        // Both nodes have been visited and already in some type of update.
        return Ok(None);
    } else if (localVisited && !cloudVisited) {
        // Only local node has been used so we create a cloud convergence update.
        return CreateConvergenceForOnlyCloudNode(
            cloudNode.safeValue(),
            cloudVisitedByFileId,
            reservedFullPath
        );
    } else if (!localVisited && cloudVisited) {
        // Only cloud node has been used so we create a local convergence update.
        return CreateConvergenceForOnlyLocalNode(
            localNode.safeValue(),
            localVisisted,
            reservedFullPath
        );
    }

    // Local node removing the option.
    const lNode = localNode.safeValue();
    // Cloud node removing the option.
    const cNode = cloudNode.safeValue();
    // checks if the file is not a markdown file.
    const notMarkdownFile = lNode.data.extension !== "md";

    // Case where everything is the same.
    if (
        lNode.data.mtime === cNode.data.mtime &&
        lNode.data.fullPath === cNode.data.fullPath &&
        lNode.data.deleted === cNode.data.deleted &&
        (lNode.data.fileId.valueOr("") === cNode.data.fileId.safeValue() || notMarkdownFile) &&
        lNode.data.size === cNode.data.size
    ) {
        // No update needed, everything is the same.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.data.fileId.safeValue());
        const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
        if (pathResult.err) {
            return pathResult;
        }
        const action: ConvergenceUpdate = {
            action: ConvergenceAction.NULL_UPDATE,
            localState: localNode,
            cloudState: cloudNode
        };
        return Ok(Some(action));
    }

    // Case where everything is the same but full path but we have overrideUseLocalIfSame. An
    // example of this would be renaming the files, the mtime and ctime are the same.
    if (
        lNode.data.mtime === cNode.data.mtime &&
        overrideUseLocalIfSame &&
        lNode.data.deleted === cNode.data.deleted &&
        (lNode.data.fileId.valueOr("") === cNode.data.fileId.safeValue() || notMarkdownFile) &&
        lNode.data.size === cNode.data.size
    ) {
        // No update needed, everything is the same.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.data.fileId.safeValue());
        const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
        if (pathResult.err) {
            return pathResult;
        }
        const action: ConvergenceUpdate = {
            action: ConvergenceAction.USE_LOCAL,
            localState: localNode,
            cloudState: cloudNode
        };
        return Ok(Some(action));
    }

    // Case where everything is the same but local file doesn't have a file id.
    if (
        lNode.data.mtime === cNode.data.mtime &&
        lNode.data.fullPath === cNode.data.fullPath &&
        lNode.data.deleted === cNode.data.deleted &&
        lNode.data.fileId.none &&
        lNode.data.size === cNode.data.size
    ) {
        // No update needed, everything is the same.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.data.fileId.safeValue());
        const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
        if (pathResult.err) {
            return pathResult;
        }
        const action: ConvergenceUpdate = {
            action: ConvergenceAction.NULL_UPDATE,
            localState: localNode,
            cloudState: cloudNode
        };
        return Ok(Some(action));
    }

    // Case where the local node has been marked for deletion. Only happens when file is watched, as
    // local deletion means the file is gone.
    if (
        (lNode.data.fileId.valueOr("") === cNode.data.fileId.safeValue() || notMarkdownFile) &&
        lNode.data.deleted &&
        lNode.data.deleted !== cNode.data.deleted
    ) {
        // The local node is newer, so replace the cloud one.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.data.fileId.safeValue());
        const action: ConvergenceUpdate = {
            action: ConvergenceAction.USE_LOCAL_DELETE_CLOUD,
            localState: localNode,
            cloudState: cloudNode
        };
        return Ok(Some(action));
    }

    // Checks if both have a file id and they are different.
    const bothHaveDifferentFileIds =
        lNode.data.fileId.some && lNode.data.fileId.safeValue() !== cNode.data.fileId.safeValue();
    if (lNode.data.mtime > cNode.data.mtime || lNode.data.ctime > cNode.data.ctime) {
        // The local node is newer, so replace the cloud one.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.data.fileId.safeValue());
        const pathResult = EnsureReservedPathValidity(reservedFullPath, lNode);
        if (pathResult.err) {
            return pathResult;
        }
        const action: ConvergenceUpdate = {
            action: !bothHaveDifferentFileIds
                ? ConvergenceAction.USE_LOCAL
                : ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID,
            localState: localNode,
            cloudState: cloudNode
        };
        return Ok(Some(action));
    }

    // In most cases use the cloud version.
    localVisisted.add(lNode);
    cloudVisitedByFileId.add(cNode.data.fileId.safeValue());
    const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
    const hasLeftOverLocalFile = lNode.data.fullPath !== cNode.data.fullPath;
    if (pathResult.err) {
        return pathResult;
    }

    // Special delete local version.
    const deleteLocalFile = cNode.data.deleted && cNode.data.deleted !== lNode.data.deleted;
    if (deleteLocalFile) {
        const action: ConvergenceUpdate = {
            action: ConvergenceAction.USE_CLOUD_DELETE_LOCAL,
            localState: localNode,
            cloudState: cloudNode,
            leftOverLocalFile: None
        };
        return Ok(Some(action));
    }

    const action: ConvergenceUpdate = {
        action: ConvergenceAction.USE_CLOUD,
        localState: localNode,
        cloudState: cloudNode,
        leftOverLocalFile: hasLeftOverLocalFile ? Some(lNode.data.fullPath) : None
    };
    return Ok(Some(action));
}

export interface ConvergeMapsToUpdateStatesOpts {
    cloudMapRep: FileMapOfNodes<Some<string>>;
    localMapRep: FileMapOfNodes;
    overrideUseLocal: Set<FileNode>;
}

/**
 * Converges the two (local,cloud) FileNode maps and returns the updates necesary to make them the
 * same.
 * @returns Updates necessary to to make both dates the same.
 */
export function ConvergeMapsToUpdateStates({
    cloudMapRep,
    localMapRep,
    overrideUseLocal
}: ConvergeMapsToUpdateStatesOpts): Result<ConvergenceUpdate[], StatusError> {
    const cloudFlatNodes = FlattenFileNodes(cloudMapRep);
    const localFlatNodes = FlattenFileNodes(localMapRep);
    const localMapOfFileId = MapByFileId(localFlatNodes);

    // These are the cloud nodes that have been reviewed, all cloud nodes are expected to have a
    // file id.
    const cloudVisitedByFileId = new Set<string>();
    // These are the local nodes that have been reviewed. They may not have a file id so we use obj
    // reference instead.
    const localVisisted = new Set<FileNode>();
    // These are file paths that other files will resolve to once synced. So we can't have 2 files
    // end up at the same path.
    const reservedFullPath = new Set<string>();

    // These are the update actions that have to take place to converge the 2 states.
    const convergenceUpdates: ConvergenceUpdate[] = [];

    //
    // First do comparison of internal vs external by `fileId`. This is the only stage where
    // deletion of files can happen. We only delete a file locally if we have matching ids
    // otherwise the local file will be kept. This is due to use following files by id instead
    // of file path.
    //

    // we expect all internal files to have a fileId.
    for (const cloudNode of cloudFlatNodes) {
        const localNode = localMapOfFileId.get(cloudNode.data.fileId.valueOr(""));
        if (localNode === undefined) {
            continue;
        }
        const shouldUseLocalIfSame = overrideUseLocal.has(localNode);
        const compareResult = CompareNodesAndGetUpdate(
            Some(localNode),
            Some(cloudNode),
            cloudVisitedByFileId,
            localVisisted,
            reservedFullPath,
            shouldUseLocalIfSame
        );
        if (compareResult.err) {
            return compareResult;
        }
        const optionalUpdate = compareResult.safeUnwrap();
        if (optionalUpdate.some) {
            convergenceUpdates.push(optionalUpdate.safeValue());
        }
    }

    /**
     * Now we compare internal vs external by file paths. We do not do any deletion of file
     * here since we only compare non deleted files.
     *
     * Edge cases:
     *  - internal and external at file path exist with different file ids: In this case we
     *      replace the external file id with the internal's value.
     */

    // We now get all unique file paths from internal and external file nodes.
    const getFilePaths = (node: FileNode): string => node.data.fullPath;
    const isNonDeleted = (node: FileNode): boolean => !node.data.deleted;
    const isInternalUnvisited = (node: FileNode): boolean =>
        !cloudVisitedByFileId.has(node.data.fileId.valueOr(""));
    const isExternalUnvisited = (node: FileNode): boolean => !localVisisted.has(node);
    const allUniqPaths = new Set<string>([
        ...cloudFlatNodes.filter(isInternalUnvisited).filter(isNonDeleted).map(getFilePaths),
        ...localFlatNodes.filter(isExternalUnvisited).filter(isNonDeleted).map(getFilePaths)
    ]);

    for (const path of allUniqPaths) {
        // First we error check and ensure there is no node at a file path that has been reserved.
        if (reservedFullPath.has(path)) {
            return Err(
                AlreadyExistsError(
                    `There is a conflict between synced files and local ones having multiple resolving to the path "${path}". Recommend complete local removal of file ids.`
                )
            );
        }

        const cloudPathNodeResult = GetNonDeletedByFilePath(cloudMapRep, path);
        if (cloudPathNodeResult.err) {
            return cloudPathNodeResult;
        }
        const cloudNode = cloudPathNodeResult.safeUnwrap();
        const localPathNodeResult = GetNonDeletedByFilePath(localMapRep, path);
        if (localPathNodeResult.err) {
            return localPathNodeResult;
        }
        const localNode = localPathNodeResult.safeUnwrap();

        const shouldUseLocalIfSame = localNode
            .andThen((node) => overrideUseLocal.has(node))
            .valueOr(false);
        const compareResult = CompareNodesAndGetUpdate(
            localNode,
            cloudNode,
            cloudVisitedByFileId,
            localVisisted,
            reservedFullPath,
            shouldUseLocalIfSame
        );
        if (compareResult.err) {
            return compareResult;
        }
        const optionalUpdate = compareResult.safeUnwrap();
        if (optionalUpdate.some) {
            convergenceUpdates.push(optionalUpdate.safeValue());
        }
    }

    return Ok(convergenceUpdates);
}
