import { describe, expect, jest, test } from "@jest/globals";
import { None, Some } from "../lib/option";
import { ConvertArrayOfNodesToMap } from "./file_node_util";
import { ConvergeMapsToUpdateStates } from "./converge_file_models";
import type { CloudNode, FilePathType, LocalNode } from "./file_node";
import { CloudNodeRaw, LocalNodeObsidian, LocalNodeRaw } from "./file_node";

jest.mock(
    "obsidian",
    () => {
        return {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            __esModule: true,
            // eslint-disable-next-line @typescript-eslint/naming-convention
            TFile: {},
            // eslint-disable-next-line @typescript-eslint/no-extraneous-class, @typescript-eslint/naming-convention, @typescript-eslint/no-shadow
            FuzzySuggestModal: class test {}
        };
    },
    { virtual: true }
);
jest.mock(
    "window",
    () => {
        return {
            app: {
                vault: {
                    getName: () => "test_name"
                }
            }
        };
    },
    { virtual: true }
);
jest.unstable_mockModule("../../src/logging/logger", () => {
    return {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        CreateLogger: (_label: string) => {
            return {};
        }
    };
});
jest.mock("../logging/logger", () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    CreateLogger: () => {
        return {};
    }
}));

describe("ConvergeMapsToUpdateStates", () => {
    test("Returns null updates for same node without id.", () => {
        const localNodes: LocalNode[] = [
            new LocalNodeRaw(
                {
                    fullPath: "folder/file_1.md" as FilePathType,
                    cTime: 1000,
                    mTime: 1001,
                    size: 1,
                    baseName: "file_1",
                    extension: "md",
                    deleted: false,
                    fileHash: "hash"
                },
                {
                    deviceId: None,
                    syncerConfigId: "syncer_config",
                    firestoreTime: None,
                    vaultName: "vault",
                    fileId: None,
                    userId: None
                }
            )
        ];
        const cloudNodes: CloudNode[] = [
            new CloudNodeRaw(
                {
                    fullPath: "folder/file_1.md" as FilePathType,
                    cTime: 1000,
                    mTime: 1001,
                    size: 1,
                    baseName: "file_1",
                    extension: "md",
                    deleted: false,
                    fileHash: "hash"
                },
                {
                    deviceId: Some("device"),
                    syncerConfigId: "syncer_config",
                    firestoreTime: Some(1000),
                    vaultName: "vault",
                    fileId: Some("Fuid"),
                    userId: None
                },
                {
                    isFromCloudCache: true,
                    data: None,
                    versionString: "v1"
                }
            )
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
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

    test("returns null update for similar objs", () => {
        const localNodes: LocalNode[] = [
            new LocalNodeObsidian(
                {
                    fullPath: "2024-01-29.md" as FilePathType,
                    cTime: 1727567232197,
                    mTime: 1727154540112,
                    size: 269,
                    baseName: "2024-01-29",
                    extension: "md",
                    deleted: false,
                    fileHash: "fCTS3rLpHgRqSecsNDrY3x3xtFbTwEIc+S07Jnt+/FI="
                },
                {
                    deviceId: None,
                    syncerConfigId: "0193150d-1f21-7b81-bde8-aed0331b8407",
                    firestoreTime: None,
                    vaultName: "AccountsDev",
                    fileId: Some("0192226e-ce47-756d-b22e-0ec3b3fba662"),
                    userId: None
                }
            )
        ];
        const cloudNodes: CloudNode[] = [
            new CloudNodeRaw(
                {
                    fullPath: "2024-01-29.md" as FilePathType,
                    cTime: 1727567232197,
                    mTime: 1727154540112,
                    size: 269,
                    baseName: "2024-01-29",
                    extension: "md",
                    deleted: false,
                    fileHash: "fCTS3rLpHgRqSecsNDrY3x3xtFbTwEIc+S07Jnt+/FI="
                },
                {
                    deviceId: Some("chromebook"),
                    syncerConfigId: "0193150d-1f21-7b81-bde8-aed0331b8407",
                    firestoreTime: Some(1727154540112),
                    vaultName: "AccountsDev",
                    fileId: Some("0192226e-ce47-756d-b22e-0ec3b3fba662"),
                    userId: Some("GJC32RdD0VU7TMgl2hikR3bZZKF2")
                },
                {
                    isFromCloudCache: true,
                    data: None,
                    versionString: "v1"
                }
            )
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
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

    // test("Returns null updates for all nodes the same.", () => {
    //     const nodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID3"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(nodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(nodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "null_update",
    //             localState: Some(nodes[0]),
    //             cloudState: Some(nodes[0])
    //         },
    //         {
    //             action: "null_update",
    //             localState: Some(nodes[1]),
    //             cloudState: Some(nodes[1])
    //         },
    //         {
    //             action: "null_update",
    //             localState: Some(nodes[2]),
    //             cloudState: Some(nodes[2])
    //         }
    //     ]);
    // });

    // test("returns valid change for missing cloud node.", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "null_update",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[1])
    //         },
    //         {
    //             action: "using_cloud",
    //             localState: None,
    //             cloudState: Some(cloudNodes[0]),
    //             leftOverLocalFile: None
    //         }
    //     ]);
    // });

    // test("returns valid change for moving local node based on cloud node.", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "using_cloud",
    //             localState: Some(localNodes[1]),
    //             cloudState: Some(cloudNodes[0]),
    //             leftOverLocalFile: Some("file_1.md")
    //         },
    //         {
    //             action: "null_update",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[1])
    //         }
    //     ]);
    // });

    // test("deletes local node based on cloud node", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: true,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode[] = [
    //         new FileNode<Option<string>>({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: None,
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "using_cloud_to_remove_local",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0]),
    //             leftOverLocalFile: None
    //         }
    //     ]);
    // });

    // test("returns valid change for missing local node.", () => {
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "null_update",
    //             localState: Some(localNodes[1]),
    //             cloudState: Some(cloudNodes[0])
    //         },
    //         {
    //             action: "using_local",
    //             localState: Some(localNodes[0]),
    //             cloudState: None
    //         }
    //     ]);
    // });

    // test("moved cloud with id and missing cloud.", () => {
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1002,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "using_local",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0])
    //         },
    //         {
    //             action: "using_local",
    //             localState: Some(localNodes[1]),
    //             cloudState: None
    //         }
    //     ]);
    // });

    // test("matching nodes but local has dif file id.", () => {
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1002,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "using_local_need_to_change_id",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0])
    //         }
    //     ]);
    // });

    // test("fails for overlapping file paths", () => {
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeFalsy();
    //     expect(result.val.toString()).toContain(
    //         `There is a conflict between synced files and local ones having multiple resolving to the path "folder/file_1/file_2.md". Recommend complete local removal of file ids.`
    //     );
    // });

    // test("fails for overlapping file paths from fileid", () => {
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1002,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1/file_2.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         }),
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID2"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeFalsy();
    //     expect(result.val.toString()).toContain(
    //         `There is a conflict between synced files and local ones having multiple resolving to the path "folder/file_1.md". Recommend complete local removal of file ids.`
    //     );
    // });

    // test("returns 'using_local_delete_cloud' for local deletion", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.md",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "md",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: true,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "using_local_delete_cloud",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0])
    //         }
    //     ]);
    // });

    // test("returns no change update for matched nodes", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.png",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "png",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.png",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "png",
    //             fileId: None,
    //             userId: None,
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "null_update",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0])
    //         }
    //     ]);
    // });

    // test("returns use_local for case of file rename", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.png",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "png",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.png",
    //             ctime: 2000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "png",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set()
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "null_update",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0])
    //         }
    //     ]);
    // });

    // test("all same but full path should use local", () => {
    //     const cloudNodes: FileNode<Some<string>>[] = [
    //         new FileNode({
    //             fullPath: "folder/file_1.png",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_1",
    //             extension: "png",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];
    //     const localNodes: FileNode[] = [
    //         new FileNode({
    //             fullPath: "folder/file_2.png",
    //             ctime: 1000,
    //             mtime: 1001,
    //             size: 1,
    //             baseName: "file_2",
    //             extension: "png",
    //             fileId: Some("ID1"),
    //             userId: Some("User1"),
    //             deleted: false,
    //             localDataType: None,
    //             cloudDataType: None,

    //             fileStorageRef: None,
    //             vaultName: "",
    //             deviceId: None,
    //             data: None,
    //             syncerConfigId: "",
    //             isFromCloudCache: false,
    //             fileHash: None
    //         })
    //     ];

    //     const localMapRep = ConvertArrayOfNodesToMap(localNodes);
    //     expect(localMapRep.ok).toBeTruthy();
    //     const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
    //     expect(cloudMapRep.ok).toBeTruthy();
    //     const result = ConvergeMapsToUpdateStates({
    //         localMapRep: localMapRep.unsafeUnwrap(),
    //         cloudMapRep: cloudMapRep.unsafeUnwrap(),
    //         overrideUseLocal: new Set([localNodes[0]!])
    //     });
    //     expect(result.ok).toBeTruthy();
    //     expect(result.val).toStrictEqual([
    //         {
    //             action: "using_local",
    //             localState: Some(localNodes[0]),
    //             cloudState: Some(cloudNodes[0])
    //         }
    //     ]);
    // });
});
