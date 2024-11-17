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
import { FlattenFileNodes, GetNonDeletedByFilePath, MapByFilePath } from "./file_node_util";
import type { CloudNode, LocalNode, AllFileNodeTypes, FilePathType } from "./file_node";

// Denotes the action that should be taken to sync the two states.
export enum ConvergenceAction {
    /** Use cloud to update local file. */
    USE_CLOUD = "using_cloud",
    /** Use cloud to update local file. */
    USE_CLOUD_DELETE_LOCAL = "using_cloud_to_remove_local",
    /** Use local file to update cloud. */
    USE_LOCAL = "using_local",
    /** Uses the local state to mark cloud as deleted. */
    USE_LOCAL_DELETE_CLOUD = "using_local_delete_cloud",
    /** No update needed just update the local file id and other metadata. */
    NULL_UPDATE = "null_update"
}

interface SharedUpdateData {
    /** Cloud upload data. */
    fileUploadTask?: UploadTask;
    /** New local nodes created in this process. */
    newLocalFile?: LocalNode;
}

export interface NullUpdate extends SharedUpdateData {
    action: ConvergenceAction.NULL_UPDATE;
    localState: Some<LocalNode>;
    cloudState: Some<CloudNode>;
}

export interface LocalConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL;
    localState: Some<LocalNode>;
    cloudState: Option<CloudNode>;
}

export interface LocalDeleteCloudConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL_DELETE_CLOUD;
    localState: Some<LocalNode>;
    cloudState: Some<CloudNode>;
}

export interface CloudConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_CLOUD;
    localState: Option<LocalNode>;
    cloudState: Some<CloudNode>;
    /** A full file path of a possible left over local file. */
    leftOverLocalFile: Option<string>;
}

/** An update that trashes the local file. */
export interface CloudDeleteLocalConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_CLOUD_DELETE_LOCAL;
    localState: Some<LocalNode>;
    cloudState: Some<CloudNode>;
    leftOverLocalFile: Option<FilePathType>;
}

export type ConvergenceUpdate =
    | NullUpdate
    | CloudConvergenceUpdate
    | CloudDeleteLocalConvergenceUpdate
    | LocalConvergenceUpdate
    | LocalDeleteCloudConvergenceUpdate;

/**
 * Ensures that there is only a single update for a path.
 * @param reservedOutPaths set to keep track of used output paths.
 * @param node the file node the update will take from.
 * @returns Result of validating path
 */
