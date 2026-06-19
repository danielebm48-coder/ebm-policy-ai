import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('ERROR: No se encontró DATABASE_URL en las variables de entorno.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function checkDocs() {
  try {
    console.log('--- Documentos ---');
    const docs = await pool.query('SELECT id, name, type, category, status FROM documents');
    console.table(docs.rows);

    console.log('\n--- Conteo de Chunks por Documento ---');
    const chunks = await pool.query(`
      SELECT d.name, count(c.id) as chunk_count, sum(length(c.text)) as total_chars
      FROM documents d 
      LEFT JOIN document_chunks c ON d.id = c.document_id 
      GROUP BY d.name
    `);
    console.table(chunks.rows);

    const totalCharsResult = await pool.query('SELECT sum(length(text)) as total FROM document_chunks');
    const totalChars = totalCharsResult.rows[0].total || 0;
    console.log(`\nTotal de caracteres en todos los documentos: ${totalChars}`);
    console.log(`Estimación de tokens (1 token ≈ 3 caracteres): ${Math.ceil(totalChars / 3)}`);

    console.log('\n--- Políticas de Acceso ---');
    const access = await pool.query(`
      SELECT d.name, a.role_id, a.access_level 
      FROM document_access_policies a
      JOIN documents d ON a.document_id = d.id
    `);
    console.table(access.rows);

  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await pool.end();
  }
}

checkDocs();
