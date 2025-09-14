# File Syncer Documentation

This document outlines the inner workings of the `FileSyncer` class, which is responsible for synchronizing files between the local filesystem and a cloud backend (Firebase).

## Overview

The `FileSyncer` is a stateful class that manages the synchronization of a file tree. It can be configured to sync an entire vault or a specific sub-folder. Multiple `FileSyncer` instances can exist, for example, to handle different nested sync roots.

## Initialization Process

The initialization of the `FileSyncer` is a multi-step process orchestrated by the static method `constructFileSyncer` and the instance method `init`.

1.  **Construction (`constructFileSyncer`)**:
    *   A `SyncProgressView` is created or retrieved to display sync status in the Obsidian side panel.
    *   It waits for the Obsidian workspace layout to be ready to avoid processing a flurry of file events during startup.
    *   It verifies that the Firebase app is initialized and available.
    *   Finally, it instantiates the `FileSyncer` with the necessary dependencies: the Obsidian `App` instance, the main plugin instance, the Firebase app, the syncer configuration, an empty file map, and the progress view.

2.  **Initialization (`init`)**:
    *   Retrieves Firebase credentials.
    *   **File System Watcher**: Sets up a watcher using `listenForFileChanges` to monitor file and folder creations, modifications, deletions, and renames within its designated sync root. These events "touch" a file, marking it for the next sync cycle.
    *   **Local File State**: Scans the local filesystem to build an in-memory map (`_mapOfFileNodes`) representing the current state of all files and folders.
    *   **Cloud State Cache**: Loads a local cache of the cloud file state (`FirebaseCache`). This cache helps in reducing redundant cloud reads and provides a last-known-state for comparison.
    *   **Firebase Syncer**: Constructs and initializes the `FirebaseSyncer`, which is responsible for all direct communication with Firebase. This includes setting up real-time listeners for changes in the cloud data.
    *   **First Tick**: After successful initialization, it triggers the first `fileSyncerTick` to perform the initial sync.

## The Sync Cycle (`fileSyncerTick`)

The `FileSyncer` operates on a continuous, self-repeating "tick" mechanism. The `fileSyncerTick` is the core of the synchronization loop.

1.  A new tick is scheduled using `setTimeout` after the previous one completes. The interval is dynamic, ensuring at least a 50ms delay but aiming for roughly one second between ticks.
2.  If the syncer is marked as `_isDead`, the loop terminates.
3.  Each tick runs inside its own tracing span with a unique `cycleId` for observability.

### Inside a Tick (`fileSyncerTickLogic`)

The logic within each tick performs the convergence of local and cloud states.

1.  **State Convergence (`ConvergenceUtil.createStateConvergenceActions`)**:
    *   This is the "brains" of the operation. It compares three sources of information:
        1.  The in-memory map of local files (`_mapOfFileNodes`).
        2.  The set of "touched" files since the last tick (from the file watcher).
        3.  The in-memory map of cloud file states (provided by `FirebaseSyncer`).
    *   By comparing these states, it generates a list of `ConvergenceAction`s. These actions represent the concrete steps needed to make the local and cloud states consistent (e.g., upload local file, download cloud file, delete local file, delete cloud file).

2.  **Action Execution (`SyncerUpdateUtil.executeLimitedSyncConvergence`)**:
    *   To avoid overwhelming the system or hitting API rate limits, the syncer doesn't execute all convergence actions at once.
    *   It processes a limited batch of actions from the list generated in the previous step.
    *   For each action, it performs the necessary filesystem or Firebase operation (e.g., reading a file and uploading its content, or deleting a file from Firestore).
    *   After executing the actions, it returns the updated in-memory map of file nodes.

3.  **State Update**: The `FileSyncer`'s internal `_mapOfFileNodes` is updated with the new state returned from the execution step.

4.  The progress view is updated with the results of the cycle, including the number of actions performed and the time taken.

## Triggers for Synchronization

A change is induced and queued for the next sync cycle under several conditions:

*   **Local File Changes**: The file system watcher (`listenForFileChanges`) detects any of the following events and adds the corresponding file path to the `_touchedFilepaths` map:
    *   `file-created`
    *   `modified`
    *   `file-removed`
    *   `renamed` (both old and new paths are marked as touched)
*   **Cloud Data Changes**: The `FirebaseSyncer` maintains a real-time listener on the Firestore database. When a change is detected in the cloud (e.g., another client uploaded a new version of a file), it updates its internal representation of the cloud state. During the next `fileSyncerTick`, the `ConvergenceUtil` will see the discrepancy between the local state and the new cloud state and generate the appropriate action (e.g., download the new version).

## Teardown

The `teardown` method provides a clean shutdown mechanism. It:
*   Sets the `_isDead` flag to `true` to stop the tick loop.
*   Tears down the `FirebaseSyncer`, which disconnects its real-time listeners.
*   Unsubscribes from the local file system watcher.
*   Clears any pending `setTimeout` for the next tick.
*   Updates the progress view to indicate the syncer has been torn down.
