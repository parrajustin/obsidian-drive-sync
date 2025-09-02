import { App, normalizePath, TFile } from "obsidian";
import { Result, StatusResult, Ok, Err } from "../lib/result";
import { InvalidArgumentError, NotFoundError, StatusError } from "../lib/status_error";
import { WrapPromise } from "../lib/wrap_promise";
import { PromiseResultSpanError } from "../logging/tracing/result_span.decorator";
import { Span } from "../logging/tracing/span.decorator";
import type { LatestSyncConfigVersion } from "../schema/settings/syncer_config.schema";
import { IsAcceptablePath, IsObsidianFile, IsLocalFileRaw } from "../sync/query_util";
import { AsyncForEach, CombineResults } from "../util";
import { Bytes } from "firebase/firestore";
import { None, Optional, Some, WrapOptional } from "../lib/option";
import GetSha256Hash from "../lib/sha";
import { FileUtilObsidian } from "./file_util_obsidian_api";
import { FileUtilRaw } from "./file_util_raw_api";
import {
    LocalFileNodeTypes,
    FileNodeType,
    InvalidFileNode,
    LocalOnlyFileNode,
    MissingFileNode
} from "./file_node";
import type { AllExistingFileNodeTypes, FilePathType, LocalCloudFileNode } from "./file_node";
import { MapOfFileNodes } from "./file_map_util";
import { MsFromEpoch } from "../types";
import { InjectMeta } from "../lib/inject_status_msg";
import { FileConst } from "../constants";

/**
 * Defines the concrete node type based on the generic boolean flags.
 * - If CanHaveMissing is true, includes MissingNode.
 * - If CanHaveInvalid is true, includes IgnoredNode.
 */
type GetNodeTypes<CanHaveMissing extends boolean, CanHaveInvalid extends boolean> =
    | LocalOnlyFileNode
    | (CanHaveMissing extends true ? MissingFileNode : never)
    | (CanHaveInvalid extends true ? InvalidFileNode : never);

export class FileAccess {
    /** Gets the obsidian file node. */
    @Span()
    @PromiseResultSpanError
    public static async getObsidianNode(
        app: App,
        fileName: FilePathType
    ): Promise<Result<Optional<LocalOnlyFileNode>, StatusError>> {
        const file = app.vault.fileMap[fileName]!;
        if (!(file instanceof TFile)) {
            return Ok(None);
        }
        // TODO: look into using file id again.
        // const fileIdResult = await GetFileUidFromFrontmatter(app, config, file);
        // if (fileIdResult.err) {
        //     return fileIdResult;
        // }

        const fileContents = await FileUtilObsidian.readObsidianFile(app, fileName);
        const fileHash = fileContents.map((f) =>
            Bytes.fromUint8Array(GetSha256Hash(new Uint8Array(f))).toBase64()
        );
        if (fileHash.err) {
            return fileHash;
        }
        const node: LocalOnlyFileNode = {
            type: FileNodeType.LOCAL_ONLY_FILE,
            fileData: {
                fullPath: fileName,
                cTime: file.stat.ctime,
                mTime: file.stat.mtime,
                size: file.stat.size,
                baseName: file.basename,
                extension: file.extension,
                deleted: false,
                fileHash: fileHash.safeUnwrap()
            },
            localTime: file.stat.mtime
        };
        return Ok(Some(node));
    }

    /** Gets the raw file ndoe. */
    @Span()
    @PromiseResultSpanError
    public static async getRawNode(
        app: App,
        fileName: FilePathType
    ): Promise<Result<Optional<LocalOnlyFileNode>, StatusError>> {
        const fileStat = await WrapPromise(
            app.vault.adapter.stat(fileName),
            /*textForUnknown=*/ `Failed to stat ${fileName}`
        );
        if (fileStat.err) {
            return fileStat;
        }
        const stat = fileStat.safeUnwrap();
        if (stat === null) {
            return Ok(None);
        }
        if (stat.type === "folder") {
            return Ok(None);
        }

        const path = fileName.split("/");
        const file = path.pop()!;
        const [baseName, extension] = file.split(".") as [string, string | undefined];

        const fileContents = await FileUtilRaw.readRawFile(app, fileName);
        const fileHash = fileContents.map((f) =>
            Bytes.fromUint8Array(GetSha256Hash(new Uint8Array(f))).toBase64()
        );
        if (fileHash.err) {
            return fileHash;
        }
        const node: LocalOnlyFileNode = {
            type: FileNodeType.LOCAL_ONLY_FILE,
            fileData: {
                fullPath: fileName,
                cTime: stat.ctime,
                mTime: stat.mtime,
                size: stat.size,
                baseName: baseName,
                extension: extension ?? "",
                deleted: false,
                fileHash: fileHash.safeUnwrap()
            },
            localTime: stat.mtime
        };
        return Ok(Some(node));
    }

