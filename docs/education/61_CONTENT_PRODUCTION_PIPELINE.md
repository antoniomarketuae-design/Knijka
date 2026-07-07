# Content Production Pipeline

> Status: skeleton — 2026-07-07. Elevated to first-class system by analysis 56 §3.8 (risk R6, R10): the Law Expert AI is only as good as the content pipeline behind it.

## Scope of this document (to be developed)

- **Authoritative sources:** Закон за движението по пътищата (ЗДвП), implementing наредби (Наредба 37, 38 — training and exams **[verify current numbering]**), official sign catalog, ИААА exam specifications.
- **Structured content model:** every rule/sign/concept as versioned structured data (ID, legal citation, effective date, knowledge-graph links) — not prose buried in lesson text.
- **Human review loop:** who validates content (driving instructor / legal reviewer), how changes in law are detected and propagated to lessons, questions, and AI grounding.
- **AI grounding contract:** the AI Law Expert answers ONLY from retrieval over this content, always citing the provision; no free-recall legal answers. Hallucinated law is a product-killing defect.
- **Question bank strategy:** original questions mapped to knowledge-graph nodes (official state questions may be copyrighted **[verify]**); difficulty calibration from user data.
- **Localization architecture:** the same pipeline must later accept other countries' rule packs (multi-country vision) — country is a content dimension, not a code fork.
