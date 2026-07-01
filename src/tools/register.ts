import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ForgeConfig } from "../config/schema.js";
import { redactConfig } from "../config/load.js";
import type { AudioProvider, ImageProvider } from "../generation/types.js";
import { adaptAudioBuffer } from "../processing/audio.js";
import { adaptImageBuffer, makeSpriteSheet, splitGridImageToBuffers } from "../processing/image.js";
import type { AssetReport } from "../schemas/common.js";
import { slugify, withTimestamp } from "../utils/fs.js";
import {
  adaptAudioInput,
  adaptImageInput,
  generateMusicLoopInput,
  generateSfxInput,
  generateSpriteGridSheetInput,
  generateSpriteInput,
  generateSpriteSheetInput,
  generateTilesetInput,
  generateUiPackInput,
  getConfigInput,
  planPackInput
} from "./schemas.js";

type ToolContext = {
  config: ForgeConfig;
  imageProvider: ImageProvider;
  audioProvider: AudioProvider;
  sfxProvider: AudioProvider;
  musicProvider: AudioProvider;
};

const DEFAULT_KEY_COLOR = "#00ff00";
const DEFAULT_KEY_TOLERANCE = 58;

export function registerAssetTools(server: McpServer, context: ToolContext): void {
  server.registerTool("asset_forge_get_config", {
    title: "Get Asset Forge Config",
    description: "Return the active Cocos Asset Forge MCP configuration with secrets redacted.",
    inputSchema: getConfigInput
  }, async () => textResult(redactConfig(context.config)));

  server.registerTool("asset_forge_plan_pack", {
    title: "Plan A Cocos Asset Pack",
    description: "Create a concrete asset checklist for a Cocos game so the calling coding agent can generate assets systematically.",
    inputSchema: planPackInput
  }, async (input) => textResult(planPack(input)));

  server.registerTool("asset_forge_generate_sprite", {
    title: "Generate Cocos Sprite",
    description: "Generate a single sprite image, clean its alpha/background, and save a Cocos-ready PNG plus manifest.",
    inputSchema: generateSpriteInput
  }, async (input) => {
    const name = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, name);
    const generated = await context.imageProvider.generateImage({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      width: input.size.width,
      height: input.size.height,
      style: input.style,
      seed: input.seed,
      transparentBackground: input.postprocess.transparentBackground,
      background: input.postprocess.transparentBackground ? "chroma_key" : "none",
      chromaKeyColor: DEFAULT_KEY_COLOR,
      referenceImagePath: input.referenceImagePath,
      referenceImageUrl: input.referenceImageUrl,
      referenceStrength: input.referenceStrength
    });
    const adapted = await adaptImageBuffer(generated.bytes, {
      name,
      outputDir,
      overwrite: context.config.safety.overwrite,
      ...withDefaultChromaKey(input.postprocess)
    });
    return textResult(makeReport({
      id: name,
      kind: "sprite",
      files: [adapted.path],
      warnings: adapted.warnings,
      importPath: cocosImportPath(context.config, adapted.path),
      recommendedType: "SpriteFrame",
      notes: [
        "PNG is normalized to RGBA and suitable for Cocos SpriteFrame import.",
        "Use Sprite component or assign as a frame in an AnimationClip."
      ]
    }));
  });

  server.registerTool("asset_forge_generate_sprite_sheet", {
    title: "Generate Cocos Sprite Sheet",
    description: "Generate an animation as individual frames, pack them into a transparent PNG sprite sheet, and emit Cocos/TexturePacker metadata.",
    inputSchema: generateSpriteSheetInput
  }, async (input) => {
    const baseName = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, baseName);
    const framesDir = join(outputDir, "frames");
    const framePaths: string[] = [];
    for (let index = 0; index < input.frameCount; index += 1) {
      const generated = await context.imageProvider.generateImage({
        prompt: `${input.prompt}\nAnimation action: ${input.action}. Frame ${index + 1} of ${input.frameCount}. Keep the same character proportions, camera, and silhouette.`,
        width: input.frameSize.width,
        height: input.frameSize.height,
        style: input.style,
        seed: input.seed ? `${input.seed}-${index}` : undefined,
        transparentBackground: input.postprocess.transparentBackground,
        background: input.postprocess.transparentBackground ? "chroma_key" : "none",
        chromaKeyColor: DEFAULT_KEY_COLOR,
        referenceImagePath: input.referenceImagePath,
        referenceImageUrl: input.referenceImageUrl,
        referenceStrength: input.referenceStrength
      });
      const adapted = await adaptImageBuffer(generated.bytes, {
        name: `${baseName}-${input.action}-${String(index + 1).padStart(3, "0")}`,
        outputDir: framesDir,
        overwrite: context.config.safety.overwrite,
        ...withDefaultChromaKey(input.postprocess)
      });
      framePaths.push(adapted.path);
    }

    const sheet = await makeSpriteSheet(framePaths, {
      name: `${baseName}-${slugify(input.action)}`,
      outputDir,
      overwrite: context.config.safety.overwrite,
      frameWidth: input.frameSize.width,
      frameHeight: input.frameSize.height,
      columns: input.columns,
      padding: input.padding,
      margin: input.margin
    });

    return textResult(makeReport({
      id: baseName,
      kind: "sprite-sheet",
      files: [...framePaths, sheet.imagePath, sheet.plistPath],
      manifest: sheet.manifestPath,
      warnings: [],
      importPath: cocosImportPath(context.config, sheet.imagePath),
      recommendedType: "SpriteAtlas + AnimationClip",
      notes: [
        "The frames directory contains individual transparent PNG frames.",
        "The sheet PNG and plist can be consumed by atlas tooling or a Cocos editor extension.",
        "The manifest includes frame coordinates for creating AnimationClips programmatically."
      ]
    }));
  });

  server.registerTool("asset_forge_generate_sprite_grid_sheet", {
    title: "Generate Cocos Sprite Grid Sheet",
    description: "Generate one AI contact sheet such as 3x3 or 4x3 for better character consistency, slice it into frames, clean alpha, and pack Cocos-ready sprite sheet metadata.",
    inputSchema: generateSpriteGridSheetInput
  }, async (input) => {
    const baseName = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, baseName);
    const framesDir = join(outputDir, "frames");
    const sourceDir = join(outputDir, "source");
    const frameCount = input.frameCount ?? input.rows * input.columns;
    const sheetWidth = input.columns * input.frameSize.width;
    const sheetHeight = input.rows * input.frameSize.height;
    const keyColor = input.contactSheetBackground === "flat_key_color" ? DEFAULT_KEY_COLOR : undefined;
    const generated = await context.imageProvider.generateImage({
      prompt: buildGridPrompt({
        prompt: input.prompt,
        action: input.action,
        rows: input.rows,
        columns: input.columns,
        frameCount,
        frameWidth: input.frameSize.width,
        frameHeight: input.frameSize.height,
        background: input.contactSheetBackground
      }),
      width: sheetWidth,
      height: sheetHeight,
      style: input.style,
      seed: input.seed,
      transparentBackground: input.contactSheetBackground === "transparent",
      background: input.contactSheetBackground === "flat_key_color"
        ? "chroma_key"
        : input.contactSheetBackground === "transparent"
          ? "transparent"
          : "none",
      chromaKeyColor: keyColor,
      referenceImagePath: input.referenceImagePath,
      referenceImageUrl: input.referenceImageUrl,
      referenceStrength: input.referenceStrength
    });
    const source = await adaptImageBuffer(generated.bytes, {
      name: `${baseName}-${slugify(input.action)}-contact-sheet-source`,
      outputDir: sourceDir,
      overwrite: context.config.safety.overwrite,
      transparentBackground: false,
      trimTransparentEdges: false,
      padToPowerOfTwo: false,
      extrudePixels: 0,
      maxTextureSize: Math.max(sheetWidth, sheetHeight, input.postprocess.maxTextureSize)
    });
    const frameBuffers = await splitGridImageToBuffers(generated.bytes, {
      rows: input.rows,
      columns: input.columns,
      limit: frameCount
    });
    const framePaths: string[] = [];
    const warnings: string[] = [];
    for (const frame of frameBuffers) {
      const adapted = await adaptImageBuffer(frame.buffer, {
        name: `${baseName}-${slugify(input.action)}-${String(frame.index + 1).padStart(3, "0")}`,
        outputDir: framesDir,
        overwrite: context.config.safety.overwrite,
        ...withDefaultChromaKey(input.postprocess),
        chromaKey: keyColor
          ? { color: keyColor, tolerance: input.postprocess.chromaKey?.tolerance ?? DEFAULT_KEY_TOLERANCE }
          : input.postprocess.chromaKey
      });
      framePaths.push(adapted.path);
      warnings.push(...adapted.warnings);
    }

    const sheet = await makeSpriteSheet(framePaths, {
      name: `${baseName}-${slugify(input.action)}-grid`,
      outputDir,
      overwrite: context.config.safety.overwrite,
      frameWidth: input.frameSize.width,
      frameHeight: input.frameSize.height,
      columns: input.columns,
      padding: input.padding,
      margin: input.margin
    });

    return textResult(makeReport({
      id: baseName,
      kind: "sprite-grid-sheet",
      files: [source.path, ...framePaths, sheet.imagePath, sheet.plistPath],
      manifest: sheet.manifestPath,
      warnings: [
        ...warnings,
        "Grid contact sheets improve consistency, but frame boundaries should still be visually checked before final animation timing."
      ],
      importPath: cocosImportPath(context.config, sheet.imagePath),
      recommendedType: "SpriteAtlas + AnimationClip",
      notes: [
        "This used one AI contact-sheet generation for stronger identity consistency across frames.",
        "The source contact sheet is preserved under source/ for auditing.",
        "The frames directory contains sliced, alpha-cleaned PNGs; the packed PNG and plist are ready for atlas workflows."
      ]
    }));
  });

  server.registerTool("asset_forge_generate_tileset", {
    title: "Generate Cocos Tileset",
    description: "Generate multiple seamless-ish tile sprites, pack them into a tileset sheet, and emit tile metadata.",
    inputSchema: generateTilesetInput
  }, async (input) => {
    const baseName = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, baseName);
    const tilesDir = join(outputDir, "tiles");
    const tilePaths: string[] = [];
    for (let index = 0; index < input.tileCount; index += 1) {
      const generated = await context.imageProvider.generateImage({
        prompt: `${input.prompt}\nTile ${index + 1} of ${input.tileCount}. Orthographic, edge-compatible, no text, no watermark.`,
        width: input.tileSize.width,
        height: input.tileSize.height,
        style: input.style,
        seed: input.seed ? `${input.seed}-${index}` : undefined,
        transparentBackground: input.postprocess.transparentBackground,
        background: input.postprocess.transparentBackground ? "chroma_key" : "none",
        chromaKeyColor: DEFAULT_KEY_COLOR
      });
      const adapted = await adaptImageBuffer(generated.bytes, {
        name: `${baseName}-tile-${String(index + 1).padStart(3, "0")}`,
        outputDir: tilesDir,
        overwrite: context.config.safety.overwrite,
        ...withDefaultChromaKey(input.postprocess)
      });
      tilePaths.push(adapted.path);
    }
    const sheet = await makeSpriteSheet(tilePaths, {
      name: `${baseName}-tileset`,
      outputDir,
      overwrite: context.config.safety.overwrite,
      frameWidth: input.tileSize.width,
      frameHeight: input.tileSize.height,
      columns: input.columns,
      padding: 0,
      margin: 0
    });

    return textResult(makeReport({
      id: baseName,
      kind: "tileset",
      files: [...tilePaths, sheet.imagePath, sheet.plistPath],
      manifest: sheet.manifestPath,
      warnings: ["AI-generated tiles may still need manual edge QA for perfect seamless maps."],
      importPath: cocosImportPath(context.config, sheet.imagePath),
      recommendedType: "TiledMap tileset texture or SpriteAtlas",
      notes: [
        "Each tile is exported individually and packed into a grid sheet.",
        "For Cocos TiledMap workflows, import the PNG into Tiled or your map editor as a tileset source."
      ]
    }));
  });

  server.registerTool("asset_forge_generate_ui_pack", {
    title: "Generate Cocos UI Pack",
    description: "Generate Cocos-ready UI element sprites such as buttons, panels, icons, bars, badges, and cursors.",
    inputSchema: generateUiPackInput
  }, async (input) => {
    const baseName = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, baseName);
    const files: string[] = [];
    const warnings: string[] = [];
    for (const element of input.elements) {
      const generated = await context.imageProvider.generateImage({
        prompt: `${input.prompt}\nUI element: ${element}. Cocos Creator game UI asset, isolated on a flat chroma key background, no text unless explicitly requested.`,
        width: input.elementSize.width,
        height: input.elementSize.height,
        style: input.style,
        seed: input.seed ? `${input.seed}-${element}` : undefined,
        transparentBackground: input.postprocess.transparentBackground,
        background: input.postprocess.transparentBackground ? "chroma_key" : "none",
        chromaKeyColor: DEFAULT_KEY_COLOR
      });
      const adapted = await adaptImageBuffer(generated.bytes, {
        name: `${baseName}-${slugify(element)}`,
        outputDir,
        overwrite: context.config.safety.overwrite,
        ...withDefaultChromaKey(input.postprocess)
      });
      files.push(adapted.path);
      warnings.push(...adapted.warnings);
    }
    return textResult(makeReport({
      id: baseName,
      kind: "ui-pack",
      files,
      warnings,
      importPath: cocosImportPath(context.config, outputDir),
      recommendedType: "SpriteFrame / 9-slice Sprite",
      notes: [
        "Use SpriteFrame assets directly for icons and buttons.",
        "For scalable panels or buttons, set border in Cocos SpriteFrame editor and use sliced mode."
      ]
    }));
  });

  server.registerTool("asset_forge_generate_sfx", {
    title: "Generate Cocos Sound Effect",
    description: "Generate a short sound effect and transcode it into a Cocos-ready AudioClip file.",
    inputSchema: generateSfxInput
  }, async (input) => {
    const name = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, name);
    const generated = await context.sfxProvider.generateAudio({
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      loop: false,
      style: input.style,
      seed: input.seed
    });
    const adapted = await adaptAudioBuffer(generated.bytes, generated.extension, {
      name,
      outputDir,
      overwrite: context.config.safety.overwrite,
      ...input.postprocess,
      loop: false,
      targetDurationSeconds: input.durationSeconds
    });
    return textResult(makeReport({
      id: name,
      kind: "sfx",
      files: [adapted.path],
      manifest: adapted.manifestPath,
      warnings: adapted.warnings,
      importPath: cocosImportPath(context.config, adapted.path),
      recommendedType: "AudioClip",
      notes: ["Use AudioSource.playOneShot for responsive game sound effects."]
    }));
  });

  server.registerTool("asset_forge_generate_music_loop", {
    title: "Generate Cocos Music Loop",
    description: "Generate background music and transcode it into a Cocos-ready looping AudioClip file.",
    inputSchema: generateMusicLoopInput
  }, async (input) => {
    const name = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, name);
    const generated = await context.musicProvider.generateAudio({
      prompt: input.prompt,
      durationSeconds: input.durationSeconds,
      loop: true,
      style: input.style,
      seed: input.seed
    });
    const adapted = await adaptAudioBuffer(generated.bytes, generated.extension, {
      name,
      outputDir,
      overwrite: context.config.safety.overwrite,
      ...input.postprocess,
      loop: true,
      targetDurationSeconds: input.durationSeconds
    });
    return textResult(makeReport({
      id: name,
      kind: "music-loop",
      files: [adapted.path],
      manifest: adapted.manifestPath,
      warnings: adapted.warnings,
      importPath: cocosImportPath(context.config, adapted.path),
      recommendedType: "AudioClip",
      notes: ["Assign to an AudioSource and enable loop for background music."]
    }));
  });

  server.registerTool("asset_forge_adapt_image", {
    title: "Adapt Image For Cocos",
    description: "Convert an existing image into a Cocos-ready transparent PNG.",
    inputSchema: adaptImageInput
  }, async (input) => {
    const name = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, name);
    const buffer = await readFile(resolve(input.inputPath));
    const adapted = await adaptImageBuffer(buffer, {
      name,
      outputDir,
      overwrite: context.config.safety.overwrite,
      ...input.postprocess
    });
    return textResult(makeReport({
      id: name,
      kind: "adapted-image",
      files: [adapted.path],
      warnings: adapted.warnings,
      importPath: cocosImportPath(context.config, adapted.path),
      recommendedType: "SpriteFrame",
      notes: [`Source file: ${basename(input.inputPath)}`]
    }));
  });

  server.registerTool("asset_forge_adapt_audio", {
    title: "Adapt Audio For Cocos",
    description: "Convert an existing audio file into a Cocos-ready AudioClip file.",
    inputSchema: adaptAudioInput
  }, async (input) => {
    const name = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, name);
    const inputPath = resolve(input.inputPath);
    const buffer = await readFile(inputPath);
    const sourceExtension = extname(inputPath).replace(".", "") || input.postprocess.format;
    const adapted = await adaptAudioBuffer(buffer, sourceExtension, {
      name,
      outputDir,
      overwrite: context.config.safety.overwrite,
      ...input.postprocess
    });
    return textResult(makeReport({
      id: name,
      kind: "adapted-audio",
      files: [adapted.path],
      manifest: adapted.manifestPath,
      warnings: adapted.warnings,
      importPath: cocosImportPath(context.config, adapted.path),
      recommendedType: "AudioClip",
      notes: [`Source file: ${basename(input.inputPath)}`]
    }));
  });
}

