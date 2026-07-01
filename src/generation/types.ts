import type { ProviderConfig } from "../config/schema.js";

export type BinaryAsset = {
  bytes: Buffer;
  mimeType: string;
  extension: string;
  seed?: string | number;
  provider: string;
  model?: string;
  prompt: string;
};

export type ImageGenerationRequest = {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  style?: string;
  seed?: string | number;
  transparentBackground?: boolean;
  referenceImagePath?: string;
  referenceImageUrl?: string;
  referenceStrength?: number;
};

export type AudioGenerationRequest = {
  prompt: string;
  durationSeconds: number;
  loop?: boolean;
  style?: string;
  seed?: string | number;
};

export interface ImageProvider {
  readonly config: ProviderConfig;
  generateImage(request: ImageGenerationRequest): Promise<BinaryAsset>;
}

export interface AudioProvider {
  readonly config: ProviderConfig;
  generateAudio(request: AudioGenerationRequest): Promise<BinaryAsset>;
}
