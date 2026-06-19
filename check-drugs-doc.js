const { Pool } = require('pg');
require('dotenv').config({ path: '.env.development' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  try {
    const docRes = await pool.query("SELECT id, name, is_optimized FROM documents WHERE name ILIKE '%DROGAS%' AND status = 'active' ORDER BY created_at DESC LIMIT 1");
    if (docRes.rows.length === 0) {
      console.log('Documento no encontrado.');
      return;
    }

    const doc = docRes.rows[0];
    console.log('DocID:', doc.id);
    console.log('Name:', doc.name);
    console.log('Is Optimized:', doc.is_optimized);

    const chunksRes = await pool.query("SELECT count(*) FROM document_chunks WHERE document_id = $1", [doc.id]);
    console.log('Chunks:', chunksRes.rows[0].count);

    const parentsRes = await pool.query("SELECT count(*) FROM document_parents WHERE document_id = $1", [doc.id]);
    console.log('Parents:', parentsRes.rows[0].count);

    if (chunksRes.rows[0].count > 0) {
      const sample = await pool.query("SELECT text, embedding IS NOT NULL as has_embedding, fts_vector IS NOT NULL as has_fts FROM document_chunks WHERE document_id = $1 LIMIT 1", [doc.id]);
      console.log('Sample Chunk Text:', sample.rows[0].text.substring(0, 100));
      console.log('Has Embedding:', sample.rows[0].has_embedding);
      console.log('Has FTS:', sample.rows[0].has_fts);
    }

  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

run();