function resolveOutputDir(config: ForgeConfig, explicit: string | undefined, assetName: string): string {
  const base = explicit ?? config.defaultOutputDir;
  return resolve(process.cwd(), base, withTimestamp(assetName));
}

function cocosImportPath(config: ForgeConfig, filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/");
  const projectRoot = config.cocos.projectRoot?.replaceAll("\\", "/");
  if (projectRoot && normalized.startsWith(projectRoot)) {
    return normalized.slice(projectRoot.length + 1);
  }
  const assetRoot = config.cocos.assetRoot.replaceAll("\\", "/");
  const marker = `/${assetRoot}/`;
  const index = normalized.indexOf(marker);
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

function makeReport(input: {
  id: string;
  kind: string;
  files: string[];
  manifest?: string;
  warnings: string[];
  importPath: string;
  recommendedType: string;
  notes: string[];
}): AssetReport {
  return {
    id: input.id,
    kind: input.kind,
    files: input.files,
    manifest: input.manifest,
    warnings: input.warnings,
    cocos: {
      importPath: input.importPath,
      recommendedType: input.recommendedType,
      notes: input.notes
    }
  };
}

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2)
      }
    ]
  };
}

function planPack(input: {
  gameDescription: string;
  targetPlatform: string;
  artDirection?: string;
  assetTypes: string[];
}) {
  const baseStyle = input.artDirection ?? "cohesive production-ready game art";
  return {
    targetPlatform: input.targetPlatform,
    gameDescription: input.gameDescription,
    artDirection: baseStyle,
    recommendedOrder: [
      "Define art bible keywords and negative prompts.",
      "Generate placeholder sprites and UI first to unblock implementation.",
      "Generate animation frames with locked seeds and consistent camera language.",
      "Generate audio after core interactions are known.",
      "Run adapt tools on any externally produced assets before importing into Cocos."
    ],
    assets: input.assetTypes.flatMap((type) => recommendationsFor(type, baseStyle))
  };
}

