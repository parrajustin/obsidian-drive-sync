# Convergence Action Utility

This document outlines the logic of the `createStateConvergenceActions` utility function, which is responsible for synchronizing local and cloud file states.

## Overview

The `createStateConvergenceActions` function is the core of the sync process. It determines the necessary actions to align the local file system with the cloud storage. It takes the current local state, recent local changes, and the current cloud state as input. It then produces a series of "convergence actions" to be executed.

The fundamental principle is **last write wins**. When changes conflict, the file with the more recent modification timestamp is preserved.

## Convergence Action Types

There are five types of actions that the utility can generate:

| Action | Description |
| :--- | :--- |
| `NEW_LOCAL_FILE` | A new file was created locally and needs to be uploaded to the cloud. |
| `UPDATE_CLOUD` | A local file was updated and its new content needs to be uploaded to the cloud. |
| `UPDATE_LOCAL` | A file in the cloud is newer or missing locally, so the local file must be downloaded/updated. |
| `DELETE_LOCAL` | A file was marked as deleted in the cloud, so the local copy must be deleted. |
| `MARK_CLOUD_DELETED` | A local file was deleted, so the cloud copy must be marked as deleted. |

## State Convergence Scenarios

The following table describes how the utility resolves different states between the local and cloud versions of a file.

| Scenario | Local State | Cloud State | Resolution Logic | Action |
| :--- | :--- | :--- | :--- | :--- |
| **New Local File** | Exists | Does not exist | The file is new and untracked. | `NEW_LOCAL_FILE` |
| **Updated Local File** | Exists (newer) | Exists (older) | Local timestamp is more recent. | `UPDATE_CLOUD` |
| **New Remote File** | Does not exist | Exists (not deleted) | A new file was synced from another device. | `UPDATE_LOCAL` |
| **Updated Remote File** | Exists (older) | Exists (newer) | Cloud timestamp is more recent. | `UPDATE_LOCAL` |
| **Deleted Local File** | Does not exist | Exists (not deleted) | The file was recently deleted locally. The deletion time is recorded and is more recent than the cloud's modification time. | `MARK_CLOUD_DELETED` |
| **Deleted Remote File** | Exists | Exists (marked as deleted) | Cloud file is marked as deleted and is considered "newer" than the local version. | `DELETE_LOCAL` |
| **Synced Deletion** | Does not exist | Exists (marked as deleted) | The file is deleted in both places. No action is needed. | None |
| **No Change** | Exists | Exists | Timestamps and content hashes match. No action is needed. | None |
