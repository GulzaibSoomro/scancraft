/**
 * Shared Finding type returned by every check module.
 * Secrets in `evidence` must be redacted before persistence.
 */
export type Severity = "critical" | "warning" | "info" | "pass";

export type FixType = "code" | "prompt" | "manual";

export type FindingFix = {
  type: FixType;
  content: string;
};

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  location: string;
  detail: string;
  evidence?: string;
  fix: FindingFix | null;
};

export type Platform =
  | "lovable"
  | "bolt"
  | "cursor"
  | "v0"
  | "replit"
  | "other";

export type SubscriptionTier = "free" | "pro";

export type ScanStatus = "queued" | "running" | "complete" | "failed";

export type OverallVerdict = "at_risk" | "secure";

export type CheckContext = {
  targetUrl: string;
  /** When true, only passive/read-only checks run (preview + default full scan). */
  consentActiveProbes: boolean;
  platform?: Platform;
  githubAccessToken?: string;
  githubRepoUrl?: string;
  /** Opt-in test credentials for IDOR — never used without explicit consent. */
  testCredentials?: {
    cookieHeader?: string;
    bearerToken?: string;
  };
};

export type CheckModule = {
  id: string;
  name: string;
  description: string;
  /** Passive checks need no consent; active probes require consentActiveProbes. */
  requiresConsent: boolean;
  /** If set, only run when repo access is available. */
  requiresRepo?: boolean;
  run: (ctx: CheckContext) => Promise<Finding[]>;
};