function recommendationsFor(type: string, style: string) {
  switch (type) {
    case "sprites":
      return [
        { tool: "asset_forge_generate_sprite", name: "player", promptHint: `main controllable character, ${style}, flat chroma key background` },
        { tool: "asset_forge_generate_sprite", name: "enemy-basic", promptHint: `basic enemy readable silhouette, ${style}, flat chroma key background` },
        { tool: "asset_forge_generate_sprite", name: "pickup", promptHint: `collectible reward item, high readability, ${style}` }
      ];
    case "sprite_sheets":
      return [
        { tool: "asset_forge_generate_sprite_grid_sheet", name: "player-run", promptHint: `3x3 or 4x3 player run contact sheet, consistent proportions, ${style}` },
        { tool: "asset_forge_generate_sprite_grid_sheet", name: "impact", promptHint: `3x3 short hit impact contact sheet, key-color background, ${style}` },
        { tool: "asset_forge_generate_sprite_sheet", name: "fallback-frame-by-frame", promptHint: `use only when a provider cannot produce reliable contact sheets, ${style}` }
      ];
    case "tilesets":
      return [
        { tool: "asset_forge_generate_tileset", name: "level-tiles", promptHint: `ground, wall, corner, decoration tiles, ${style}` }
      ];
    case "ui":
      return [
        { tool: "asset_forge_generate_ui_pack", name: "hud", promptHint: `buttons, panels, icons, meters, ${style}` }
      ];
    case "sfx":
      return [
        { tool: "asset_forge_generate_sfx", name: "jump", promptHint: "short responsive jump sound" },
        { tool: "asset_forge_generate_sfx", name: "collect", promptHint: "bright collectible pickup sound" }
      ];
    case "music":
      return [
        { tool: "asset_forge_generate_music_loop", name: "main-loop", promptHint: `loopable background music matching ${style}` }
      ];
    default:
      return [];
  }
}

