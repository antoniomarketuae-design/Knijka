# 08 — AI tools to accelerate 3D asset creation (2025–2026 landscape)

Research date: 2026-07-10. Lane: image→3D / text→3D services, AI texture generation,
AI skybox/HDRI, AI retopo — evaluated against OUR pipeline (headless Blender 5.1.2
procedural generators → GLB → gltf-transform Draco → instanced R3F rendering, 60fps
mid-range web target, ADR-005). Verdicts are "adopt now / adopt selectively / skip".

Companion docs: 01 root cause · 02 trim sheets/facades · 03 baking · 06 vehicle detail.

---

## 0. Executive verdicts (TL;DR table)

| Tool | Category | Verdict | Why (one line) |
|---|---|---|---|
| **Hyper3D Rodin** (integrated in our blender-mcp) | img/text→3D SaaS | **ADOPT — already have it** | Best-in-class fidelity + quad option; $0.40/gen via fal.ai; use for props & hero-vehicle base meshes, not finals |
| **Meshy** (esp. **Retexture API**) | img/text→3D + AI texturing SaaS | **ADOPT for retexturing** | Upload OUR existing Blender GLBs → PBR texture sets (albedo/rough/metal/normal); directly attacks the REF 5 "flat untextured" gap |
| **Tripo3D** | img/text→3D SaaS | Selective | Fastest iteration + best auto quad-retopo; good 2nd opinion for traffic-fleet base meshes |
| **Microsoft TRELLIS / TRELLIS.2** | open-source img→3D | Selective (cloud GPU) | MIT license, free, PBR GLB out — but 24 GB VRAM class and dense tri meshes needing decimation |
| **Hunyuan3D-2.x** | open-source img→3D | **SKIP — license blocks us** | Community license **excludes the European Union** from Territory; Bulgaria = EU. Legal dead end |
| **Stable-Fast-3D (SF3D)** | open-source img→3D | Skip | 0.5 s speed but low detail; community license fine (<$1M rev) yet quality below our bar even for props |
| **Luma Genie** | text→3D SaaS | Skip | Alive and funded, but mid quality vs Rodin/Meshy; no gap it uniquely fills |
| **Poly (withpoly.com)** | AI PBR textures | **ADOPT (free)** | Free seamless 8K PBR texture gen (color/normal/height/AO/rough/metal) — facade & ground material factory |
| **Polycam AI textures** | AI PBR textures | Backup | Same idea, up to 8K, paid; use if Poly quality disappoints |
| **DreamTextures Blender addon** | SD-in-Blender | Skip | Last release v0.4.1 (Aug 2024), GUI-oriented, no headless story — doesn't fit our headless Blender 5.1.2 pipeline |
| **SDXL/ComfyUI tiling texture pipeline** | AI textures (local) | Optional | Only if we outgrow Poly; tiling flag + Materialize/DeepBump for maps |
| **Blockade Labs Skybox AI** | AI 360° skybox/HDRI | Defer | $48/mo tier needed for real 32-bit HDRI; PolyHaven CC0 golden-hour HDRIs already cover the REF 1 lighting for free |
| **Tripo Smart Retopo / Rodin quad output** | AI retopo | Selective | Use at generation time; for static instanced assets tri topology is fine — decimate + gltf-transform is enough |

**The strategic insight:** REF 5 says our geometry/layout is fine and MATERIALS/TEXTURES/
LIGHTING are missing. Image→3D generators mostly solve the problem we *don't* have
(geometry) — the highest-leverage AI tools for us are the **texture-side** ones
(Poly free PBR materials, Meshy Retexture on our own kits) plus **Rodin (already wired)**
for the few genuinely hard meshes (boxy SUV hero interior parts, complex props).

---

## 1. Image→3D / Text→3D services

### 1.1 Hyper3D Rodin — ALREADY INTEGRATED (blender-mcp `generate_hyper3d_model_via_*`)

- **Quality**: consensus best visual fidelity / photorealism of the SaaS pack (Gen-2,
  10B params; Gen-2.5 claims geometry in ~4 s, 10M+ poly capable). Best choice when the
  target is "capture the reference photo's look".
- **Topology**: clean **quad-mesh option** + tri option; "High-Poly Quad" and 4K textures
  gated to the **Business plan ($120/mo)** on hyper3d.ai.
- **Pricing (two routes)**:
  - hyper3d.ai subscriptions: Free / Education $12 / Creator $24 / Business $120 per month;
    generation free, **pay-per-download ~$0.50–1.50 per model** (credit system). All paid
    plans grant full commercial rights.
  - **fal.ai API: $0.40 per generation** (HighPack = 3× for 4K textures + high-poly);
    quality tiers high/medium/low/extra-low; PBR or shaded; out: glb/usdz/fbx/obj/stl.
