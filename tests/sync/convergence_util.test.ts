import type { App } from "obsidian";
import { describe, expect, test, beforeEach, jest, afterEach } from "@jest/globals";
import { ConvergenceUtil } from "../../src/sync/convergence_util";
import type {
    AllExistingFileNodeTypes,
    FileData,
    FilePathType,
    LocalCloudFileNode,
    LocalFileNodeTypes,
    LocalOnlyFileNode,
    MissingFileNode,
    RemoteOnlyNode
} from "../../src/filesystem/file_node";
import { FileNodeType } from "../../src/filesystem/file_node";
import type { LatestSyncConfigVersion } from "../../src/schema/settings/syncer_config.schema";
import type { MapOfFileNodes } from "../../src/filesystem/file_map_util";
import type { MsFromEpoch } from "../../src/types";
import { Ok } from "../../src/lib/result";
import { FileAccess } from "../../src/filesystem/file_access";
import type { SchemaWithId } from "../../src/sync/firebase_cache";
import type { LatestNotesSchema } from "../../src/schema/notes/notes.schema";

// Mocking FileAccess
jest.mock("../../src/filesystem/file_access");

const mockedFileAccess = jest.mocked(FileAccess);

const createMockApp = (): App => ({}) as App;

const createMockConfig = (): LatestSyncConfigVersion =>
    ({
        syncerId: "test-syncer"
    }) as LatestSyncConfigVersion;

const createFileData = (
    fullPath: FilePathType,
    mtime: MsFromEpoch,
    fileHash: string
): FileData => ({
    fullPath,
    cTime: mtime,
    mTime: mtime,
    size: 100,
    baseName: fullPath.split("/").pop()?.split(".")[0] ?? "",
    extension: fullPath.split(".").pop() ?? "",
    deleted: false,
    fileHash
});

const createLocalOnlyFileNode = (
    fullPath: FilePathType,
    mtime: MsFromEpoch,
    fileHash: string
): LocalOnlyFileNode => ({
    type: FileNodeType.LOCAL_ONLY_FILE,
    fileData: createFileData(fullPath, mtime, fileHash),
    localTime: mtime
});

const createLocalCloudFileNode = (
    fullPath: FilePathType,
    mtime: MsFromEpoch,
    fileHash: string,
    remoteEntryTime: MsFromEpoch,
    remoteFileHash: string,
    deleted = false
): LocalCloudFileNode => ({
    type: FileNodeType.LOCAL_CLOUD_FILE,
    fileData: createFileData(fullPath, mtime, fileHash),
    localTime: mtime,
    firebaseData: {
        id: `id-${fullPath}`,
        data: {
            entryTime: remoteEntryTime,
            fileHash: remoteFileHash,
            deleted,
            path: fullPath,
            cTime: remoteEntryTime,
            mTime: remoteEntryTime,
            size: 100,
            baseName: fullPath.split("/").pop()?.split(".")[0] ?? "",
            ext: fullPath.split(".").pop() ?? "",
            userId: "test-user",
            vaultName: "test-vault",
            deviceId: "test-device",
            syncerConfigId: "test-syncer",
            type: "Ref",
            data: null,
            fileStorageRef: "ref",
            version: 0
        }
    }
});

const createRemoteOnlyNode = (
    fullPath: FilePathType,
    remoteEntryTime: MsFromEpoch,
    remoteFileHash: string,
    deleted = false
): RemoteOnlyNode => ({
    type: FileNodeType.REMOTE_ONLY,
    fileData: { fullPath },
    localTime: remoteEntryTime,
    firebaseData: {
        id: `id-${fullPath}`,
        data: {
            entryTime: remoteEntryTime,
            fileHash: remoteFileHash,
            deleted,
            path: fullPath,
            cTime: remoteEntryTime,
            mTime: remoteEntryTime,
            size: 100,
            baseName: fullPath.split("/").pop()?.split(".")[0] ?? "",
            ext: fullPath.split(".").pop() ?? "",
            userId: "test-user",
            vaultName: "test-vault",
            deviceId: "test-device",
            syncerConfigId: "test-syncer",
            type: "Ref",
            data: null,
            fileStorageRef: "ref",
            version: 0
        }
    }
});

