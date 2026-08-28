import type { InterviewResponse } from "./types";
export type LocalDraft = {
    responses: InterviewResponse[];
    durationSeconds: number;
    savedAt: string;
};
export declare function writeLocalDraft(interviewId: string, draft: LocalDraft): void;
export declare function readLocalDraft(interviewId: string): LocalDraft | null;
export declare function clearLocalDraft(interviewId: string): void;
/** True when the local copy holds notes the server has not confirmed. */
export declare function localDraftIsNewer(local: LocalDraft | null, serverResponses: InterviewResponse[]): boolean;
