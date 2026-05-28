import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

const env = process.env.NODE_ENV ?? 'development';
const envFile = env === 'production' ? '.env.production' : '.env.development';
const envPath = path.resolve(process.cwd(), envFile);

// Solo cargar si el archivo existe. En Render/Vercel las variables se pasan directamente.
if (fs.existsSync(envPath)) {
  console.log(`[CONFIG] Loading environment from ${envFile}`);
  dotenv.config({ path: envPath });
} else {
  console.log(`[CONFIG] No ${envFile} found, using system environment variables`);
}

// Import y ejecuta el servidor después de cargar las variables de entorno
import './server';
