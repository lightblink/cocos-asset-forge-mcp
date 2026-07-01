import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import sharp from "sharp";
import { ensureDir, writeFileSafe } from "../utils/fs.js";
import { stableJson } from "../utils/json.js";

export type ImageAdaptOptions = {
  name: string;
  outputDir: string;
  overwrite: boolean;
  transparentBackground: boolean;
  chromaKey?: { color?: string; tolerance: number };
  trimTransparentEdges: boolean;
  trimTransparentPadding?: number;
  padToPowerOfTwo: boolean;
  extrudePixels: number;
  maxTextureSize: number;
  cutout?: CutoutOptions;
};

export type CutoutOptions = {
  backend: "auto" | "chroma-key" | "local-command";
  command?: string;
  args: string[];
  timeoutMs: number;
  triggerMinRemovedRatio: number;
};

export type AdaptedImage = {
  path: string;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  trim?: TrimRect;
  warnings: string[];
};

type Rgb = { r: number; g: number; b: number };

type RemoveBackgroundResult = {
  image: sharp.Sharp;
  removedPixels: number;
  totalPixels: number;
};

type LocalCutoutResult = {
  bytes: Buffer;
  warnings: string[];
};

type NormalizedSpriteSheetFrame = {
  path: string;
  packedWidth: number;
  packedHeight: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
  hasTrimMetadata: boolean;
};

export type SpriteSheetOptions = {
  name: string;
  outputDir: string;
  overwrite: boolean;
  frameWidth: number;
  frameHeight: number;
  columns: number;
  padding: number;
  margin: number;
};

export type SpriteFrame = {
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceX: number;
  sourceY: number;
  sourceWidth: number;
  sourceHeight: number;
};

export type SpriteSheetResult = {
  imagePath: string;
  manifestPath: string;
  plistPath: string;
  frames: SpriteFrame[];
};

export type TrimRect = {
  x: number;
  y: number;
  width: number;
  height: number;
  padding: number;
};

export type SpriteSheetInputFrame = string | Pick<AdaptedImage, "path" | "sourceWidth" | "sourceHeight" | "trim">;

export type GridFrameBuffer = {
  index: number;
  row: number;
  column: number;
  buffer: Buffer;
  width: number;
  height: number;
};

export async function adaptImageBuffer(buffer: Buffer, options: ImageAdaptOptions): Promise<AdaptedImage> {
  await ensureDir(options.outputDir);
  const warnings: string[] = [];
  let image = sharp(buffer, { animated: false }).ensureAlpha();
  const sourceMeta = await image.metadata();
  const sourceWidth = sourceMeta.width ?? 0;
  const sourceHeight = sourceMeta.height ?? 0;
  let trim: TrimRect | undefined;

  if (options.transparentBackground) {
    if (shouldRunLocalCommandFirst(options.cutout)) {
      const local = await runLocalCommandCutout(await image.clone().png().toBuffer(), options.cutout);
      image = await cleanLocalCutoutOutput(local.bytes, options.chromaKey);
      warnings.push(...local.warnings);
    } else {
      const sourceForFallback = await image.clone().png().toBuffer();
      const removed = await removeBackground(image, options.chromaKey);
      image = removed.image;
      const removedRatio = removed.totalPixels > 0 ? removed.removedPixels / removed.totalPixels : 0;
      if (removedRatio < 0.01) {
        warnings.push(
          `Background removal removed only ${(removedRatio * 100).toFixed(1)}% of pixels. The model may not have used a flat key background.`
        );
      } else if (removedRatio > 0.92) {
        warnings.push(
          `Background removal removed ${(removedRatio * 100).toFixed(1)}% of pixels. Check that the subject was not too close to the key color.`
        );
      }

      if (shouldFallbackToLocalCommand(options.cutout, removedRatio)) {
        const local = await runLocalCommandCutout(sourceForFallback, options.cutout);
        image = await cleanLocalCutoutOutput(local.bytes, options.chromaKey);
        warnings.push(
          `Chroma-key removal removed only ${(removedRatio * 100).toFixed(1)}% of pixels, so local segmentation backend was used.`
        );
        warnings.push(...local.warnings);
      }
    }
  }

  if (options.trimTransparentEdges) {
    const trimmed = await trimTransparentImage(image, options.trimTransparentPadding ?? 2);
    image = trimmed.image;
    trim = trimmed.trim;
    if (!trim) warnings.push("Transparent-edge trim was requested, but no visible pixels were found.");
  }

  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width > options.maxTextureSize || height > options.maxTextureSize) {
    const ratio = Math.min(options.maxTextureSize / width, options.maxTextureSize / height);
    image = image.resize({
      width: Math.floor(width * ratio),
      height: Math.floor(height * ratio),
      fit: "inside",
      kernel: sharp.kernel.lanczos3
    });
    warnings.push(`Image was resized to fit maxTextureSize ${options.maxTextureSize}.`);
  }

  if (options.extrudePixels > 0) {
    image = await extrudeTransparentBorder(image, options.extrudePixels);
  }

  if (options.padToPowerOfTwo) {
    image = await padToPowerOfTwo(image);
  }

  const outputBuffer = await image.png({ compressionLevel: 9 }).toBuffer();
  const finalMeta = await sharp(outputBuffer).metadata();
  const outputPath = join(options.outputDir, `${options.name}.png`);
  await writeFileSafe(outputPath, outputBuffer, options.overwrite);

  return {
    path: outputPath,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    sourceWidth,
    sourceHeight,
    trim,
    warnings
  };
}

