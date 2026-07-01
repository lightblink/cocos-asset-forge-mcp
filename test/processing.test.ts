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

  it("removes connected chroma-key backgrounds while preserving isolated subject pixels", async () => {
    const dir = await tempDir();
    try {
      const source = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: "#00ff00"
        }
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 16,
                height: 16,
                channels: 4,
                background: { r: 20, g: 40, b: 180, alpha: 1 }
              }
            })
              .composite([
                {
                  input: await sharp({
                    create: {
                      width: 4,
                      height: 4,
                      channels: 4,
                      background: "#00ee00"
                    }
                  }).png().toBuffer(),
                  left: 6,
                  top: 6
                }
              ])
              .png()
              .toBuffer(),
            left: 8,
            top: 8
          }
        ])
        .png()
        .toBuffer();

      const adapted = await adaptImageBuffer(source, {
        name: "keyed",
        outputDir: dir,
        overwrite: true,
        transparentBackground: true,
        chromaKey: { color: "#00ff00", tolerance: 58 },
        trimTransparentEdges: false,
        padToPowerOfTwo: false,
        extrudePixels: 0,
        maxTextureSize: 256
      });
      const raw = await sharp(adapted.path).raw().toBuffer({ resolveWithObject: true });
      const cornerAlpha = raw.data[3];
      const innerGreenOffset = (16 * raw.info.width + 16) * raw.info.channels;
      expect(cornerAlpha).toBe(0);
      expect(raw.data[innerGreenOffset + 3]).toBe(255);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes connected green-screen gradients generated by image models", async () => {
    const dir = await tempDir();
    try {
      const source = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: { r: 2, g: 56, b: 7, alpha: 1 }
        }
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 20,
                height: 20,
                channels: 4,
                background: { r: 235, g: 137, b: 20, alpha: 1 }
              }
            }).png().toBuffer(),
            left: 6,
            top: 6
          }
        ])
        .png()
        .toBuffer();

      const adapted = await adaptImageBuffer(source, {
        name: "green-gradient",
        outputDir: dir,
        overwrite: true,
        transparentBackground: true,
        chromaKey: { color: "#00ff00", tolerance: 58 },
        trimTransparentEdges: false,
        padToPowerOfTwo: false,
        extrudePixels: 0,
        maxTextureSize: 256
      });
      const raw = await sharp(adapted.path).raw().toBuffer({ resolveWithObject: true });
      const cornerAlpha = raw.data[3];
      const subjectOffset = (16 * raw.info.width + 16) * raw.info.channels;
      expect(cornerAlpha).toBe(0);
      expect(raw.data[subjectOffset + 3]).toBe(255);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("removes green spill connected to transparent background", async () => {
    const dir = await tempDir();
    try {
      const source = await sharp({
        create: {
          width: 32,
          height: 32,
          channels: 4,
          background: "#00ff00"
        }
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 18,
                height: 18,
                channels: 4,
                background: { r: 235, g: 137, b: 20, alpha: 1 }
              }
            }).png().toBuffer(),
            left: 7,
            top: 7
          },
          {
            input: await sharp({
              create: {
                width: 2,
                height: 8,
                channels: 4,
                background: { r: 20, g: 210, b: 20, alpha: 1 }
              }
            }).png().toBuffer(),
            left: 7,
            top: 12
          }
        ])
        .png()
        .toBuffer();

      const adapted = await adaptImageBuffer(source, {
        name: "green-spill",
        outputDir: dir,
        overwrite: true,
        transparentBackground: true,
        chromaKey: { color: "#00ff00", tolerance: 58 },
        trimTransparentEdges: false,
        padToPowerOfTwo: false,
        extrudePixels: 0,
        maxTextureSize: 256
      });
      const raw = await sharp(adapted.path).raw().toBuffer({ resolveWithObject: true });
      const spillOffset = (16 * raw.info.width + 7) * raw.info.channels;
      const subjectOffset = (16 * raw.info.width + 16) * raw.info.channels;
      expect(raw.data[spillOffset + 3]).toBe(0);
      expect(raw.data[subjectOffset + 3]).toBe(255);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("can delegate cutouts to a configured local command backend", async () => {
    const dir = await tempDir();
    try {
      const source = await sharp({
        create: {
          width: 16,
          height: 16,
          channels: 4,
          background: "#00ff00"
        }
      })
        .composite([
          {
            input: await sharp({
              create: {
                width: 8,
                height: 8,
                channels: 4,
                background: { r: 20, g: 40, b: 180, alpha: 1 }
              }
            }).png().toBuffer(),
            left: 4,
            top: 4
          },
          {
            input: await sharp({
              create: {
                width: 2,
                height: 2,
                channels: 4,
                background: { r: 20, g: 210, b: 20, alpha: 1 }
              }
            }).png().toBuffer(),
            left: 7,
            top: 7
          }
        ])
        .png()
        .toBuffer();
      const script = [
        "const fs=require('fs');",
        "fs.copyFileSync(process.argv[1], process.argv[2]);"
      ].join("");

      const adapted = await adaptImageBuffer(source, {
        name: "local-command",
        outputDir: dir,
        overwrite: true,
        transparentBackground: true,
        chromaKey: { color: "#00ff00", tolerance: 58 },
        trimTransparentEdges: false,
        padToPowerOfTwo: false,
        extrudePixels: 0,
        maxTextureSize: 256,
        cutout: {
          backend: "local-command",
          command: process.execPath,
          args: ["-e", script, "{input}", "{output}"],
          timeoutMs: 10000,
          triggerMinRemovedRatio: 0.25
        }
      });

      const raw = await sharp(adapted.path).raw().toBuffer({ resolveWithObject: true });
      expect(raw.data[3]).toBe(0);
      const subjectOffset = (10 * raw.info.width + 10) * raw.info.channels;
      const residueOffset = (7 * raw.info.width + 7) * raw.info.channels;
      expect(raw.data[subjectOffset + 3]).toBe(255);
      expect(raw.data[residueOffset + 3]).toBe(0);
      expect(adapted.warnings.some((warning) => warning.includes("Local segmentation cutout backend ran"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
