/** Thin wrapper over fetch. Every call carries the session cookie. */
export declare class ApiError extends Error {
    readonly status: number;
    /** Field name to message, when the server rejected specific inputs. */
    readonly fields: Record<string, string> | null;
    constructor(status: number, message: string, 
    /** Field name to message, when the server rejected specific inputs. */
    fields?: Record<string, string> | null);
}
export declare const api: {
    get: <T>(path: string) => Promise<T>;
    post: <T>(path: string, body?: unknown) => Promise<T>;
    put: <T>(path: string, body?: unknown) => Promise<T>;
    delete: <T>(path: string) => Promise<T>;
    /** Multipart upload, for the Word document import. */
    upload<T>(path: string, file: File): Promise<T>;
};