export function EnsureReservedPathValidity(
    reservedOutPaths: Set<string>,
    node: AllFileNodeTypes
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
    localNode: LocalNode,
    localVisisted: Set<LocalNode>,
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
 * @param cloudVisitedByFilePath set to keep track of visited nodes.
 * @param reservedFullPath set to keep track of used output paths.
 * @returns Convergence update if an update is needed.
 */
function CreateConvergenceForOnlyCloudNode(
    cloudNode: CloudNode,
    cloudVisitedByFilePath: Set<string>,
    reservedFullPath: Set<string>
): Result<Option<ConvergenceUpdate>, StatusError> {
    // The local node has been visited
    if (cloudVisitedByFilePath.has(cloudNode.data.fullPath)) {
        return Ok(None);
    }

    // Make sure the final output path hasn't been reserved by another convergence.
    const result = EnsureReservedPathValidity(reservedFullPath, cloudNode);
    if (result.err) {
        return result;
    }

    cloudVisitedByFilePath.add(cloudNode.data.fullPath);
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
 * @param cloudVisitedByFilePath set of visited cloud nodes
 * @param localVisisted set of visited local nodes
 * @param reservedFullPath set of the paths used by an update or existing files
 * @returns Result of a possible update if necessary or error
 */
export function CompareNodesAndGetUpdate(
    localNode: Option<LocalNode>,
    cloudNode: Option<CloudNode>,
    cloudVisitedByFilePath: Set<string>,
    localVisisted: Set<LocalNode>,
    reservedFullPath: Set<string>
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
            cloudVisitedByFilePath,
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
    const cloudVisited = cloudVisitedByFilePath.has(cloudNode.safeValue().data.fullPath);
    if (localVisited && cloudVisited) {
        // Both nodes have been visited and already in some type of update.
        return Ok(None);
    } else if (localVisited && !cloudVisited) {
        // Only local node has been used so we create a cloud convergence update.
        return CreateConvergenceForOnlyCloudNode(
            cloudNode.safeValue(),
            cloudVisitedByFilePath,
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

    // Case where everything is the same but it is missing the firestore time.
    if (
        lNode.metadata.firestoreTime.none &&
        lNode.data.fullPath === cNode.data.fullPath &&
        lNode.data.deleted === cNode.data.deleted &&
        lNode.data.fileHash === cNode.data.fileHash
    ) {
        // No update needed, everything is almost the same.
        localVisisted.add(lNode);
        cloudVisitedByFilePath.add(cNode.data.fullPath);
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

    const hasLeftOverLocalFile = lNode.data.fullPath !== cNode.data.fullPath;
    // Case where the data on device does not have a firestore time or is older.
    if (
        lNode.metadata.firestoreTime.none ||
        lNode.metadata.firestoreTime.safeValue() < cNode.metadata.firestoreTime.safeValue()
    ) {
        localVisisted.add(lNode);
        cloudVisitedByFilePath.add(cNode.data.fullPath);
        const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
        if (pathResult.err) {
            return pathResult;
        }
        const action: ConvergenceUpdate = {
            action:
                cNode.data.deleted && cNode.data.deleted !== lNode.data.deleted
                    ? ConvergenceAction.USE_CLOUD_DELETE_LOCAL
                    : ConvergenceAction.USE_CLOUD,
            localState: localNode,
            cloudState: cloudNode,
            leftOverLocalFile: hasLeftOverLocalFile ? Some(lNode.data.fullPath) : None
        };
        return Ok(Some(action));
    }

    // Case where everything is the same.
    if (
        lNode.metadata.firestoreTime.equals(cNode.metadata.firestoreTime) &&
        lNode.data.fullPath === cNode.data.fullPath &&
        lNode.data.deleted === cNode.data.deleted &&
        lNode.data.fileHash === cNode.data.fileHash
    ) {
        // No update needed, everything is the same.
        localVisisted.add(lNode);
        cloudVisitedByFilePath.add(cNode.data.fullPath);
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

    // The local node has been marked to be deleted by cloud node hasn't. We need to remove the
    // cloud node.
    if (lNode.data.deleted && lNode.data.deleted !== cNode.data.deleted) {
        localVisisted.add(lNode);
        cloudVisitedByFilePath.add(cNode.data.fullPath);
        const action: ConvergenceUpdate = {
            action: ConvergenceAction.USE_LOCAL_DELETE_CLOUD,
            localState: localNode,
            cloudState: cloudNode
        };
        return Ok(Some(action));
    }

    // Default to using local to update the cloud.
    localVisisted.add(lNode);
    cloudVisitedByFilePath.add(cNode.data.fullPath);
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

export interface ConvergeMapsToUpdateStatesOpts {
    cloudMapRep: FileMapOfNodes<CloudNode>;
    localMapRep: FileMapOfNodes<LocalNode>;
}

/**
 * Converges the two (local,cloud) FileNode maps and returns the updates necesary to make them the
 * same.
 * @returns Updates necessary to to make both dates the same.
 */
export function ConvergeMapsToUpdateStates({
    cloudMapRep,
    localMapRep
}: ConvergeMapsToUpdateStatesOpts): Result<ConvergenceUpdate[], StatusError> {
    const cloudFlatNodes = FlattenFileNodes(cloudMapRep);
    const localFlatNodes = FlattenFileNodes(localMapRep);
    const localMapOfFilePath = MapByFilePath(localFlatNodes);

    // These are the cloud nodes that have been reviewed.
    const cloudVisitedByFilePath = new Set<string>();
    // These are the local nodes that have been reviewed. They may not have a file id so we use obj
    // reference instead.
    const localVisisted = new Set<LocalNode>();
    // These are file paths that other files will resolve to once synced. So we can't have 2 files
    // end up at the same path.
    const reservedFullPath = new Set<string>();

    // These are the update actions that have to take place to converge the 2 states.
    const convergenceUpdates: ConvergenceUpdate[] = [];

    //
    // First do comparison of internal vs external by `fulpath`. This is the only stage where
    // deletion of files can happen. We only delete a file locally if we have matching ids
    // otherwise the local file will be kept. This is due to use following files by id instead
    // of file path.
    //

    for (const cloudNode of cloudFlatNodes) {
        const localNode = localMapOfFilePath.get(cloudNode.data.fullPath);
        if (localNode === undefined) {
            continue;
        }
        const compareResult = CompareNodesAndGetUpdate(
            Some(localNode),
            Some(cloudNode),
            cloudVisitedByFilePath,
            localVisisted,
            reservedFullPath
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
    const getFilePaths = (node: AllFileNodeTypes): string => node.data.fullPath;
    const isNonDeleted = (node: AllFileNodeTypes): boolean => !node.data.deleted;
    const isInternalUnvisited = (node: CloudNode): boolean =>
        !cloudVisitedByFilePath.has(node.data.fullPath);
    const isExternalUnvisited = (node: LocalNode): boolean => !localVisisted.has(node);
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

        const compareResult = CompareNodesAndGetUpdate(
            localNode,
            cloudNode,
            cloudVisitedByFilePath,
            localVisisted,
            reservedFullPath
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
