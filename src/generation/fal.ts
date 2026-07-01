import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { fal } from "@fal-ai/client";
import type { ProviderConfig } from "../config/schema.js";
import { resolveApiKey } from "./auth.js";
import type {
  AudioGenerationRequest,
  AudioProvider,
  BinaryAsset,
  ImageGenerationRequest,
  ImageProvider
} from "./types.js";

type FalImageResult = {
  images?: Array<{
    url?: string;
    content_type?: string;
    file_name?: string;
  }>;
  seed?: number;
};

type FalAudioResult = {
  audio?: string | FalFile;
  audio_file?: FalFile;
  seed?: number;
};

type FalFile = {
  url?: string;
  content_type?: string;
  file_name?: string;
};

export class FalImageProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    configureFalCredentials(config);
  }

  async generateImage(request: ImageGenerationRequest): Promise<BinaryAsset> {
    const model = this.config.model ?? "fal-ai/flux-2-pro";
    let result: { data: FalImageResult };
    try {
      result = await fal.subscribe(model, {
        input: await buildFalImageInput(model, request, this.config.requestTemplate),
        logs: false
      }) as { data: FalImageResult };
    } catch (error) {
      if (error instanceof Error && /unauthorized|authentication|invalid token/i.test(error.message)) {
        throw new Error(
          `fal authentication failed for ${model}. Set a valid imageProvider.apiKey, imageProvider.apiKeyEnv, FAL_KEY, or FAL_API_KEY. Original error: ${error.message}`
        );
      }
      throw error;
    }

    const image = result.data.images?.[0];
    if (!image?.url) {
      throw new Error(`fal model ${model} did not return an image URL`);
    }

    const response = await fetch(image.url, { signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!response.ok) {
      throw new Error(`Failed to download fal image: ${response.status} ${await response.text()}`);
    }
    const mimeType = response.headers.get("content-type") ?? image.content_type ?? "image/png";

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType,
      extension: extensionFromMime(mimeType),
      provider: this.config.name,
      model,
      prompt: request.prompt,
      seed: result.data.seed ?? request.seed
    };
  }
}

async function buildFalImageInput(
  model: string,
  request: ImageGenerationRequest,
  template: Record<string, unknown> | undefined
): Promise<Record<string, unknown>> {
  const input: Record<string, unknown> = {
    prompt: buildFalPrompt(request),
    image_size: {
      width: request.width,
      height: request.height
    },
    ...(request.seed === undefined ? {} : { seed: normalizeSeed(request.seed) })
  };
  const imageUrl = await resolveReferenceImageUrl(request);
  if (imageUrl) {
    if (!supportsReferenceImage(model)) {
      throw new Error(
        `Reference image generation requires an edit/image-to-image capable fal model. Current model is ${model}. Try fal-ai/qwen-image-2/edit, fal-ai/qwen-image-edit-2511, fal-ai/flux-2-pro/edit, or a Kontext model.`
      );
    }
    input.image_url = imageUrl;
    input.reference_image_url = imageUrl;
    input.strength = request.referenceStrength ?? 0.72;
    input.prompt = `${input.prompt}\nUse the supplied reference image for character identity, proportions, palette, and costume consistency.`;
  }
  return { ...(template ?? {}), ...input };
}

function supportsReferenceImage(model: string): boolean {
  const lower = model.toLowerCase();
  return lower.includes("edit") || lower.includes("kontext") || lower.includes("image-to-image") || lower.includes("i2i");
}

async function resolveReferenceImageUrl(request: ImageGenerationRequest): Promise<string | undefined> {
  if (request.referenceImageUrl) return request.referenceImageUrl;
  if (!request.referenceImagePath) return undefined;
  const bytes = await readFile(request.referenceImagePath);
  const type = contentTypeFromPath(request.referenceImagePath);
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", {
    value: basename(request.referenceImagePath),
    configurable: true
  });
  return fal.storage.upload(blob);
}

function contentTypeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

