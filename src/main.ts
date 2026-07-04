import './style.css';
import { parse as parseYaml } from 'yaml';
import { issue, verify, countSeverities, meetsProfile, profileById, PROFILES, type Certificate } from './cert';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const val = (s: string) => ($(s) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
const setVal = (s: string, v: string) => { ($(s) as HTMLInputElement | HTMLTextAreaElement).value = v; };
const parseDoc = (t: string) => { const s = t.trim(); if (!s) throw new Error('empty'); try { return JSON.parse(s); } catch { return parseYaml(s); } };

let mode: 'issue' | 'verify' = 'issue';
let sampleApi = '', sampleRes = '';
let lastCert: Certificate | null = null;

init();
async function init() {
  $('#f-profile').innerHTML = PROFILES.map((p) => `<option value="${p.id}">${p.label} — ${p.desc}</option>`).join('');
  wire();
  try {
    [sampleApi, sampleRes] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}sample-openapi.json`).then((r) => r.text()),
      fetch(`${import.meta.env.BASE_URL}sample-spectral.json`).then((r) => r.text()),
    ]);
    setVal('#api-text', sampleApi); setVal('#res-text', sampleRes);
    await runIssue();
    // pre-issue a certificate so the Verify tab has something to check
    if (lastCert) { setVal('#cert-text', JSON.stringify(lastCert, null, 2)); setVal('#vapi-text', sampleApi); }
  } catch (e) { $('#report').innerHTML = `<div class="cov-error">Couldn't load samples. ${esc((e as Error).message)}</div>`; }
}

function wire() {
  document.querySelectorAll<HTMLButtonElement>('.tab').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('is-active'));
    t.classList.add('is-active');
    mode = t.dataset.mode as typeof mode;
    $('#issue-inputs').hidden = mode !== 'issue';
    $('#verify-inputs').hidden = mode !== 'verify';
    $('#action').textContent = mode === 'issue' ? 'Issue certificate ▸' : 'Verify ▸';
    run();
  }));
  $('#action').addEventListener('click', run);
  $('#load-sample').addEventListener('click', () => { setVal('#api-text', sampleApi); setVal('#res-text', sampleRes); if (mode === 'verify' && lastCert) { setVal('#cert-text', JSON.stringify(lastCert, null, 2)); setVal('#vapi-text', sampleApi); } run(); });
  const up = (btn: string, file: string, target: string) => { $(btn).addEventListener('click', () => $(file).click()); $(file).addEventListener('change', (e) => { const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => { setVal(target, String(r.result)); run(); }; r.readAsText(f); }); };
  up('#up-api', '#file-api', '#api-text'); up('#up-res', '#file-res', '#res-text');
  up('#up-cert', '#file-cert', '#cert-text'); up('#up-vapi', '#file-vapi', '#vapi-text');
  $('#engage-ae').addEventListener('click', () => { location.href = 'mailto:info@apievangelist.com?subject=' + encodeURIComponent('API governance certification'); });
  $('#nav-about').addEventListener('click', (e) => { e.preventDefault(); about(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('about-modal')?.remove(); });
}

function run() { (mode === 'issue' ? runIssue() : runVerify()).catch((e) => err(String(e?.message || e))); }
function err(msg: string) { $('#report').innerHTML = `<div class="cov-error">${esc(msg)}</div>`; }

async function runIssue() {
  let api: any, results: any;
  try { api = parseDoc(val('#api-text')); } catch { return err('Could not parse the API description.'); }
  try { results = JSON.parse(val('#res-text') || '[]'); if (!Array.isArray(results)) throw 0; } catch { return err('Spectral results must be a JSON array.'); }
  const cert = await issue(api, results, {
    ruleset: { id: val('#f-rid').trim() || 'unnamed', version: val('#f-rver').trim() || '0' },
    profile: val('#f-profile'), issuer: val('#f-issuer').trim(), validMonths: val('#f-valid') ? Number(val('#f-valid')) : null,
  });
  lastCert = cert;
  const counts = countSeverities(results);
  $('#status').innerHTML = `<b>${counts.errors}</b> err · <b>${counts.warnings}</b> warn · <b>${counts.info}</b> info · profile <b>${esc(profileById(cert.profile).label)}</b>: ${cert.passed ? '<b style="color:var(--ok)">pass</b>' : '<b style="color:var(--error)">fail</b>'}`;
  renderCert(cert, counts);
}

