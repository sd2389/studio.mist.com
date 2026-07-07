# DevJewels Studio — Competitive Feature Ideas

**Captured:** 2026-07-07
**Context:** Brainstorm of features to leapfrog Gemora and adjacent players (Threekit, VNTANA, KeyShot, Picup Media). Grounded in the current stack: Next.js 16 + R3F/Three.js r184, FastAPI + Postgres, S3/R2 + CDN, Mediabunny MP4 muxing, existing features (upload, viewer, scene, render, render_jobs, variants, publish, billing, catalog, user_library, feature flags, `AI_BACKGROUND_MODE` SDXL hook).

**Strategic spine:** Gemora renders jewelry. DevJewels should *sell* jewelry — push every feature from "make a pretty picture" toward "close the sale": configure → price → try on → approve → list → advertise. That positioning requires a rebuild for competitors to follow.

**Recommended opening combo:** #1 + #2 + #3 (configurator, live pricing, listing packs). All three sit directly on top of slot materials, already spec'd in [.planning/research/gemora/PHASE-SPEC-slot-materials.md](research/gemora/PHASE-SPEC-slot-materials.md).

---

## Tier 1 — Money features (buildable now, direct kill shots)

### 1. Live configurator embed
Retailer drops one `<script>` tag; shopper picks metal/stone/size on the product page and sees photoreal 3D instantly. Threekit sells this for six figures via enterprise sales; DevJewels sells it self-serve on a credit card.
**Depends on:** slot-aware material swap (spec drafted), publish/embed feature.

### 2. Instant price engine
Mesh volume × metal density = weight × live gold/platinum spot price + stone carat estimate = manufacturing quote per variant, recalculated live as the shopper configures. No competitor does this in-browser.
**Depends on:** slot materials (to know which meshes are metal vs gem), geometry volume math, metals price API.

### 3. Marketplace listing pack
One click produces: white-background hero, 6 standard angles, 360 spin MP4/GIF, dimension diagram — each auto-sized to Amazon/Etsy/Shopify image specs. Jewelers currently pay Picup Media per image.
**Depends on:** render pipeline (exists), camera-preset templates, export sizing profiles.

### 4. Shopify app
Renders sync as product media; DevJewels variants map to Shopify variants; configurator embeds in the theme. Distribution channel + moat in one move.
**Depends on:** #1, #3, Shopify partner app (OAuth + Admin API).

### 5. AI lifestyle compositing
`AI_BACKGROUND_MODE=sdxl` hook already exists. Level up: render the piece with matched lighting, composite onto AI-generated hands/necks/scenes via ControlNet. "On-model photography without a photoshoot."
**Depends on:** GPU host, existing AI BG feature, lighting-match pass.

### 6. Batch render farm
Upload 200 CADs, apply one scene template, wake up to 200 finished listing packs. `render_jobs` backend feature already exists — this is queue + template application + progress UI.
**Depends on:** #3 templates, render_jobs queue hardening.

---

## Tier 2 — Category breakers (nobody in jewelry has these)

### 7. WebAR try-on
Ring on the shopper's actual hand via MediaPipe hand tracking; earrings via face tracking. Free adjacent win: USDZ export → iPhone QuickLook AR with zero code.

### 8. Auto slot detection
Gemora requires pre-tagged GLBs. DevJewels: heuristics/ML on raw STL/GLB geometry (refractive candidates, prong patterns, band topology) auto-tags `Gem 01` / `Metal 01` / `Heads`. Upload anything → configurable model. Removes the biggest onboarding friction in the category.

### 9. Path-traced beauty mode
Real-time preview stays R3F; "final render" runs progressive path tracing (WebGPU or server-side) with true diamond dispersion and fire. KeyShot quality, zero install.

### 10. Client proofing portal
Frame.io for jewelry: send a link, client drops comments pinned in 3D space on the model, approves variants. Kills the email-chain-of-screenshots workflow.

### 11. Digital twin microsite
Every piece gets a shareable page: 360, AR button, specs, care info + QR code for the physical display case. In-store shoppers scan the tag and spin the ring on their phone.
**Depends on:** publish feature (exists), #7 for AR button.

### 12. Engraving preview
Live text on the band, font picker, generated normal map. Small feature, big configurator upsell, absent from every competitor.

