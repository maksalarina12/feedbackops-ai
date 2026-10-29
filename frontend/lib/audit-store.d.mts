export interface AuditRow {
  request_id: string;
  created_at: string | null;
  source: string | null;
  unit: string | null;
  sentiment: string | null;
  category: string | null;
  urgency: string | null;
  summary: string | null;
  routing_decision: string | null;
  routing_reasons: string[] | null;
  review_status: string | null;
  status: string | null;
  error_code: string | null;
  suggested_response: string | null;
  response_grounded: boolean | null;
  kb_source: string | null;
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

export interface AuditStats {
  window_days: number;
  cutoff: string;
  total: number;
  counts: {
    total: number;
    review_required: number;
    auto: number;
    rejected: number;
    resolved: number;
    needs_review: number;
  };
  by_route: Record<string, number>;
  by_category: Record<string, number>;
  by_sentiment: Record<string, number>;
  by_unit: Record<string, number>;
  service: {
    avg_processing_ms: number | null;
    rejection_rate: number;
    review_rate: number;
    resolution_rate: number | null;
    grounding_rate: number | null;
    llm_error_count: number;
  };
  daily: Array<{ day: string; total: number }>;
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
export function readAuditStats(options?: { days?: number }): Promise<AuditStats>;
export function pruneAuditEvents(options?: { days?: number }): Promise<number>;
