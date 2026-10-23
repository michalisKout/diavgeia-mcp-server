import dayjs from "dayjs";
import type { ManipulateType } from "dayjs";
import { z } from "zod";

export type DateRangePreset =
  | "1month"
  | "3months"
  | "6months"
  | "1year"
  | "2years";

export interface DiavgeiaConfigOverrides {
  apiBaseUrl?: string;
  defaultPageSize?: number;
  maxOrganizations?: number;
  defaultDateRange?: DateRangePreset;
  language?: "el" | "en";
  timeout?: number;
  cacheEnabled?: boolean;
}

const configSchema = z.object({
  apiBaseUrl: z.string().url(),
  defaultPageSize: z.number().int().min(1).max(500),
  maxOrganizations: z.number().int().min(10).max(200),
  defaultDateRange: z.enum(["1month", "3months", "6months", "1year", "2years"]),
  language: z.enum(["el", "en"]),
  timeout: z.number().int().min(5_000).max(120_000),
  cacheEnabled: z.boolean(),
});

export type ResolvedDiavgeiaConfig = z.infer<typeof configSchema>;

export const DEFAULT_CONFIG: ResolvedDiavgeiaConfig = {
  apiBaseUrl: "https://diavgeia.gov.gr/opendata",
  defaultPageSize: 10,
  maxOrganizations: 50,
  defaultDateRange: "1year",
  language: "en",
  timeout: 30_000,
  cacheEnabled: true,
};

const envKeys: Record<keyof ResolvedDiavgeiaConfig, string[]> = {
  apiBaseUrl: ["DIAVGEIA_API_BASE_URL", "DIAVGEIA_URL"],
  defaultPageSize: ["DIAVGEIA_DEFAULT_PAGE_SIZE"],
  maxOrganizations: ["DIAVGEIA_MAX_ORGANIZATIONS"],
  defaultDateRange: ["DIAVGEIA_DEFAULT_DATE_RANGE"],
  language: ["DIAVGEIA_LANGUAGE"],
  timeout: ["DIAVGEIA_TIMEOUT"],
  cacheEnabled: ["DIAVGEIA_CACHE_ENABLED"],
};

const dateRangeToDayjs: Record<
  DateRangePreset,
  { amount: number; unit: ManipulateType }
> = {
  "1month": { amount: 1, unit: "month" },
  "3months": { amount: 3, unit: "month" },
  "6months": { amount: 6, unit: "month" },
  "1year": { amount: 1, unit: "year" },
  "2years": { amount: 2, unit: "year" },
};

function readFirstEnv(keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }

  return undefined;
}

function parseBoolean(value: string | undefined) {
  if (!value) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return undefined;
}

function parseNumber(value: string | undefined) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

function loadEnvConfig(): DiavgeiaConfigOverrides {
  const defaultDateRange = readFirstEnv(
    envKeys.defaultDateRange
  )?.toLowerCase();
  const language = readFirstEnv(envKeys.language)?.toLowerCase();

  const envConfig: DiavgeiaConfigOverrides = {
    apiBaseUrl: readFirstEnv(envKeys.apiBaseUrl),
    defaultPageSize: parseNumber(readFirstEnv(envKeys.defaultPageSize)),
    maxOrganizations: parseNumber(readFirstEnv(envKeys.maxOrganizations)),
    defaultDateRange: configSchema.shape.defaultDateRange.safeParse(
      defaultDateRange
    ).success
      ? (defaultDateRange as DateRangePreset)
      : undefined,
    language: language === "el" || language === "en" ? language : undefined,
    timeout: parseNumber(readFirstEnv(envKeys.timeout)),
    cacheEnabled: parseBoolean(readFirstEnv(envKeys.cacheEnabled)),
  };

  return Object.fromEntries(
    Object.entries(envConfig).filter(([, value]) => value !== undefined)
  ) as DiavgeiaConfigOverrides;
}

function sanitize(config: ResolvedDiavgeiaConfig) {
  return {
    ...config,
    defaultPageSize: Math.min(Math.max(config.defaultPageSize, 1), 500),
    maxOrganizations: Math.min(Math.max(config.maxOrganizations, 10), 200),
    timeout: Math.min(Math.max(config.timeout, 5_000), 120_000),
  };
}

