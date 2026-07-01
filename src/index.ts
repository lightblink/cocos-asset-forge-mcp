#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config/load.js";
import { createAudioProvider, createImageProvider } from "./generation/factory.js";
import { registerAssetTools } from "./tools/register.js";

const program = new Command()
  .name("cocos-asset-forge-mcp")
  .description("MCP server for generating Cocos Creator-ready game assets with configurable multimodal providers.")
  .option("-c, --config <path>", "Path to a JSON config file")
  .option("--config-json <json>", "Inline JSON config, useful when an MCP client stores server settings in its own config")
  .option("--stdio", "Run on stdio transport", true);

program.parse(process.argv);
const options = program.opts<{ config?: string; configJson?: string }>();

loadEnvironment(options.config);

const config = await loadConfig(options.config, options.configJson);
const server = new McpServer({
  name: "cocos-asset-forge-mcp",
  version: "0.1.0"
});

registerAssetTools(server, {
  config,
  imageProvider: createImageProvider(config.imageProvider),
  audioProvider: createAudioProvider(config.audioProvider),
  sfxProvider: createAudioProvider(config.sfxProvider ?? config.audioProvider),
  musicProvider: createAudioProvider(config.musicProvider ?? config.audioProvider)
});

await server.connect(new StdioServerTransport());

function loadEnvironment(configPath?: string): void {
  const distDir = dirname(fileURLToPath(import.meta.url));
  const packageRoot = resolve(distDir, "..");
  const configDir = configPath ? dirname(resolve(process.cwd(), configPath)) : undefined;
  const dirs = unique([process.cwd(), packageRoot, configDir]);

  for (const dir of dirs) {
    loadDotenv({ path: resolve(dir, ".env"), quiet: true });
    loadDotenv({ path: resolve(dir, ".env.local"), override: true, quiet: true });
  }
}

function unique(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}
