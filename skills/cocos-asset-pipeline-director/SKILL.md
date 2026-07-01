---
name: cocos-asset-pipeline-director
description: Plan, generate, adapt, validate, and import Cocos Creator 3.x game assets through a configured Cocos Asset Forge-compatible MCP. Use whenever the user asks for Cocos assets, sprites, sprite sheets, tilesets, UI packs, effects, placeholders, audio, art bibles, Cocos-ready metadata, asset folders, bundle placement, from-zero playable slices, or mobile/web runtime asset QA.
---

# Cocos Asset Pipeline Director

## Overview

Use this skill to direct Cocos Creator asset work through a dedicated asset-generation MCP instead of treating generated art as loose files. The skill chooses the right asset pipeline, constrains prompts for game-runtime use, preserves generated metadata, and verifies that outputs are ready to import or wire into a Cocos project.

The skill is intentionally a pipeline layer, not a competing image model wrapper. If the configured MCP can produce or adapt the requested asset, use it first.

Use `cocos-asset-review-director` after generation or adaptation when assets will be imported into gameplay, especially for player/enemy sprites, sprite sheets, VFX, UI packs, audio cues, directional or semantic art, or anything whose readability affects the first loop.

## Compatibility

Expected MCP capabilities:

- `asset_forge_get_config`
- `asset_forge_plan_pack`
- `asset_forge_generate_sprite`
- `asset_forge_generate_sprite_sheet`
- `asset_forge_generate_sprite_grid_sheet`
- `asset_forge_generate_tileset`
- `asset_forge_generate_ui_pack`
- `asset_forge_adapt_image`
- `asset_forge_generate_sfx`
- `asset_forge_generate_music_loop`
- `asset_forge_adapt_audio`

If one of these tools is unavailable, use the closest available MCP tool and clearly report the gap. Only use generic image generation, file downloads, or hand-authored placeholder assets when the MCP cannot satisfy the request or the user explicitly asks for another path.

## Core Workflow

1. Inspect configuration.
   - Call `asset_forge_get_config` before a non-trivial asset task.
   - Note the default output directory, Cocos version target, asset root, overwrite policy, and exposed providers.
2. Clarify the runtime job.
   - Identify whether the asset is a placeholder, production candidate, UI element, gameplay sprite, animation, tileset, effect, or imported external source.
   - Identify target platform constraints: mobile, web, mini-game, playable ad, desktop, or editor-only prototype.
   - For a from-zero playable slice, define the minimum asset pack before implementation starts: gameplay placeholders, UI/HUD art, feedback/VFX cues, SFX, and optional short music loop. If the slice intentionally uses engine geometry only, record that as a deliberate prototype constraint instead of silently skipping the asset pipeline.
   - Apply a batch-first cost policy for generated images: related sprites, states, VFX frames, icons, pickups, enemy variants, projectiles, and props should be generated as one or more grid/contact sheets and sliced into frames. Use one-by-one sprite generation only for a style anchor, a uniquely important hero asset, or a failed cell that cannot be adapted.
3. Establish a compact art bible.
   - Capture camera/view, palette, outline style, rendering style, scale, silhouette rules, UI material, lighting, and negative prompts.
   - Reuse existing canonical assets when present instead of regenerating known characters or UI styles.
4. Select the MCP pipeline by runtime job.
5. Generate into the MCP output directory unless the user provides a project-specific output path.
6. Review outputs before import.
   - For gameplay-critical sprites and VFX, apply an explicit asset contract: role, gameplay meaning, runtime size, motion requirement, style constraints, alpha policy, collision expectation, and import target.
   - Use `cocos-asset-review-director` for design fit, gameplay semantics, style consistency, animation readiness, alpha/silhouette issues, mobile thumbnail readability, collision fit, audio fit, and performance risk.
   - Do not import failed production-candidate assets silently. Adapt or regenerate the smallest failed unit.
7. Import or stage assets under Cocos-friendly project folders only when requested or clearly required by the task.
8. Report exact paths, tool choices, generation settings, review status, and any rejected or deferred assets.

## Tool Selection

