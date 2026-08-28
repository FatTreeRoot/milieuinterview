import type { EvaluationReport, InterviewStatus, InputKind, Question, Response as InterviewResponse, Role, TypeSnapshot } from "@milieu/shared";
export type { InputKind, Question, InterviewResponse, TypeSnapshot };
export type CurrentUser = {
    id: string;
    email: string;
    name: string;
    role: Role;
};
export type InterviewType = {
    id: string;
    name: string;
    description: string | null;
    passThreshold: number;
    archived: boolean;
    sort: number;
    questions: Question[];
};
export type InterviewSummary = {
    id: string;
    typeId: string | null;
    typeName: string;
    candidateName: string;
    position: string | null;
    interviewerNames: string | null;
    status: InterviewStatus;
    startedAt: string;
    completedAt: string | null;
    durationSeconds: number;
    score: number | null;
    aiScore: number | null;
    finalScore: number | null;
    threshold: number | null;
    passed: boolean | null;
    borderline: boolean | null;
    redFlagCount: number;
};
export type InterviewDetail = InterviewSummary & {
    snapshot: TypeSnapshot;
    responses: InterviewResponse[];
    report: EvaluationReport | null;
    documents: {
        kind: string;
        content: string;
        updatedAt: string;
    }[];
};
export type Capabilities = {
    ai: boolean;
    email: boolean;
};
export type Stats = {
    totals: {
        completed: number;
        drafts: number;
        passed: number;
        borderline: number;
        averageScore: number | null;
    };
    byMonth: {
        month: string;
        count: number;
        passed: number;
    }[];
    byType: {
        typeName: string;
        count: number;
        passed: number;
        averageScore: number | null;
    }[];
};
export type AccessCode = {
    id: string;
    code: string;
    label: string;
    active: boolean;
    uses: number;
    createdAt?: string;
    createdByName?: string | null;
};
export type AdminUser = {
    id: string;
    email: string;
    name: string;
    role: Role;
    createdAt: string;
};
export type AuditEntry = {
    id: string;
    userName: string;
    action: string;
    entity: string;
    entityId: string | null;
    detail: string | null;
    createdAt: string;
};
export type UsageRow = {
    feature: string;
    model: string;
    calls: number;
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cost_usd: number;
};
export type UsageMonth = {
    month: string;
    calls: number;
    cost_usd: number;
};
export type ImportedTypeDraft = {
    name: string;
    description: string | null;
    passThreshold: number;
    questions: {
        text: string;
        answerKey: string | null;
        inputKind: InputKind;
        inputConfig: Record<string, never>;
    }[];
};