export async function makeSpriteSheet(framesInput: SpriteSheetInputFrame[], options: SpriteSheetOptions): Promise<SpriteSheetResult> {
  if (framesInput.length === 0) throw new Error("At least one frame is required");
  await ensureDir(options.outputDir);
  const rows = Math.ceil(framesInput.length / options.columns);
  const width = options.margin * 2 + options.columns * options.frameWidth + (options.columns - 1) * options.padding;
  const height = options.margin * 2 + rows * options.frameHeight + (rows - 1) * options.padding;
  const frameSources = await Promise.all(framesInput.map(normalizeSpriteSheetFrame));

  const composites = await Promise.all(
    frameSources.map(async (frame, index) => {
      const column = index % options.columns;
      const row = Math.floor(index / options.columns);
      const left = options.margin + column * (options.frameWidth + options.padding);
      const top = options.margin + row * (options.frameHeight + options.padding);
      const input = frame.hasTrimMetadata
        ? await sharp(frame.path).ensureAlpha().png().toBuffer()
        : await sharp(frame.path)
          .ensureAlpha()
          .resize(options.frameWidth, options.frameHeight, {
            fit: "contain",
            background: { r: 0, g: 0, b: 0, alpha: 0 }
          })
          .png()
          .toBuffer();
      return { input, left, top };
    })
  );

  const image = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  })
    .composite(composites)
    .png({ compressionLevel: 9 })
    .toBuffer();

  const frames = frameSources.map((frame, index) => {
    const column = index % options.columns;
    const row = Math.floor(index / options.columns);
    const frameWidth = frame.hasTrimMetadata ? frame.packedWidth : options.frameWidth;
    const frameHeight = frame.hasTrimMetadata ? frame.packedHeight : options.frameHeight;
    const sourceWidth = frame.hasTrimMetadata ? frame.sourceWidth : options.frameWidth;
    const sourceHeight = frame.hasTrimMetadata ? frame.sourceHeight : options.frameHeight;
    return {
      name: basename(frame.path, ".png"),
      x: options.margin + column * (options.frameWidth + options.padding),
      y: options.margin + row * (options.frameHeight + options.padding),
      width: frameWidth,
      height: frameHeight,
      sourceX: frame.hasTrimMetadata ? frame.sourceX : 0,
      sourceY: frame.hasTrimMetadata ? frame.sourceY : 0,
      sourceWidth,
      sourceHeight
    };
  });

  const imagePath = join(options.outputDir, `${options.name}.png`);
  const manifestPath = join(options.outputDir, `${options.name}.cocos-asset.json`);
  const plistPath = join(options.outputDir, `${options.name}.plist`);
  await writeFileSafe(imagePath, image, options.overwrite);
  await writeFileSafe(manifestPath, stableJson({
    type: "sprite-sheet",
    image: imagePath,
    width,
    height,
    frames,
    cocos: {
      importAs: "Sprite Atlas or individual SpriteFrames",
      notes: [
        "Drag the PNG into Cocos Creator Assets.",
        "Use the frame manifest to create animation clips or slice frames in an editor extension.",
        "The generated plist follows TexturePacker-style coordinates for tools that can consume it."
      ]
    }
  }), options.overwrite);
  await writeFileSafe(plistPath, makeTexturePackerPlist(`${options.name}.png`, width, height, frames), options.overwrite);

  return { imagePath, manifestPath, plistPath, frames };
}

