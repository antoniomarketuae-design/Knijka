# Documentation Index — AI Driving Academy

> The `docs/` tree is the **source of truth** for this project. Code follows docs, never the reverse.
> Statuses: ✅ drafted · 🟡 skeleton (scoped, awaiting content) · ⚪ placeholder

## Start Here

| Doc | Status |
|---|---|
| [00 Product Vision](00_PRODUCT_VISION.md) — the organized founder vision (living blueprint) | ✅ |
| [01 North Star Principles](01_NORTH_STAR_PRINCIPLES.md) — decision rules & success metrics | ✅ |
| [56 Vision Analysis & Critique](56_VISION_ANALYSIS_AND_CRITIQUE.md) — co-founder analysis, wedge strategy, open questions | ✅ |
| [57 Risk Register](57_RISK_REGISTER.md) — living list of what can kill us | ✅ |
| [02 Product Strategy](02_PRODUCT_STRATEGY.md) · [03 Roadmap](03_PRODUCT_ROADMAP.md) · [04 MVP Scope](04_MVP_SCOPE.md) — blocked on founder answers (56 §7) | ⚪ |

## architecture/
05 System Architecture · 06 Tech Stack Evaluation · 07 ADRs · 08 Security · 09 Scalability & Infra · 10 Data · 11 API — all ⚪ (next after strategy layer)

## simulation/
12 Simulator Architecture · 13 Vehicle Systems · 14 Physics · 15 Traffic AI · 16 NPC Behavior · 17 World/Map System · 18 Weather & Environment · 19 VR & Hardware — all ⚪ (H1+ concerns; 17 needed early for map/data licensing research)

## ai/
20 AI System Architecture · 21 AI Instructor · 22 Driving Twin · 23 AI Memory · 24 Scenario Generator · 25 Dialogue & Voice · 26 Analytics · 27 Recommendations — all ⚪ (20 is on the critical path for H0)

## education/
28 Learning Engine · 29 Driving Knowledge Graph · 30 Adaptive Difficulty · 31 Bulgarian Driving Laws · 32 Examination System · 33 Assessment & Scoring — ⚪ · [61 Content Production Pipeline](education/61_CONTENT_PRODUCTION_PIPELINE.md) 🟡

## platform/
34 User Platform · 35 Profile & Progress · 36 Gamification · 37 Multiplayer · 38 Marketplace · 39 Mobile Companion — all ⚪ (37/38 are H3)

**UI/design surface (implemented):** [64 UI Visual Direction](platform/64_UI_VISUAL_DIRECTION.md) ✅ · [65 UI/UX Upgrade Plan](platform/65_UI_UX_UPGRADE_PLAN.md) ✅ · [75 Platform Audit V2](platform/75_PLATFORM_AUDIT_V2.md) ✅ · [83 Cluster Design Foundation](platform/83_CLUSTER_DESIGN_FOUNDATION.md) — the dark token ramp + depth/motion primitives ✅ · [84 Interior Class Layer](platform/84_INTERIOR_CLASS_LAYER.md) — the same lever one level up: rebinding `.card`/`.btn-*`/`.hud-panel` inside the cluster scope ✅ · [85 The Deck Backdrop](platform/85_THE_DECK_BACKDROP.md) — the layer *behind* the panels: the landing page's road at dusk, from the driver's seat, under a hard luminance ceiling ✅

## business/
40 Business Model · 41 Competitor Analysis · 42 Market Expansion · 43 Customer Segments · 44 Monetization — ⚪ · [58 Validation & Experiment Plan](business/58_VALIDATION_AND_EXPERIMENT_PLAN.md) 🟡 · [59 Go-To-Market](business/59_GO_TO_MARKET_STRATEGY.md) 🟡 · [60 Unit Economics & AI Cost Model](business/60_UNIT_ECONOMICS_AND_AI_COST_MODEL.md) 🟡

## research/
45 Educational Psychology · 46 Human Factors · 47 Simulation Industry · 48 Technology Trends — ⚪ · [62 Efficacy & Outcomes Measurement](research/62_EFFICACY_AND_OUTCOMES_MEASUREMENT.md) 🟡

## legal/
49 Compliance & Regulations · 50 Data Privacy & AI Ethics — ⚪ (⚠ EU AI Act + GDPR flags raised in 56 §3.5 — early legal attention required)

## development/
51 Development Plan · 52 Engineering Standards · 53 Testing Strategy · 54 Deployment · 55 Project Management — all ⚪ (last to be written; depend on everything above)

## Working Order

1. Founder answers open questions (56 §7) → ADRs
2. Research phase: 41, 31/49, 45–47, 06/17 (parallel)
3. Strategy layer: 02, 03, 04
4. Architecture foundation: 05, 06, 10, 11, 20 + ADRs in 07
5. Implementation planning: 51
