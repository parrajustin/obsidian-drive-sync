// import { describe, expect, jest, test } from "@jest/globals";
// import { None, Some } from "../lib/option";
// import { ConvertArrayOfNodesToMap } from "./file_node_util";
// import type { CloudNode, FilePathType } from "./file_node";
// import { CloudNodeFileRef, CloudNodeRaw } from "./file_node";
// import { ConvertCloudNodesToCache, GetCloudNodesFromCache } from "./firebase_cache";

// jest.mock(
//     "obsidian",
//     () => {
//         return {
//             // eslint-disable-next-line @typescript-eslint/naming-convention
//             __esModule: true,
//             // eslint-disable-next-line @typescript-eslint/naming-convention
//             TFile: {},
//             // eslint-disable-next-line @typescript-eslint/no-extraneous-class, @typescript-eslint/naming-convention, @typescript-eslint/no-shadow
//             FuzzySuggestModal: class test {}
//         };
//     },
//     { virtual: true }
// );
// jest.mock(
//     "window",
//     () => {
//         return {
//             app: {
//                 vault: {
//                     getName: () => "test_name"
//                 }
//             }
//         };
//     },
//     { virtual: true }
// );
// jest.mock(
//     "SYNCBUNDLEVERSION",
//     () => {
//         return "mock-version";
//     },
//     { virtual: true }
// );
// jest.mock("../logging/logger", () => ({
//     // eslint-disable-next-line @typescript-eslint/naming-convention
//     CreateLogger: () => {
//         return {};
//     }
// }));

// describe("Firebase Cache", () => {
//     test("test cache creation and retrieval", async () => {
//         const cloudNodes: CloudNode[] = [
//             new CloudNodeRaw(
//                 {
//                     fullPath: "folder/file_1.md" as FilePathType,
//                     cTime: 1000,
//                     mTime: 1001,
//                     size: 1,
//                     baseName: "file_1",
//                     extension: "md",
//                     deleted: false,
//                     fileHash: "hash"
//                 },
//                 {
//                     deviceId: Some("device"),
//                     syncerConfigId: "syncer_config",
//                     firestoreTime: Some(1000),
//                     vaultName: "vault",
//                     fileId: Some("id_1"),
//                     userId: Some("uid_1")
//                 },
//                 {
//                     isFromCloudCache: true,
//                     data: None,
//                     versionString: "v1"
//                 }
//             ),
//             new CloudNodeRaw(
//                 {
//                     fullPath: "file_2.md" as FilePathType,
//                     cTime: 1000,
//                     mTime: 1001,
//                     size: 4,
//                     baseName: "file_2",
//                     extension: "md",
//                     deleted: false,
//                     fileHash: "hash-2"
//                 },
//                 {
//                     deviceId: Some("device"),
//                     syncerConfigId: "syncer_config",
//                     firestoreTime: Some(1000),
//                     vaultName: "vault",
//                     fileId: Some("id_2"),
//                     userId: Some("uid_1")
//                 },
//                 {
//                     isFromCloudCache: false,
//                     data: Some(new Uint8Array([1, 2, 3, 4])),
//                     versionString: "v1"
//                 }
//             ),
//             new CloudNodeFileRef(
//                 {
//                     fullPath: "file_3.md" as FilePathType,
//                     cTime: 1000,
//                     mTime: 1001,
//                     size: 4,
//                     baseName: "file_3",
//                     extension: "md",
//                     deleted: false,
//                     fileHash: "hash-3"
//                 },
//                 {
//                     deviceId: Some("device"),
//                     syncerConfigId: "syncer_config",
//                     firestoreTime: Some(1000),
//                     vaultName: "vault",
//                     fileId: Some("id_3"),
//                     userId: Some("uid_1")
//                 },
//                 {
//                     isFromCloudCache: false,
//                     fileStorageRef: "Storage_Ref",
//                     versionString: "v1"
//                 }
//             )
//         ];

