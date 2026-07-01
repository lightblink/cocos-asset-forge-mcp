import type { ProviderConfig } from "../config/schema.js";

export function resolveApiKey(config: ProviderConfig, fallbackEnvNames: string[] = []): string | undefined {
  if (config.apiKey) return config.apiKey;
  if (config.apiKeyEnv && process.env[config.apiKeyEnv]) return process.env[config.apiKeyEnv];
  for (const envName of fallbackEnvNames) {
    if (process.env[envName]) return process.env[envName];
  }
  return undefined;
}
