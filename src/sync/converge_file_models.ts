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
import type { FileMapOfNodes, FileNode } from "./file_node";
import { FlattenFileNodes, GetNonDeletedByFilePath, MapByFileId } from "./file_node";

// Denotes the action that should be taken to sync the two states.
export enum ConvergenceAction {
    /** Use cloud to update local file. */
    USE_CLOUD = "using_cloud",
    /** Use local file to update cloud. */
    USE_LOCAL = "using_local",
    /** Uses the local state but repalces local id with the cloud id. */
    USE_LOCAL_BUT_REPLACE_ID = "using_local_need_to_change_id"
}

interface SharedUpdateData {
    fileUploadTask?: UploadTask;
}

interface LocalConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL;
    localState: Some<FileNode>;
    cloudState: Option<FileNode<Some<string>>>;
}

interface LocalReplaceIdConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_LOCAL_BUT_REPLACE_ID;
    localState: Some<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
}

interface CloudConvergenceUpdate extends SharedUpdateData {
    action: ConvergenceAction.USE_CLOUD;
    localState: Option<FileNode>;
    cloudState: Some<FileNode<Some<string>>>;
}

export type ConvergenceUpdate =
    | CloudConvergenceUpdate
    | LocalConvergenceUpdate
    | LocalReplaceIdConvergenceUpdate;

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
    if (reservedOutPaths.has(node.fullPath)) {
        return Err(
            AlreadyExistsError(
                `There is a conflict between synced files and local ones having multiple resolving to the path "${node.fullPath}". Recommend complete local removal of file ids.`
            )
        );
    }
    reservedOutPaths.add(node.fullPath);
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
    if (cloudVisitedByFileId.has(cloudNode.fileId.safeValue())) {
        return Ok(None);
    }

    // Make sure the final output path hasn't been reserved by another convergence.
    const result = EnsureReservedPathValidity(reservedFullPath, cloudNode);
    if (result.err) {
        return result;
    }

    cloudVisitedByFileId.add(cloudNode.fileId.safeValue());
    const update: CloudConvergenceUpdate = {
        action: ConvergenceAction.USE_CLOUD,
        localState: None,
        cloudState: Some(cloudNode)
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
 * @returns Result of a possible update if necessary or error
 */
export function CompareNodesAndGetUpdate(
    localNode: Option<FileNode>,
    cloudNode: Option<FileNode<Some<string>>>,
    cloudVisitedByFileId: Set<string>,
    localVisisted: Set<FileNode>,
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
    const cloudVisited = cloudVisitedByFileId.has(cloudNode.safeValue().fileId.safeValue());
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
    const notMarkdownFile = lNode.extension !== "md";
    if (
        lNode.mtime === cNode.mtime &&
        lNode.fullPath === cNode.fullPath &&
        lNode.deleted === cNode.deleted &&
        (lNode.fileId.valueOr("") === cNode.fileId.safeValue() || notMarkdownFile) &&
        lNode.size === cNode.size
    ) {
        // No update needed, everything is the same.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.fileId.safeValue());
        const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
        if (pathResult.err) {
            return pathResult;
        }
        return Ok(None);
    }

    // Checks if both have a file id and they are different.
    const bothHaveDifferentFileIds =
        lNode.fileId.some && lNode.fileId.safeValue() !== cNode.fileId.safeValue();
    if (lNode.mtime > cNode.mtime) {
        // The local node is newer, so replace the cloud one.
        localVisisted.add(lNode);
        cloudVisitedByFileId.add(cNode.fileId.safeValue());
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
    cloudVisitedByFileId.add(cNode.fileId.safeValue());
    const pathResult = EnsureReservedPathValidity(reservedFullPath, cNode);
    if (pathResult.err) {
        return pathResult;
    }
    const action: ConvergenceUpdate = {
        action: ConvergenceAction.USE_CLOUD,
        localState: localNode,
        cloudState: cloudNode
    };
    return Ok(Some(action));
}

/**
 * Converges the two (local,cloud) FileNode maps and returns the updates necesary to make them the
 * same.
 * @returns Updates necessary to to make both dates the same.
 */
export function ConvergeMapsToUpdateStates({
    cloudMapRep,
    localMapRep
}: {
    cloudMapRep: FileMapOfNodes<Some<string>>;
    localMapRep: FileMapOfNodes;
}): Result<ConvergenceUpdate[], StatusError> {
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
        const localNode = localMapOfFileId.get(cloudNode.fileId.valueOr(""));
        if (localNode === undefined) {
            continue;
        }
        const compareResult = CompareNodesAndGetUpdate(
            Some(localNode),
            Some(cloudNode),
            cloudVisitedByFileId,
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
    const getFilePaths = (node: FileNode): string => node.fullPath;
    const isNonDeleted = (node: FileNode): boolean => !node.deleted;
    const isInternalUnvisited = (node: FileNode): boolean =>
        !cloudVisitedByFileId.has(node.fileId.valueOr(""));
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

        const compareResult = CompareNodesAndGetUpdate(
            localNode,
            cloudNode,
            cloudVisitedByFileId,
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
