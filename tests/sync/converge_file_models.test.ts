import { describe, expect, jest, test } from "@jest/globals";
import type { Option } from "../../src/lib/option";
import { None, Some } from "../../src/lib/option";
import { ConvertArrayOfNodesToMap } from "../../src/sync/file_node_util";
import { ConvergeMapsToUpdateStates } from "../../src/sync/converge_file_models";
import { FileNode } from "../../src/sync/file_node";

jest.mock(
    "obsidian",
    () => {
        return {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            __esModule: true,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            TFile: {}
        };
    },
    { virtual: true }
);

describe("ConvergeMapsToUpdateStates", () => {
    test("Returns null updates for same node without id.", () => {
        const localNodes: FileNode[] = [
            new FileNode<Option<string>>({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: None,
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "null_update",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });

    test("Returns null updates for all nodes the same.", () => {
        const nodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID3"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(nodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(nodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "null_update",
                localState: Some(nodes[0]),
                cloudState: Some(nodes[0])
            },
            {
                action: "null_update",
                localState: Some(nodes[1]),
                cloudState: Some(nodes[1])
            },
            {
                action: "null_update",
                localState: Some(nodes[2]),
                cloudState: Some(nodes[2])
            }
        ]);
    });

    test("returns valid change for missing cloud node.", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "null_update",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[1])
            },
            {
                action: "using_cloud",
                localState: None,
                cloudState: Some(cloudNodes[0]),
                leftOverLocalFile: None
            }
        ]);
    });

    test("returns valid change for moving local node based on cloud node.", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_cloud",
                localState: Some(localNodes[1]),
                cloudState: Some(cloudNodes[0]),
                leftOverLocalFile: Some("file_1.md")
            },
            {
                action: "null_update",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[1])
            }
        ]);
    });

    test("deletes local node based on cloud node", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: true,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode[] = [
            new FileNode<Option<string>>({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: None,
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_cloud_to_remove_local",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0]),
                leftOverLocalFile: None
            }
        ]);
    });

    test("returns valid change for missing local node.", () => {
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "null_update",
                localState: Some(localNodes[1]),
                cloudState: Some(cloudNodes[0])
            },
            {
                action: "using_local",
                localState: Some(localNodes[0]),
                cloudState: None
            }
        ]);
    });

    test("moved cloud with id and missing cloud.", () => {
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1002,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_local",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            },
            {
                action: "using_local",
                localState: Some(localNodes[1]),
                cloudState: None
            }
        ]);
    });

    test("matching nodes but local has dif file id.", () => {
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1002,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_local_need_to_change_id",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });

    test("fails for overlapping file paths", () => {
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeFalsy();
        expect(result.val.toString()).toContain(
            `There is a conflict between synced files and local ones having multiple resolving to the path "folder/file_1/file_2.md". Recommend complete local removal of file ids.`
        );
    });

    test("fails for overlapping file paths from fileid", () => {
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1002,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1/file_2.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            }),
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID2"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeFalsy();
        expect(result.val.toString()).toContain(
            `There is a conflict between synced files and local ones having multiple resolving to the path "folder/file_1.md". Recommend complete local removal of file ids.`
        );
    });

    test("returns 'using_local_delete_cloud' for local deletion", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.md",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "md",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: true,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_local_delete_cloud",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });

    test("returns no change update for matched nodes", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.png",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "png",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode[] = [
            new FileNode({
                fullPath: "folder/file_1.png",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "png",
                fileId: None,
                userId: None,
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "null_update",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });

    test("returns use_local for case of file rename", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.png",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "png",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode[] = [
            new FileNode({
                fullPath: "folder/file_1.png",
                ctime: 2000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "png",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "null_update",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });

    test("all same but full path should use local", () => {
        const cloudNodes: FileNode<Some<string>>[] = [
            new FileNode({
                fullPath: "folder/file_1.png",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_1",
                extension: "png",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];
        const localNodes: FileNode[] = [
            new FileNode({
                fullPath: "folder/file_2.png",
                ctime: 1000,
                mtime: 1001,
                size: 1,
                baseName: "file_2",
                extension: "png",
                fileId: Some("ID1"),
                userId: Some("User1"),
                deleted: false,
                localDataType: None,

                fileStorageRef: None,
                vaultName: "",
                deviceId: None,
                data: None,
                syncerConfigId: "",
                isFromCloudCache: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap(),
            overrideUseLocal: new Set([localNodes[0]!])
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_local",
                localState: Some(localNodes[0]),
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });
});