export async function splitGridImage(
  buffer: Buffer,
  options: {
    name: string;
    outputDir: string;
    overwrite: boolean;
    rows: number;
    columns: number;
  }
): Promise<string[]> {
  await ensureDir(options.outputDir);
  const image = sharp(buffer).ensureAlpha();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const frameWidth = Math.floor(width / options.columns);
  const frameHeight = Math.floor(height / options.rows);
  const paths: string[] = [];

  for (let row = 0; row < options.rows; row += 1) {
    for (let column = 0; column < options.columns; column += 1) {
      const index = row * options.columns + column;
      const path = join(options.outputDir, `${options.name}-${String(index + 1).padStart(3, "0")}.png`);
      const frame = await image
        .clone()
        .extract({ left: column * frameWidth, top: row * frameHeight, width: frameWidth, height: frameHeight })
        .png({ compressionLevel: 9 })
        .toBuffer();
      await writeFileSafe(path, frame, options.overwrite);
      paths.push(path);
    }
  }

  return paths;
}

export async function splitGridImageToBuffers(
  buffer: Buffer,
  options: {
    rows: number;
    columns: number;
    limit?: number;
  }
): Promise<GridFrameBuffer[]> {
  const image = sharp(buffer).ensureAlpha();
  const meta = await image.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const frameWidth = Math.floor(width / options.columns);
  const frameHeight = Math.floor(height / options.rows);
  const maxFrames = Math.min(options.limit ?? options.rows * options.columns, options.rows * options.columns);
  const frames: GridFrameBuffer[] = [];

  for (let index = 0; index < maxFrames; index += 1) {
    const row = Math.floor(index / options.columns);
    const column = index % options.columns;
    frames.push({
      index,
      row,
      column,
      width: frameWidth,
      height: frameHeight,
      buffer: await image
        .clone()
        .extract({ left: column * frameWidth, top: row * frameHeight, width: frameWidth, height: frameHeight })
        .png({ compressionLevel: 9 })
        .toBuffer()
    });
  }

  return frames;
}

async function removeBackground(
  image: sharp.Sharp,
  chromaKey?: { color?: string; tolerance: number }
): Promise<RemoveBackgroundResult> {
  const raw = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = raw.info.channels;
  const data = Buffer.from(raw.data);
  const explicitKey = Boolean(chromaKey?.color);
  const key = chromaKey?.color ? hexToRgb(chromaKey.color) : sampleCornerColor(data, raw.info.width, raw.info.height, channels);
  const tolerance = chromaKey?.tolerance ?? 42;
  const mask = floodFillBackgroundMask(data, raw.info.width, raw.info.height, channels, key, tolerance);
  if (explicitKey) {
    const cornerKey = sampleCornerColor(data, raw.info.width, raw.info.height, channels);
    if (rgbDistance(cornerKey, key) > tolerance && isLikelyGeneratedFrameBackground(cornerKey)) {
      mergeMask(mask, floodFillBackgroundMask(data, raw.info.width, raw.info.height, channels, cornerKey, Math.min(48, Math.max(18, tolerance))));
    }
  }
  if (isGreenKey(key)) {
    removeConnectedDominantGreen(data, raw.info.width, raw.info.height, channels, mask);
  }
  let removedPixels = 0;

  for (let pixel = 0; pixel < mask.length; pixel += 1) {
    if (mask[pixel] === 1) {
      data[pixel * channels + 3] = 0;
      removedPixels += 1;
    }
  }

  return {
    image: sharp(data, {
      raw: {
        width: raw.info.width,
        height: raw.info.height,
        channels
      }
    }),
    removedPixels,
    totalPixels: raw.info.width * raw.info.height
  };
}