- **Licensing**: full commercial rights on paid plans — compatible with our B2C product.
- **For VEHICLES**: literature + practice warn single-image vehicle generation degrades
  wheels (symmetry loss, mesh distortion) and thin parts (mirrors, slats). Our own hero
  car (Aurelis GT-E) already followed the right recipe: **Rodin → voxel/manual rebuild in
  Blender**. Keep that: Rodin output = proportion/detail reference + bake source, the
  shipping mesh stays authored. For the REF 4 boxy SUV: generate from multiple curated
  renders (`via_images` mode takes several views) → rebuild → bake normal/AO from the
  Rodin mesh onto our low-poly (see doc 03).
- **For BUILDINGS**: wrong tool. Rodin returns a monolithic sculpt; towers need tileable
  facade systems + instancing (doc 02). Use it only for one-off street furniture
  (utility boxes, kiosk pavilion, ornate lamp head).
- Sources: [hyper3d.ai/pricing](https://hyper3d.ai/pricing) ·
  [fal.ai Rodin API](https://fal.ai/models/fal-ai/hyper3d/rodin) ·
  [costbench free-plan analysis](https://costbench.com/software/ai-3d-generation/rodin-hyper3d/free-plan/)

### 1.2 Meshy (v6 era)

- **Quality**: "most balanced, most production-mature" per multiple 2026 comparisons;
  Rodin beats it on raw fidelity, Meshy wins on workflow (topology controls, PBR maps,
  broad exports, reliable API).
- **Pricing**: Free / **Pro $20/mo (1,000 credits)** / Studio $60/mo / Enterprise.
  Full generation (model + texture) = 20 credits ⇒ ~50 full generations on Pro.
  API = separate pay-before-you-go credits, Pro tier and up.
- **Licensing**: paid plans → **you own the assets outright**; free plan outputs are
  CC BY 4.0 (attribution + public). For a commercial product: use a paid plan.
- **THE key feature for us — Retexture API** (`docs.meshy.ai/en/api/retexture`, also on
  fal as `meshy/v5/retexture`): upload OUR existing mesh (.glb/.obj/.fbx, via public URL
  for API) + a text prompt or a **reference image** (e.g. a REF 1 facade crop) → returns
  **PBR set: albedo, roughness, metallic, normal**, mapped onto our UVs. This is the only
  major SaaS that textures *your* mesh rather than only its own generations — it plugs
  straight into our "geometry exists, materials missing" gap: traffic fleet v1 cars,
  building kit boxes, street furniture.
- Caveat: retexture quality depends on our UV unwraps being sane (do the unwrap in the
  Blender generators first) and results need review — batch 3–4 variants, pick, bake down.
- Sources: [meshy.ai/pricing](https://www.meshy.ai/pricing) ·
  [Retexture API docs](https://docs.meshy.ai/en/api/retexture) ·
  [ownership help article](https://help.meshy.ai/en/articles/10000507-how-many-credits-does-each-generation-task-cost)

### 1.3 Tripo3D

- **Quality**: fastest of the pack; **best automatic quad retopology** ("Smart Retopo",
  P1 model line focused on clean low-poly quads for games). Fidelity a notch under Rodin.
- **Pricing**: Studio subscription + separate API billing; API generation on v3.x ≈ 20
  credits, +30 for detailed geometry, **+7.5 for quad remesh**. Free plan outputs are
  CC BY 4.0 and **not licensed for commercial use** — paid plan required for us.
- **Texturing**: has a Texture Model endpoint (`platform.tripo3d.ai/docs/texture`) but
  it primarily textures Tripo-generated geometry; Meshy claims Tripo can't retexture
  arbitrary uploads (vendor claim — verify before relying on it).
- **Fit**: candidate for the **traffic fleet v2** (10 distinct 1–3k-tri models): generate
  base mesh from our concept renders → Smart Retopo to ~2k quads → hand-fix wheels →
  Meshy-retexture or bake. Worth one $20-tier month as an experiment vs pure hand-authoring.
- Sources: [tripo3d.ai/pricing](https://www.tripo3d.ai/pricing) ·
  [API pricing docs](https://docs.tripo3d.ai/get-started/pricing.html) ·
  [retopo workspace](https://studio.tripo3d.ai/workspace/retopology/)

### 1.4 Microsoft TRELLIS / TRELLIS.2 (open source)

- **License: MIT** (deps nvdiffrast/nvdiffrec have own terms — rendering-time only, not
  shipped in assets). Genuinely free for commercial use, no territory games.
- **TRELLIS.2** (4B params, HF `microsoft/TRELLIS.2-4B`): image→3D with **PBR GLB output**
  (base color, roughness, metallic, opacity); resolutions 512³ (~3 s) / 1024³ (~17 s) /
  1536³ (~60 s on H100). **Needs ≥24 GB VRAM** (A100/H100/4090 class); original TRELLIS
  runs at 16 GB, fp16 forks down to ~8 GB but 1.0 quality < SaaS leaders.
- **Topology**: dense **triangulated** output; GLB export exposes `decimation_target`
  (default 1M tris!) — always needs decimate + retopo for our 1–3k-tri budgets.
- **Fit**: our workstation likely can't run TRELLIS.2 locally; rentable per-hour
  (Clore/RunPod ~$0.3–0.8/h for a 4090/A100) makes it the **zero-license-risk bulk prop
  generator** if SaaS credit costs ever bite. Not worth setup time during the 240h sprint
  while Rodin credits are cheap ($0.40/gen).
- Sources: [github.com/microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) ·
  [microsoft.github.io/TRELLIS.2](https://microsoft.github.io/TRELLIS.2/) ·
  [TRELLIS-BOX fp16 fork](https://github.com/off-by-some/TRELLIS-BOX)

### 1.5 Hunyuan3D-2 / 2.1 (Tencent, open source) — **LEGAL DEAD END FOR US**

- Verified in the actual LICENSE file of Hunyuan3D-2.1: *"Tencent Hunyuan 3D 2.1 Community
  License Agreement … THIS AGREEMENT DOES NOT APPLY IN THE EUROPEAN UNION, UNITED KINGDOM
  AND SOUTH KOREA"* — Territory is defined as **worldwide excluding EU/UK/South Korea**.
  Bulgaria is in the EU ⇒ we have **no license at all** to use the model or arguably its
  outputs in our product. Also: >1M MAU needs Tencent's discretionary grant; "Powered by
  Tencent Hunyuan" attribution required.
- Quality itself is strong (10 GB VRAM shape / 21 GB texture / 29 GB both; real PBR
  synthesis) — irrelevant given the territory clause. Note our blender-mcp addon exposes
  `generate_hunyuan3d_model` — **do not use it for production assets**.
- Source: [raw LICENSE](https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2.1/main/LICENSE) ·
  [repo](https://github.com/tencent-hunyuan/hunyuan3d-2.1)

### 1.6 Stable-Fast-3D (Stability AI) — skip

- Single image → UV-unwrapped textured mesh in **0.5 s**; predicts roughness/metallic;
  runs on modest GPUs. **Community license**: free commercial use under **$1M annual
  revenue** (we qualify), enterprise license above.
- But: it's a reconstruction model — detail level is "acceptable placeholder", visibly
  below Rodin/Meshy/TRELLIS.2, and vehicle wheels distort (documented in the DeepWheel
  benchmark). Nothing in our pipeline needs 0.5 s latency.
- Sources: [github.com/Stability-AI/stable-fast-3d](https://github.com/Stability-AI/stable-fast-3d) ·
  [HF model card](https://huggingface.co/stabilityai/stable-fast-3d)

### 1.7 Luma Genie — skip (but alive)

- Not discontinued: Luma raised a $900M Series C (Nov 2025); Genie still generates
  text/image→3D "in seconds". No 2026 comparison puts it above Rodin/Meshy/Tripo for
  hard-surface assets; adds nothing our stack lacks.
- Source: [lumalabs.ai](https://lumalabs.ai/) · [aiapps review](https://www.aiapps.com/items/genie-by-lumalabs/)

### Vehicles vs buildings — cross-tool reality check

- **Vehicles**: every single-image 3D generator struggles with wheel symmetry/roundness,
  thin chrome slats, mirror stalks, glass. Research (DeepWheel, RGM, DreamCar, arXiv
  2024–25) confirms this is a dataset-prior problem, not tool-specific. Workflow that
  works: AI mesh = *reference/blockout + bake source*; ship authored low-poly (this is
  exactly what we did for Aurelis GT-E — keep it for REF 4 SUV and fleet v2).
- **Buildings**: image→3D returns monolithic sculpts — useless for a 25–80-floor
  instanced tower kit needing 4 facade SYSTEMS (REF 1). Correct AI leverage is
  **texture-side**: AI-generate the facade *materials* (concrete grid, vertical strips,
  bronze curtain wall, horizontal bands) as tileable PBR sets → apply to our procedural
  Blender kit via trim sheets (doc 02). Meshy Retexture can additionally dress one-off
  podium/pavilion meshes.

---

## 2. AI texture generation

### 2.1 Poly — withpoly.com — **ADOPT NOW, free**

- Text/image prompt → **seamlessly tileable PBR texture** with **Color, Normal, Height,
  AO, Roughness, Metalness** maps, up to 8K (32-bit height on the $20/mo Infinity tier;
  base generation currently free with commercial use permitted).
- Exactly the facade/ground factory we need: "beige precast concrete panel grid, deep
  window reveals", "wet dark asphalt with faded lane paint", "large rectangular promenade
  pavers two-tone", "bronze reflective curtain-wall glass". Generate → downres to
  1–2K → pack into our trim-sheet atlases (doc 02), gltf-transform pipeline unchanged.
- Caveat: license terms are thin marketing-site prose, not a formal EULA — screenshot the
  license page when adopting; if it matters later, the $20 Infinity tier explicitly grants
  royalty-free commercial rights.
- Sources: [CG Channel coverage](https://www.cgchannel.com/2023/05/poly-lets-you-generate-8k-pbr-textures-from-text-prompts/) ·
  [withpoly.com](https://withpoly.com)

### 2.2 Polycam AI texture generator — backup

- Text→PBR up to 8K, full map set, paid tiers; comparable output. Use as second source
  if Poly's style range disappoints. (Polycam ≠ Poly/withpoly — different companies.)

### 2.3 Meshy Text-to-Texture / Retexture — the "texture OUR kits" hammer

- Covered in §1.2 — listed here because it's as much a texturing tool as a 3D generator.
  Highest-leverage single adoption of this whole document.

### 2.4 DreamTextures (Blender addon) — skip

- Last release **v0.4.1, Aug 2024**; built for interactive GUI use (Project Dream Texture
  = depth-to-image projection in the viewport). No headless/`blender -b` story — our
  generators run headless Blender 5.1.2, and the addon's UI-thread design + old
  SD 1.5/2.x-era models make it a poor fit. The *idea* (depth-conditioned projection
  texturing) is better served today by ComfyUI + controlnet-depth if ever needed.
- Source: [github.com/carson-katri/dream-textures](https://github.com/carson-katri/dream-textures)

### 2.5 Local SDXL tiling pipeline — optional, later

- Recipe (proven, e.g. cprimozic.net writeup): SDXL/ComfyUI with circular/tiling conv
  padding enabled → seamless albedo → derive normal/height/AO/rough via **Materialize**
  (free) or **DeepBump** (free Blender addon, ONNX, works headless) → 4K packs.
- Zero per-texture cost, fully private, but setup + prompt-wrangling time. Adopt only if
  Poly/Meshy can't hit the REF 1 material look or free tiers tighten.
- Sources: [SDXL 4K PBR notes](https://cprimozic.net/notes/posts/generating-textures-for-3d-using-stable-diffusion/) ·
  [gridstack seamless guide](https://www.getgridstack.ru/en/blog/stable-diffusion-seamless-textures-generation)

---

## 3. AI skybox / HDRI

### Blockade Labs Skybox AI — defer

- Product: text→360° 8–16K skybox; **true 32-bit HDRI export only on Standard $48/mo+**;
  API + Unity/Blender export on **Business $112/mo**; all paid plans full commercial,
  free tier is preview-only (no export). Credits: 100/$20 · 300/$48 · 500/$112 monthly.
- Reality check for OUR gap: REF 1's look is *lighting* (warm low sun, haze), delivered
  by the HDRI + sun DirLight + fog in three.js — **PolyHaven has dozens of CC0 golden-hour
  urban 4K HDRIs** (we already load `sky_urban_1k.hdr` via drei Environment, and the
  blender-mcp PolyHaven integration can fetch more). That's $0 and higher dynamic range
  than most AI skyboxes (AI panos often have clipped/painted suns → weak sun reflections
  on our wet asphalt).
- When Blockade DOES earn its fee: a custom **Sofia-skyline-with-Vitosha-mountain**
  backdrop pano that no stock HDRI has. Even then: generate 1 month of Standard ($48),
  export the 2–3 HDRIs we need, cancel. Not a subscription to hold.
- Sources: [skybox.blockadelabs.com/plans](https://skybox.blockadelabs.com/plans) ·
  [api-membership](https://skybox.blockadelabs.com/api-membership)

---

## 4. AI retopo / mesh optimization

- **Tripo Smart Retopo** (in Studio + API, ~7.5 credits/op): AI quad retopo tuned for
  game assets — the best "AI" entry; useful when we accept a generated mesh as the base.
- **Rodin quad output** (Business tier / HighPack): get quads at generation time instead
  of retopologizing after.
- **Non-AI tools that already win for our use case**: static, non-deforming, instanced
  assets don't need quad flow — they need **polycount + vertex-cache efficiency**:
  Blender Decimate (planar+collapse) in our headless generators, `gltf-transform
  simplify/weld/dedup` post-export (meshoptimizer under the hood). Exoside Quad Remesher
  ($109 one-time, Blender bridge, scriptable) only if we ever need clean quads for
  subdivision/bevel workflows on hero meshes.
- **MeshAnything / AutoRemesher / Instant Meshes**: research-grade or semi-maintained;
  none beats the Tripo/Decimate combo for our budgets. Skip.
- Verdict: no new adoption needed; use Rodin-quad or Tripo-retopo *at the source* when
  consuming AI meshes, keep everything else in the existing Blender+gltf-transform chain.

---

## 5. Concrete pipeline integration plan (adopt-now actions)

1. **This week (texture gap, ~$20)**: Meshy Pro 1 month → Retexture API over the existing
   building-kit GLBs + traffic fleet v1 with REF 1-style prompts/reference crops; in
   parallel generate the 4 facade systems + ground/asphalt/paver sets on Poly (free).
   Bake winners into trim-sheet atlases (docs 02/03). This attacks 80% of REF 5's verdict.
2. **REF 4 boxy SUV**: Rodin `via_images` (multi-view of de-badged concept renders,
   HighPack) → proportion reference + high-poly bake source → authored low-poly (same
   recipe as Aurelis GT-E). Budget ≈ $1.20–5 total.
3. **Traffic fleet v2 (10 models)**: A/B one vehicle: (a) pure Blender authoring vs
   (b) Tripo generate→Smart-Retopo→hand-fix wheels. Pick the faster path, batch the rest.
   Either way, final texturing via Meshy Retexture or baked trim sheet.
4. **HDRI**: pull 2–3 CC0 golden-hour urban 4K HDRIs from PolyHaven (blender-mcp tool
   exists) before spending on Blockade; revisit Blockade Standard for a one-month custom
   skyline pano later.
5. **Hard rules**: no Hunyuan3D for production (EU exclusion); free tiers of Meshy/Tripo
   are CC-BY/non-commercial — always generate production assets on a paid seat; keep an
   `ai_provenance` note per asset (tool, plan, date) for license hygiene.

Estimated total new spend for the sprint: **$20–70 one-off** (Meshy Pro month + Rodin
credits + optional Tripo month), zero new local infra.

---

## Sources (primary)

- Rodin: https://hyper3d.ai/pricing · https://fal.ai/models/fal-ai/hyper3d/rodin
- Meshy: https://www.meshy.ai/pricing · https://docs.meshy.ai/en/api/retexture · https://help.meshy.ai/en/articles/12062933-meshy-pricing-plans-free-pro-studio-enterprise
- Tripo: https://www.tripo3d.ai/pricing · https://docs.tripo3d.ai/get-started/pricing.html · https://platform.tripo3d.ai/docs/texture
- TRELLIS.2: https://github.com/microsoft/TRELLIS.2 · https://huggingface.co/microsoft/TRELLIS.2-4B
- Hunyuan3D-2.1 license (EU exclusion verified): https://raw.githubusercontent.com/Tencent-Hunyuan/Hunyuan3D-2.1/main/LICENSE
- SF3D: https://github.com/Stability-AI/stable-fast-3d · https://huggingface.co/stabilityai/stable-fast-3d
- Luma: https://lumalabs.ai/ · https://lumalabs.ai/series-b
- Poly textures: https://www.cgchannel.com/2023/05/poly-lets-you-generate-8k-pbr-textures-from-text-prompts/
- Blockade Labs: https://skybox.blockadelabs.com/plans · https://skybox.blockadelabs.com/api-membership
- DreamTextures: https://github.com/carson-katri/dream-textures
- Vehicle-generation failure modes: https://arxiv.org/html/2504.11347v1 (DeepWheel) · https://arxiv.org/pdf/2410.08181 (RGM) · https://arxiv.org/pdf/2407.16988 (DreamCar)
- 2026 comparisons: https://visiomake.com/en/blog/best-ai-image-to-3d-tools-2026-comparison-archviz · https://www.meshy.ai/blog/best-ai-tools-for-3d-printing