export function loadConfig(
  overrides: DiavgeiaConfigOverrides = {}
): ResolvedDiavgeiaConfig {
  const candidate = sanitize({
    ...DEFAULT_CONFIG,
    ...loadEnvConfig(),
    ...overrides,
  });

  const parsed = configSchema.safeParse(candidate);
  if (parsed.success) return parsed.data;

  console.warn(
    `[Diavgeia MCP] Invalid configuration detected (${parsed.error.message}). Falling back to defaults.`
  );
  return DEFAULT_CONFIG;
}

export function resolveDefaultDateRange(preset: DateRangePreset) {
  const range = dateRangeToDayjs[preset] ?? dateRangeToDayjs["1year"];

  return {
    from: dayjs().subtract(range.amount, range.unit).format("YYYY-MM-DD"),
    to: dayjs().format("YYYY-MM-DD"),
  };
}

/** Hard upper bounds for one search operation, shared by all entry points. */
export const SEARCH_LIMITS = Object.freeze({
  deadlineMs: 30_000,
  maxAttempts: 3,
  retryAfterMs: 2_000,
  maxWindows: 4,
  maxPages: 4,
});

export const searchLimitsSchema = z.object({
  deadlineMs: z.number().int().min(1).max(SEARCH_LIMITS.deadlineMs),
  maxAttempts: z.number().int().min(1).max(SEARCH_LIMITS.maxAttempts),
  retryAfterMs: z.number().int().min(0).max(SEARCH_LIMITS.retryAfterMs),
  maxWindows: z.number().int().min(1).max(SEARCH_LIMITS.maxWindows),
  maxPages: z.number().int().min(1).max(SEARCH_LIMITS.maxPages),
});
export type SearchLimits = z.infer<typeof searchLimitsSchema>;

/** Downward-only bounds for document work and transient text storage. */
export const DOCUMENT_LIMITS = Object.freeze({
  deadlineMs: 30_000,
  maxAttempts: 3,
  retryAfterMs: 2_000,
  maxRedirects: 3,
  maxBytes: 15 * 1024 * 1024,
  maxPages: 200,
  concurrency: 2,
  extractionMs: 10_000,
  maxExcerpts: 6,
  excerptCharacters: 1_200,
  cacheEntries: 64,
  cacheBytes: 32 * 1024 * 1024,
  cacheTtlMs: 5 * 60_000,
});
export const documentLimitsSchema = z.object({
  deadlineMs: z.number().int().min(1).max(DOCUMENT_LIMITS.deadlineMs),
  maxAttempts: z.number().int().min(1).max(DOCUMENT_LIMITS.maxAttempts),
  retryAfterMs: z.number().int().min(0).max(DOCUMENT_LIMITS.retryAfterMs),
  maxRedirects: z.number().int().min(0).max(DOCUMENT_LIMITS.maxRedirects),
  maxBytes: z.number().int().min(1).max(DOCUMENT_LIMITS.maxBytes),
  maxPages: z.number().int().min(1).max(DOCUMENT_LIMITS.maxPages),
  concurrency: z.number().int().min(1).max(DOCUMENT_LIMITS.concurrency),
  extractionMs: z.number().int().min(1).max(DOCUMENT_LIMITS.extractionMs),
  maxExcerpts: z.number().int().min(1).max(DOCUMENT_LIMITS.maxExcerpts),
  excerptCharacters: z
    .number()
    .int()
    .min(1)
    .max(DOCUMENT_LIMITS.excerptCharacters),
  cacheEntries: z.number().int().min(1).max(DOCUMENT_LIMITS.cacheEntries),
  cacheBytes: z.number().int().min(1).max(DOCUMENT_LIMITS.cacheBytes),
  cacheTtlMs: z.number().int().min(1).max(DOCUMENT_LIMITS.cacheTtlMs),
});
export type DocumentLimits = z.infer<typeof documentLimitsSchema>;
export function resolveDocumentLimits(
  overrides: Partial<DocumentLimits> = {}
): DocumentLimits {
  return documentLimitsSchema.parse({ ...DOCUMENT_LIMITS, ...overrides });
}
