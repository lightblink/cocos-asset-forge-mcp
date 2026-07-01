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
  padToPowerOfTwo: boolean;
  extrudePixels: number;
  maxTextureSize: number;
};

export type AdaptedImage = {
  path: string;
  width: number;
  height: number;
  warnings: string[];
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
};

export type SpriteSheetResult = {
  imagePath: string;
  manifestPath: string;
  plistPath: string;
  frames: SpriteFrame[];
};

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

  if (options.transparentBackground) {
    image = await removeBackground(image, options.chromaKey);
  }

  if (options.trimTransparentEdges) {
    image = image.trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } });
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

  const finalMeta = await image.metadata();
  const outputPath = join(options.outputDir, `${options.name}.png`);
  await writeFileSafe(outputPath, await image.png({ compressionLevel: 9 }).toBuffer(), options.overwrite);

  return {
    path: outputPath,
    width: finalMeta.width ?? 0,
    height: finalMeta.height ?? 0,
    warnings
  };
}

export async function makeSpriteSheet(framePaths: string[], options: SpriteSheetOptions): Promise<SpriteSheetResult> {
  if (framePaths.length === 0) throw new Error("At least one frame is required");
  await ensureDir(options.outputDir);
  const rows = Math.ceil(framePaths.length / options.columns);
  const width = options.margin * 2 + options.columns * options.frameWidth + (options.columns - 1) * options.padding;
  const height = options.margin * 2 + rows * options.frameHeight + (rows - 1) * options.padding;

  const composites = await Promise.all(
    framePaths.map(async (path, index) => {
      const column = index % options.columns;
      const row = Math.floor(index / options.columns);
      const left = options.margin + column * (options.frameWidth + options.padding);
      const top = options.margin + row * (options.frameHeight + options.padding);
      const input = await sharp(path)
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

  const frames = framePaths.map((path, index) => {
    const column = index % options.columns;
    const row = Math.floor(index / options.columns);
    return {
      name: basename(path, ".png"),
      x: options.margin + column * (options.frameWidth + options.padding),
      y: options.margin + row * (options.frameHeight + options.padding),
      width: options.frameWidth,
      height: options.frameHeight
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
): Promise<sharp.Sharp> {
  const raw = await image.raw().toBuffer({ resolveWithObject: true });
  const channels = raw.info.channels;
  const data = Buffer.from(raw.data);
  const key = chromaKey?.color ? hexToRgb(chromaKey.color) : sampleCornerColor(data, raw.info.width, raw.info.height, channels);
  const tolerance = chromaKey?.tolerance ?? 28;

  for (let i = 0; i < data.length; i += channels) {
    const distance = Math.sqrt(
      (data[i] - key.r) ** 2 +
      (data[i + 1] - key.g) ** 2 +
      (data[i + 2] - key.b) ** 2
    );
    if (distance <= tolerance) {
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

function sampleCornerColor(data: Buffer, width: number, height: number, channels: number): { r: number; g: number; b: number } {
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

function hexToRgb(value: string): { r: number; g: number; b: number } {
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
  const frameEntries = frames.map((frame) => `
    <key>${escapeXml(frame.name)}</key>
    <dict>
      <key>frame</key><string>{{${frame.x},${frame.y}},{${frame.width},${frame.height}}}</string>
      <key>offset</key><string>{0,0}</string>
      <key>rotated</key><false/>
      <key>sourceColorRect</key><string>{{0,0},{${frame.width},${frame.height}}}</string>
      <key>sourceSize</key><string>{${frame.width},${frame.height}}</string>
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
