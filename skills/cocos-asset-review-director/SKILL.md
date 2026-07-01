---
name: cocos-asset-review-director
description: Review generated or imported Cocos Creator game assets against game design, art direction, gameplay semantics, animation needs, technical quality, mobile readability, interaction feedback, audio fit, performance risk, and runtime import constraints. Use after asset generation or adaptation, before importing assets into gameplay, and whenever sprites, sprite sheets, VFX, UI art, or audio may not match the intended Cocos mini-game.
---

# Cocos Asset Review Director

## Overview

Use this skill to prevent generated assets from silently becoming gameplay defects. It reviews whether assets are usable for the specific game, not just whether the files exist or look attractive.

This skill coordinates with `cocos-art-direction-director` and `cocos-asset-pipeline-director`. Art direction defines the visual promise, asset pipeline generates and imports files, and this skill accepts, rejects, or requests targeted regeneration before implementation relies on them.

## Review Philosophy

Review with guided judgment, not a rigid checklist. The skill should help Codex ask the right production questions while preserving room for creative choices, genre variation, stylization, and deliberate exceptions.

Use hard gates only for defects that clearly break the asset's job: corrupt files, wrong role, unusable transparency, unreadable gameplay-critical silhouettes, missing required frames, misleading feedback, broken import metadata, or runtime/package risks. Treat most other findings as contextual tradeoffs: accept, adapt, regenerate, or defer based on the current slice and design intent.

## Core Workflow

1. Recover the asset contract.
   - Identify the game genre, camera, design resolution, target runtime size, asset role, gameplay meaning, interaction context, style target, and whether the asset is static, animated, VFX, UI, background, or audio.
   - If the asset contract is missing, write the smallest contract needed to review it instead of accepting the asset by taste.
2. Inspect the actual artifact.
   - Prefer visual inspection for PNG, sprite sheets, UI packs, and contact sheets.
   - Check metadata, dimensions, frame layout, file names, transparency, and project placement when available.
3. Judge design fit.
   - Verify the asset communicates the intended gameplay identity: player, enemy, hazard, reward, neutral prop, background, UI, or feedback effect.
   - Check whether shape, color, value, motion, scale, material, faction language, and feedback meaning match the design and art direction.
4. Judge runtime fitness.
   - Check mobile readability, alpha cleanliness, padding, atlas friendliness, collision fit, frame consistency, audio length, import metadata, and package-size risk.
5. Decide and hand off.
   - Mark each asset as `accepted`, `accepted-with-notes`, `needs-adaptation`, `needs-regeneration`, or `rejected`.
   - Regenerate or adapt only the smallest failed unit when possible.

## Review Contract

For each asset or asset family, define:

- Role: player, enemy, boss, projectile, pickup, VFX, background, UI, audio, or other.
- Gameplay meaning: what the player must understand immediately.
- Camera and composition: top-down, side, isometric, UI orthographic, close-up, icon, background, or other.
- Semantic constraints: any required direction, faction identity, threat level, reward value, rarity, state, material, emotion, or interaction meaning.
- Runtime size: approximate on-screen size in the target device viewport.
- Motion requirement: static, loop, one-shot sequence, state sheet, VFX burst, or audio cue.
- Import target: Cocos folder, resource path, bundle, atlas, prefab, or scene property.
- Acceptance gates: role-specific checks that must pass before import or wiring.

## Review Dimensions

Use these dimensions as prompts for judgment. Not every asset needs every dimension, and an unusual but intentional design may pass when it still serves the game.

- Gameplay semantics: role, affordance, danger/reward meaning, state, faction, rarity, target priority, and interaction clarity.
- Composition and perspective: camera match, pose, crop, scale, visual center, empty space, and whether the asset reads correctly in the scene.
- Shape and silhouette: distinctive outline, readable proportions, no accidental ambiguity between player/enemy/hazard/reward.
- Color and value: contrast against background, color meaning, palette consistency, accessibility risk, and effect visibility.
- Style consistency: rendering method, line quality, lighting direction, material language, UI style, faction cohesion, and variant consistency.
- Animation and feedback: required states, frame consistency, timing implication, hit/reward/failure readability, and whether motion supports game feel.
- Technical integrity: alpha, padding, trimming, frame layout, metadata, pivots, atlas friendliness, compression risk, and Cocos import suitability.
- Runtime fairness: collision fit, visual footprint, warning clarity, effect occlusion, tap target clarity, and perceived hit accuracy.
- Audio fit: event meaning, loudness, length, fatigue risk, loop quality, and whether cues conflict with one another.
- Performance and package risk: texture size, frame count, duplicate variants, audio duration, first-package budget, and bundle placement.
- Compliance and originality: unwanted logos, watermarks, generated text artifacts, brand/IP confusion, or inappropriate visual references.

