import dotenv from 'dotenv';

const env = process.env.NODE_ENV ?? 'development';
const envFile = env === 'production' ? '.env.production' : '.env.development';

dotenv.config({ path: envFile });

// Import y ejecuta el servidor después de cargar las variables de entorno
import './server';
