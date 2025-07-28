import { Span } from "../logging/tracing/span.decorator";
import { FileNode, FilePathType } from "./file_node";

export type MapOfFileNodes = Map<FilePathType, FileNode>;

export class FileMapUtil {
    @Span()
    public static convertNodeToMap(allNodes: FileNode[]): MapOfFileNodes {
        const map = new Map<FilePathType, FileNode>();
        for (const node of allNodes) {
            map.set(node.fileData.fullPath, node);
        }
        return map;
    }
}
