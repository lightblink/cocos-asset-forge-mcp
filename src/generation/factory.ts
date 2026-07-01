import type { ProviderConfig } from "../config/schema.js";
import type { AudioProvider, ImageProvider } from "./types.js";
import { FalAudioProvider, FalImageProvider } from "./fal.js";
import { HuggingFaceImageProvider } from "./huggingface.js";
import { GenericHttpAudioProvider, GenericHttpImageProvider, OpenAICompatibleImageProvider } from "./http.js";
import { MockAudioProvider, MockImageProvider } from "./mock.js";

export function createImageProvider(config: ProviderConfig): ImageProvider {
  switch (config.kind) {
    case "mock":
      return new MockImageProvider(config);
    case "openai-compatible-image":
      return new OpenAICompatibleImageProvider(config);
    case "fal-image":
      return new FalImageProvider(config);
    case "huggingface-image":
      return new HuggingFaceImageProvider(config);
    case "siliconflow-image":
      return new OpenAICompatibleImageProvider({
        ...config,
        baseUrl: config.baseUrl ?? "https://api.siliconflow.cn",
        model: config.model ?? "Kwai-Kolors/Kolors"
      });
    case "modelscope-image":
      return new GenericHttpImageProvider(config);
    case "generic-http-image":
    case "comfyui":
      return new GenericHttpImageProvider(config);
    default:
      throw new Error(`Provider ${config.kind} cannot generate images`);
  }
}

export function createAudioProvider(config: ProviderConfig): AudioProvider {
  switch (config.kind) {
    case "mock":
      return new MockAudioProvider(config);
    case "generic-http-audio":
      return new GenericHttpAudioProvider(config);
    case "fal-audio":
      return new FalAudioProvider(config);
    default:
      throw new Error(`Provider ${config.kind} cannot generate audio`);
  }
}
