# atlas: deterministic 2D city map generator

You own this box. You build only what lives in this repo.

## Context (general, do not expand it)
This repo is one isolated layer of a larger build: a seeded, deterministic city world that ends as a playable 3D game (map, buildings, transit, NPCs, quests). Nine layers are built in parallel by separate sessions, each locked to its own repo, coupled only through CONTRACT.md files. Never read another layer's code or tests, only its CONTRACT.md. Your raw requirements are in docs/REQUIREMENTS.md, in the user's own words: they win over any summary here.

## Scope
- From a seed plus parameters, generate the full 2D city plan: districts, street hierarchy (streets, roads, highways) with real widths and sidewalks, buildable parcels typed (residential, hotel, offices, corpo, hospital/clinic, police/military, factory, commerce, mall, restaurant, coffee shop) with quality tier (poor, mid, rich, high rich), transit placement (bus stops and routes, train and subway stations and lines).
- City shape is irregular: curved edges, angled cuts, circular parts, road-like cuts, plus some normal rectangular blocks. Never a plain grid, never a perfect square.
- Zone ratios grounded in real urban statistics: residents per hospital, per police station, per commerce, district sizes, street widths. Research gives the numbers, the generator applies them.
- Output is a typed JSON blueprint (the world state): placeholders only, no names. Include per-parcel 3D envelope data (footprint polygon, allowed height range) so 3D layers downstream can consume it, plus a low poly volumetric representation of the whole city for map previews.
- Fully parametric and era-agnostic: max floors global or per district, highways on/off, air or underground tunnels on/off, subways on/off, size, district count ranges.
- Preview tool: 2D plane with pan and zoom, color legend per type and tier (e.g. light blue poor residential, strong blue rich), layer toggles (streets only, transit only, zones only).

## Out of scope
No 3D geometry, no building shapes, no interiors, no NPC logic, no naming, no materials. Placeholders and topology only.

## Consumers (they read your CONTRACT.md)
../connections, ../exterior, ../simulation, ../naming, ../engine

## Working order
1. Deep research first: spin up research agents on the 2026 state of the art for procedural city layout (street graph generation, parcel subdivision, zoning ratios, real district and street dimensions). Save compact conclusions to docs/RESEARCH.md.
2. Draft CONTRACT.md with schemas before code: dependent layers are blocked on it.
3. Implement with tests and the preview.
4. Keep CONTRACT.md and docs/INDEX.md current with every change.

## Hard requirements
- Deterministic: same seed and params give identical output. No LLM calls inside generation. Generation is near instant.
- Standalone: runs and previews with no other layer present.
- Coherence invariants: every parcel reachable by street, every sidewalk continuous, every station connected to its network, NPC walk lines and car path lines always make sense.
- Preview UI follows src/ui/ with views/, widgets/, components/.

## Coordination
- Read docs/FEEDBACK.md at the start of every session: the orchestrator writes corrections there.
- Write blockers and cross-layer questions to docs/ISSUES.md: the orchestrator reads it.

## Master requirements (background only)
docs/FULL-REQUIREMENTS.md holds the user's complete raw requirements for the whole project, so you see your surroundings. Read it once for awareness. It never widens your scope: what you build is defined by this file and docs/REQUIREMENTS.md only.
