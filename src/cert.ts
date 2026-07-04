// The certificate model: count a lint result by severity, decide whether it meets
// a profile, and mint a tamper-evident certificate whose fingerprint is a SHA-256
// over the canonical API description + ruleset identity + profile. Verifying
// recomputes that fingerprint from the API you hold — so any drift in the API
// (or a forged certificate) fails the check. No signing keys; integrity only.

export interface SevCounts { errors: number; warnings: number; info: number; hints: number; total: number; }
export interface Profile { id: string; label: string; maxErrors: number; maxWarnings: number | null; maxInfo: number | null; desc: string; }

export const PROFILES: Profile[] = [
  { id: 'baseline', label: 'Baseline', maxErrors: 0, maxWarnings: null, maxInfo: null, desc: 'No errors. Warnings and info are permitted.' },
  { id: 'standard', label: 'Standard', maxErrors: 0, maxWarnings: 0, maxInfo: null, desc: 'No errors and no warnings.' },
  { id: 'strict', label: 'Strict', maxErrors: 0, maxWarnings: 0, maxInfo: 0, desc: 'Fully clean — no errors, warnings, or info.' },
];
export const profileById = (id: string) => PROFILES.find((p) => p.id === id) ?? PROFILES[0];

export interface Certificate {
  certificate: 'api-commons/governance-certificate';
  version: '0.1';
  api: { title: string; version: string };
  ruleset: { id: string; version: string };
  profile: string;
  result: SevCounts;
  passed: boolean;
  issued: string;
  expires: string | null;
  issuer: string;
  fingerprint: string;
}

export function countSeverities(results: any[]): SevCounts {
  const c: SevCounts = { errors: 0, warnings: 0, info: 0, hints: 0, total: 0 };
  for (const r of results || []) {
    const s = typeof r?.severity === 'number' ? r.severity : 1;
    if (s === 0) c.errors++; else if (s === 1) c.warnings++; else if (s === 2) c.info++; else c.hints++;
    c.total++;
  }
  return c;
}

export function meetsProfile(c: SevCounts, p: Profile): boolean {
  if (c.errors > p.maxErrors) return false;
  if (p.maxWarnings != null && c.warnings > p.maxWarnings) return false;
  if (p.maxInfo != null && c.info > p.maxInfo) return false;
  return true;
}

// Deterministic canonical JSON (sorted keys) so formatting never changes the hash.
export function canonicalize(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}

async function sha256Hex(str: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function fingerprint(api: any, ruleset: { id: string; version: string }, profile: string): Promise<string> {
  const material = canonicalize(api) + '|' + ruleset.id + '@' + ruleset.version + '|' + profile;
  return 'sha256:' + (await sha256Hex(material));
}

export interface IssueOpts { ruleset: { id: string; version: string }; profile: string; issuer: string; validMonths: number | null; today?: Date; }

export async function issue(api: any, results: any[], opts: IssueOpts): Promise<Certificate> {
  const counts = countSeverities(results);
  const profile = profileById(opts.profile);
  const passed = meetsProfile(counts, profile);
  const today = opts.today ?? new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  let expires: string | null = null;
  if (opts.validMonths) { const e = new Date(today); e.setMonth(e.getMonth() + opts.validMonths); expires = iso(e); }
  return {
    certificate: 'api-commons/governance-certificate', version: '0.1',
    api: { title: String(api?.info?.title ?? api?.title ?? 'Untitled API'), version: String(api?.info?.version ?? api?.version ?? '') },
    ruleset: opts.ruleset, profile: profile.id, result: counts, passed,
    issued: iso(today), expires, issuer: opts.issuer || 'self-attested',
    fingerprint: await fingerprint(api, opts.ruleset, profile.id),
  };
}

export type Verdict = 'valid' | 'tampered' | 'expired' | 'not-passed' | 'malformed';
export interface VerifyResult { verdict: Verdict; integrity: boolean; expired: boolean; recomputed: string; cert: Certificate; daysLeft: number | null; }

export async function verify(cert: Certificate, api: any, today = new Date()): Promise<VerifyResult> {
  if (!cert || cert.certificate !== 'api-commons/governance-certificate' || !cert.fingerprint || !cert.ruleset) {
    return { verdict: 'malformed', integrity: false, expired: false, recomputed: '', cert, daysLeft: null };
  }
  const recomputed = await fingerprint(api, cert.ruleset, cert.profile);
  const integrity = recomputed === cert.fingerprint;
  let daysLeft: number | null = null, expired = false;
  if (cert.expires) {
    const exp = new Date(cert.expires + 'T23:59:59');
    daysLeft = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
    expired = daysLeft < 0;
  }
  let verdict: Verdict = 'valid';
  if (!integrity) verdict = 'tampered';
  else if (!cert.passed) verdict = 'not-passed';
  else if (expired) verdict = 'expired';
  return { verdict, integrity, expired, recomputed, cert, daysLeft };
}
