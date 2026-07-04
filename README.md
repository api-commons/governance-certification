# API Governance Certification

A browser-first tool that **issues and verifies tamper-evident API governance
certificates**. A certificate attests that a specific API description passed a named
ruleset at a profile threshold, on a date — and its **SHA-256 fingerprint** lets any
consumer re-verify it against the API they hold. No backend, no accounts; runs entirely
in your browser. Live at
**[certification.apicommons.org](https://certification.apicommons.org)**.

Most governance tooling faces the producer. This one faces the **consumer**: it answers
"should I trust that this API meets a standard?" with a portable, verifiable artifact
instead of a claim.

Part of the [API Commons](https://apicommons.org/tools/) tools, alongside
[API Validator](https://github.com/api-commons/api-validator),
[Governance Coverage](https://github.com/api-commons/governance-coverage),
[Governance Waivers](https://github.com/api-commons/governance-waivers), and
[Spectral Reporter](https://github.com/api-commons/spectral-reporter).

## What a certificate is

```json
{
  "certificate": "api-commons/governance-certificate",
  "version": "0.1",
  "api": { "title": "Invoices API", "version": "1.4.0" },
  "ruleset": { "id": "api-commons/openapi", "version": "0.3.0" },
  "profile": "baseline",
  "result": { "errors": 0, "warnings": 3, "info": 3, "hints": 0, "total": 6 },
  "passed": true,
  "issued": "2026-07-04",
  "expires": "2027-07-04",
  "issuer": "self-attested",
  "fingerprint": "sha256:…"
}
```

The **fingerprint** is a SHA-256 over the *canonical* API description plus the ruleset
identity and profile. Because it's recomputable, verification is trustless: if the API has
drifted by even one character, or the certificate was forged, the recomputed fingerprint
won't match and the certificate fails. This is **integrity, not identity** — it proves
*what* was certified, not *who* signed it (that would need key management, a deliberate
follow-up).

## Profiles

A profile is the pass threshold the certificate attests to:

| Profile | Requires |
| --- | --- |
| **Baseline** | 0 errors (warnings and info permitted) |
| **Standard** | 0 errors and 0 warnings |
| **Strict** | fully clean — 0 errors, warnings, or info |

## Two modes

- **Issue** — paste the API description + its `spectral lint -f json` result, name the
  ruleset and pick a profile; if the result meets the profile, mint a certificate. Download
  it, copy it, or copy an `apis.json` property that references it.
- **Verify** — paste a certificate + the API description you hold; the tool recomputes the
  fingerprint and reports **valid**, **tampered / mismatch** (the API differs from what was
  certified), **expired**, or **not a passing certificate**.

It composes with the rest of the stack: run the
[Validator](https://validator.apicommons.org) to produce the result, certify it here, then
reference the certificate from your `apis.json` so consumers can verify before they
integrate.

## Develop

```bash
npm install
npm run dev
npm run build     # → dist/
```

Pure client-side; fingerprints use the Web Crypto API. No data build.

## Privacy

Everything runs client-side. The API descriptions, results, and certificates you paste
never leave the page — there is no server.

---

**Governance guidance** — the human *why* behind trust:
[Accountability](https://guidance.apievangelist.com/store/accountability/) and
[Provenance](https://guidance.apievangelist.com/store/provenance/) at
guidance.apievangelist.com.

A project of [API Evangelist](https://apievangelist.com), maintained openly under
[API Commons](https://apicommons.org). Free to fork; API Evangelist offers expert API
governance services — including standing up a certification program — when you want help.
Apache-2.0.