function renderCert(cert: Certificate, counts: ReturnType<typeof countSeverities>) {
  const prof = profileById(cert.profile);
  const met = PROFILES.map((p) => `<span class="prof ${meetsProfile(counts, p) ? 'met' : 'unmet'}">${meetsProfile(counts, p) ? '✓' : '·'} ${p.label}</span>`).join('');
  const apisjson = { type: 'Certification', name: `API Commons Governance Certificate — ${prof.label}`, url: 'https://your-host/governance-certificate.json', properties: [{ type: 'x-fingerprint', value: cert.fingerprint }] };
  $('#report').innerHTML = `
    <div class="cert-card">
      <div class="cert-head">
        <div class="cert-seal ${cert.passed ? '' : 'fail'}">${cert.passed ? '✓' : '✕'}</div>
        <div><h2>Governance Certificate</h2><div class="sub">${esc(cert.api.title)} ${esc(cert.api.version)}</div></div>
      </div>
      <dl class="cert-grid">
        <dt>Ruleset</dt><dd><code>${esc(cert.ruleset.id)}@${esc(cert.ruleset.version)}</code></dd>
        <dt>Profile</dt><dd>${esc(prof.label)} <span class="cert-badge ${cert.passed ? 'pass' : 'fail'}">${cert.passed ? 'passed' : 'not met'}</span> <span class="muted small">${esc(prof.desc)}</span></dd>
        <dt>Result</dt><dd class="sevrow"><span class="sevpill err">${counts.errors} errors</span><span class="sevpill warn">${counts.warnings} warnings</span><span class="sevpill info">${counts.info} info</span></dd>
        <dt>Issued</dt><dd>${esc(cert.issued)}</dd>
        <dt>Expires</dt><dd>${cert.expires ? esc(cert.expires) : '<span class="muted">no expiry</span>'}</dd>
        <dt>Issuer</dt><dd>${esc(cert.issuer)}</dd>
      </dl>
      <div class="muted small">Meets:</div><div class="profiles">${met}</div>
      <div class="muted small">Fingerprint <span class="muted">— SHA-256 of the API description + ruleset + profile</span></div>
      <div class="fp">${esc(cert.fingerprint)}</div>
    </div>
    ${cert.passed ? '' : `<p class="hint small" style="color:var(--warn)">This result does not meet the <b>${esc(prof.label)}</b> profile, so the certificate is marked <b>not met</b>. Pick a profile it satisfies above, or fix the flagged issues, then re-issue.</p>`}
    <div class="export-bar">
      <button class="measure-btn" id="dl-cert" type="button">Download certificate.json ↓</button>
      <button class="ghost-btn" id="copy-cert" type="button">Copy</button>
      <button class="ghost-btn" id="copy-apisjson" type="button">Copy APIs.json property</button>
      <span class="muted small">Host the certificate and reference it from your <code>apis.json</code>; anyone can re-verify it here.</span>
    </div>
    <details style="margin-top:.8rem"><summary class="muted small" style="cursor:pointer">APIs.json property</summary><div class="fp" style="white-space:pre-wrap">${esc(JSON.stringify(apisjson, null, 2))}</div></details>`;
  $('#dl-cert').addEventListener('click', () => download('governance-certificate.json', JSON.stringify(cert, null, 2)));
  $('#copy-cert').addEventListener('click', () => navigator.clipboard?.writeText(JSON.stringify(cert, null, 2)));
  $('#copy-apisjson').addEventListener('click', () => navigator.clipboard?.writeText(JSON.stringify(apisjson, null, 2)));
}