| Runtime job | Preferred tool | Notes |
|---|---|---|
| Style anchor or uniquely important single hero sprite | `asset_forge_generate_sprite` | Use sparingly. This proves a look or fixes one failed asset, but should not be the default for packs. |
| Related static sprites, variants, props, pickups, projectiles, icons, state sets, or short VFX bursts | `asset_forge_generate_sprite_grid_sheet` | Batch into one contact sheet, slice cells, then review before import to reduce provider calls and cost. |
| Character animation, repeated state frames, short VFX burst | `asset_forge_generate_sprite_grid_sheet` | Prefer contact-sheet generation for consistency across frames and lower generation cost. |
| Animation requiring separately generated frames | `asset_forge_generate_sprite_sheet` | Use when grid/contact-sheet output is unsuitable for the motion. |
| Terrain, modular map pieces, platform tiles, wall/floor/corner sets | `asset_forge_generate_tileset` | Specify tile size, tile count, and target camera scale. |
| HUD, buttons, panels, meters, cursors, badges, inventory/shop icons | `asset_forge_generate_ui_pack` | Avoid accidental text unless text is explicitly part of the asset. |
| User-provided or externally generated images | `asset_forge_adapt_image` | Use for alpha cleanup, trimming, padding, and Cocos-ready conversion. |
| Clicks, drops, clears, hits, rewards, warnings, UI confirms, failure stingers | `asset_forge_generate_sfx` | Keep short, normalized, and mobile-safe. Prefer mono unless spatial feel matters. |
| Menu loop, gameplay bed, tension loop, result music | `asset_forge_generate_music_loop` | Request loop-ready output with fade and stable mood. Keep early prototypes short. |
| User-provided or externally sourced audio | `asset_forge_adapt_audio` | Use for format conversion, normalization, trimming, channel count, and loop prep. |

Only use audio generation or adaptation if the matching audio MCP tool is actually exposed in the active tool list. If configuration mentions audio but no callable audio tools are available, list audio as pending instead of claiming it was generated.

## From-Zero Slice Asset Minimum

For a new playable local game, do not default to geometry-only visuals unless the user explicitly asks for a logic-only prototype or the asset MCP is unavailable. Prepare the smallest useful pack:

- core gameplay sprites or placeholder tiles for player pieces, hazards, pickups, board cells, or equivalent interactables, batched into grid/contact sheets whenever multiple related visuals are needed
- required first-loop animated assets such as player thrust, hit/death feedback, explosion, pickup, warning, muzzle flash, or UI state frames when those cues carry readability or game feel
- minimal background or playfield frame when it improves readability
- HUD/UI elements needed for score, pause, restart, result, and primary actions
- immediate feedback VFX or sprite states for success, failure, hit, clear, reward, or invalid action
- SFX for primary action, reward/progress, error/failure, and UI confirm when audio tools are available
- a short optional music loop only after the first playable loop and UX are stable enough to judge mood

If any class is skipped, report the reason as one of: not needed for this mechanic, intentionally deferred, MCP unavailable, provider failed, or user requested no assets.

## Prompt Contract

For generated visual assets, include the following constraints unless they conflict with the user request:

- target use: Cocos Creator 3.x runtime asset
- output intent: sprite, sprite sheet, tileset, UI pack, VFX, or background
- background policy: transparent for sprites, UI, and effects; explicit non-transparent background only for backgrounds or tiles
- camera/view: front, side, top-down, isometric, three-quarter, or UI orthographic
- scale: readable at target in-game size
- style bible: palette, line quality, shading, material, and visual references
- atlas friendliness: clean silhouette, controlled padding, no unnecessary empty canvas
- negative constraints: no watermark, logo, poster text, labels, cropped limbs, merged frames, background clutter, or inconsistent proportions

For sprite sheets and grid sheets, also specify frame count, rows/columns when known, action name, full motion cycle, consistent facing direction, consistent proportions, and whether the first/last frame should loop.

Prefer stable seeds for related assets in the same character, faction, UI theme, tileset, or effect family.

## Batch-First Cost Policy

For AI image generation, the default should be "one generation produces many usable cells." Prefer grid/contact sheets for:

- first-loop sprite packs such as player, enemies, pickups, projectiles, hazards, and markers
- enemy or prop variants within one faction or biome
- UI icon sets, reward icons, item icons, and meter states
- VFX bursts, hit frames, warning markers, muzzle flashes, and pickup pulses
- character state sets and animation frames

Single-image generation is acceptable for a style anchor, a highly important hero asset, an external image adaptation, or a targeted retry of one failed cell. When using one-by-one generation for multiple related images, state the reason; otherwise batch and slice first.

For batched static packs, set the grid action to a pack intent such as `asset-pack`, `variant-pack`, `state-set`, `icon-pack`, `enemy-pack`, or `pickup-pack`, and describe the expected content of each cell in the prompt.

## Direction And Animation Contracts

When generating directional sprites, include explicit motion semantics in the prompt. For example, top-down vertical shooters should state whether the nose points to the top or bottom of the image, where engines sit, and which direction bullets or attacks travel.

When a game object needs feedback animation, request a sprite sheet or grid sheet during the first asset pass instead of accepting a single still image and hoping implementation can compensate. Typical first-loop animation contracts include:

