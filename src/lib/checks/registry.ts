import type { CheckModule } from "@/lib/types";
import { exposedApiKeysCheck } from "@/lib/checks/exposed-api-keys";
import { supabaseRlsCheck } from "@/lib/checks/supabase-rls";
import { securityHeadersCheck } from "@/lib/checks/security-headers";
import { corsCheck } from "@/lib/checks/cors";
import { envFileExposedCheck } from "@/lib/checks/env-file-exposed";
import { sourceMapsCheck } from "@/lib/checks/source-maps";
import { httpsCheck } from "@/lib/checks/https";
import { adminRoutesCheck } from "@/lib/checks/admin-routes";
import { firebaseOpenRulesCheck } from "@/lib/checks/firebase-open-rules";
import { supabaseRestExposureCheck } from "@/lib/checks/supabase-rest-exposure";
import { xssProbeCheck } from "@/lib/checks/xss-probe";
import { injectionProbeCheck } from "@/lib/checks/injection-probe";
import { outdatedDepsCheck } from "@/lib/checks/outdated-deps";
import { platformPatterns } from "@/lib/checks/platform-patterns";

/**
 * Registry of composable check modules.
 * Preview uses the first 4 passive, non-repo modules (keys, RLS, headers, CORS).
 */
export const checkRegistry: CheckModule[] = [
  exposedApiKeysCheck,
  supabaseRlsCheck,
  securityHeadersCheck,
  corsCheck,
  envFileExposedCheck,
  sourceMapsCheck,
  httpsCheck,
  adminRoutesCheck,
  firebaseOpenRulesCheck,
  supabaseRestExposureCheck,
  xssProbeCheck,
  injectionProbeCheck,
  outdatedDepsCheck,
];

export function getPreviewChecks(): CheckModule[] {
  return checkRegistry
    .filter((c) => !c.requiresConsent && !c.requiresRepo)
    .slice(0, 4);
}

export function getChecksForPlatform(platform?: string): CheckModule[] {
  if (!platform || !(platform in platformPatterns)) {
    return [...checkRegistry];
  }

  const prioritize = platformPatterns[platform]?.prioritize ?? [];

  return [...checkRegistry].sort((a, b) => {
    const ai = prioritize.indexOf(a.id);
    const bi = prioritize.indexOf(b.id);
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    return av - bv;
  });
}