//         const mapResult = ConvertArrayOfNodesToMap(cloudNodes);
//         expect(mapResult.ok).toBeTruthy();
//         if (mapResult.err) {
//             return;
//         }

//         const convertToCache = await ConvertCloudNodesToCache(mapResult.val);
//         expect(convertToCache.ok).toBeTruthy();
//         if (convertToCache.err) {
//             return;
//         }
//         expect(convertToCache.val).toStrictEqual({
//             lastUpdate: 1000,
//             cache: "H4sIAAAAAAAAA82Qu07EMBBF/+XWA+RB5ZYGGopdOoQiE493LTnOynYCAe2/IzvhIWjISkhUM3fec+5fcZBxDwHdW8X+QhvLTXneKRDaO9MxRFkUBaH7ECUhmJfkEx5l4FuZEpg7QeDnCIE8YQjsbxQEBqNyTrHlyApCSxuYMMrBxmVA9nPNaFrObbMLQphcy/6qd9rscmYONG2OgPL2axnSJ/tkCOyin75+MLIPpndpU7l05FHLaUlvY+/ljjesIdxgLSFOh3TbRj7hSJ+w0q/V7yhd/qRU/RNKZ9VKTtUpnOqTOdUrOX0/DYtokvpDjPVKjKn+HRhrHB/eAK4vsxeHAwAA",
//             length: 3,
//             versionOfData: "v1"
//         });

//         const getFromCache = await GetCloudNodesFromCache(convertToCache.safeUnwrap());
//         expect(getFromCache.ok).toBeTruthy();
//         if (getFromCache.err) {
//             return;
//         }
//         expect(getFromCache.val).toStrictEqual([
//             new CloudNodeRaw(
//                 {
//                     fullPath: "folder/file_1.md" as FilePathType,
//                     cTime: 1000,
//                     mTime: 1001,
//                     size: 1,
//                     baseName: "file_1",
//                     extension: "md",
//                     deleted: false,
//                     fileHash: "hash"
//                 },
//                 {
//                     deviceId: Some("device"),
//                     syncerConfigId: "syncer_config",
//                     firestoreTime: Some(1000),
//                     vaultName: "vault",
//                     fileId: Some("id_1"),
//                     userId: Some("uid_1")
//                 },
//                 {
//                     isFromCloudCache: true,
//                     data: None,
//                     versionString: "v1"
//                 }
//             ),
//             new CloudNodeRaw(
//                 {
//                     fullPath: "file_2.md" as FilePathType,
//                     cTime: 1000,
//                     mTime: 1001,
//                     size: 4,
//                     baseName: "file_2",
//                     extension: "md",
//                     deleted: false,
//                     fileHash: "hash-2"
//                 },
//                 {
//                     deviceId: Some("device"),
//                     syncerConfigId: "syncer_config",
//                     firestoreTime: Some(1000),
//                     vaultName: "vault",
//                     fileId: Some("id_2"),
//                     userId: Some("uid_1")
//                 },
//                 {
//                     isFromCloudCache: true,
//                     data: None,
//                     versionString: "v1"
//                 }
//             ),
//             new CloudNodeFileRef(
//                 {
//                     fullPath: "file_3.md" as FilePathType,
//                     cTime: 1000,
//                     mTime: 1001,
//                     size: 4,
//                     baseName: "file_3",
//                     extension: "md",
//                     deleted: false,
//                     fileHash: "hash-3"
//                 },
//                 {
//                     deviceId: Some("device"),
//                     syncerConfigId: "syncer_config",
//                     firestoreTime: Some(1000),
//                     vaultName: "vault",
//                     fileId: Some("id_3"),
//                     userId: Some("uid_1")
//                 },
//                 {
//                     isFromCloudCache: false,
//                     fileStorageRef: "Storage_Ref",
//                     versionString: "v1"
//                 }
//             )
//         ]);
//     }, 10000);
// });