async function runVerify() {
  let cert: any, api: any;
  try { cert = JSON.parse(val('#cert-text')); } catch { return err('Could not parse the certificate JSON.'); }
  try { api = parseDoc(val('#vapi-text')); } catch { return err('Could not parse the API description.'); }
  const v = await verify(cert, api);
  const copy: Record<string, { icon: string; title: string; msg: string }> = {
    valid: { icon: '✓', title: 'Valid', msg: 'The fingerprint matches — this is exactly the API description that was certified, the profile passed, and the certificate has not expired.' },
    tampered: { icon: '✕', title: 'Tampered / mismatch', msg: 'The recomputed fingerprint does not match the certificate. The API description differs from the one that was certified (or the certificate was altered). Do not trust it.' },
    expired: { icon: '⌛', title: 'Expired', msg: 'The API description matches, but the certificate is past its expiry date. Ask the issuer to re-certify.' },
    'not-passed': { icon: '⚠', title: 'Not a passing certificate', msg: 'The fingerprint matches, but this certificate records a result that did not meet its profile — it does not attest conformance.' },
    malformed: { icon: '?', title: 'Malformed certificate', msg: 'This is not a recognizable API Commons governance certificate.' },
  };
  const c = copy[v.verdict];
  const cn = v.cert || {};
  $('#status').innerHTML = `verdict: <b style="color:${v.verdict === 'valid' ? 'var(--ok)' : v.verdict === 'tampered' || v.verdict === 'malformed' ? 'var(--error)' : 'var(--warn)'}">${v.verdict}</b>`;
  $('#report').innerHTML = `
    <div class="verdict ${v.verdict}">
      <div class="verdict-icon">${c.icon}</div>
      <div><h2>${esc(c.title)}</h2><p>${esc(c.msg)}</p></div>
    </div>
    ${v.verdict === 'malformed' ? '' : `<div class="cert-card"><div class="cert-head"><div><h2 style="font-size:1rem">${esc(cn.api?.title || 'API')} ${esc(cn.api?.version || '')}</h2><div class="sub">${esc(cn.ruleset?.id)}@${esc(cn.ruleset?.version)} · profile ${esc(profileById(cn.profile || '').label)} · issued ${esc(cn.issued || '?')}${cn.expires ? ' · expires ' + esc(cn.expires) + (v.daysLeft != null ? ` (${v.daysLeft}d)` : '') : ''}</div></div></div>
      <dl class="fp-cmp">
        <dt>Certificate says</dt><dd>${esc(cn.fingerprint || '—')}</dd>
        <dt>Recomputed</dt><dd class="${v.integrity ? 'fp-ok' : 'fp-bad'}">${esc(v.recomputed)} ${v.integrity ? '✓ match' : '✕ mismatch'}</dd>
      </dl></div>`}`;
}

function download(name: string, content: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

function about() {
  const el = document.createElement('div'); el.id = 'about-modal';
  el.innerHTML = `<div class="about-backdrop"></div><div class="about-card">
    <button class="detail-close" id="about-close">&times;</button>
    <h2>A certificate a consumer can actually trust</h2>
    <p>Most governance tooling faces the producer. This one faces the <strong>consumer</strong>: it answers "should I trust that this API meets a standard?" with a portable, verifiable artifact instead of a claim.</p>
    <p>A <strong>certificate</strong> attests that a specific API description passed a named <strong>ruleset</strong> at a <strong>profile</strong> threshold, on a date. Its <strong>fingerprint</strong> is a SHA-256 over the canonical API description plus the ruleset identity and profile — so anyone can recompute it from the API they hold. If the API has drifted by even one character, or the certificate was forged, the fingerprint won't match and verification fails.</p>
    <p>This is integrity, not identity: it proves <em>what</em> was certified, not <em>who</em> signed it (that would need keys). It composes with the rest of the stack — run the <a href="https://validator.apicommons.org" target="_blank" rel="noopener">Validator</a> to produce the result, certify it here, then reference the certificate from your <code>apis.json</code> so consumers can verify before they integrate.</p>
    <p class="muted small">Runs entirely in your browser. Nothing you paste leaves the page.</p>
  </div>`;
  document.body.appendChild(el);
  el.querySelector('#about-close')!.addEventListener('click', () => el.remove());
  el.querySelector('.about-backdrop')!.addEventListener('click', () => el.remove());
}
