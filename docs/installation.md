# Installation, Uninstall, and LLM Prompts

[English](#english) | [简体中文](#简体中文)

## English

### Install From Source

```bash
git clone <your-fork-or-repo-url> cocos-asset-forge-mcp
cd cocos-asset-forge-mcp
npm install
npm run build
```

Choose a provider config preset and replace placeholders:

- `examples/config.fal.example.json`: recommended fal setup through inline `apiKey`.
- `examples/config.fal-rembg.example.json`: fal plus optional local segmentation fallback through `rembg`.
- `examples/config.huggingface.example.json`: Hugging Face image generation through inline `apiKey`.
- `examples/config.siliconflow.example.json`: SiliconFlow image generation through inline `apiKey`.
- `examples/config.modelscope.example.json`: ModelScope-style HTTP image endpoint through inline `apiKey`.

For fal, the recommended models are:

- Image: `fal-ai/flux-2-pro`
- SFX: `fal-ai/stable-audio-3/small/sfx/text-to-audio`
- Music: `fal-ai/stable-audio-3/small/music/text-to-audio`

You can put keys directly in the JSON config:

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

Alternatively, keep secrets out of JSON and use `apiKeyEnv` with `.env.local`:

```bash
FAL_KEY="your-fal-key"
```

Optional: install a local segmentation command for uncontrolled backgrounds. With Python `rembg` available on `PATH`, use `examples/config.fal-rembg.example.json` or add:

```json
{
  "cutout": {
    "backend": "auto",
    "command": "rembg",
    "args": ["i", "{input}", "{output}"]
  }
}
```

### MCP Client Config

Most MCP clients launch local servers over stdio. Use absolute paths:

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

For Codex, add this TOML block to `~/.codex/config.toml`:

```toml
[mcp_servers.cocos_asset_forge]
command = "node"
args = [
  "/absolute/path/to/cocos-asset-forge-mcp/dist/index.js",
  "--config",
  "/absolute/path/to/cocos-asset-forge-mcp/examples/config.fal.example.json"
]
startup_timeout_sec = 120
```

Restart the MCP client after changing its config.

To keep everything in one MCP client config file, pass inline server config with `--config-json`:

```toml
[mcp_servers.cocos_asset_forge]
command = "node"
args = [
  "/absolute/path/to/cocos-asset-forge-mcp/dist/index.js",
  "--config-json",
  "{\"imageProvider\":{\"kind\":\"fal-image\",\"name\":\"fal-flux-2-pro\",\"apiKey\":\"your-fal-key\",\"model\":\"fal-ai/flux-2-pro\"}}"
]
startup_timeout_sec = 120
```

<a id="llm-install-prompt"></a>

### LLM Install Prompt

Paste this prompt into your coding agent when you want it to install the MCP for you:

```text
Install the Cocos Asset Forge MCP server for this machine.

Repository path or URL:
<PASTE_REPO_URL_OR_LOCAL_PATH>

Requirements:
1. Clone or use the local repo.
2. Run npm install and npm run build.
3. Ask me which provider preset I want: fal, fal plus local rembg cutout, Hugging Face, SiliconFlow, or ModelScope.
4. Configure provider credentials in one of two ways:
   - If I explicitly provide a key outside chat or tell you it is already in a local config file, put it in the MCP server JSON config as apiKey.
   - Otherwise prefer apiKeyEnv and .env.local. Do not ask me to paste secrets into chat.
5. Configure my MCP client to launch:
   node /absolute/path/to/cocos-asset-forge-mcp/dist/index.js --config /absolute/path/to/cocos-asset-forge-mcp/examples/config.fal.example.json
6. If I ask for inline MCP configuration, use --config-json instead of --config.
7. Use the correct config format for my client. If the client is Codex, update ~/.codex/config.toml with [mcp_servers.cocos_asset_forge].
8. Verify the server by running an MCP initialize + tools/list smoke test.
9. Report the exact config block you added and whether the tools were listed successfully.

Do not overwrite unrelated MCP configuration. Back up any config file before editing.
```

<a id="llm-uninstall-prompt"></a>

### LLM Uninstall Prompt

```text
Uninstall the Cocos Asset Forge MCP server from my MCP client.

Requirements:
1. Find the MCP client config entry named cocos-asset-forge or cocos_asset_forge.
2. Back up the config file before editing.
3. Remove only the Cocos Asset Forge MCP entry.
4. Do not delete generated assets unless I explicitly ask.
5. If I confirm that I no longer need the repo, remove the local cocos-asset-forge-mcp directory.
6. Report what was removed and where the backup config was written.
```

### Manual Uninstall

1. Remove the MCP client entry named `cocos-asset-forge` or `cocos_asset_forge`.
2. Restart the MCP client.
3. Optional: remove `.env.local`, inline `apiKey`, or provider entries if they are only used by this project.
4. Optional: delete the local repo directory.
5. Optional: delete generated assets under `generated/`.

## 简体中文

### 从源码安装

```bash
git clone <your-fork-or-repo-url> cocos-asset-forge-mcp
cd cocos-asset-forge-mcp
npm install
npm run build
```

选择一个 provider 配置预设，并替换占位符：

- `examples/config.fal.example.json`: 推荐的 fal 配置，默认通过内联 `apiKey` 读取 key。
- `examples/config.fal-rembg.example.json`: fal 加可选本地 `rembg` 分割兜底。
- `examples/config.huggingface.example.json`: 通过内联 `apiKey` 使用 Hugging Face 生图。
- `examples/config.siliconflow.example.json`: 通过内联 `apiKey` 使用硅基流动生图。
- `examples/config.modelscope.example.json`: 通过内联 `apiKey` 使用魔搭风格 HTTP 图片 endpoint。

fal 推荐模型：

- 图片：`fal-ai/flux-2-pro`
- 音效：`fal-ai/stable-audio-3/small/sfx/text-to-audio`
- 音乐：`fal-ai/stable-audio-3/small/music/text-to-audio`

你可以把 key 直接写进 JSON 配置：

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

也可以继续把 key 放在 `.env.local`，然后用 `apiKeyEnv` 引用：

```bash
FAL_KEY="your-fal-key"
```

可选：为不可控背景安装本地分割命令。如果本机 `PATH` 里可以直接调用 Python `rembg`，可以使用 `examples/config.fal-rembg.example.json`，或添加：

```json
{
  "cutout": {
    "backend": "auto",
    "command": "rembg",
    "args": ["i", "{input}", "{output}"]
  }
}
```

### MCP 客户端配置

大多数 MCP 客户端通过 stdio 启动本地 server。请使用绝对路径：

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

Codex 可以把下面的 TOML 配置加到 `~/.codex/config.toml`：

```toml
[mcp_servers.cocos_asset_forge]
command = "node"
args = [
  "/absolute/path/to/cocos-asset-forge-mcp/dist/index.js",
  "--config",
  "/absolute/path/to/cocos-asset-forge-mcp/examples/config.fal.example.json"
]
startup_timeout_sec = 120
```

修改配置后需要重启 MCP 客户端。

如果想把 server 配置直接写进 MCP 客户端配置，可以使用 `--config-json`：

```toml
[mcp_servers.cocos_asset_forge]
command = "node"
args = [
  "/absolute/path/to/cocos-asset-forge-mcp/dist/index.js",
  "--config-json",
  "{\"imageProvider\":{\"kind\":\"fal-image\",\"name\":\"fal-flux-2-pro\",\"apiKey\":\"your-fal-key\",\"model\":\"fal-ai/flux-2-pro\"}}"
]
startup_timeout_sec = 120
```

<a id="给-llm-的安装-prompt"></a>

### 给 LLM 的安装 Prompt

当你希望编程 Agent 帮你安装时，可以把这段 prompt 粘给它：

```text
请帮我在这台机器上安装 Cocos Asset Forge MCP server。

仓库路径或 URL：
<PASTE_REPO_URL_OR_LOCAL_PATH>

要求：
1. 克隆仓库，或使用本地仓库。
2. 运行 npm install 和 npm run build。
3. 先问我要使用哪个 provider 预设：fal、fal 加本地 rembg 抠图、Hugging Face、硅基流动或魔搭。
4. 用下面两种方式之一配置 provider key：
   - 如果我明确说明 key 已经通过聊天外的方式提供，或已经在本地配置文件里，可以把它写进 MCP server JSON 配置的 apiKey。
   - 否则优先使用 apiKeyEnv 和 .env.local。不要让我在聊天里粘贴密钥。
5. 配置我的 MCP 客户端启动：
   node /absolute/path/to/cocos-asset-forge-mcp/dist/index.js --config /absolute/path/to/cocos-asset-forge-mcp/examples/config.fal.example.json
6. 如果我要求内联 MCP 配置，则使用 --config-json，而不是 --config。
7. 按我的客户端使用正确配置格式。如果客户端是 Codex，请更新 ~/.codex/config.toml，并添加 [mcp_servers.cocos_asset_forge]。
8. 通过 MCP initialize + tools/list 做冒烟测试。
9. 告诉我你添加的完整配置，以及 tools/list 是否成功。

不要覆盖无关 MCP 配置。编辑任何配置文件前先备份。
```

<a id="给-llm-的卸载-prompt"></a>

### 给 LLM 的卸载 Prompt

```text
请从我的 MCP 客户端卸载 Cocos Asset Forge MCP server。

要求：
1. 找到名为 cocos-asset-forge 或 cocos_asset_forge 的 MCP 客户端配置。
2. 编辑前先备份配置文件。
3. 只删除 Cocos Asset Forge MCP 相关配置。
4. 除非我明确要求，不要删除已生成素材。
5. 如果我确认不再需要仓库，再删除本地 cocos-asset-forge-mcp 目录。
6. 告诉我删除了什么，以及备份配置写到了哪里。
```

### 手动卸载

1. 删除 MCP 客户端里名为 `cocos-asset-forge` 或 `cocos_asset_forge` 的配置。
2. 重启 MCP 客户端。
3. 可选：如果只给本项目使用，删除 `.env.local`、内联 `apiKey` 或相关 provider 配置。
4. 可选：删除本地仓库目录。
5. 可选：删除 `generated/` 下的生成素材。