---

## Tier 3 — Steroids (the "why didn't we think of that" pile)

### 13. Sketch/photo-to-3D
Customer photo of an heirloom or a napkin sketch → approximate 3D concept model via gen-3D (Tripo/Rodin class). Custom-design leadgen machine for jewelers.

### 14. Gem grading simulator
Slider from D→J color, IF→SI clarity, rendered physically. Sales associates justify price differences visually; doubles as an SEO/education page.

### 15. Auto video ads
Templated TikTok/Reels: camera orbit, music, text overlays, price reveal. Mediabunny muxing already in the stack — this is camera-path templates + overlay compositor.

### 16. Multiplayer scene editing
Designer and client in the same 3D scene with live cursors. "Can you make it rose gold?" happens live on a sales call.

### 17. Necklace drape physics
Chains lie naturally on a virtual bust (XPBD chain sim) instead of floating rigid. Every competitor's necklace renders look dead without it.

### 18. Melee scatter brush
Paint pavé stones onto a surface — auto-spaced, auto-pronged.

### 19. Headless render API
`POST /v1/renders` with a GLB → listing pack back. Usage-billed (billing feature exists). Turns the studio into infrastructure other jewelry platforms build on.

### 20. Appraisal/insurance PDF
Renders + metal weight + stone specs + replacement value in a signed document template. Boring; jewelers need it monthly. Retention glue.

### 21. LLM product copy
Model metadata (metal, carats, style detected from geometry) → SEO product descriptions in 10 languages, bundled into the listing pack export.

### 22. Patina/wear slider
Brand-new vs 5-years-loved rendering. Emotional selling tool no renderer offers.

---

## Tier 4 — Industry blind spots (researched 2026-07; regulatory & market currents most jewelers haven't reacted to yet)

