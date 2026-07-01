---
name: cocos-asset-pipeline-director
description: Plan, generate, adapt, validate, and import Cocos Creator 3.x game assets through a configured Cocos Asset Forge-compatible MCP. Use whenever the user asks for Cocos assets, sprites, sprite sheets, tilesets, UI packs, effects, placeholders, art bibles, Cocos-ready metadata, asset folders, bundle placement, or mobile/web runtime asset QA.
---

# Cocos Asset Pipeline Director

## Overview

Use this skill to direct Cocos Creator asset work through a dedicated asset-generation MCP instead of treating generated art as loose files. The skill chooses the right asset pipeline, constrains prompts for game-runtime use, preserves generated metadata, and verifies that outputs are ready to import or wire into a Cocos project.

The skill is intentionally a pipeline layer, not a competing image model wrapper. If the configured MCP can produce or adapt the requested asset, use it first.

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

If one of these tools is unavailable, use the closest available MCP tool and clearly report the gap. Only use generic image generation, file downloads, or hand-authored placeholder assets when the MCP cannot satisfy the request or the user explicitly asks for another path.

## Core Workflow

1. Inspect configuration.
   - Call `asset_forge_get_config` before a non-trivial asset task.
   - Note the default output directory, Cocos version target, asset root, overwrite policy, and exposed providers.
2. Clarify the runtime job.
   - Identify whether the asset is a placeholder, production candidate, UI element, gameplay sprite, animation, tileset, effect, or imported external source.
   - Identify target platform constraints: mobile, web, mini-game, playable ad, desktop, or editor-only prototype.
3. Establish a compact art bible.
   - Capture camera/view, palette, outline style, rendering style, scale, silhouette rules, UI material, lighting, and negative prompts.
   - Reuse existing canonical assets when present instead of regenerating known characters or UI styles.
4. Select the MCP pipeline by runtime job.
5. Generate into the MCP output directory unless the user provides a project-specific output path.
6. Verify outputs before import.
7. Import or stage assets under Cocos-friendly project folders only when requested or clearly required by the task.
8. Report exact paths, tool choices, generation settings, and QA status.

## Tool Selection

| Runtime job | Preferred tool | Notes |
|---|---|---|
| Character, prop, pickup, icon, marker, static effect | `asset_forge_generate_sprite` | Request transparent background and mobile-readable silhouette. |
| Character animation, repeated state frames, short VFX burst | `asset_forge_generate_sprite_grid_sheet` | Prefer contact-sheet generation for consistency across frames. |
| Animation requiring separately generated frames | `asset_forge_generate_sprite_sheet` | Use when grid/contact-sheet output is unsuitable for the motion. |
| Terrain, modular map pieces, platform tiles, wall/floor/corner sets | `asset_forge_generate_tileset` | Specify tile size, tile count, and target camera scale. |
| HUD, buttons, panels, meters, cursors, badges, inventory/shop icons | `asset_forge_generate_ui_pack` | Avoid accidental text unless text is explicitly part of the asset. |
| User-provided or externally generated images | `asset_forge_adapt_image` | Use for alpha cleanup, trimming, padding, and Cocos-ready conversion. |

Only use audio generation if an audio MCP tool is actually exposed in the active tool list. If config mentions audio but no callable audio tools are available, list audio as pending instead of claiming it was generated.

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
- Sprite sheets have expected frame count, rows/columns, padding, and metadata.
- Animation frames keep stable proportions, facing direction, and readable action.
- Tilesets have consistent tile dimensions and enough modular pieces for the requested map use.
- UI packs are legible at mobile scale and do not contain accidental text.
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
