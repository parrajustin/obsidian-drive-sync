import { Span } from "../logging/tracing/span.decorator";
import { FilePathType, AllFileNodeTypes } from "./file_node";

export type MapOfFileNodes<T> = Map<FilePathType, T>;

export class FileMapUtil {
    @Span()
    public static convertNodeToMap<T extends AllFileNodeTypes>(allNodes: T[]): MapOfFileNodes<T> {
        const map = new Map<FilePathType, T>();
        for (const node of allNodes) {
            map.set(node.fileData.fullPath, node);
        }
        return map;
    }
}