### 23. Digital Product Passport (DPP) compliance engine
EU is rolling out Digital Product Passports for product categories including jewelry, alongside G7 rules pushing digital tracking of diamonds and gold through supply chains. Every piece sold into the EU will need a digital identity: origin, certifications, material traceability. DevJewels already generates digital twins (#11) — extend them into DPP-compliant passports (QR/NFC-linked, origin + cert fields, ownership history). This is a *forced* purchase for jewelers — regulation sells it for us. First mover in jewelry tooling owns the category.
**Why now:** compliance deadlines create urgency no marketing feature can match.

### 24. Agentic commerce feed (UCP / ACP / MCP)
AI agents now shop on behalf of consumers: ChatGPT Instant Checkout (Stripe/OpenAI ACP) live since Sept 2025 with ~900M weekly users; Google launched UCP at NRF 2026 with Shopify, Etsy, Walmart, Target; Anthropic's MCP is the data-connectivity layer. McKinsey projects $900B–$1T US agentic-commerce revenue by 2030. Jewelry retailers have zero tooling for this. DevJewels exports agent-ready product data from what it already has — renders, variants, live configured pricing (#2), 3D/AR links — as UCP/ACP feeds plus an MCP server per catalog ("AI agents can browse, configure, and quote your jewelry"). Nobody in the jewelry-rendering space is even talking about this.
**Why now:** protocols just standardized (late 2025–early 2026); feed structures are settling; early integrations get outsized AI-search visibility.

### 25. Gram-budget design optimizer
Gold at record highs is pushing shoppers to lightweight designs and lower karat weights, squeezing jeweler margins. Tool: set a target retail price → engine computes allowable metal grams → suggests band-profile slimming, hollowing, or karat drop → renders the options side-by-side with live price deltas (builds on #2). "Design to a price point" — manufacturers and retailers both bleed money on this problem today.
**Why now:** metal-price pain is acute in 2025–2026; every gram saved is margin.

### 26. Lab-grown / natural dual-listing
Over half of new engagement rings now feature lab-created stones; LGD fashion inventory under $1,000 has tripled year-over-year. One model → two listings automatically: identical renders, LGD price vs natural price, visual "same look, $1,200 vs $4,000+" comparison module for the configurator. Also makes the batch pipeline (#6) the right tool for the exploding sub-$500 LGD volume segment.
**Why now:** retailers are actively restructuring inventory around LGD; tooling vacuum.

### 27. Live video consultation mode
High-AOV jewelry selling is shifting to live video consultation and short-form-video discovery. Presenter mode: clean full-screen studio view for screen share, instant variant switching, client-visible cursor, one-click "send this exact config" link after the call. Pairs with multiplayer editing (#16) but is simpler — one-way presenting first.
**Why now:** independent jewelers are adopting video consults post-2025 as foot traffic declines.

### 28. Resale & estate digitization kit
Resale is mainstream in 2026, and documented pieces resell at a premium while undocumented ones sell at a discount. Bundle: photo-to-3D (#13) + appraisal PDF (#20) + digital passport (#23) = "certify and list grandma's ring" workflow for estate buyers, pawn, and consignment platforms. A whole customer segment (resale platforms, estate jewelers) competitors ignore because they only serve new-piece manufacturers.
**Why now:** provenance documentation now directly moves resale price.

### 29. Melt-value trust badge
Jewelry is increasingly bought as wealth storage in volatile times. Digital twin shows a live "contains 8.2 g 18k gold — melt value $X today" badge, updated from spot prices (reuses #2's price feed). Turns transparency into a trust-based selling tool — jewelers holding price through trust rather than spot-price competition is the 2026 retail playbook. Also aligns with gold-savings-scheme markets (India/GCC).
**Why now:** record gold prices make intrinsic value a selling argument for the first time in decades.

### 30. WhatsApp-native B2B wholesale *(domain knowledge, not from cited research)*
Manufacturing hubs (Surat, Jaipur, Mumbai, Dubai) run wholesale over WhatsApp today — PDFs and photo dumps. WhatsApp Business API integration: send interactive 3D catalog links, buyer configures metal/stone in the browser, quote lands back in the thread. Massive underserved B2B channel invisible to Western competitors.

### 31. Hallmark/HUID linkage *(domain knowledge, not from cited research)*
India mandates HUID (Hallmark Unique ID) on gold jewelry. Link each digital twin to its HUID → scannable verification page tying the physical hallmark to the 3D twin, specs, and appraisal. Cheap feature, strong trust signal in the largest gold-jewelry market on earth.

### 32. AI-search-optimized twin pages
Discovery is shifting to AI search and short-form video. Bake Product + 3DModel structured data, provenance fields, and configurator deep-links into every twin microsite (#11) so AI search engines and shopping agents cite and link them. The microsites become the retailer's AI-search surface — content they could never build themselves.

### Research sources (Tier 4)
- [Loytee — European DPP: what jewelry owners need to know](https://loytee.com/blogs/sustainable-jewelry-manufacturing-blog/european-product-passports-epp-what-jewelry-business-owners-need-to-know)
- [TraceX — DPP implementation guide for 2026 compliance](https://tracextech.com/digital-product-passport-implementation-guide/)
- [Deloitte — Digital passports in luxury goods](https://www.deloittedigital.com/fr/en/insights/perspective/digital-passports-revolutionizing-transparency-and-traceability-in-luxury-goods.html)
- [Minespider — Diamond traceability & G7 rules](https://www.minespider.com/blog/diamonds-supply-chain-from-diamonds-discovery-to-g7-rules)
- [Immerss — Jewelry ecommerce trends 2026](https://www.immerss.live/content/jewelry-ecommerce-trends-2026/)
- [JCK — Jewelry retail 2025→2026 outlook](https://www.jckonline.com/article-long/jewelry-retail-in-2025-and-2026/)
- [Money — Diamond prices plunge as lab-grown surges](https://money.com/diamond-prices-plunge-lab-grown/)
- [Google — Agentic shopping era tools & UCP](https://blog.google/products/ads-commerce/agentic-commerce-ai-tools-protocol-retailers-platforms/)
- [og1o — UCP vs ACP vs MCP camps](https://www.og1o.com/en/resources/blog/agentic-commerce-three-camps-ucp-acp-mcp)
- [MetaRouter — Agentic commerce statistics 2026](https://www.metarouter.io/post/agentic-commerce-trends-statistics)

---

## Next actions

- Pick 1–3 items → run `/gsd:discuss-phase` or promote to ROADMAP.md phases.
- Tier 1 items #1–#3 share the slot-materials prerequisite — sequence that phase first.