describe("ConvergenceUtil.updateWithNewNodes", () => {
    let app: App;
    let config: LatestSyncConfigVersion;

    beforeEach(() => {
        app = createMockApp();
        config = createMockConfig();
        mockedFileAccess.getTouchedFileNodes.mockClear();
    });

    test("should add a new local file", async () => {
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map();
        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["new_file.md" as FilePathType, 1000 as MsFromEpoch]
        ]);
        const newFileNode = createLocalOnlyFileNode(
            "new_file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );

        mockedFileAccess.getTouchedFileNodes.mockResolvedValue(
            Ok(new Map([[newFileNode.fileData.fullPath, newFileNode]]))
        );

        const result = await ConvergenceUtil.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );

        expect(result.ok).toBe(true);
        const newMap = result.unsafeUnwrap();
        expect(newMap.size).toBe(1);
        expect(newMap.get("new_file.md" as FilePathType)).toEqual(newFileNode);
    });

    test("should update a modified local file", async () => {
        const originalNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["file.md" as FilePathType, 2000 as MsFromEpoch]
        ]);
        const updatedFileNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            2000 as MsFromEpoch,
            "hash2"
        );

        mockedFileAccess.getTouchedFileNodes.mockResolvedValue(
            Ok(new Map([[updatedFileNode.fileData.fullPath, updatedFileNode]]))
        );

        const result = await ConvergenceUtil.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );

        expect(result.ok).toBe(true);
        const newMap = result.unsafeUnwrap();
        expect(newMap.size).toBe(1);
        expect(newMap.get("file.md" as FilePathType)).toEqual(updatedFileNode);
    });

    test("should update a modified cloud-synced file", async () => {
        const originalNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            500 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["file.md" as FilePathType, 2000 as MsFromEpoch]
        ]);
        const updatedFileNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            2000 as MsFromEpoch,
            "hash2"
        );

        mockedFileAccess.getTouchedFileNodes.mockResolvedValue(
            Ok(new Map([[updatedFileNode.fileData.fullPath, updatedFileNode]]))
        );

        const result = await ConvergenceUtil.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );

        expect(result.ok).toBe(true);
        const newMap = result.unsafeUnwrap();
        expect(newMap.size).toBe(1);
        const finalNode = newMap.get("file.md" as FilePathType) as LocalCloudFileNode;
        expect(finalNode.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(finalNode.localTime).toBe(2000 as MsFromEpoch);
        expect(finalNode.fileData.fileHash).toBe("hash2");
        expect(finalNode.firebaseData).toEqual(originalNode.firebaseData);
    });

    test("should handle a file created locally that was remote-only", async () => {
        const originalNode = createRemoteOnlyNode(
            "file.md" as FilePathType,
            500 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["file.md" as FilePathType, 2000 as MsFromEpoch]
        ]);
        const newFileNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            2000 as MsFromEpoch,
            "hash2"
        );

        mockedFileAccess.getTouchedFileNodes.mockResolvedValue(
            Ok(new Map([[newFileNode.fileData.fullPath, newFileNode]]))
        );

        const result = await ConvergenceUtil.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );

        expect(result.ok).toBe(true);
        const newMap = result.unsafeUnwrap();
        expect(newMap.size).toBe(1);
        const finalNode = newMap.get("file.md" as FilePathType) as LocalCloudFileNode;
        expect(finalNode.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(finalNode.localTime).toBe(2000 as MsFromEpoch);
        expect(finalNode.fileData.fileHash).toBe("hash2");
        expect(finalNode.firebaseData).toEqual(originalNode.firebaseData);
    });

    test("should handle a deleted local-only file", async () => {
        const originalNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["file.md" as FilePathType, 2000 as MsFromEpoch]
        ]);
        const deletedFileNode: MissingFileNode = {
            type: FileNodeType.LOCAL_MISSING,
            fileData: { fullPath: "file.md" as FilePathType },
            localTime: 2000 as MsFromEpoch
        };

        mockedFileAccess.getTouchedFileNodes.mockResolvedValue(
            Ok(
                new Map([
                    [deletedFileNode.fileData.fullPath, deletedFileNode as LocalFileNodeTypes]
                ])
            )
        );

        const result = await ConvergenceUtil.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );

        expect(result.ok).toBe(true);
        const newMap = result.unsafeUnwrap();
        expect(newMap.size).toBe(0);
    });

    test("should handle a deleted cloud-synced file", async () => {
        const originalNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            500 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const touchedFiles = new Map<FilePathType, MsFromEpoch>([
            ["file.md" as FilePathType, 2000 as MsFromEpoch]
        ]);
        const deletedFileNode: MissingFileNode = {
            type: FileNodeType.LOCAL_MISSING,
            fileData: { fullPath: "file.md" as FilePathType },
            localTime: 2000 as MsFromEpoch
        };

        mockedFileAccess.getTouchedFileNodes.mockResolvedValue(
            Ok(
                new Map([
                    [deletedFileNode.fileData.fullPath, deletedFileNode as LocalFileNodeTypes]
                ])
            )
        );

        const result = await ConvergenceUtil.updateWithNewNodes(
            app,
            config,
            mapOfFileNodes,
            touchedFiles
        );

        expect(result.ok).toBe(true);
        const newMap = result.unsafeUnwrap();
        expect(newMap.size).toBe(1);
        const finalNode = newMap.get("file.md" as FilePathType) as RemoteOnlyNode;
        expect(finalNode.type).toBe(FileNodeType.REMOTE_ONLY);
        expect(finalNode.localTime).toBe(2000 as MsFromEpoch);
        expect(finalNode.firebaseData).toEqual(originalNode.firebaseData);
    });
});

