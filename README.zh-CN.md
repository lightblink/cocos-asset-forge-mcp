# Cocos Asset Forge MCP

[English](./README.md) | 简体中文

![Cocos Asset Forge MCP 横幅图](./docs/assets/cocos-asset-forge-hero.webp)

[![Node.js >=20](https://img.shields.io/badge/node-%3E%3D20-339933)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-server-6f42c1)](https://modelcontextprotocol.io/)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

面向 Cocos Creator 游戏开发的 AI 素材生成与适配 MCP Server。它让 Claude、Codex、Qoder、Trae、Cursor 等编程 Agent 可以直接调用工具生成精灵图、序列帧、瓦片图、UI 素材、音效和音乐，并把模型输出自动处理成更适合 Cocos 导入的资源文件。

## 快速链接

- [安装](#安装)
- [MCP 客户端配置](#mcp-客户端配置)
- [给 LLM 的安装 Prompt](./docs/installation.md#给-llm-的安装-prompt)
- [卸载](#卸载)
- [生成策略](#生成策略)

## 亮点

- 面向 Cocos 的输出：透明 PNG、帧 manifest、`.plist` 图集元数据，以及适合 AudioClip 的 WAV/MP3/OGG。
- 一致性优先的动画流程：一次生成 3x3/4x3 contact sheet，切割成帧、清透明通道，再重新打包给 Cocos。
- Provider 抽象：离线可用 mock provider，生产可用 fal、Hugging Face、魔搭、硅基流动、OpenAI-compatible、通用 HTTP 和 ComfyUI 风格 workflow。
- 图片、音效、音乐分开选择模型，方便游戏团队按素材类型选择最合适的模型。
- MCP 原生工具接口，返回 JSON 报告，包含写出的文件、警告、Cocos 导入建议和下一步动作。

## 为什么需要它

AI 生成素材很有用，但模型原始输出通常不是可靠的游戏素材管线：

- 精灵图需要干净透明通道、稳定尺寸、可预测命名和可导入 PNG。
- 动画帧需要稳定顺序、固定帧尺寸、图集和帧坐标元数据。
- 人物一致性通常需要“一次生成九宫格/十二宫格 contact sheet，再切割”，而不是逐帧独立生成。
- 瓦片图需要网格打包和地图编辑器友好的元数据。
- 音频需要 Cocos 支持的格式、采样率/声道归一化，以及音效/循环音乐意图。
- 主编程 Agent 不应该理解每个模型 API 和每个 Cocos 导入细节。

Cocos Creator 支持从纹理创建 SpriteFrame、Auto Atlas、`.plist` 图集索引、AudioClip、TiledMap 资源和 AnimationClip 的 spriteFrame 轨道。Asset Forge 的目标是把 AI 输出整理成这些工作流更容易消费的文件和 manifest。

## 工具

| Tool | 说明 |
| --- | --- |
| `asset_forge_get_config` | 查看当前配置，并隐藏密钥状态。 |
| `asset_forge_plan_pack` | 为一个 Cocos 游戏生成可执行的素材清单。 |
| `asset_forge_generate_sprite` | 生成单个精灵图，并适配为透明 PNG。 |
| `asset_forge_generate_sprite_sheet` | 逐帧生成、导出单帧 PNG、打包图集并输出 `.plist` 和 manifest。 |
| `asset_forge_generate_sprite_grid_sheet` | 一次生成 3x3/4x3 contact sheet，切割、清透明通道、打包序列帧，适合角色一致性。 |
| `asset_forge_generate_tileset` | 生成瓦片并打包成网格 tileset。 |
| `asset_forge_generate_ui_pack` | 生成按钮、面板、图标、血条等 UI 精灵。 |
| `asset_forge_generate_sfx` | 生成并转码短音效为 Cocos AudioClip 可用文件。 |
| `asset_forge_generate_music_loop` | 生成并转码循环背景音乐。 |
| `asset_forge_adapt_image` | 把已有图片转换为 Cocos 可用透明 PNG。 |
| `asset_forge_adapt_audio` | 把已有音频转换为 Cocos 可用 AudioClip 文件。 |

## 安装

```bash
npm install
npm run build
```

本地开发运行：

```bash
npm run dev
```

运行构建后的 server：

```bash
node dist/index.js --config ./examples/config.example.json
```

完整安装说明、Codex 配置、给 LLM 的安装 prompt 和卸载 prompt 见 [docs/installation.md](./docs/installation.md)。

Provider key 可以通过 `apiKey` 直接写进 MCP server 配置，也可以继续通过 `apiKeyEnv` 读取 `.env.local` 或系统环境变量。直接写配置对本地 MCP 客户端更方便，但不要把真实 key 提交到仓库。

```json
{
  "imageProvider": {
    "kind": "fal-image",
    "name": "fal-flux-2-pro",
    "apiKey": "your-fal-key",
    "model": "fal-ai/flux-2-pro"
  }
}
```

也可以把配置作为 `--config-json` 直接放进 MCP 客户端配置：

```json
{
  "mcpServers": {
    "cocos-asset-forge": {
      "command": "node",
      "args": [
        "/absolute/path/to/cocos-asset-forge-mcp/dist/index.js",
        "--config-json",
        "{\"imageProvider\":{\"kind\":\"fal-image\",\"name\":\"fal-flux-2-pro\",\"apiKey\":\"your-fal-key\",\"model\":\"fal-ai/flux-2-pro\"}}"
      ]
    }
  }
}
```

## MCP 客户端配置

适用于通过 stdio 启动 MCP server 的客户端：

```json
{
  "mcpServers": {
    "cocos-asset-forge": {
      "command": "node",
      "args": [
        "/absolute/path/to/cocos-asset-forge-mcp/dist/index.js",
        "--config",
        "/absolute/path/to/cocos-asset-forge-mcp/examples/config.fal.example.json"
      ]
    }
  }
}
```

如果你希望让编程 Agent 帮你安装，可以使用 [给 LLM 的安装 Prompt](./docs/installation.md#给-llm-的安装-prompt)。

## 卸载

从 MCP 客户端配置里删除 `cocos-asset-forge` 或 `cocos_asset_forge` 条目，然后重启客户端。除非你已经不需要生成素材，否则不要删除 `generated/` 下的文件。

安全卸载步骤和给 LLM 的卸载 prompt 见 [docs/installation.md](./docs/installation.md#给-llm-的卸载-prompt)。

## Provider 配置

默认 provider 是 `mock`，所以没有外部 API key 也能离线跑通流程。真实项目应在 JSON 配置里指定图片、音频或 fal provider。

密钥读取优先级是：先读 `apiKey`，再读 `apiKeyEnv`，最后读 provider 默认环境变量，例如 `FAL_KEY`、`FAL_API_KEY`、`HF_TOKEN` 或 `HUGGINGFACE_API_KEY`。`asset_forge_get_config` 返回配置时会自动隐藏内联密钥。

```json
{
  "defaultOutputDir": "./generated/cocos-assets",
  "imageProvider": {
    "kind": "openai-compatible-image",
    "name": "my-image-provider",
    "baseUrl": "https://api.example.com",
    "apiKey": "replace-with-your-key",
    "model": "image-model-name"
  },
  "audioProvider": {
    "kind": "generic-http-audio",
    "name": "my-audio-provider",
    "baseUrl": "https://api.example.com/v1/audio/generate",
    "apiKey": "replace-with-your-key",
    "model": "audio-model-name",
    "responsePath": "data.0.b64_audio"
  }
}
```

支持的 provider 类型：

- `mock`: 离线、确定性的 PNG/WAV 生成，适合测试和 demo。
- `openai-compatible-image`: 调用 `/v1/images/generations`，期望返回 `b64_json` 或 `url`。
- `generic-http-image`: 通用 HTTP 图片 provider。
- `generic-http-audio`: 通用 HTTP 音频 provider。
- `fal-image`: 使用 `@fal-ai/client`，读取 `apiKey`、`apiKeyEnv`、`FAL_KEY` 或 `FAL_API_KEY`，默认 `fal-ai/flux-2-pro`。
- `fal-audio`: 使用 `@fal-ai/client`，按工具意图默认选择 Stable Audio 3 Small SFX 或 Music。
- `huggingface-image`: 调用 Hugging Face Inference text-to-image API，默认 `black-forest-labs/FLUX.1-dev`。
- `siliconflow-image`: 调用硅基流动 OpenAI-compatible 生图 endpoint，默认 `Kwai-Kolors/Kolors`。
- `modelscope-image`: 面向魔搭部署或网关的通用 HTTP 图片 provider，需要按你的 endpoint 配置 `baseUrl`、`model` 和 `responsePath`。
- `comfyui`: 当前按通用 HTTP 图片 endpoint 处理，可通过 `requestTemplate` 注入 workflow 参数。

Provider 示例：

- [examples/config.fal.example.json](./examples/config.fal.example.json)
- [examples/config.huggingface.example.json](./examples/config.huggingface.example.json)
- [examples/config.siliconflow.example.json](./examples/config.siliconflow.example.json)
- [examples/config.modelscope.example.json](./examples/config.modelscope.example.json)

fal 图片示例：

```json
{
  "imageProvider": {
    "kind": "fal-image",
    "name": "fal-flux-2-pro",
    "apiKey": "replace-with-your-fal-key",
    "model": "fal-ai/flux-2-pro"
  }
}
```

fal 音频示例：

```json
{
  "sfxProvider": {
    "kind": "fal-audio",
    "name": "fal-stable-audio-3-small-sfx",
    "apiKey": "replace-with-your-fal-key",
    "model": "fal-ai/stable-audio-3/small/sfx/text-to-audio"
  },
  "musicProvider": {
    "kind": "fal-audio",
    "name": "fal-stable-audio-3-small-music",
    "apiKey": "replace-with-your-fal-key",
    "model": "fal-ai/stable-audio-3/small/music/text-to-audio"
  }
}
```

## 生成策略

角色、敌人、多状态道具和短动画循环，优先使用 `asset_forge_generate_sprite_grid_sheet`。它会让图片模型一次生成固定网格 contact sheet，再按从左到右、从上到下切割。因为模型在同一张图里同时看到所有姿势，通常比逐帧独立生成更容易保持身份、服装、比例、视角和色板一致。

只有当 provider 不能稳定生成 contact sheet，或者每一帧需要完全不同提示词时，才优先用 `asset_forge_generate_sprite_sheet`。单个道具、占位图和静态元素使用 `asset_forge_generate_sprite`。

参考图工作流可以传 `referenceImagePath` 或 `referenceImageUrl`，并把 `imageProvider.model` 配置为 edit/image-to-image 能力的 fal 模型。纯 text-to-image 模型在传参考图时会被主动拒绝，避免调用方误以为一致性已生效。

推荐 fal 模型预设：

- 快速迭代精灵: `fal-ai/flux/schnell` 或快速 FLUX.2 变体。
- 高质量精灵/contact sheet: `fal-ai/flux-2-pro` 或 FLUX.2 flex/pro 变体。
- 参考图编辑与身份一致性: `fal-ai/qwen-image-2/edit`、`fal-ai/qwen-image-edit-2511` 或 `fal-ai/flux-2-pro/edit`。
- 音效: `fal-ai/stable-audio-3/small/sfx/text-to-audio`。
- 音乐循环: `fal-ai/stable-audio-3/small/music/text-to-audio`。
- 更垂直的短音效: 当 UI/战斗音效的精确度比音乐性更重要时，可以接入 CassetteAI 等专用 SFX provider。

## 输出协议

每个生成工具都会返回 JSON 文本：

- `files`: server 写出的绝对路径。
- `manifest`: 需要元数据时输出的 `.cocos-asset.json`。
- `warnings`: 调用方应展示的质量或导入注意事项。
- `cocos.importPath`: 尽可能推断的 Cocos 项目相对路径。
- `cocos.recommendedType`: 推荐导入类型，例如 SpriteFrame、SpriteAtlas、AudioClip、TiledMap texture。
- `cocos.notes`: 给调用 Agent 的下一步建议。

## 开发

```bash
npm run typecheck
npm test
npm run build
```

如果可用，音频转码会使用 `ffmpeg`。没有 `ffmpeg` 时，同格式音频可以复制，但格式转换需要 `ffmpeg`。

## 路线图

- Cocos Editor extension：根据 frame manifest 自动创建 `.anim` clips。
- ComfyUI workflow 提交与轮询。
- Replicate、Fal、Stability、ElevenLabs、Suno-like、本地模型 provider 包。
- 真正复制边缘像素的 texture extrusion。
- Tiled `.tsx` 生成和可选 `.tmx` starter map。
- 序列帧一致性视觉 QA 报告。

## 参考

- Cocos Creator Auto Atlas 会把图片序列打包成 sprite sheet，类似 TexturePacker: <https://docs.cocos.com/creator/3.8/manual/en/asset/auto-atlas.html>
- Cocos Creator Atlas 使用纹理和 `.plist` 等索引文件: <https://docs.cocos.com/creator/3.8/manual/en/asset/atlas.html>
- Cocos Creator 会把常见音频格式导入为 AudioClip: <https://docs.cocos.com/creator/3.8/manual/en/asset/audio.html>
- Cocos Creator TiledMap 资源使用 `.tmx`、`.png`，有时也会使用 `.tsx`: <https://docs.cocos.com/creator/3.8/manual/en/asset/tiledmap.html>
- SpriteFrame 动画轨道使用 `cc.Sprite.spriteFrame`: <https://docs.cocos.com/creator/3.8/manual/en/animation/edit-animation-clip.html>
- MCP TypeScript SDK 通过标准 transport 暴露 tools: <https://ts.sdk.modelcontextprotocol.io/>