function buildGridPrompt(input: {
  prompt: string;
  action: string;
  rows: number;
  columns: number;
  frameCount: number;
  frameWidth: number;
  frameHeight: number;
  background: "transparent" | "flat_key_color" | "white";
}): string {
  const background = input.background === "flat_key_color"
    ? "pure #00ff00 chroma key background inside every cell, no checkerboard, no texture, no shadow"
    : input.background === "transparent"
      ? "transparent background inside every cell"
      : "plain white background inside every cell";
  return [
    input.prompt,
    `Create a single ${input.columns} columns by ${input.rows} rows contact sheet for the action/state set "${input.action}".`,
    `Exactly ${input.frameCount} usable frames, each frame centered in a ${input.frameWidth}x${input.frameHeight} cell.`,
    "Keep the same character identity, costume, proportions, camera angle, scale, lighting, outline weight, and color palette in every cell.",
    "No grid lines, no labels, no text, no numbers, no watermark, no cropping, no merged cells.",
    "Leave comfortable empty space around the subject in each cell for clean slicing.",
    `Use ${background}.`,
    "Order frames left to right, top to bottom."
  ].join("\n");
}

function withDefaultChromaKey<T extends {
  transparentBackground: boolean;
  chromaKey?: { color?: string; tolerance: number };
}>(postprocess: T): T {
  if (!postprocess.transparentBackground || postprocess.chromaKey?.color) return postprocess;
  return {
    ...postprocess,
    chromaKey: {
      color: DEFAULT_KEY_COLOR,
      tolerance: postprocess.chromaKey?.tolerance ?? DEFAULT_KEY_TOLERANCE
    }
  };
}