## Contextual Examples

Examples are guidance, not universal law. Apply them when they match the game contract, and rewrite the equivalent rule when the genre, camera, or art direction differs.

For top-down vertical shooters:

- Player ship usually reads best when its threat/forward direction points toward the top of the image and engines or exhaust sit behind it.
- Enemy ship usually reads best when its threat, weapons, or movement imply pressure toward the player.
- Boss art should communicate attack direction, weak points, warning areas, or encounter scale.
- Projectile, trail, and impact art should align with travel and damage semantics.
- A beauty render can pass only if it still reads clearly as a gameplay sprite at runtime scale.

For other games, write the equivalent rule from the camera and control model before judging.

## Animation Requirements

Do not treat animation as optional when it carries feedback, readability, or game feel.

Prefer sprite sheets, grid sheets, or state frames when animation carries essential meaning, such as:

- player thrust, charge, hit, shield, or death feedback
- enemy hit, death, spawn, attack tell, or elite state
- explosions, muzzle flashes, impact bursts, pickups, rewards, and warning markers
- UI button states, meter fills, cooldowns, result reveals, or power-ready states

For each animated asset, check:

- expected frame count, row/column layout, and frame order
- consistent facing direction, silhouette, pivot, scale, and padding
- no merged frames, cropped frames, accidental background, or identity drift
- loop suitability for loops and clear terminal frame for one-shots
- mobile readability at intended playback size

## Alpha And Silhouette Gates

For sprites, UI, and VFX with transparency:

- Background should be transparent and clean unless the asset contract calls for a background, shadow plate, or full-frame effect.
- The gameplay subject should not have unintended holes, broken alpha, or transparent noise.
- Transparent padding must be controlled and symmetric enough for atlas packing and pivots.
- Glow, exhaust, shadow, and particle edges must not inflate the logical collision area.
- The silhouette must remain readable at target in-game size.
- If the visible body is much smaller than the texture, adapt, trim, or regenerate.

## Mobile Readability Gates

Review at or near intended runtime size. Prefer adaptation or regeneration when:

- player, enemy, hazard, and reward roles are not distinguishable in a quick glance
- important orientation cues disappear when scaled down
- UI art contains accidental text or unreadable generated lettering
- background contrast competes with bullets, pickups, or touch controls
- effects obscure hazards or make collision feel unfair

## Decision Guidance

- Accept when the asset serves its gameplay role, fits the style, and has no blocking runtime issue.
- Accept with notes when imperfections are visible but do not block the current slice.
- Adapt when the core asset is good but needs trim, padding, alpha cleanup, scale adjustment, format conversion, or metadata fixes.
- Regenerate when the concept is right but the artifact violates semantics, style, readability, animation, or technical fitness.
- Reject when the asset would teach the wrong gameplay meaning, create unfairness, break import, or require more cleanup than a targeted retry.

When in doubt, state the tradeoff and preserve creative intent. Do not overfit one genre's examples into a universal rule.

## Audio Gates

For SFX and music:

- Primary action, hit, reward, warning, failure, UI confirm, and result cues should be distinct.
- SFX should be short, normalized, and not fatiguing on mobile speakers.
- Music loops should match session intensity and loop cleanly.
- Audio files should be Cocos-ready candidates with known format, duration, and intended trigger.

## Output Format

For substantial reviews, return:

- Asset contract summary.
- Review table: asset, role, key review dimensions, result, issue or tradeoff, next action.
- Accepted paths and intended Cocos usage.
- Rejected or staged paths with exact regeneration or adaptation prompt changes.
- Unrun checks and why they were skipped.

## Quality Gates

- Asset semantics match the game design and art direction.
- Gameplay-critical assets are readable at intended runtime scale.
- Required animation or feedback states are present, intentionally deferred, or called out as blockers.
- Technical integrity is good enough for Cocos import and runtime use.
- Collision, visual footprint, warning, and feedback feel fair to the player.
- UI and audio support the first loop without confusing the player.
- Performance, package, and bundle risks are visible before import.
- Failed assets are not imported silently as production candidates.
