import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { forgeConfigSchema, type ForgeConfig } from "./schema.js";

export async function loadConfig(configPath?: string, inlineConfigJson?: string): Promise<ForgeConfig> {
  if (inlineConfigJson) {
    return parseConfig(JSON.parse(inlineConfigJson) as unknown);
  }

  const explicit = configPath ?? process.env.COCOS_ASSET_FORGE_CONFIG;
  if (!explicit) {
    return parseConfig({});
  }

  const fullPath = resolve(process.cwd(), explicit);
  const raw = await readFile(fullPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  return parseConfig(parsed);
}

export function parseConfig(value: unknown): ForgeConfig {
  return forgeConfigSchema.parse(value);
}

export function redactConfig(config: ForgeConfig): ForgeConfig {
  return {
    ...config,
    imageProvider: redactProvider(config.imageProvider),
    audioProvider: redactProvider(config.audioProvider),
    sfxProvider: config.sfxProvider ? redactProvider(config.sfxProvider) : undefined,
    musicProvider: config.musicProvider ? redactProvider(config.musicProvider) : undefined,
    videoProvider: config.videoProvider ? redactProvider(config.videoProvider) : undefined
  };
}

function redactProvider<T extends { apiKey?: string; apiKeyEnv?: string }>(provider: T): T {
  return {
    ...provider,
    apiKey: provider.apiKey ? "sk-...redacted" : undefined,
    apiKeyEnv: provider.apiKeyEnv ? `${provider.apiKeyEnv} (${process.env[provider.apiKeyEnv] ? "set" : "not set"})` : undefined
  };
}
