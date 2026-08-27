import type { CheckModule, Finding } from "@/lib/types";
import { redactSecret } from "@/lib/utils/redact";
import {
  absoluteUrl,
  assertPublicHttpUrl,
  fetchWithLimits,
  normalizeTargetUrl,
} from "@/lib/checks/http";

type FirebaseConfig = {
  apiKey: string;
  projectId: string;
};

function findFirebaseConfig(text: string): FirebaseConfig | null {
  const projectId =
    text.match(/projectId["'\s:]+["']([a-z0-9-]+)["']/i)?.[1] ??
    text.match(/FIREBASE_PROJECT_ID["'\s:=]+["']([a-z0-9-]+)["']/i)?.[1];
  const apiKey =
    text.match(/apiKey["'\s:]+["'](AIza[0-9A-Za-z\-_]{20,})["']/i)?.[1] ??
    text.match(/AIza[0-9A-Za-z\-_]{35}/)?.[0];

  if (!projectId || !apiKey) return null;
  return { projectId, apiKey };
}

function extractScripts(html: string, pageUrl: string): string[] {
  const urls: string[] = [];
  const scriptSrc = /<script[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptSrc.exec(html))) {
    const abs = absoluteUrl(pageUrl, m[1]);
    if (abs) urls.push(abs);
  }
  return Array.from(new Set(urls)).slice(0, 15);
}

export const firebaseOpenRulesCheck: CheckModule = {
  id: "firebase-open-rules",
  name: "Firebase/Firestore open rules",
  description:
    "If Firebase config is in the frontend, probes Firestore REST for open reads.",
  requiresConsent: false,
  async run(ctx) {
    let pageUrl: URL;
    try {
      pageUrl = normalizeTargetUrl(ctx.targetUrl);
      assertPublicHttpUrl(pageUrl);
    } catch (err) {
      return [
        {
          id: "firebase-open-rules",
          severity: "info",
          title: "Could not start Firebase check",
          location: ctx.targetUrl,
          detail: err instanceof Error ? err.message : "Invalid URL",
          fix: null,
        },
      ];
    }

    let combined = "";
    try {
      const page = await fetchWithLimits(pageUrl.toString());
      combined += page.body;
      const scripts = extractScripts(page.body, pageUrl.toString());
      const bodies = await Promise.allSettled(
        scripts.map((u) => fetchWithLimits(u, {}, { maxBytes: 800_000 }))
      );
      for (const b of bodies) {
        if (b.status === "fulfilled") combined += `\n${b.value.body}`;
      }
    } catch {
      return [
        {
          id: "firebase-open-rules",
          severity: "info",
          title: "Could not fetch site to detect Firebase",
          location: pageUrl.toString(),
          detail: "Homepage request failed.",
          fix: null,
        },
      ];
    }

    const config = findFirebaseConfig(combined);
    if (!config) {
      return [
        {
          id: "firebase-open-rules",
          severity: "info",
          title: "No Firebase config detected in frontend",
          location: pageUrl.hostname,
          detail:
            "We didn’t find a Firebase apiKey + projectId in the sampled JS. If this app doesn’t use Firebase, you can ignore this check.",
          fix: null,
        },
      ];
    }

    const findings: Finding[] = [];
    const listUrl = `https://firestore.googleapis.com/v1/projects/${config.projectId}/databases/(default)/documents?pageSize=3&key=${encodeURIComponent(config.apiKey)}`;

    try {
      const res = await fetchWithLimits(
        listUrl,
        {},
        { timeoutMs: 10000, maxBytes: 200_000 }
      );

      if (res.status === 200) {
        let hasDocs = false;
        try {
          const json = JSON.parse(res.body) as { documents?: unknown[] };
          hasDocs = Array.isArray(json.documents) && json.documents.length > 0;
        } catch {
          hasDocs = /"documents"\s*:/.test(res.body);
        }

        findings.push({
          id: "firebase-open-rules",
          severity: "critical",
          title: "Firestore appears readable with only the public API key",
          location: `projects/${config.projectId}/databases/(default)`,
          detail:
            "Using the Firebase web config from your frontend, we could list Firestore documents without signing in. That usually means security rules allow open read (or are still in test mode). Attackers copy the same public config and dump your data.",
          evidence: hasDocs
            ? `REST list returned documents (apiKey ${redactSecret(config.apiKey, 4)})`
            : `REST list returned HTTP 200 (apiKey ${redactSecret(config.apiKey, 4)})`,
          fix: {
            type: "prompt",
            content: `Lock down Firestore security rules. Example — only signed-in users read their own docs:\n\nrules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /users/{userId}/{document=**} {\n      allow read, write: if request.auth != null && request.auth.uid == userId;\n    }\n  }\n}\n\nRemove any allow read, write: if true test rules before production.`,
          },
        });
      } else if (res.status === 403 || res.status === 401) {
        findings.push({
          id: "firebase-open-rules",
          severity: "pass",
          title: "Firestore list denied with public API key",
          location: config.projectId,
          detail:
            "Firebase is present, but listing documents with only the web API key was denied. Keep rules locked down for every collection.",
          evidence: `HTTP ${res.status}`,
          fix: null,
        });
      } else {
        findings.push({
          id: "firebase-open-rules",
          severity: "info",
          title: "Firebase detected; Firestore list inconclusive",
          location: config.projectId,
          detail: `Got HTTP ${res.status} probing Firestore. Manually confirm rules aren’t left in test mode.`,
          fix: null,
        });
      }
    } catch {
      findings.push({
        id: "firebase-open-rules",
        severity: "info",
        title: "Firebase detected; probe failed",
        location: config.projectId,
        detail: "Couldn’t reach Firestore REST. Confirm rules in the Firebase console.",
        fix: null,
      });
    }

    return findings;
  },
};
