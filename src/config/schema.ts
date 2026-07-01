import { z } from "zod";

export const providerKindSchema = z.enum([
  "mock",
  "openai-compatible-image",
  "generic-http-image",
  "generic-http-audio",
  "fal-image",
  "fal-audio",
  "huggingface-image",
  "modelscope-image",
  "siliconflow-image",
  "comfyui"
]);

export const providerSchema = z.object({
  kind: providerKindSchema,
  name: z.string().min(1),
  baseUrl: z.string().url().optional(),
  apiKey: z.string().optional(),
  apiKeyEnv: z.string().optional(),
  model: z.string().optional(),
  headers: z.record(z.string()).default({}),
  timeoutMs: z.number().int().positive().default(120000),
  requestTemplate: z.record(z.unknown()).optional(),
  responsePath: z.string().optional()
});

export const cutoutSchema = z
  .object({
    backend: z.enum(["auto", "chroma-key", "local-command"]).default("auto"),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).default(["i", "{input}", "{output}"]),
    timeoutMs: z.number().int().positive().default(180000),
    triggerMinRemovedRatio: z.number().min(0).max(1).default(0.25)
  })
  .superRefine((value, context) => {
    if (value.backend === "local-command" && !value.command) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["command"],
        message: "cutout.command is required when cutout.backend is local-command"
      });
    }
  })
  .default({
    backend: "auto",
    args: ["i", "{input}", "{output}"],
    timeoutMs: 180000,
    triggerMinRemovedRatio: 0.25
  });

export const forgeConfigSchema = z.object({
  defaultOutputDir: z.string().default("./generated/cocos-assets"),
  imageProvider: providerSchema.default({ kind: "mock", name: "mock-image" }),
  audioProvider: providerSchema.default({ kind: "mock", name: "mock-audio" }),
  sfxProvider: providerSchema.optional(),
  musicProvider: providerSchema.optional(),
  videoProvider: providerSchema.optional(),
  cutout: cutoutSchema,
  cocos: z
    .object({
      creatorVersion: z.string().default("3.x"),
      assetRoot: z.string().default("assets"),
      projectRoot: z.string().optional()
    })
    .default({
      creatorVersion: "3.x",
      assetRoot: "assets"
    }),
  safety: z
    .object({
      overwrite: z.boolean().default(false),
      allowNetworkProviders: z.boolean().default(true)
    })
    .default({
      overwrite: false,
      allowNetworkProviders: true
    })
});

export type ProviderConfig = z.infer<typeof providerSchema>;
export type ForgeConfig = z.infer<typeof forgeConfigSchema>;
