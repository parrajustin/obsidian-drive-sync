/**
 * A reusable, jest-free in-memory fake of Firebase Cloud Storage plus the
 * `firebase/storage` module mock factory. Mirrors `firestore_sdk_mock.ts`.
 */

export interface StoredObject {
    data: ArrayBuffer;
    metadata: Record<string, unknown> | undefined;
}

interface FakeStorageRef {
    fullPath: string;
}

export class FakeCloudStorage {
    private _objects = new Map<string, StoredObject>();
    private _nextUploadError: Error | undefined = undefined;
    private _nextDownloadError: Error | undefined = undefined;

    public async uploadBytes(
        ref: FakeStorageRef,
        data: ArrayBuffer,
        metadata?: Record<string, unknown>
    ): Promise<{ ref: FakeStorageRef }> {
        if (this._nextUploadError !== undefined) {
            const error = this._nextUploadError;
            this._nextUploadError = undefined;
            return Promise.reject(error);
        }
        this._objects.set(ref.fullPath, { data, metadata });
        return Promise.resolve({ ref });
    }

    public async getBytes(ref: FakeStorageRef): Promise<ArrayBuffer> {
        if (this._nextDownloadError !== undefined) {
            const error = this._nextDownloadError;
            this._nextDownloadError = undefined;
            return Promise.reject(error);
        }
        const stored = this._objects.get(ref.fullPath);
        if (stored === undefined) {
            return Promise.reject(new Error(`storage/object-not-found: ${ref.fullPath}`));
        }
        return Promise.resolve(stored.data);
    }

    /** Makes the next `uploadBytes` call reject with `error`. */
    public failNextUpload(error: Error): void {
        this._nextUploadError = error;
    }

    /** Makes the next `getBytes` call reject with `error`. */
    public failNextDownload(error: Error): void {
        this._nextDownloadError = error;
    }

    public peekObject(fullPath: string): StoredObject | undefined {
        return this._objects.get(fullPath);
    }

    public get objectCount(): number {
        return this._objects.size;
    }

    public clear(): void {
        this._objects.clear();
        this._nextUploadError = undefined;
        this._nextDownloadError = undefined;
    }
}

let INSTANCE = new FakeCloudStorage();

export function GetFakeCloudStorage(): FakeCloudStorage {
    return INSTANCE;
}

export function ResetFakeCloudStorage(): FakeCloudStorage {
    INSTANCE = new FakeCloudStorage();
    return INSTANCE;
}

/** Creates an object with the `firebase/storage` module shape. */
export function CreateStorageSdkMock(): Record<string, unknown> {
    return {
        getStorage: () => ({ fake: true }),
        ref: (_storage: unknown, path: string): FakeStorageRef => ({ fullPath: path }),
        uploadBytes: async (
            ref: FakeStorageRef,
            data: ArrayBuffer,
            metadata?: Record<string, unknown>
        ) => INSTANCE.uploadBytes(ref, data, metadata),
        getBytes: async (ref: FakeStorageRef) => INSTANCE.getBytes(ref)
    };
}
