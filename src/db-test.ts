import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: No se encontró DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function testConnection() {
  try {
    const nowResult = await pool.query('SELECT NOW() AS now');
    console.log('Conexión OK. Hora del servidor:', nowResult.rows[0].now);

    const userCount = await pool.query('SELECT COUNT(*) AS count FROM users');
    console.log('Usuarios en la base de datos:', userCount.rows[0].count);

    const policyCount = await pool.query('SELECT COUNT(*) AS count FROM policies');
    console.log('Políticas en la base de datos:', policyCount.rows[0].count);
  } catch (error) {
    console.error('ERROR al conectar con la base de datos:', error);
  } finally {
    await pool.end();
  }
}

testConnection();
