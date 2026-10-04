import { z } from 'zod';
import { httpUrl } from './schemas';
const positiveInt = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);
export const publicEnvSchema = z.object({
  VITE_SUPABASE_URL: httpUrl,
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().min(20),
  VITE_WEB_URL: httpUrl.default('http://localhost:5173'),
});
export const serverEnvSchema = z.object({
  SUPABASE_URL: httpUrl,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  GEMINI_API_KEY: z.string().min(10),
  LLM_PROVIDER: z.literal('gemini').default('gemini'),
  LLM_MODEL: z.string().default('gemini-3.5-flash-lite'),
  MAX_SAVES_PER_MONTH: positiveInt(100),
  MAX_AI_ANALYSIS_PER_MONTH: positiveInt(25),
  MAX_SOURCE_CHARACTERS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(60000),
  MAX_ITEMS_PER_PROJECT: positiveInt(500),
  INPUT_USD_PER_MILLION: z.coerce.number().nonnegative().default(0.3),
  OUTPUT_USD_PER_MILLION: z.coerce.number().nonnegative().default(2.5),
});
