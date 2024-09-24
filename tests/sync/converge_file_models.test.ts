import { describe, expect, jest, test } from "@jest/globals";
import { None, Some } from "../../src/lib/option";
import { ConvertArrayOfNodesToMap, FileNode } from "../../src/sync/file_node";
import { ConvergeMapsToUpdateStates } from "../../src/sync/converge_file_models";

// interface FileNodeParams<TypeOfData extends Option<string> = Option<string>> {
//     fullPath: string;
//     ctime: number;
//     mtime: number;
//     size: number;
//     baseName: string;
//     extension: string;
//     fileId: TypeOfData;
//     userId: TypeOfData;
//     deleted: boolean;
// }

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
    test("Returns empty for all nodes the same.", async () => {
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
                deleted: false
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(nodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(nodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([]);
    });

    test("returns valid change for missing cloud node.", async () => {
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
                deleted: false
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_cloud",
                localState: None,
                cloudState: Some(cloudNodes[0])
            }
        ]);
    });

    test("returns valid change for missing local node.", async () => {
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
                deleted: false
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
        });
        expect(result.ok).toBeTruthy();
        expect(result.val).toStrictEqual([
            {
                action: "using_local",
                localState: Some(localNodes[0]),
                cloudState: None
            }
        ]);
    });

    test("moved cloud with id and missing cloud.", async () => {
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
                deleted: false
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
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

    test("matching nodes but local has dif file id.", async () => {
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
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

    test("fails for overlapping file paths", async () => {
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
                deleted: false
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
        });
        expect(result.ok).toBeFalsy();
        expect(result.val.toString()).toContain(
            `There is a conflict between synced files and local ones having multiple resolving to the path "folder/file_1/file_2.md". Recommend complete local removal of file ids.`
        );
    });

    test("fails for overlapping file paths from fileid", async () => {
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
                deleted: false
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
                deleted: false
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
                deleted: false
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
                deleted: false
            })
        ];

        const localMapRep = ConvertArrayOfNodesToMap(localNodes);
        expect(localMapRep.ok).toBeTruthy();
        const cloudMapRep = ConvertArrayOfNodesToMap(cloudNodes);
        expect(cloudMapRep.ok).toBeTruthy();
        const result = await ConvergeMapsToUpdateStates({
            localMapRep: localMapRep.unsafeUnwrap(),
            cloudMapRep: cloudMapRep.unsafeUnwrap()
        });
        expect(result.ok).toBeFalsy();
        expect(result.val.toString()).toContain(
            `There is a conflict between synced files and local ones having multiple resolving to the path "folder/file_1.md". Recommend complete local removal of file ids.`
        );
    });
});