describe("ConvergenceUtil.updateWithCloudData", () => {
    const createCloudData = (
        fullPath: FilePathType,
        entryTime: MsFromEpoch,
        fileHash: string,
        deleted = false
    ): SchemaWithId<LatestNotesSchema> => ({
        id: `id-${fullPath}`,
        data: {
            entryTime,
            fileHash,
            deleted,
            path: fullPath,
            cTime: entryTime,
            mTime: entryTime,
            size: 100,
            baseName: fullPath.split("/").pop()?.split(".")[0] ?? "",
            ext: fullPath.split(".").pop() ?? "",
            userId: "test-user",
            vaultName: "test-vault",
            deviceId: "test-device",
            syncerConfigId: "test-syncer",
            type: "Ref",
            fileStorageRef: "ref",
            data: null,
            version: 0
        }
    });

    test("should add a new remote-only file from cloud data", () => {
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map();
        const cloudData = createCloudData(
            "new_cloud_file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfCloudData = new Map([["new_cloud_file.md" as FilePathType, cloudData]]);

        const newMap = ConvergenceUtil.updateWithCloudData(mapOfFileNodes, mapOfCloudData);

        expect(newMap.size).toBe(1);
        const newNode = newMap.get("new_cloud_file.md" as FilePathType) as RemoteOnlyNode;
        expect(newNode.type).toBe(FileNodeType.REMOTE_ONLY);
        expect(newNode.firebaseData).toEqual(cloudData);
    });

    test("should merge cloud data with a local-only file", () => {
        const localNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [localNode.fileData.fullPath, localNode]
        ]);
        const cloudData = createCloudData("file.md" as FilePathType, 500 as MsFromEpoch, "hash1");
        const mapOfCloudData = new Map([["file.md" as FilePathType, cloudData]]);

        const newMap = ConvergenceUtil.updateWithCloudData(mapOfFileNodes, mapOfCloudData);

        expect(newMap.size).toBe(1);
        const mergedNode = newMap.get("file.md" as FilePathType) as LocalCloudFileNode;
        expect(mergedNode.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(mergedNode.fileData).toEqual(localNode.fileData);
        expect(mergedNode.localTime).toEqual(localNode.localTime);
        expect(mergedNode.firebaseData).toEqual(cloudData);
    });

    test("should update cloud data for a local-cloud file", () => {
        const originalNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            500 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const cloudData = createCloudData(
            "file.md" as FilePathType,
            1500 as MsFromEpoch,
            "hash2",
            true
        );
        const mapOfCloudData = new Map([["file.md" as FilePathType, cloudData]]);

        const newMap = ConvergenceUtil.updateWithCloudData(mapOfFileNodes, mapOfCloudData);

        expect(newMap.size).toBe(1);
        const updatedNode = newMap.get("file.md" as FilePathType) as LocalCloudFileNode;
        expect(updatedNode.type).toBe(FileNodeType.LOCAL_CLOUD_FILE);
        expect(updatedNode.firebaseData.data.entryTime).toBe(1500 as MsFromEpoch);
        expect(updatedNode.firebaseData.data.fileHash).toBe("hash2");
        expect(updatedNode.firebaseData.data.deleted).toBe(true);
    });

    test("should update cloud data for a remote-only file", () => {
        const originalNode = createRemoteOnlyNode(
            "file.md" as FilePathType,
            500 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [originalNode.fileData.fullPath, originalNode]
        ]);
        const cloudData = createCloudData("file.md" as FilePathType, 1500 as MsFromEpoch, "hash2");
        const mapOfCloudData = new Map([["file.md" as FilePathType, cloudData]]);

        const newMap = ConvergenceUtil.updateWithCloudData(mapOfFileNodes, mapOfCloudData);

        expect(newMap.size).toBe(1);
        const updatedNode = newMap.get("file.md" as FilePathType) as RemoteOnlyNode;
        expect(updatedNode.type).toBe(FileNodeType.REMOTE_ONLY);
        expect(updatedNode.firebaseData.data.entryTime).toBe(1500 as MsFromEpoch);
        expect(updatedNode.firebaseData.data.fileHash).toBe("hash2");
    });

    test("should preserve untouched files", () => {
        const untouchedNode = createLocalOnlyFileNode(
            "untouched.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash_untouched"
        );
        const mapOfFileNodes: MapOfFileNodes<AllExistingFileNodeTypes> = new Map([
            [untouchedNode.fileData.fullPath, untouchedNode]
        ]);
        const cloudData = createCloudData(
            "new_cloud_file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfCloudData = new Map([["new_cloud_file.md" as FilePathType, cloudData]]);

        const newMap = ConvergenceUtil.updateWithCloudData(mapOfFileNodes, mapOfCloudData);

        expect(newMap.size).toBe(2);
        expect(newMap.has("untouched.md" as FilePathType)).toBe(true);
        expect(newMap.get("untouched.md" as FilePathType)).toEqual(untouchedNode);
    });
});

