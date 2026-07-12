import { z } from "zod";

try {
  process.loadEnvFile();
} catch {
}

const envSchema = z
  .object({
    DATABASE_URL: z.string().url(),
    LLM_PROVIDER: z.enum(["ollama", "openrouter"]).default("ollama"),
    OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    MODEL: z.string().min(1),
    LOG_LEVEL: z
      .enum(["debug", "info", "warn", "error"])
      .default("info"),
  })
  .superRefine((env, ctx) => {
    if (env.LLM_PROVIDER === "openrouter" && env.OPENROUTER_API_KEY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENROUTER_API_KEY"],
        message: "es requerida cuando LLM_PROVIDER=openrouter",
      });
    }
  });

export type Config = Readonly<z.infer<typeof envSchema>>;

function loadConfig(): Config {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Configuración de entorno inválida. Revisá tu .env:\n${issues}`,
    );
  }

  return Object.freeze(parsed.data);
}

export const config: Config = loadConfig();