export class FalAudioProvider implements AudioProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
    configureFalCredentials(config);
  }

  async generateAudio(request: AudioGenerationRequest): Promise<BinaryAsset> {
    const model = this.config.model ?? (request.loop
      ? "fal-ai/stable-audio-3/small/music/text-to-audio"
      : "fal-ai/stable-audio-3/small/sfx/text-to-audio");
    let result: { data: FalAudioResult };
    try {
      result = await fal.subscribe(model, {
        input: buildFalAudioInput(model, request, this.config.requestTemplate),
        logs: false
      }) as { data: FalAudioResult };
    } catch (error) {
      if (error instanceof Error && /unauthorized|authentication|invalid token/i.test(error.message)) {
        throw new Error(
          `fal authentication failed for ${model}. Set a valid audioProvider.apiKey, audioProvider.apiKeyEnv, FAL_KEY, or FAL_API_KEY. Original error: ${error.message}`
        );
      }
      throw error;
    }

    const audio = resolveFalAudio(result.data);
    if (!audio.url) {
      throw new Error(`fal model ${model} did not return an audio URL`);
    }

    const response = await fetch(audio.url, { signal: AbortSignal.timeout(this.config.timeoutMs) });
    if (!response.ok) {
      throw new Error(`Failed to download fal audio: ${response.status} ${await response.text()}`);
    }
    const mimeType = response.headers.get("content-type") ?? audio.content_type ?? "audio/wav";

    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      mimeType,
      extension: extensionFromAudioMimeOrUrl(mimeType, audio.url),
      provider: this.config.name,
      model,
      prompt: request.prompt,
      seed: result.data.seed ?? request.seed
    };
  }
}

function buildFalPrompt(request: ImageGenerationRequest): string {
  return [
    request.prompt,
    request.style ? `Style: ${request.style}.` : undefined,
    request.transparentBackground ? "Transparent background, isolated game sprite, clean silhouette, no text, no watermark." : undefined,
    request.negativePrompt ? `Avoid: ${request.negativePrompt}.` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFalAudioInput(
  model: string,
  request: AudioGenerationRequest,
  template: Record<string, unknown> | undefined
): Record<string, unknown> {
  const prompt = [
    request.prompt,
    request.style ? `Style: ${request.style}.` : undefined,
    request.loop ? "Loopable background music, clean start and ending, no vocals unless requested." : "Short game sound effect, immediate attack, no silence."
  ]
    .filter(Boolean)
    .join("\n");
  const seed = request.seed === undefined ? undefined : normalizeSeed(request.seed);

  if (model.includes("cassetteai/sound-effects-generator")) {
    return {
      ...(template ?? {}),
      prompt,
      duration: Math.round(request.durationSeconds),
      ...(seed === undefined ? {} : { seed })
    };
  }

  return {
    ...(template ?? {}),
    prompt,
    seconds_total: Math.round(request.durationSeconds),
    ...(seed === undefined ? {} : { seed })
  };
}

function configureFalCredentials(config: ProviderConfig): void {
  const apiKey = resolveApiKey(config, ["FAL_KEY", "FAL_API_KEY"]);
  if (apiKey) {
    fal.config({ credentials: apiKey });
  }
}

function resolveFalAudio(result: FalAudioResult): FalFile {
  if (typeof result.audio === "string") return { url: result.audio };
  if (result.audio?.url) return result.audio;
  if (result.audio_file?.url) return result.audio_file;
  return {};
}

function normalizeSeed(seed: string | number): number {
  if (typeof seed === "number") return Math.trunc(seed);
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function extensionFromMime(mime: string): string {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("webp")) return "webp";
  return "png";
}

function extensionFromAudioMimeOrUrl(mime: string, url: string): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav") || mime.includes("wave")) return "wav";
  const pathname = new URL(url).pathname.toLowerCase();
  if (pathname.endsWith(".mp3")) return "mp3";
  if (pathname.endsWith(".ogg")) return "ogg";
  return "wav";
}
