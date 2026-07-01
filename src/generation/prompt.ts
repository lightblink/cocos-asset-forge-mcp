import type { ImageGenerationRequest } from "./types.js";

export function buildImageAssetPrompt(request: ImageGenerationRequest, assetLabel: string): string {
  return [
    request.prompt,
    request.style ? `Style: ${request.style}.` : undefined,
    backgroundInstruction(request, assetLabel),
    request.negativePrompt ? `Avoid: ${request.negativePrompt}.` : undefined
  ]
    .filter(Boolean)
    .join("\n");
}

function backgroundInstruction(request: ImageGenerationRequest, assetLabel: string): string | undefined {
  if (request.background === "chroma_key") {
    const color = request.chromaKeyColor ?? "#00ff00";
    return [
      `Use a perfectly flat solid ${color} chroma key background behind the ${assetLabel}.`,
      "The background must be one uniform color only: no checkerboard, no fake transparency pattern, no shadow, no texture, no gradient.",
      "Keep the subject fully inside the canvas with a clean readable silhouette, no text, no watermark."
    ].join(" ");
  }

  if (request.background === "transparent" || request.transparentBackground) {
    return [
      `Transparent background for an isolated ${assetLabel}.`,
      "Do not draw a checkerboard or fake transparency pattern.",
      "Keep a clean silhouette, no text, no watermark."
    ].join(" ");
  }

  return undefined;
}
