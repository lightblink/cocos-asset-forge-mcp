# Companion Codex Skills

This folder contains optional Codex skills that pair with Cocos Asset Forge MCP. The MCP server remains usable on its own; these skills add agent workflow guidance for Cocos-specific asset planning, generation, validation, and import decisions.

## Included Skills

- [`cocos-asset-pipeline-director`](./cocos-asset-pipeline-director): plans and validates Cocos Creator asset work through the `cocos_asset_forge` MCP tools.
- [`cocos-asset-review-director`](./cocos-asset-review-director): reviews generated Cocos assets for game-design fit, orientation, animation readiness, alpha quality, mobile readability, and import fitness before they are wired into gameplay.

## Install For Codex

```bash
mkdir -p ~/.codex/skills
cp -R skills/cocos-asset-pipeline-director ~/.codex/skills/
cp -R skills/cocos-asset-review-director ~/.codex/skills/
```

Restart Codex after installing or updating a skill.
