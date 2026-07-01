import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { MockAudioProvider, MockImageProvider } from "../src/generation/mock.js";
import { adaptAudioBuffer } from "../src/processing/audio.js";
import { adaptImageBuffer, makeSpriteSheet, splitGridImageToBuffers } from "../src/processing/image.js";

describe("asset processing pipeline", () => {
  it("adapts generated images into Cocos-ready PNGs", async () => {
    const dir = await tempDir();
    try {
      const provider = new MockImageProvider({ kind: "mock", name: "mock-image", headers: {}, timeoutMs: 1000 });
      const generated = await provider.generateImage({
        prompt: "tiny hero",
        width: 64,
        height: 64,
        transparentBackground: true
      });
      const adapted = await adaptImageBuffer(generated.bytes, {
        name: "hero",
        outputDir: dir,
        overwrite: true,
        transparentBackground: true,
        trimTransparentEdges: false,
        padToPowerOfTwo: false,
        extrudePixels: 0,
        maxTextureSize: 256
      });
      const meta = await sharp(adapted.path).metadata();
      expect(meta.format).toBe("png");
      expect(meta.hasAlpha).toBe(true);
      expect(adapted.width).toBe(64);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("packs frames into a sprite sheet with manifest files", async () => {
    const dir = await tempDir();
    try {
      const framePaths: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        const path = join(dir, `frame-${i}.png`);
        await sharp({
          create: {
            width: 32,
            height: 32,
            channels: 4,
            background: { r: 20 + i * 20, g: 80, b: 140, alpha: 1 }
          }
        }).png().toFile(path);
        framePaths.push(path);
      }
      const sheet = await makeSpriteSheet(framePaths, {
        name: "run",
        outputDir: dir,
        overwrite: true,
        frameWidth: 32,
        frameHeight: 32,
        columns: 2,
        padding: 2,
        margin: 2
      });
      const meta = await sharp(sheet.imagePath).metadata();
      expect(meta.width).toBe(70);
      expect(meta.height).toBe(70);
      expect(sheet.frames).toHaveLength(3);
      expect(sheet.manifestPath.endsWith(".cocos-asset.json")).toBe(true);
      expect(sheet.plistPath.endsWith(".plist")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("splits contact sheets by fixed grid for consistent animation workflows", async () => {
    const buffer = await sharp({
      create: {
        width: 96,
        height: 64,
        channels: 4,
        background: { r: 0, g: 255, b: 0, alpha: 1 }
      }
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 20,
              height: 20,
              channels: 4,
              background: { r: 255, g: 0, b: 0, alpha: 1 }
            }
          }).png().toBuffer(),
          left: 6,
          top: 6
        }
      ])
      .png()
      .toBuffer();
    const frames = await splitGridImageToBuffers(buffer, { rows: 2, columns: 3, limit: 5 });
    expect(frames).toHaveLength(5);
    expect(frames[0]).toMatchObject({ row: 0, column: 0, width: 32, height: 32 });
    expect(frames[4]).toMatchObject({ row: 1, column: 1, width: 32, height: 32 });
  });

  it("adapts generated audio into a Cocos AudioClip file", async () => {
    const dir = await tempDir();
    try {
      const provider = new MockAudioProvider({ kind: "mock", name: "mock-audio", headers: {}, timeoutMs: 1000 });
      const generated = await provider.generateAudio({
        prompt: "jump",
        durationSeconds: 0.25
      });
      const adapted = await adaptAudioBuffer(generated.bytes, generated.extension, {
        name: "jump",
        outputDir: dir,
        overwrite: true,
        format: "wav",
        sampleRate: 44100,
        channels: "mono",
        normalize: false,
        trimSilence: false,
        loop: false,
        fadeMs: 0,
        targetDurationSeconds: 0.2
      });
      expect(adapted.path.endsWith(".wav")).toBe(true);
      expect(adapted.manifestPath.endsWith(".cocos-asset.json")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "cocos-asset-forge-"));
}