- player: idle/thrust loop, hit flash or shield state, death burst
- enemy: hit state, death explosion, spawn or attack tell
- shooter VFX: muzzle flash, projectile trail, impact burst, warning marker
- rewards/UI: pickup pulse, meter fill, button press, power-ready state

If a still image is intentionally accepted for an animated role, report the tradeoff and the first animation asset to add before production QA.

## Cocos Project Placement

Prefer project-local directories that make import intent obvious:

- `assets/art/characters/` for player, enemy, NPC, and creature sprites.
- `assets/art/effects/` for impact, pickup, spell, trail, and UI feedback effects.
- `assets/art/tilesets/` for tile sheets and terrain modules.
- `assets/ui/` for HUD, menu, shop, inventory, button, and icon art.
- `assets/audio/sfx/` and `assets/audio/music/` only when audio files actually exist.
- `assets/bundles/<bundle-name>/...` for optional, remote, level-specific, or non-first-screen assets.

Keep generated source artifacts under `generated/cocos-assets` unless importing. When copying into `assets/`, avoid overwriting existing files unless the user asked for replacement. Preserve `.json` or atlas metadata next to the image when it defines frames or packing.

Do not claim assets are imported into Cocos unless files were actually copied into the project or references were actually updated. If the task stops at generation, call the output "generated" or "staged", not "imported".

## Import Heuristics

- Keep source-generation outputs separate from committed runtime assets until the user accepts them.
- Preserve metadata that defines frame rectangles, packing, pivots, or animation intent.
- Prefer bundle folders for optional, cosmetic, level-specific, seasonal, remote, or late-loaded assets.
- Prefer first-package placement only for assets required before the first playable frame.
- Keep naming stable and role-oriented: `<category>-<subject>-<state>` or `<subject>-<action>-<variant>`.
- Use lowercase, hyphenated names where practical for generated artifacts.

## Quality Gates

Before finalizing an asset task, verify the relevant gates and report any skipped checks:

- Output files exist at the generated or imported paths.
- PNG assets intended as sprites preserve transparency after postprocessing.
- Related generated images were batched into grid/contact sheets unless a style-anchor, hero-asset, provider-failure, or targeted-retry reason was reported.
- Gameplay-critical assets pass semantic fit, style consistency, alpha/silhouette, animation, mobile readability, audio/feedback, performance, and collision-fit review before import.
- Sprite sheets have expected frame count, rows/columns, padding, and metadata.
- Animation frames keep stable proportions, facing direction, and readable action.
- Tilesets have consistent tile dimensions and enough modular pieces for the requested map use.
- UI packs are legible at mobile scale and do not contain accidental text.
- Audio files import as Cocos-ready `AudioClip` candidates with appropriate format, sample rate, length, normalization, and loop handling.
- Assets are atlas-friendly: controlled transparent whitespace, clean edges, and consistent sizing.
- Names are stable and reflect role, subject, action, state, or variant.
- Imported assets are placed in the correct Cocos folder and do not overwrite unrelated files.

If visual inspection is possible and the output is user-facing, inspect at least the final contact sheet, atlas, or generated PNG before claiming visual quality.

## Performance Guardrails

Favor fewer, well-packed textures over many tiny loose sprites. Watch for oversized transparent PNGs, giant backgrounds, high-frame-count animations, repeated near-duplicate images, and UI elements that can increase draw calls.

For mobile, web, mini-game, and playable-ad targets:

- prefer smaller frame sizes until gameplay needs justify higher resolution
- keep loops short for early prototypes
- keep first-package assets minimal
- recommend bundles for late-loaded or optional content
- avoid regenerating full packs when one state, frame, or icon can be fixed surgically

Use placeholders early to unblock implementation, then regenerate production-quality assets after mechanics stabilize.

## Failure Handling

If generation fails, returns inconsistent art, or produces unusable metadata:

1. Keep the failed output path for diagnosis when available.
2. Tighten the prompt around the violated invariant: silhouette, transparency, frame count, perspective, or style.
3. Regenerate the smallest failed unit instead of the whole pack.
4. Use `asset_forge_adapt_image` for cleanup when the base image is acceptable but alpha, trim, or padding is wrong.
5. Report the failure and the next recommended retry rather than pretending the asset passed QA.

## Output Standard

When completing a task with this skill, return:

- Pipeline choice and rationale.
- Assets generated, adapted, staged, or imported.
- Exact output paths and, if applicable, Cocos project paths.
- MCP tools used and key settings: size, frame count, rows/columns, seed, style, and postprocessing.
- QA checks performed and issues found.
- Remaining Cocos Editor steps only when they are truly still required.
