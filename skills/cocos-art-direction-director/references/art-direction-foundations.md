# Art Direction Foundations

Use this reference when visual quality depends on design judgment and consistency, not only generation capability.

## Visual Hierarchy

Gameplay readability usually comes from:

- silhouette contrast
- value contrast
- color coding
- motion priority
- scale and spacing
- outline or edge treatment
- reduced background noise

Gameplay-critical elements should be more readable than decorative scenery.

## Art Bible Building Blocks

- Camera: side, top-down, isometric, three-quarter, UI orthographic.
- Proportions: head size, limb length, weapon scale, enemy size tiers.
- Shape language: round for safe, angular for danger, square for stability, or project-specific rules.
- Palette: base colors, accents, rarity, danger, reward, neutral UI.
- Line and edge: no outline, soft outline, hard outline, pixel edge, painted edge.
- Lighting: flat, cel, soft directional, rim light, ambient.
- Material: toy-like, paper, metal, candy, stone, neon, fabric, or other.
- Animation feel: frame count, squash, anticipation, impact frames, loop cadence.

## Prompt System

Strong prompts include:

- target runtime use
- camera and scale
- subject and role
- shape language
- palette and material
- lighting
- background/alpha policy
- frame or atlas requirements
- negative constraints

Keep reusable style anchors stable across prompts. Change only the subject-specific clause when generating related assets.

## Reviewing Generated Art

Reject or revise when:

- the silhouette is unreadable at in-game size
- perspective differs from the scene camera
- lighting conflicts across related assets
- UI contains accidental text or fake labels
- sprite sheets change character identity between frames
- transparent padding wastes atlas space
- colors compete with danger/reward signals

## Mobile Readability

Test important assets at approximate phone scale. Details that vanish at gameplay size should not drive recognition. Use larger shapes, stronger value separation, and fewer tiny decorations for first-pass production.
