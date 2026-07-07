# Risk Register

> Status: v1.0 — 2026-07-07. Living document; review at every horizon boundary and after every major decision. Severity/likelihood: H/M/L.

| ID | Risk | Sev | Lik | Mitigation | Owner/Doc |
|----|------|-----|-----|------------|-----------|
| R1 | **Scope death** — chasing AAA fidelity exhausts time/money before validation | H | H | Wedge strategy (H0→H1); fidelity funded only on proven learning value | 56 §3.1, 04 |
| R2 | **No market validation** — building years of product on untested demand | H | M | H0 ships in months and generates real payment signal | 58 |
| R3 | **AI serving costs exceed revenue per user** | H | M | Hybrid rule-engine + LLM architecture; cost model before commitments | 60, ai/20 |
| R4 | **EU AI Act / GDPR violation** (minors, emotion recognition, high-risk exam AI) | H | M | Legal review before designing affected features; performance proxies instead of biometrics | legal/49, 50 |
| R5 | **IP litigation** — car brands, Google Maps ToS, exam question copyright | H | M | Fictional vehicles; OSM/open data; original question bank; clearance review | 56 §3.3, legal/49 |
| R6 | **AI hallucinates Bulgarian law** — a single wrong legal answer destroys trust | H | M | Retrieval-grounded answers citing versioned, human-reviewed legal content only | 61, ai/20 |
| R7 | **Incumbent response** — cheap theory apps add AI features first | M | M | Move fast on H0; moat = knowledge graph + twin + sim integration they can't match | 41 |
| R8 | **Bulgarian market too small for B2C economics** | M | H | B2B (schools) as primary model; Bulgaria as playbook, not prize | 40, 59 |
| R9 | **Engine/tech lock-in** — wrong engine choice compounds for a decade | M | M | Formal tech evaluation (doc 06) with exit strategies; business logic engine-independent | 06, 07 |
| R10 | **Content rot** — laws/exam formats change, content goes stale | M | H | Versioned content pipeline with legal-source monitoring | 61 |
| R11 | **Solo-founder bus factor / burnout** | H | ? | Unknown until team question answered; docs-as-source-of-truth reduces knowledge loss | 56 §7 |
| R12 | **Efficacy claim fails** — sim training doesn't measurably improve pass rates | H | L | Design measurement from day one; if true, pivot value prop to convenience/cost/confidence | 62 |
| R13 | **Hardware barrier** — target students lack gaming PCs | M | M | Validate A4; consider browser/cloud delivery; mobile-first theory unaffected | 56 §4 |
| R14 | **Voice AI quality in Bulgarian** (STT/TTS) below product bar | M | M | Evaluate Bulgarian speech models early in H0 tutor; text fallback always available | ai/25 |
