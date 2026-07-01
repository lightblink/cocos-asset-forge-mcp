import type {
  AudioGenerationRequest,
  AudioProvider,
  BinaryAsset,
  ImageGenerationRequest,
  ImageProvider
} from "./types.js";
import type { ProviderConfig } from "../config/schema.js";
import { resolveApiKey } from "./auth.js";
import { buildImageAssetPrompt } from "./prompt.js";

export class OpenAICompatibleImageProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateImage(request: ImageGenerationRequest): Promise<BinaryAsset> {
    if (!this.config.baseUrl) throw new Error("imageProvider.baseUrl is required");
    const apiKey = resolveApiKey(this.config);
    const response = await fetch(new URL("/v1/images/generations", this.config.baseUrl), {
      method: "POST",
      signal: AbortSignal.timeout(this.config.timeoutMs),
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
        ...this.config.headers
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt: buildImagePrompt(request),
        n: 1,
        size: `${request.width}x${request.height}`,
        response_format: "b64_json"
      })
    });

    if (!response.ok) {
      throw new Error(`Image provider failed with ${response.status}: ${await response.text()}`);
    }

    const json = (await response.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const item = json.data?.[0];
    if (!item) throw new Error("Image provider returned no data");
    const bytes = item.b64_json
      ? Buffer.from(item.b64_json, "base64")
      : await downloadToBuffer(assertUrl(item.url));

    return {
      bytes,
      mimeType: "image/png",
      extension: "png",
      provider: this.config.name,
      model: this.config.model,
      prompt: request.prompt,
      seed: request.seed
    };
  }
}

export class GenericHttpImageProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateImage(request: ImageGenerationRequest): Promise<BinaryAsset> {
    return postGenericBinary(this.config, {
      prompt: buildImagePrompt(request),
      negative_prompt: request.negativePrompt,
      width: request.width,
      height: request.height,
      style: request.style,
      seed: request.seed,
      transparent_background: request.background === "transparent" || request.transparentBackground,
      background: request.background,
      chroma_key_color: request.chromaKeyColor
    }, "image/png", "png", request.prompt);
  }
}

export class GenericHttpAudioProvider implements AudioProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateAudio(request: AudioGenerationRequest): Promise<BinaryAsset> {
    return postGenericBinary(this.config, {
      prompt: request.prompt,
      duration_seconds: request.durationSeconds,
      loop: request.loop,
      style: request.style,
      seed: request.seed
    }, "audio/wav", "wav", request.prompt);
  }
}

async function postGenericBinary(
  config: ProviderConfig,
  payload: Record<string, unknown>,
  fallbackMime: string,
  fallbackExtension: string,
  prompt: string
): Promise<BinaryAsset> {
  if (!config.baseUrl) throw new Error(`${config.name}.baseUrl is required`);
  const apiKey = resolveApiKey(config);
  const mergedPayload = {
    ...(config.requestTemplate ?? {}),
    model: config.model,
    ...payload
  };

  const response = await fetch(config.baseUrl, {
    method: "POST",
    signal: AbortSignal.timeout(config.timeoutMs),
    headers: {
      "content-type": "application/json",
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      ...config.headers
    },
    body: JSON.stringify(mergedPayload)
  });

  if (!response.ok) {
    throw new Error(`${config.name} failed with ${response.status}: ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") ?? fallbackMime;
  if (!contentType.includes("application/json")) {
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType: contentType,
      extension: extensionFromMime(contentType) ?? fallbackExtension,
      provider: config.name,
      model: config.model,
      prompt
    };
  }

  const json = (await response.json()) as unknown;
  const value = getPath(json, config.responsePath ?? "data.0.b64_json");
  if (typeof value !== "string") {
    throw new Error(`${config.name} returned JSON, but responsePath did not resolve to a string`);
  }

  const bytes = value.startsWith("http://") || value.startsWith("https://")
    ? await downloadToBuffer(value)
    : Buffer.from(value, "base64");

  return {
    bytes,
    mimeType: fallbackMime,
    extension: fallbackExtension,
    provider: config.name,
    model: config.model,
    prompt
  };
}

function buildImagePrompt(request: ImageGenerationRequest): string {
  return buildImageAssetPrompt(request, "game asset");
}

function assertUrl(value: string | undefined): string {
  if (!value) throw new Error("Provider returned neither b64_json nor url");
  return value;
}

async function downloadToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download generated asset: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function getPath(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((current, key) => {
    if (current == null) return undefined;
    if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
    if (typeof current === "object") return (current as Record<string, unknown>)[key];
    return undefined;
  }, value);
}

function extensionFromMime(mime: string): string | undefined {
  if (mime.includes("png")) return "png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("wav")) return "wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  return undefined;
}
