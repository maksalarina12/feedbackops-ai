export interface AuditRow {
  request_id: string;
  created_at: string | null;
  source: string | null;
  sentiment: string | null;
  category: string | null;
  urgency: string | null;
  summary: string | null;
  routing_decision: string | null;
  review_status: string | null;
  status: string | null;
  error_code: string | null;
  llm_error: string | null;
  processing_duration_ms: number | null;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface AuditCounts {
  total: number;
  needs_review: number;
  resolved: number;
  auto: number;
  rejected: number;
}

export interface AuditState {
  rows: AuditRow[];
  counts: AuditCounts;
  total: number;
  store: string;
}

export function storePath(): string;
export function appendAuditRow(row: Record<string, unknown>): Promise<AuditRow>;
export function appendReviewUpdate(input: {
  request_id: string;
  status: "resolved" | "needs_review";
  note?: string;
  reviewer?: string;
}): Promise<void>;
export function readAuditState(options?: { limit?: number }): Promise<AuditState>;
export function pruneAuditEvents(options?: { days?: number }): Promise<number>;
