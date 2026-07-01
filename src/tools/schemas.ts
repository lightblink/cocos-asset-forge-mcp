import { z } from "zod";
import {
  audioPostprocessBaseSchema,
  audioPostprocessSchema,
  imagePostprocessSchema,
  sizeSchema
} from "../schemas/common.js";

const assetName = z.string().min(1).max(120).describe("Human-readable asset name. Used for file names after slugification.");
const outputDir = z.string().optional().describe("Directory where generated files should be written. Defaults to server config.");
const style = z.string().optional().describe("Visual or audio style, e.g. 'cozy pixel art', 'hand-painted fantasy', '8-bit arcade'.");
const referenceImagePath = z.string().optional().describe("Local reference image path for image-to-image/edit capable providers.");
const referenceImageUrl = z.string().url().optional().describe("Public reference image URL for image-to-image/edit capable providers.");
const referenceStrength = z.number().min(0).max(1).default(0.72).describe("How strongly an image-to-image/edit provider should preserve the reference.");

export const getConfigInput = z.object({});

export const planPackInput = z.object({
  gameDescription: z.string().min(1),
  targetPlatform: z.string().default("Cocos Creator 3.x"),
  artDirection: z.string().optional(),
  assetTypes: z.array(z.enum(["sprites", "sprite_sheets", "tilesets", "ui", "sfx", "music"])).default([
    "sprites",
    "sprite_sheets",
    "tilesets",
    "sfx",
    "music"
  ])
});

export const generateSpriteInput = z.object({
  name: assetName,
  prompt: z.string().min(1),
  negativePrompt: z.string().optional(),
  size: sizeSchema,
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  referenceImagePath,
  referenceImageUrl,
  referenceStrength,
  outputDir,
  postprocess: imagePostprocessSchema
});

export const generateSpriteSheetInput = z.object({
  name: assetName,
  prompt: z.string().min(1).describe("Describe the character/object and the motion."),
  action: z.string().default("idle"),
  frameCount: z.number().int().min(1).max(64).default(8),
  frameSize: sizeSchema,
  columns: z.number().int().min(1).max(16).default(8),
  padding: z.number().int().min(0).max(32).default(2),
  margin: z.number().int().min(0).max(32).default(2),
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  referenceImagePath,
  referenceImageUrl,
  referenceStrength,
  outputDir,
  postprocess: imagePostprocessSchema
});

export const generateSpriteGridSheetInput = z.object({
  name: assetName,
  prompt: z.string().min(1).describe("Describe the same character/object animation, or a related multi-asset pack to generate in one contact sheet."),
  action: z.string().default("idle").describe("Animation action such as idle/run/attack, or pack intent such as asset-pack, variant-pack, state-set, icon-pack, enemy-pack, or pickup-pack."),
  rows: z.number().int().min(1).max(8).default(3),
  columns: z.number().int().min(1).max(8).default(3),
  frameCount: z.number().int().min(1).max(64).optional(),
  frameSize: sizeSchema.default({ width: 256, height: 256 }),
  padding: z.number().int().min(0).max(32).default(2),
  margin: z.number().int().min(0).max(32).default(2),
  contactSheetBackground: z.enum(["transparent", "flat_key_color", "white"]).default("flat_key_color"),
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  referenceImagePath,
  referenceImageUrl,
  referenceStrength,
  outputDir,
  postprocess: imagePostprocessSchema
});

export const generateTilesetInput = z.object({
  name: assetName,
  prompt: z.string().min(1),
  tileSize: sizeSchema.default({ width: 32, height: 32 }),
  tileCount: z.number().int().min(1).max(256).default(16),
  columns: z.number().int().min(1).max(32).default(8),
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  outputDir,
  postprocess: imagePostprocessSchema
});

export const generateUiPackInput = z.object({
  name: assetName,
  prompt: z.string().min(1),
  elements: z.array(z.string().min(1)).min(1).max(64).default(["button", "panel", "icon"]),
  elementSize: sizeSchema.default({ width: 256, height: 96 }),
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  outputDir,
  postprocess: imagePostprocessSchema
});

export const generateSfxInput = z.object({
  name: assetName,
  prompt: z.string().min(1),
  durationSeconds: z.number().positive().max(15).default(1.5),
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  outputDir,
  postprocess: audioPostprocessSchema
});

export const generateMusicLoopInput = z.object({
  name: assetName,
  prompt: z.string().min(1),
  durationSeconds: z.number().positive().max(180).default(30),
  style,
  seed: z.union([z.string(), z.number()]).optional(),
  outputDir,
  postprocess: audioPostprocessBaseSchema.extend({ loop: z.boolean().default(true) }).default({
    format: "wav",
    sampleRate: 44100,
    channels: "stereo",
    normalize: true,
    trimSilence: false,
    loop: true,
    fadeMs: 0
  })
});

export const adaptImageInput = z.object({
  name: assetName,
  inputPath: z.string().min(1),
  outputDir,
  postprocess: imagePostprocessSchema
});

export const adaptAudioInput = z.object({
  name: assetName,
  inputPath: z.string().min(1),
  outputDir,
  postprocess: audioPostprocessSchema
});
