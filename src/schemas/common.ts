import { z } from "zod";

export const outputFormatSchema = z.enum(["png", "jpg", "webp"]).default("png");

export const sizeSchema = z
  .object({
    width: z.number().int().positive().max(4096).default(512),
    height: z.number().int().positive().max(4096).default(512)
  })
  .default({ width: 512, height: 512 });

export const cocosTargetSchema = z
  .object({
    creatorVersion: z.string().default("3.x"),
    projectRoot: z.string().optional(),
    assetRoot: z.string().default("assets"),
    pixelsPerUnit: z.number().positive().default(100)
  })
  .default({
    creatorVersion: "3.x",
    assetRoot: "assets",
    pixelsPerUnit: 100
  });

export const imagePostprocessBaseSchema = z
  .object({
    transparentBackground: z.boolean().default(true),
    chromaKey: z
      .object({
        color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        tolerance: z.number().min(0).max(255).default(28)
      })
      .optional(),
    trimTransparentEdges: z.boolean().default(false),
    padToPowerOfTwo: z.boolean().default(false),
    extrudePixels: z.number().int().min(0).max(16).default(0),
    maxTextureSize: z.number().int().positive().max(8192).default(2048)
  });

export const imagePostprocessSchema = imagePostprocessBaseSchema.default({
    transparentBackground: true,
    trimTransparentEdges: false,
    padToPowerOfTwo: false,
    extrudePixels: 0,
    maxTextureSize: 2048
  });

export const audioPostprocessBaseSchema = z
  .object({
    format: z.enum(["wav", "mp3", "ogg"]).default("wav"),
    sampleRate: z.number().int().positive().default(44100),
    channels: z.enum(["mono", "stereo"]).default("mono"),
    normalize: z.boolean().default(true),
    trimSilence: z.boolean().default(true),
    loop: z.boolean().default(false),
    fadeMs: z.number().int().min(0).max(10000).default(12)
  });

export const audioPostprocessSchema = audioPostprocessBaseSchema.default({
    format: "wav",
    sampleRate: 44100,
    channels: "mono",
    normalize: true,
    trimSilence: true,
    loop: false,
    fadeMs: 12
  });

export const assetReportSchema = z.object({
  id: z.string(),
  kind: z.string(),
  files: z.array(z.string()),
  manifest: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  cocos: z.object({
    importPath: z.string(),
    recommendedType: z.string(),
    notes: z.array(z.string()).default([])
  })
});

export type AssetReport = z.infer<typeof assetReportSchema>;
