# Check modules

Each file exports one `CheckModule` and is registered in `registry.ts`.

## Implemented

| ID | File | Notes |
| --- | --- | --- |
| exposed-api-key | `exposed-api-keys.ts` | Bundle secret patterns |
| supabase-rls | `supabase-rls.ts` | Anon SELECT on common tables |
| missing-security-headers | `security-headers.ts` | CSP / HSTS / framing / nosniff |
| cors-misconfiguration | `cors.ts` | Wildcard / reflected Origin |
| env-file-exposed | `env-file-exposed.ts` | Public `/.env*` |
| source-maps | `source-maps.ts` | Public `.map` with server hints |
| http-not-https | `https.ts` | HTTP + mixed content |
| admin-routes | `admin-routes.ts` | Unauth admin/dashboard paths |
| firebase-open-rules | `firebase-open-rules.ts` | Firestore REST with public config |
| supabase-rest-exposure | `supabase-rest-exposure.ts` | OpenAPI + `/rest/v1` |
| xss-probe | `xss-probe.ts` | Consent required |
| injection-probe | `injection-probe.ts` | Consent required |
| outdated-dependencies | `outdated-deps.ts` | Public GitHub `package.json` + OSV |

## Still deferred

- `client-only-auth.ts` — needs deeper static analysis / private repo access
- `idor.ts` — needs explicit test credentials

Platform priority: `platform-patterns.ts`

Rules: read-only by default, redact secrets, never fabricate findings.
