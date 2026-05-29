import { loadEnv } from '../src/config/env';

loadEnv();

// Importar el servidor despues de cargar variables de entorno.
import './server';
