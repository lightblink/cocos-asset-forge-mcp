---
name: cocos-asset-review-director
description: Review generated or imported Cocos Creator game assets against game design, art direction, animation requirements, alpha quality, orientation, mobile readability, collision fit, atlas readiness, and runtime import constraints. Use after asset generation or adaptation, before importing assets into gameplay, and whenever sprites, sprite sheets, VFX, UI art, or audio may not match the intended Cocos mini-game.
---

# Cocos Asset Review Director

## Overview

Use this skill to prevent generated assets from silently becoming gameplay defects. It reviews whether assets are usable for the specific game, not just whether the files exist or look attractive.

This skill coordinates with `cocos-art-direction-director` and `cocos-asset-pipeline-director`. Art direction defines the visual promise, asset pipeline generates and imports files, and this skill accepts, rejects, or requests targeted regeneration before implementation relies on them.

## Core Workflow

1. Recover the asset contract.
   - Identify the game genre, camera, orientation, design resolution, target runtime size, asset role, expected movement direction, and whether the asset is static, animated, VFX, UI, background, or audio.
   - If the asset contract is missing, write the smallest contract needed to review it instead of accepting the asset by taste.
2. Inspect the actual artifact.
   - Prefer visual inspection for PNG, sprite sheets, UI packs, and contact sheets.
   - Check metadata, dimensions, frame layout, file names, transparency, and project placement when available.
3. Judge design fit.
   - Verify the asset communicates the intended gameplay identity: player, enemy, hazard, reward, neutral prop, background, UI, or feedback effect.
   - For directional games, verify facing and motion semantics match the game coordinate system.
4. Judge runtime fitness.
   - Check mobile readability, alpha cleanliness, padding, atlas friendliness, collision fit, frame consistency, audio length, and package-size risk.
5. Decide and hand off.
   - Mark each asset as `accepted`, `accepted-with-notes`, `needs-adaptation`, `needs-regeneration`, or `rejected`.
   - Regenerate or adapt only the smallest failed unit when possible.

## Review Contract

For each asset or asset family, define:

- Role: player, enemy, boss, projectile, pickup, VFX, background, UI, audio, or other.
- Gameplay meaning: what the player must understand immediately.
- Camera and orientation: top-down, side, isometric, UI orthographic, and required facing direction.
- Runtime size: approximate on-screen size in the target device viewport.
- Motion requirement: static, loop, one-shot sequence, state sheet, VFX burst, or audio cue.
- Import target: Cocos folder, resource path, bundle, atlas, prefab, or scene property.
- Acceptance gates: role-specific checks that must pass before import or wiring.

## Directional Sprite Rules

For top-down vertical shooters:

- Player ship: nose points toward the top of the image; engines, exhaust, and tail are at the bottom.
- Enemy ship: nose, weapons, or threat direction point toward the bottom of the image unless the design says otherwise.
- Boss: weapon banks, warning markers, or attack direction must read as downward pressure on the player.
- Projectile and trail art must align with travel direction.
- A rear-view beauty render is not acceptable for a gameplay sprite if it makes the motion direction ambiguous.

For other games, write the equivalent rule from the camera and control model before judging.

## Animation Requirements

Do not treat animation as optional when it carries feedback, readability, or game feel.

Require sprite sheets, grid sheets, or state frames for:

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

- Background must be transparent and clean.
- The gameplay subject must not have unintended holes, broken alpha, or transparent noise.
- Transparent padding must be controlled and symmetric enough for atlas packing and pivots.
- Glow, exhaust, shadow, and particle edges must not inflate the logical collision area.
- The silhouette must remain readable at target in-game size.
- If the visible body is much smaller than the texture, adapt, trim, or regenerate.

## Mobile Readability Gates

Review at or near intended runtime size. Reject or regenerate when:

- player, enemy, hazard, and reward roles are not distinguishable in a quick glance
- important orientation cues disappear when scaled down
- UI art contains accidental text or unreadable generated lettering
- background contrast competes with bullets, pickups, or touch controls
- effects obscure hazards or make collision feel unfair

## Audio Gates

For SFX and music:

- Primary action, hit, reward, warning, failure, UI confirm, and result cues should be distinct.
- SFX should be short, normalized, and not fatiguing on mobile speakers.
- Music loops should match session intensity and loop cleanly.
- Audio files should be Cocos-ready candidates with known format, duration, and intended trigger.

## Output Format

For substantial reviews, return:

- Asset contract summary.
- Review table: asset, role, expected contract, result, issue, next action.
- Accepted paths and intended Cocos usage.
- Rejected or staged paths with exact regeneration or adaptation prompt changes.
- Unrun checks and why they were skipped.

## Quality Gates

- Asset role matches the game design.
- Direction and orientation match gameplay movement.
- Required animations are generated and inspected before runtime wiring.
- Alpha is clean and subject silhouettes are intact.
- Mobile thumbnail read passes for gameplay-critical assets.
- Collision and visual footprint are close enough for fair play.
- Sprite sheets preserve frame count, consistency, and playback intent.
- UI and audio are understandable in the first loop.
- Failed assets are not imported silently as production candidates.
