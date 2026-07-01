import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { ensureDir, writeFileSafe } from "../utils/fs.js";
import { stableJson } from "../utils/json.js";

export type AudioAdaptOptions = {
  name: string;
  outputDir: string;
  overwrite: boolean;
  format: "wav" | "mp3" | "ogg";
  sampleRate: number;
  channels: "mono" | "stereo";
  normalize: boolean;
  trimSilence: boolean;
  loop: boolean;
  fadeMs: number;
  targetDurationSeconds?: number;
};

export type AdaptedAudio = {
  path: string;
  manifestPath: string;
  warnings: string[];
};

export async function adaptAudioBuffer(buffer: Buffer, sourceExtension: string, options: AudioAdaptOptions): Promise<AdaptedAudio> {
  await ensureDir(options.outputDir);
  const warnings: string[] = [];
  const sourcePath = join(options.outputDir, `${options.name}.source.${sourceExtension}`);
  const outputPath = join(options.outputDir, `${options.name}.${options.format}`);
  const manifestPath = join(options.outputDir, `${options.name}.cocos-asset.json`);
  await writeFileSafe(sourcePath, buffer, options.overwrite);

  if (await hasFfmpeg()) {
    await transcodeWithFfmpeg(sourcePath, outputPath, options);
  } else if (sourceExtension === options.format) {
    await writeFileSafe(outputPath, buffer, options.overwrite);
    warnings.push("ffmpeg was not found; copied source audio without normalization or trimming.");
  } else {
    throw new Error("ffmpeg is required to transcode audio formats.");
  }

  await writeFileSafe(manifestPath, stableJson({
    type: options.loop ? "music-loop" : "audio-clip",
    audio: outputPath,
    source: sourcePath,
    cocos: {
      importAs: "AudioClip",
      notes: [
        "Drag the audio file into Cocos Creator Assets.",
        options.loop ? "Set the AudioSource loop property for background music." : "Use AudioSource.playOneShot for sound effects."
      ]
    }
  }), options.overwrite);

  return { path: outputPath, manifestPath, warnings };
}

async function hasFfmpeg(): Promise<boolean> {
  const candidates = ["/opt/homebrew/bin/ffmpeg", "/usr/local/bin/ffmpeg", "ffmpeg"];
  for (const candidate of candidates) {
    try {
      if (candidate.includes("/")) await access(candidate);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

async function transcodeWithFfmpeg(input: string, output: string, options: AudioAdaptOptions): Promise<void> {
  const filters: string[] = [];
  if (options.trimSilence) {
    filters.push("silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05");
  }
  if (options.normalize) {
    filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  }
  if (!options.loop && options.fadeMs > 0) {
    filters.push(`afade=t=in:st=0:d=${options.fadeMs / 1000}`);
  }

  const args = [
    "-y",
    "-i",
    input,
    ...(options.targetDurationSeconds ? ["-t", String(options.targetDurationSeconds)] : []),
    "-ar",
    String(options.sampleRate),
    "-ac",
    options.channels === "mono" ? "1" : "2",
    ...(filters.length ? ["-af", filters.join(",")] : []),
    output
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr}`));
    });
  });
}
