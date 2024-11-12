import { InvalidArgumentError } from "../lib/status_error";
import type { CloudFileMetadata, CloudNode, FileData } from "../sync/file_node";
import { CloudNodeFileRef, CloudNodeRaw, BaseMutableFileNode } from "../sync/file_node";

export interface HistoricNodeMetadata {
    /** The uid of the historic node. */
    historyDocId: string;
    /** Creation time of the history node. */
    historyDocEntryTime: number;
}

export interface UploadRawDataCached {
    type: "cached_raw";
}
export interface UploadRawData {
    type: "raw_data";
    /** Data from the cloud storage compressed with brotli encoded in uint8. */
    data: Uint8Array;
}
export interface UploadFileRefData {
    type: "file_ref";
    /** Storage path on cloud storage if any. */
    fileStorageRef: string;
}
export type HistoricNodeExtraType = HistoricNodeMetadata &
    (UploadFileRefData | UploadRawData | UploadRawDataCached);

type THistoricFileNodeKey = "HISTORIC_NODE";
/** Represent a node of data that changed in the past. */
export class HistoricFileNode extends BaseMutableFileNode {
    public override readonly type: THistoricFileNodeKey = "HISTORIC_NODE";
    public override readonly metadata: CloudFileMetadata;
    public override readonly extra: HistoricNodeExtraType;

    // eslint-disable-next-line @typescript-eslint/no-useless-constructor
    constructor(data: FileData, metadata: CloudFileMetadata, extra: HistoricNodeExtraType) {
        super(data, metadata, extra);
    }

    /** Constructs a historic node from a cloud node. Raw cloud nodes must not be from the cache. */
    public static constructFromCloudNode(cloudNode: CloudNode): HistoricFileNode {
        if (cloudNode instanceof CloudNodeRaw && !cloudNode.extra.isFromCloudCache) {
            return new HistoricFileNode(cloudNode.data, cloudNode.metadata, {
                type: "raw_data",
                data: cloudNode.extra.data.safeValue(),
                historyDocId: "",
                historyDocEntryTime: Date.now()
            });
        }
        if (cloudNode instanceof CloudNodeRaw && cloudNode.extra.isFromCloudCache) {
            return new HistoricFileNode(cloudNode.data, cloudNode.metadata, {
                type: "cached_raw",
                historyDocId: "",
                historyDocEntryTime: Date.now()
            });
        }
        if (cloudNode instanceof CloudNodeFileRef) {
            return new HistoricFileNode(cloudNode.data, cloudNode.metadata, {
                type: "file_ref",
                fileStorageRef: cloudNode.extra.fileStorageRef,
                historyDocId: "",
                historyDocEntryTime: Date.now()
            });
        }
        throw InvalidArgumentError(`Cloud node "${cloudNode.toString()}" of unknown type.`);
    }
}
