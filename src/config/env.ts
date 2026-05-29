import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const env = process.env.NODE_ENV ?? 'development';
  const files = env === 'production' ? ['.env.production', '.env'] : ['.env.development', '.env'];

  for (const file of files) {
    const envPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath, override: false });
      return;
    }
  }

  dotenv.config({ override: false });
}
