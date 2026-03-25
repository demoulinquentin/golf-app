import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production"]).default("production"),
  BASE_URL: z.string().optional(),
  BASE_URL_OTHER_PORT: z.string().optional(),
  ADMIN_PASSWORD: z.string().default("changeme"),
  JWT_SECRET: z.string().default("changeme"),
});

export const env = envSchema.parse(process.env);
