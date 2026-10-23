export type SearchCoverage = {
  contractVersion: 1;
  requestedFilters: Record<string, string | string[] | number>;
  appliedFilters: Record<string, string | string[] | number>;
  windows: Array<{ from: string; to: string; complete: boolean }>;
  upstreamTotal: number | null;
  hasMore: boolean | null;
  completeness: "complete" | "limited" | "unknown";
  limitations: string[];
};
export type DocumentEvidence = {
  contractVersion: 1;
  ada: string;
  fetchedAt: string;
  version: string | null;
  checksum: string | null;
  publicationStatus: string;
  extraction: {
    state:
      | "native"
      | "partial"
      | "ocr_needed"
      | "missing"
      | "unsupported"
      | "failed";
    totalPages: number | null;
    extractedPages: number[];
    unreadablePages: number[];
    searchedPages: number[];
    limitations: string[];
  };
  excerpts: Array<{ id: string; page: number; text: string }>;
};
export type OperationContext = { signal: AbortSignal; deadlineAt: number };