    /**
     * Gets the file node, if file is not acceptable or neither local/obsidian will return error.
     * @param fullPath the full path to the file to get
     * @param config syncer config for the fetching
     * @param ignoreMissingFile if true, missing files will not fail.
     * @param ignoreInvalidPath if true won't return error just invalid path file.
     * @returns FileNode if found.
     */
    @Span()
    @PromiseResultSpanError
    public static async getFileNode<
        CanHaveMissing extends boolean = false,
        CanHaveInvalid extends boolean = false
    >(
        app: App,
        fullPath: FilePathType,
        config: LatestSyncConfigVersion,
        ignoreMissingFile: CanHaveMissing = false as CanHaveMissing,
        ignoreInvalidPath: CanHaveInvalid = false as CanHaveInvalid
    ): Promise<Result<GetNodeTypes<CanHaveMissing, CanHaveInvalid>, StatusError>> {
        if (!IsAcceptablePath(fullPath, config)) {
            if (ignoreInvalidPath) {
                const invalid: InvalidFileNode = {
                    type: FileNodeType.INVALID,
                    fileData: { fullPath }
                };
                return Ok(invalid as GetNodeTypes<CanHaveMissing, CanHaveInvalid>);
            }
            return Err(NotFoundError(`File node path: "${fullPath}" not found.`));
        }
        if (IsObsidianFile(fullPath, config)) {
            const fileResult = await this.getObsidianNode(app, fullPath);
            if (fileResult.err) {
                return fileResult;
            }
            const optFile = fileResult.safeUnwrap();
            if (optFile.some) {
                return Ok(optFile.safeValue());
            }
            if (ignoreMissingFile) {
                const missing: MissingFileNode = {
                    type: FileNodeType.LOCAL_MISSING,
                    localTime: Date.now(),
                    fileData: { fullPath }
                };
                return Ok(missing as GetNodeTypes<CanHaveMissing, CanHaveInvalid>);
            }
        }
        if (IsLocalFileRaw(fullPath, config)) {
            const fileResult = await this.getRawNode(app, fullPath);
            if (fileResult.err) {
                return fileResult;
            }
            const optFile = fileResult.safeUnwrap();
            if (optFile.some) {
                return Ok(optFile.safeValue());
            }
            if (ignoreMissingFile) {
                const missing: MissingFileNode = {
                    type: FileNodeType.LOCAL_MISSING,
                    localTime: Date.now(),
                    fileData: { fullPath }
                };
                return Ok(missing as GetNodeTypes<CanHaveMissing, CanHaveInvalid>);
            }
        }
        if (ignoreInvalidPath) {
            const invalid: InvalidFileNode = {
                type: FileNodeType.INVALID,
                fileData: { fullPath }
            };
            return Ok(invalid as GetNodeTypes<CanHaveMissing, CanHaveInvalid>);
        }
        return Err(
            InvalidArgumentError(
                `File node path: "${fullPath}" is acceptable but isn't obisdian or local files.`
            )
        );
    }

    /**
     * Deletes a file node.
     * @param app the obsidian app
     * @param fileNode the file node to delete
     * @param config the syncer config used in this
     * @returns the status of deleting the file
     */
    @Span()
    @PromiseResultSpanError
    public static async deleteFileNode(
        app: App,
        fileNode: AllExistingFileNodeTypes,
        config: LatestSyncConfigVersion
    ): Promise<StatusResult<StatusError>> {
        if (!IsAcceptablePath(fileNode.fileData.fullPath, config)) {
            return Ok();
        }
        if (IsObsidianFile(fileNode.fileData.fullPath, config)) {
            const fileResult = await FileUtilObsidian.deleteObsidianFile(
                app,
                fileNode.fileData.fullPath
            );
            if (fileResult.err) {
                return fileResult;
            }
        }
        if (IsLocalFileRaw(fileNode.fileData.fullPath, config)) {
            const fileResult = await FileUtilRaw.deleteRawFile(app, fileNode.fileData.fullPath);
            if (fileResult.err) {
                return fileResult;
            }
        }
        return Ok();
    }
    /**
     * Deletes a file node.
     * @param app the obsidian app
     * @param fileNode the file node to delete
     * @param config the syncer config used in this
     * @returns the status of deleting the file
     */
    @Span()
    @PromiseResultSpanError
    public static async readFileNode(
        app: App,
        fileNode: LocalOnlyFileNode | LocalCloudFileNode,
        config: LatestSyncConfigVersion
    ): Promise<Result<Uint8Array, StatusError>> {
        if (!IsAcceptablePath(fileNode.fileData.fullPath, config)) {
            return Err(
                NotFoundError("File node not found").with(
                    InjectMeta({ [FileConst.FILE_PATH]: fileNode.fileData.fullPath })
                )
            );
        }
        if (IsObsidianFile(fileNode.fileData.fullPath, config)) {
            const fileResult = await FileUtilObsidian.readObsidianFile(
                app,
                fileNode.fileData.fullPath
            );
            if (fileResult.err) {
                fileResult.val.with(
                    InjectMeta({ [FileConst.FILE_PATH]: fileNode.fileData.fullPath })
                );
            }
            return fileResult;
        }
        if (IsLocalFileRaw(fileNode.fileData.fullPath, config)) {
            const fileResult = await FileUtilRaw.readRawFile(app, fileNode.fileData.fullPath);
            if (fileResult.err) {
                fileResult.val.with(
                    InjectMeta({ [FileConst.FILE_PATH]: fileNode.fileData.fullPath })
                );
            }
            return fileResult;
        }
        return Err(
            NotFoundError("File node not found").with(
                InjectMeta({ [FileConst.FILE_PATH]: fileNode.fileData.fullPath })
            )
        );
    }