function shouldRunLocalCommandFirst(cutout: CutoutOptions | undefined): cutout is CutoutOptions & { command: string } {
  return cutout?.backend === "local-command" && Boolean(cutout.command);
}

function shouldFallbackToLocalCommand(
  cutout: CutoutOptions | undefined,
  removedRatio: number
): cutout is CutoutOptions & { command: string } {
  return cutout?.backend === "auto" && Boolean(cutout.command) && removedRatio < cutout.triggerMinRemovedRatio;
}

async function runLocalCommandCutout(
  inputBytes: Buffer,
  cutout: CutoutOptions & { command: string }
): Promise<LocalCutoutResult> {
  const dir = await mkdtemp(join(tmpdir(), "cocos-asset-cutout-"));
  const inputPath = join(dir, "input.png");
  const outputPath = join(dir, "output.png");
  try {
    await writeFileSafe(inputPath, inputBytes, true);
    const args = cutout.args.map((arg) => arg
      .replaceAll("{input}", inputPath)
      .replaceAll("{output}", outputPath));
    await runCommand(cutout.command, args, cutout.timeoutMs);
    const bytes = await readFile(outputPath);
    await sharp(bytes, { animated: false }).ensureAlpha().metadata();
    return {
      bytes,
      warnings: [`Local segmentation cutout backend ran: ${cutout.command}`]
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function cleanLocalCutoutOutput(
  bytes: Buffer,
  chromaKey?: { color?: string; tolerance: number }
): Promise<sharp.Sharp> {
  const image = sharp(bytes, { animated: false }).ensureAlpha();
  if (!chromaKey?.color) return image;
  return removeChromaResidue((await removeBackground(image, chromaKey)).image, chromaKey);
}

async function removeChromaResidue(
  image: sharp.Sharp,
  chromaKey: { color?: string; tolerance: number }
): Promise<sharp.Sharp> {
  if (!chromaKey.color) return image;
  const key = hexToRgb(chromaKey.color);
  const raw = await image.raw().toBuffer({ resolveWithObject: true });
  const data = Buffer.from(raw.data);
  const channels = raw.info.channels;
  for (let i = 0; i < data.length; i += channels) {
    if (data[i + 3] <= 8) continue;
    if (colorDistance(data, i, key) <= chromaKey.tolerance || (isGreenKey(key) && isDominantGreen(data, i))) {
      data[i + 3] = 0;
    }
  }
  return sharp(data, {
    raw: {
      width: raw.info.width,
      height: raw.info.height,
      channels
    }
  });
}

async function runCommand(command: string, args: string[], timeoutMs: number): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`Local cutout command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolvePromise();
      } else {
        const output = [...stdout, ...stderr].map((chunk) => chunk.toString("utf8")).join("").trim();
        reject(new Error(`Local cutout command failed with exit code ${code}: ${output}`));
      }
    });
  });
}

async function trimTransparentImage(
  image: sharp.Sharp,
  padding: number
): Promise<{ image: sharp.Sharp; trim?: TrimRect }> {
  const raw = await image.raw().toBuffer({ resolveWithObject: true });
  const data = raw.data;
  const channels = raw.info.channels;
  const width = raw.info.width;
  const height = raw.info.height;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha <= 8) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      image: sharp(data, { raw: { width, height, channels } })
    };
  }

  const safePadding = Math.max(0, Math.floor(padding));
  const left = Math.max(0, minX - safePadding);
  const top = Math.max(0, minY - safePadding);
  const right = Math.min(width - 1, maxX + safePadding);
  const bottom = Math.min(height - 1, maxY + safePadding);
  const trimWidth = right - left + 1;
  const trimHeight = bottom - top + 1;

  return {
    image: sharp(data, { raw: { width, height, channels } }).extract({
      left,
      top,
      width: trimWidth,
      height: trimHeight
    }),
    trim: {
      x: left,
      y: top,
      width: trimWidth,
      height: trimHeight,
      padding: safePadding
    }
  };
}

async function normalizeSpriteSheetFrame(frame: SpriteSheetInputFrame): Promise<NormalizedSpriteSheetFrame> {
  const path = typeof frame === "string" ? frame : frame.path;
  const meta = await sharp(path).metadata();
  const packedWidth = meta.width ?? 0;
  const packedHeight = meta.height ?? 0;
  if (typeof frame !== "string" && frame.trim) {
    return {
      path,
      packedWidth,
      packedHeight,
      sourceX: frame.trim.x,
      sourceY: frame.trim.y,
      sourceWidth: frame.sourceWidth,
      sourceHeight: frame.sourceHeight,
      hasTrimMetadata: true
    };
  }
  return {
    path,
    packedWidth,
    packedHeight,
    sourceX: 0,
    sourceY: 0,
    sourceWidth: packedWidth,
    sourceHeight: packedHeight,
    hasTrimMetadata: false
  };
}

async function extrudeTransparentBorder(image: sharp.Sharp, pixels: number): Promise<sharp.Sharp> {
  const buffer = await image.png().toBuffer();
  const meta = await sharp(buffer).metadata();
  return sharp({
    create: {
      width: (meta.width ?? 0) + pixels * 2,
      height: (meta.height ?? 0) + pixels * 2,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([{ input: buffer, left: pixels, top: pixels }]);
}

async function padToPowerOfTwo(image: sharp.Sharp): Promise<sharp.Sharp> {
  const buffer = await image.png().toBuffer();
  const meta = await sharp(buffer).metadata();
  const width = nextPowerOfTwo(meta.width ?? 1);
  const height = nextPowerOfTwo(meta.height ?? 1);
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
  }).composite([{ input: buffer, left: 0, top: 0 }]);
}

function floodFillBackgroundMask(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  key: Rgb,
  tolerance: number
): Uint8Array {
  const total = width * height;
  const mask = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  function enqueue(pixel: number): void {
    if (pixel < 0 || pixel >= total || mask[pixel] === 1) return;
    if (!isBackgroundLike(data, pixel * channels, key, tolerance)) return;
    mask[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }

  for (let x = 0; x < width; x += 1) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueue(y * width);
    enqueue(y * width + width - 1);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  return mask;
}

function removeConnectedDominantGreen(
  data: Buffer,
  width: number,
  height: number,
  channels: number,
  mask: Uint8Array
): void {
  const total = width * height;
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  function enqueue(pixel: number): void {
    if (pixel < 0 || pixel >= total || mask[pixel] === 1) return;
    if (!isDominantGreen(data, pixel * channels)) return;
    mask[pixel] = 1;
    queue[tail] = pixel;
    tail += 1;
  }

  for (let pixel = 0; pixel < total; pixel += 1) {
    if (mask[pixel] !== 1) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }

  while (head < tail) {
    const pixel = queue[head];
    head += 1;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    if (x > 0) enqueue(pixel - 1);
    if (x < width - 1) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - width);
    if (y < height - 1) enqueue(pixel + width);
  }
}

function mergeMask(target: Uint8Array, source: Uint8Array): void {
  for (let i = 0; i < target.length; i += 1) {
    if (source[i] === 1) target[i] = 1;
  }
}

function isBackgroundLike(data: Buffer, offset: number, key: Rgb, tolerance: number): boolean {
  if (data[offset + 3] <= 8) return true;
  if (isGreenKey(key) && isDominantGreen(data, offset)) return true;
  return colorDistance(data, offset, key) <= tolerance;
}

function isGreenKey(key: Rgb): boolean {
  return key.g > 180 && key.r < 80 && key.b < 80;
}

function isDominantGreen(data: Buffer, offset: number): boolean {
  const r = data[offset];
  const g = data[offset + 1];
  const b = data[offset + 2];
  return g >= 40 && g - r >= 24 && g - b >= 24 && g > r * 1.35 && g > b * 1.35;
}

function colorDistance(data: Buffer, offset: number, key: Rgb): number {
  return Math.sqrt(
    (data[offset] - key.r) ** 2 +
    (data[offset + 1] - key.g) ** 2 +
    (data[offset + 2] - key.b) ** 2
  );
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

function isLikelyGeneratedFrameBackground(color: Rgb): boolean {
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  return max - min <= 24 && (max >= 220 || max <= 36);
}

function sampleCornerColor(data: Buffer, width: number, height: number, channels: number): Rgb {
  const indexes = [0, width - 1, (height - 1) * width, height * width - 1].map((pixel) => pixel * channels);
  const sum = indexes.reduce(
    (acc, index) => ({
      r: acc.r + data[index],
      g: acc.g + data[index + 1],
      b: acc.b + data[index + 2]
    }),
    { r: 0, g: 0, b: 0 }
  );
  return {
    r: Math.round(sum.r / indexes.length),
    g: Math.round(sum.g / indexes.length),
    b: Math.round(sum.b / indexes.length)
  };
}

function hexToRgb(value: string): Rgb {
  return {
    r: Number.parseInt(value.slice(1, 3), 16),
    g: Number.parseInt(value.slice(3, 5), 16),
    b: Number.parseInt(value.slice(5, 7), 16)
  };
}

function nextPowerOfTwo(value: number): number {
  return 2 ** Math.ceil(Math.log2(value));
}

function makeTexturePackerPlist(image: string, width: number, height: number, frames: SpriteFrame[]): string {
  const formatOffset = (frame: SpriteFrame) => {
    const x = frame.sourceX + frame.width / 2 - frame.sourceWidth / 2;
    const y = frame.sourceHeight / 2 - (frame.sourceY + frame.height / 2);
    return `{${formatPlistNumber(x)},${formatPlistNumber(y)}}`;
  };
  const frameEntries = frames.map((frame) => `
    <key>${escapeXml(frame.name)}</key>
    <dict>
      <key>aliases</key><array/>
      <key>frame</key><string>{{${frame.x},${frame.y}},{${frame.width},${frame.height}}}</string>
      <key>offset</key><string>${formatOffset(frame)}</string>
      <key>rotated</key><false/>
      <key>sourceColorRect</key><string>{{${frame.sourceX},${frame.sourceY}},{${frame.width},${frame.height}}}</string>
      <key>sourceSize</key><string>{${frame.sourceWidth},${frame.sourceHeight}}</string>
      <key>spriteOffset</key><string>${formatOffset(frame)}</string>
      <key>spriteSize</key><string>{${frame.width},${frame.height}}</string>
      <key>spriteSourceSize</key><string>{${frame.sourceWidth},${frame.sourceHeight}}</string>
      <key>textureRect</key><string>{{${frame.x},${frame.y}},{${frame.width},${frame.height}}}</string>
      <key>textureRotated</key><false/>
    </dict>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>frames</key>
  <dict>${frameEntries}
  </dict>
  <key>metadata</key>
  <dict>
    <key>format</key><integer>3</integer>
    <key>realTextureFileName</key><string>${escapeXml(image)}</string>
    <key>size</key><string>{${width},${height}}</string>
    <key>textureFileName</key><string>${escapeXml(image)}</string>
  </dict>
</dict>
</plist>
`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPlistNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}
