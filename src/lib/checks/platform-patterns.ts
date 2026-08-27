/**
 * Platform → check priority map.
 * Lovable/Bolt apps almost always use Supabase — RLS checks run first.
 * Extend this JSON as new failure patterns are discovered.
 */
/** Check ids that exist today; future modules can be added to prioritize lists early. */
export const platformPatterns: Record<
  string,
  { prioritize: string[] }
> = {
  lovable: {
    prioritize: [
      "supabase-rls",
      "exposed-api-key",
      "supabase-rest-exposure",
      "missing-security-headers",
    ],
  },
  bolt: {
    prioritize: [
      "supabase-rls",
      "exposed-api-key",
      "client-only-auth",
      "missing-security-headers",
    ],
  },
  cursor: {
    prioritize: [
      "exposed-api-key",
      "missing-security-headers",
      "cors-misconfiguration",
      "outdated-dependencies",
    ],
  },
  v0: {
    prioritize: [
      "exposed-api-key",
      "missing-security-headers",
      "cors-misconfiguration",
      "admin-routes",
    ],
  },
  replit: {
    prioritize: [
      "exposed-api-key",
      "env-file-exposed",
      "missing-security-headers",
      "http-not-https",
    ],
  },
  other: {
    prioritize: [
      "exposed-api-key",
      "missing-security-headers",
      "cors-misconfiguration",
      "supabase-rls",
    ],
  },
};
