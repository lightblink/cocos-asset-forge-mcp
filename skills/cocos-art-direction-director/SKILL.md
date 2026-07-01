---
name: cocos-art-direction-director
description: Direct visual style, art bibles, asset consistency, prompt language, sprite readability, UI visual systems, animation style, and Cocos-ready asset QA for game art pipelines. Use before asset generation when Codex needs to define a coherent look, guide or critique generated assets, coordinate with cocos_asset_forge, prevent style drift, or prepare production-quality visual requirements for Cocos Creator and WeChat Mini Game projects.
---

# Cocos Art Direction Director

## Overview

Use this skill to turn visual intent into a coherent, Cocos-ready art direction that asset generation and implementation can follow. The skill should define style constraints, prompt language, asset acceptance criteria, and runtime readability rules.

This skill directs `cocos_asset_forge` and `cocos-asset-pipeline-director`; it does not replace them.

Art direction owns the art bible, style anchors, and visual acceptance criteria. The asset pipeline owns MCP tool selection, generation order, output paths, metadata preservation, and import verification.

## Core Workflow

1. Establish the art promise.
   - State genre, mood, camera, audience, platform, and production target.
   - Choose whether the first slice needs placeholder, style exploration, or production-candidate assets.
2. Create a compact art bible.
   - Define camera/view, proportions, silhouette language, line style, palette, lighting, material, UI style, animation feel, and negative constraints.
3. Map asset families.
   - Character, enemy, prop, VFX, background, tileset, UI, icon, audio cue, and typography needs.
   - Specify how families differ while staying in one visual system.
4. Produce generation prompts.
   - Write prompt components that can be reused by asset type.
   - Include Cocos runtime requirements: transparency, readable scale, padding, frame consistency, and atlas friendliness.
5. Review outputs.
   - Check silhouette, style match, palette, alpha, frame consistency, UI legibility, and in-scene scale.
   - Regenerate the smallest failed unit instead of the whole pack.
6. Hand off to implementation.
   - Provide accepted asset paths, intended scene usage, SpriteFrame/animation needs, UI assignments, and unresolved visual risks.

## Art Bible Format

For substantial tasks, return:

- Visual promise: one sentence.
- Camera and scale: top-down, side, isometric, UI orthographic, or other.
- Shape language: character and object proportions.
- Color system: dominant, accent, danger, reward, UI, and background colors.
- Value hierarchy: how gameplay-critical objects separate from scenery.
- Material and rendering: pixel, vector-like, painterly, low-poly, cel, or hybrid.
- UI style: panels, buttons, icons, meters, text rules.
- Motion style: snappy, squashy, weighty, floaty, restrained, or dramatic.
- Negative prompts: artifacts to avoid.
- Asset acceptance gates: objective checks before import.

## Asset Generation Guidance

- Use `cocos-asset-pipeline-director` for MCP generation and adaptation.
- Use transparent backgrounds for sprites, UI, and VFX unless the asset is a background or tile.
- Ask for clean silhouettes and readable details at target mobile size.
- Keep related characters, factions, icons, and UI elements on shared seeds or shared prompt anchors when supported.
- Prefer contact sheets, grid sheets, UI packs, or tilesets for related assets. Avoid one-by-one generation for packs of enemies, pickups, projectiles, props, icons, state frames, or VFX unless a single style anchor or targeted retry is needed.
- Avoid generated text inside UI art unless the text itself is the asset.
- Prefer a small coherent pack over many inconsistent one-offs.

## Generation Priority Handoff

When handing off to asset generation, prioritize:

1. Gameplay-critical placeholders that unblock scene assembly.
2. One style-anchor hero sprite or object that proves the visual direction.
3. Core enemy, hazard, pickup, and UI feedback assets used in the first loop.
4. Minimal HUD and result-state UI.
5. Tiles, backgrounds, decorations, and secondary animation.
6. Polish audio and visual variants after the loop, UX, and balance are validated.

## Theory Reference

Read `references/art-direction-foundations.md` when the task involves style discovery, visual hierarchy, prompt systems, animation style, or judging whether generated assets are good enough.

## Quality Gates

- The player can identify playable, dangerous, collectible, and decorative elements quickly.
- Assets in one family share proportions, palette, outline, and lighting.
- UI art remains legible on mobile screens.
- Sprites have usable alpha, padding, and scale.
- Animation frames preserve identity and orientation.
- Important sprites and UI pass a mobile thumbnail read before acceptance.
- Sprite sheets or contact sheets are visually inspected before frame consistency is accepted.
- Related assets are generated as coherent batched sheets or packs when practical, reducing cost and style drift versus many one-off images.
- First-package visual assets are limited to what is needed before the first playable frame.
- Generated assets are accepted, staged, or rejected explicitly.

## Output Standard

When completing an art-direction task, report:

- Art bible decisions.
- Prompt blocks or asset-generation requirements.
- Asset families and priority order.
- QA findings on generated or existing assets.
- Handoffs to asset generation, scene assembly, or UX.
