import { z } from "zod";

// Carga .env si existe (desarrollo). En producción las vars vienen del entorno
// real, por eso un .env ausente no es un error.
try {
  process.loadEnvFile();
} catch {
  // sin .env: seguimos con process.env tal cual está
}

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  MODEL: z.string().min(1),
  LOG_LEVEL: z
    .enum(["debug", "info", "warn", "error"])
    .default("info"),
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