    @Span()
    @PromiseResultSpanError
    public static async getTouchedFileNodes(
        app: App,
        config: LatestSyncConfigVersion,
        touchedFiles: Map<FilePathType, MsFromEpoch>
    ): Promise<Result<MapOfFileNodes<LocalFileNodeTypes>, StatusError>> {
        const touchedFileNodes = new Map<FilePathType, LocalFileNodeTypes>();
        const readFile = async (
            path: string,
            time: MsFromEpoch
        ): Promise<StatusResult<StatusError>> => {
            const fileStatResult = await WrapPromise(
                app.vault.adapter.stat(normalizePath(path)),
                /*textForUnknown=*/ `Failed to stat "${path}"`
            );
            if (fileStatResult.err) {
                return fileStatResult;
            }

            const stat = WrapOptional(fileStatResult.safeUnwrap());
            if (stat.none) {
                return Ok(None);
            }

            const fileNodeResult = await this.getFileNode(
                app,
                path as FilePathType,
                config,
                /*ignoreMissingFile=*/ true,
                /*ignoreInvalidPath=*/ true
            );
            if (fileNodeResult.err) {
                return fileNodeResult;
            }
            const fileNode = fileNodeResult.safeUnwrap();
            if (fileNode.type === FileNodeType.INVALID) {
                return Ok();
            }
            fileNode.localTime = time;

            touchedFileNodes.set(fileNode.fileData.fullPath, fileNode);
            return Ok();
        };
        const touchedFileFetchResult = await Promise.all(
            touchedFiles.entries().map((val) => {
                return readFile(val[0], val[1]);
            })
        );
        const combinedResults = CombineResults(touchedFileFetchResult);
        if (combinedResults.err) {
            return combinedResults;
        }
        return Ok(touchedFileNodes);
    }

    /** Gets all the file nodes from the filesystem. */
    @Span()
    @PromiseResultSpanError
    public static async getAllFileNodes(
        app: App,
        config: LatestSyncConfigVersion
    ): Promise<Result<LocalOnlyFileNode[], StatusError>> {
        const files: LocalOnlyFileNode[] = [];

        const iterateFiles = async (path: string): Promise<StatusResult<StatusError>> => {
            const fileNamesResult = await WrapPromise(
                app.vault.adapter.list(normalizePath(path)),
                /*textForUnknown=*/ `Failed to list(${path})`
            );
            if (fileNamesResult.err) {
                return fileNamesResult;
            }

            const fileResult = AsyncForEach<FilePathType, StatusResult<StatusError>>(
                fileNamesResult.safeUnwrap().files as FilePathType[],
                async (fullpath: FilePathType): Promise<StatusResult<StatusError>> => {
                    if (!IsAcceptablePath(fullpath, config)) {
                        return Ok();
                    }
                    const fileNode = await this.getFileNode(app, fullpath, config);
                    if (fileNode.ok) {
                        files.push(fileNode.safeUnwrap());
                    }
                    return fileNode;
                }
            );

            const folderResult = AsyncForEach<string, StatusResult<StatusError>>(
                fileNamesResult.safeUnwrap().folders,
                async (folder: string) => iterateFiles(folder)
            );

            const combinePromises = await Promise.all([...fileResult, ...folderResult]);
            return CombineResults(combinePromises);
        };
        const iterateResult = await iterateFiles("");
        if (iterateResult.err) {
            return iterateResult;
        }

        return Ok(files);
    }
}
