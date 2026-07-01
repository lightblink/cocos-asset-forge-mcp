import sharp from "sharp";
import type {
  AudioGenerationRequest,
  AudioProvider,
  BinaryAsset,
  ImageGenerationRequest,
  ImageProvider
} from "./types.js";
import type { ProviderConfig } from "../config/schema.js";

export class MockImageProvider implements ImageProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateImage(request: ImageGenerationRequest): Promise<BinaryAsset> {
    const palette = paletteFromText(`${request.prompt}:${request.seed ?? ""}`);
    const background = request.background === "chroma_key"
      ? request.chromaKeyColor ?? "#00ff00"
      : request.transparentBackground || request.background === "transparent"
        ? "transparent"
        : palette.bg;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${request.width}" height="${request.height}" viewBox="0 0 ${request.width} ${request.height}">
        <rect width="100%" height="100%" fill="${background}"/>
        <circle cx="${request.width * 0.5}" cy="${request.height * 0.5}" r="${Math.min(request.width, request.height) * 0.32}" fill="${palette.primary}"/>
        <rect x="${request.width * 0.2}" y="${request.height * 0.58}" width="${request.width * 0.6}" height="${request.height * 0.18}" rx="${request.width * 0.04}" fill="${palette.secondary}"/>
        <path d="M ${request.width * 0.5} ${request.height * 0.16} L ${request.width * 0.67} ${request.height * 0.5} L ${request.width * 0.33} ${request.height * 0.5} Z" fill="${palette.accent}"/>
      </svg>`;

    const bytes = await sharp(Buffer.from(svg)).png().toBuffer();
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

export class MockAudioProvider implements AudioProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async generateAudio(request: AudioGenerationRequest): Promise<BinaryAsset> {
    const sampleRate = 44100;
    const duration = Math.max(0.1, Math.min(request.durationSeconds, 30));
    const frequency = 180 + (hashText(request.prompt) % 620);
    const bytes = makeSineWav({
      sampleRate,
      durationSeconds: duration,
      frequency,
      loop: request.loop ?? false
    });

    return {
      bytes,
      mimeType: "audio/wav",
      extension: "wav",
      provider: this.config.name,
      model: this.config.model,
      prompt: request.prompt,
      seed: request.seed
    };
  }
}

function paletteFromText(text: string): { bg: string; primary: string; secondary: string; accent: string } {
  const hash = hashText(text);
  const hue = hash % 360;
  return {
    bg: `hsl(${hue}, 36%, 16%)`,
    primary: `hsl(${(hue + 24) % 360}, 76%, 58%)`,
    secondary: `hsl(${(hue + 154) % 360}, 70%, 48%)`,
    accent: `hsl(${(hue + 284) % 360}, 86%, 66%)`
  };
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeSineWav(options: {
  sampleRate: number;
  durationSeconds: number;
  frequency: number;
  loop: boolean;
}): Buffer {
  const channels = 1;
  const bitsPerSample = 16;
  const samples = Math.floor(options.sampleRate * options.durationSeconds);
  const dataSize = samples * channels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(options.sampleRate, 24);
  buffer.writeUInt32LE(options.sampleRate * channels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples; i += 1) {
    const t = i / options.sampleRate;
    const envelope = options.loop ? 1 : Math.sin(Math.PI * Math.min(1, i / Math.max(1, samples - 1)));
    const value = Math.sin(2 * Math.PI * options.frequency * t) * 0.35 * envelope;
    buffer.writeInt16LE(Math.max(-1, Math.min(1, value)) * 32767, 44 + i * 2);
  }

  return buffer;
}
