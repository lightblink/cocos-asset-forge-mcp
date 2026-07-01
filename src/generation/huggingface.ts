import type { ProviderConfig } from "../config/schema.js";
import { resolveApiKey } from "./auth.js";
import { buildImageAssetPrompt } from "./prompt.js";
import type { BinaryAsset, ImageGenerationRequest, ImageProvider } from "./types.js";

export class HuggingFaceImageProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateImage(request: ImageGenerationRequest): Promise<BinaryAsset> {
    const model = this.config.model ?? "black-forest-labs/FLUX.1-dev";
    const endpoint = this.config.baseUrl ?? `https://api-inference.huggingface.co/models/${model}`;
    const apiKey = resolveApiKey(this.config, ["HF_TOKEN", "HUGGINGFACE_API_KEY"]);
    const template = this.config.requestTemplate ?? {};
    const response = await fetch(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...this.config.headers
      },
      body: JSON.stringify({
        ...withoutParameters(template),
        inputs: buildPrompt(request),
        parameters: {
          width: request.width,
          height: request.height,
          ...parametersFromTemplate(template)
        }
      })
    });

    const contentType = response.headers.get("content-type") ?? "image/png";
    if (!response.ok) {
      throw new Error(`Hugging Face image provider failed with ${response.status}: ${await response.text()}`);
    }
    if (contentType.includes("application/json")) {
      throw new Error(`Hugging Face image provider returned JSON instead of image bytes: ${await response.text()}`);
    }

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: contentType,
      extension: extensionFromMime(contentType),
      provider: this.config.name,
      model,
      prompt: request.prompt,
      seed: request.seed
    };
  }
}

function buildPrompt(request: ImageGenerationRequest): string {
  return buildImageAssetPrompt(request, "game sprite");
}

function parametersFromTemplate(template: Record<string, unknown>): Record<string, unknown> {
  const parameters = template.parameters;
  return parameters && typeof parameters === "object" && !Array.isArray(parameters)
    ? parameters as Record<string, unknown>
    : {};
}

function withoutParameters(template: Record<string, unknown>): Record<string, unknown> {
  const { parameters: _parameters, ...rest } = template;
  return rest;
}

function extensionFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}