describe("ConvergenceUtil.createStateConvergenceActions", () => {
    let app: App;
    let config: LatestSyncConfigVersion;

    beforeEach(() => {
        app = createMockApp();
        config = createMockConfig();
        // eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/require-await
        jest.spyOn(ConvergenceUtil, "updateWithNewNodes").mockImplementation(async (_, __, map) =>
            Ok(map)
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test("should create NEW_LOCAL_FILE action for a new local file", async () => {
        const localNode = createLocalOnlyFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes = new Map([[localNode.fileData.fullPath, localNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(1);
        expect(actions[0]).toBeDefined();
        if (!actions[0]) return;
        expect(actions[0].action).toBe("NEW_LOCAL_FILE");
    });

    test("should create UPDATE_CLOUD action for a modified local file", async () => {
        const localNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            2000 as MsFromEpoch,
            "hash2",
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes = new Map([[localNode.fileData.fullPath, localNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(1);
        expect(actions[0]).toBeDefined();
        if (!actions[0]) return;
        expect(actions[0].action).toBe("UPDATE_CLOUD");
    });

    test("should create DELETE_LOCAL action for a remotely deleted file", async () => {
        const localNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            2000 as MsFromEpoch,
            "hash1",
            true
        );
        const mapOfFileNodes = new Map([[localNode.fileData.fullPath, localNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(1);
        expect(actions[0]).toBeDefined();
        if (!actions[0]) return;
        expect(actions[0].action).toBe("DELETE_LOCAL_FILE");
    });

    test("should create UPDATE_LOCAL action for a remotely updated file", async () => {
        const localNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            2000 as MsFromEpoch,
            "hash2"
        );
        const mapOfFileNodes = new Map([[localNode.fileData.fullPath, localNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(1);
        expect(actions[0]).toBeDefined();
        if (!actions[0]) return;
        expect(actions[0].action).toBe("UPDATE_LOCAL");
    });

    test("should create MARK_CLOUD_DELETED action for a locally deleted file", async () => {
        const remoteNode = createRemoteOnlyNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        // localTime > entryTime indicates a local deletion
        remoteNode.localTime = 2000 as MsFromEpoch;
        const mapOfFileNodes = new Map([[remoteNode.fileData.fullPath, remoteNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(1);
        expect(actions[0]).toBeDefined();
        if (!actions[0]) return;
        expect(actions[0].action).toBe("MARK_CLOUD_DELETED");
    });

    test("should create UPDATE_LOCAL action for a new remote file", async () => {
        const remoteNode = createRemoteOnlyNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes = new Map([[remoteNode.fileData.fullPath, remoteNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(1);
        expect(actions[0]).toBeDefined();
        if (!actions[0]) return;
        expect(actions[0].action).toBe("UPDATE_LOCAL");
    });

    test("should produce no actions when files are in sync", async () => {
        const localNode = createLocalCloudFileNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            1000 as MsFromEpoch,
            "hash1"
        );
        const mapOfFileNodes = new Map([[localNode.fileData.fullPath, localNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(0);
    });

    test("should produce no action for a remotely deleted file that is already deleted locally", async () => {
        const remoteNode = createRemoteOnlyNode(
            "file.md" as FilePathType,
            1000 as MsFromEpoch,
            "hash1",
            true
        );
        const mapOfFileNodes = new Map([[remoteNode.fileData.fullPath, remoteNode]]);
        const result = await ConvergenceUtil.createStateConvergenceActions(
            app,
            config,
            mapOfFileNodes,
            new Map(),
            new Map()
        );
        expect(result.ok).toBe(true);
        const { actions } = result.unsafeUnwrap();
        expect(actions.length).toBe(0);
    });
});
