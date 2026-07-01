import { readFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ForgeConfig } from "../config/schema.js";
import { redactConfig } from "../config/load.js";
import type { AudioProvider, ImageProvider } from "../generation/types.js";
import { adaptAudioBuffer } from "../processing/audio.js";
import { adaptImageBuffer, analyzeFrameVariation, makeSpriteSheet, splitGridImageToBuffers } from "../processing/image.js";
import type { AdaptedImage } from "../processing/image.js";
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
      cutout: context.config.cutout,
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
    const adaptedFrames: AdaptedImage[] = [];
    const warnings: string[] = [];
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
        cutout: context.config.cutout,
        ...withDefaultChromaKey(input.postprocess)
      });
      framePaths.push(adapted.path);
      adaptedFrames.push(adapted);
      warnings.push(...adapted.warnings);
    }
    const variation = await analyzeFrameVariation(adaptedFrames);
    warnings.push(...variation.warnings);

    const sheet = await makeSpriteSheet(adaptedFrames, {
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
      warnings,
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
    description: "Generate one AI contact sheet such as 3x3 or 4x3 for better consistency and lower cost, slice it into frames, clean alpha, and pack Cocos-ready sprite sheet metadata. Use for animations, state sets, variants, icons, or related static asset packs.",
    inputSchema: generateSpriteGridSheetInput
  }, async (input) => {
    const baseName = slugify(input.name);
    const outputDir = resolveOutputDir(context.config, input.outputDir, baseName);
    const framesDir = join(outputDir, "frames");
    const sourceDir = join(outputDir, "source");
    const frameCount = input.frameCount ?? input.rows * input.columns;
    const isVariantGrid = isVariantGridAction(input.action);
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
      maxTextureSize: Math.max(sheetWidth, sheetHeight, input.postprocess.maxTextureSize),
      cutout: context.config.cutout
    });
    const frameBuffers = await splitGridImageToBuffers(generated.bytes, {
      rows: input.rows,
      columns: input.columns,
      limit: frameCount
    });
    const framePaths: string[] = [];
    const adaptedFrames: AdaptedImage[] = [];
    const warnings: string[] = [];
    for (const frame of frameBuffers) {
      const adapted = await adaptImageBuffer(frame.buffer, {
        name: `${baseName}-${slugify(input.action)}-${String(frame.index + 1).padStart(3, "0")}`,
        outputDir: framesDir,
        overwrite: context.config.safety.overwrite,
        cutout: context.config.cutout,
        ...withDefaultChromaKey(input.postprocess),
        chromaKey: keyColor
          ? { color: keyColor, tolerance: input.postprocess.chromaKey?.tolerance ?? DEFAULT_KEY_TOLERANCE }
          : input.postprocess.chromaKey
      });
      framePaths.push(adapted.path);
      adaptedFrames.push(adapted);
      warnings.push(...adapted.warnings);
    }
    const variation = await analyzeFrameVariation(adaptedFrames);
    warnings.push(...variation.warnings);

    const sheet = await makeSpriteSheet(adaptedFrames, {
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
        `Frame variation QA: averageDelta=${variation.averageDelta.toFixed(3)}, minDelta=${variation.minDelta.toFixed(3)}, maxDelta=${variation.maxDelta.toFixed(3)}.`,
        isVariantGrid
          ? "Grid contact sheets reduce generation cost, but every sliced cell should still be reviewed for role fit, silhouette, alpha, and accidental merged subjects."
          : "Grid contact sheets improve consistency, but frame boundaries and motion readability should still be visually checked before final animation timing."
      ],
      importPath: cocosImportPath(context.config, sheet.imagePath),
      recommendedType: isVariantGrid ? "SpriteAtlas / sliced SpriteFrames" : "SpriteAtlas + AnimationClip",
      notes: [
        isVariantGrid
          ? "This used one AI contact-sheet generation for multiple related assets or states, reducing provider calls versus one-by-one sprite generation."
          : "This used one AI contact-sheet generation for stronger identity consistency across frames.",
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
        cutout: context.config.cutout,
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
        cutout: context.config.cutout,
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
      cutout: context.config.cutout,
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

export function planPack(input: {
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
      "Generate one style-anchor sprite only when needed to prove the look.",
      "Batch related sprites, icons, states, and VFX into grid/contact sheets first, then slice and review the cells.",
      "Generate animation frames with grid sheets, locked seeds, and consistent camera language.",
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
        { tool: "asset_forge_generate_sprite", name: "style-anchor", promptHint: `single style anchor only when the look is still unproven, ${style}, flat chroma key background` },
        { tool: "asset_forge_generate_sprite_grid_sheet", name: "first-loop-sprite-pack", promptHint: `3x3 asset-pack contact sheet containing player, 3 enemies, 2 pickups, 2 projectiles, 1 warning marker, ${style}, flat key-color background` },
        { tool: "asset_forge_generate_sprite_grid_sheet", name: "enemy-variant-pack", promptHint: `4x3 enemy-pack contact sheet with related enemy silhouettes, threat tiers, and readable mobile shapes, ${style}` }
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
  const isVariantGrid = isVariantGridAction(input.action);
  if (isVariantGrid) {
    return [
      input.prompt,
      `Create a single ${input.columns} columns by ${input.rows} rows contact sheet for the Cocos asset pack/state set "${input.action}".`,
      `Exactly ${input.frameCount} usable cells, each cell centered in a ${input.frameWidth}x${input.frameHeight} area.`,
      "Each cell must contain one complete asset, state, icon, prop, enemy, pickup, projectile, or VFX element requested by the prompt.",
      "Keep the same art bible, camera language, outline weight, lighting direction, value range, and palette across all cells.",
      "Make each cell distinct in gameplay role or state; avoid near-duplicates unless the prompt asks for variants.",
      "No grid lines, labels, text, numbers, watermarks, collages, cropped subjects, merged cells, or multi-subject clutter inside a cell.",
      "Leave comfortable empty space around each subject for clean slicing and Cocos pivots.",
      `Use ${background}.`,
      "Order cells left to right, top to bottom."
    ].join("\n");
  }
  const motionGuide = motionGuideForAction(input.action, input.frameCount);
  return [
    input.prompt,
    `Create a single ${input.columns} columns by ${input.rows} rows contact sheet for the animation action "${input.action}".`,
    `Exactly ${input.frameCount} usable frames, each frame centered in a ${input.frameWidth}x${input.frameHeight} cell.`,
    "Keep the same character identity, costume, proportions, camera angle, scale, lighting, outline weight, and color palette in every cell.",
    "Every cell must show a distinct animation key pose, not duplicated static artwork.",
    "Change limb positions, body squash/stretch, silhouette, held-item position, cloth/hair secondary motion, and contact points across frames while preserving identity.",
    motionGuide,
    "For looping actions, make the final frame lead naturally back into frame 1 without copying frame 1 exactly.",
    "No grid lines, no labels, no text, no numbers, no watermark, no cropping, no merged cells.",
    "Leave comfortable empty space around the subject in each cell for clean slicing.",
    `Use ${background}.`,
    "Order frames left to right, top to bottom."
  ].join("\n");
}

function isVariantGridAction(action: string): boolean {
  return /(asset|sprite|variant|variants|state|states|set|pack|icons?|items?|props?|enemies|enemy|pickups?|projectiles?|vfx|ui)/i.test(action);
}

function motionGuideForAction(action: string, frameCount: number): string {
  const normalized = action.toLowerCase();
  if (/(run|running|sprint|dash)/.test(normalized)) {
    return `Pose progression for ${frameCount} frames: contact, down, passing, up, opposite contact, opposite down, opposite passing, opposite up; show clear alternating legs and arms.`;
  }
  if (/(walk|walking)/.test(normalized)) {
    return `Pose progression for ${frameCount} frames: contact, recoil/down, passing, high point, opposite contact, opposite recoil, opposite passing, opposite high point; keep the stride readable.`;
  }
  if (/(idle|breath|stand)/.test(normalized)) {
    return `Pose progression for ${frameCount} frames: subtle but visible breathing loop with head, shoulders, hands, clothing, and hair shifting over time; no two adjacent frames identical.`;
  }
  if (/(jump|leap)/.test(normalized)) {
    return `Pose progression for ${frameCount} frames: crouch anticipation, launch, rising, apex, falling, landing anticipation, impact, recover.`;
  }
  if (/(attack|slash|hit|shoot|cast)/.test(normalized)) {
    return `Pose progression for ${frameCount} frames: anticipation, wind-up, action smear/contact, follow-through, recoil, settle; make the silhouette change strongly.`;
  }
  if (/(death|die|ko|fall)/.test(normalized)) {
    return `Pose progression for ${frameCount} frames: hit reaction, stagger, falling, impact, collapse, settle; each frame should advance the action.`;
  }
  return `Pose progression for ${frameCount} frames: clear beginning, anticipation, main action, follow-through, recovery, and loop/settle poses; no adjacent frames should be visually identical.`;
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
