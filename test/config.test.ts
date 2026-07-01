import { describe, expect, it } from "vitest";
import { parseConfig, redactConfig } from "../src/config/load.js";
import { createImageProvider } from "../src/generation/factory.js";

describe("provider configuration", () => {
  it("accepts inline apiKey values and redacts them for config reporting", () => {
    const config = parseConfig({
      imageProvider: {
        kind: "fal-image",
        name: "fal-flux-2-pro",
        apiKey: "fal-secret",
        model: "fal-ai/flux-2-pro"
      }
    });

    expect(config.imageProvider.apiKey).toBe("fal-secret");
    expect(redactConfig(config).imageProvider.apiKey).toBe("sk-...redacted");
    expect(config.cutout).toMatchObject({
      backend: "auto",
      args: ["i", "{input}", "{output}"],
      timeoutMs: 180000,
      triggerMinRemovedRatio: 0.25
    });
  });

  it("creates first-class image providers for hosted model choices", () => {
    const huggingFace = createImageProvider(parseConfig({
      imageProvider: {
        kind: "huggingface-image",
        name: "hf-flux",
        apiKey: "hf-secret"
      }
    }).imageProvider);

    const siliconFlow = createImageProvider(parseConfig({
      imageProvider: {
        kind: "siliconflow-image",
        name: "siliconflow-kolors",
        apiKey: "sf-secret"
      }
    }).imageProvider);

    const modelScope = createImageProvider(parseConfig({
      imageProvider: {
        kind: "modelscope-image",
        name: "modelscope-custom",
        baseUrl: "https://example.com/image",
        apiKey: "ms-secret"
      }
    }).imageProvider);

    expect(huggingFace.config.kind).toBe("huggingface-image");
    expect(siliconFlow.config.kind).toBe("siliconflow-image");
    expect(modelScope.config.kind).toBe("modelscope-image");
  });
});
