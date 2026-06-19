import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });

async function cleanDatabase() {
  try {
    console.log('🚀 Iniciando limpieza profunda de la base de datos...');

    // 1. Identificar duplicados por nombre
    const duplicates = await pool.query(
      'SELECT name, COUNT(*) FROM documents GROUP BY name HAVING COUNT(*) > 1'
    );
    console.log(`Encontrados ${duplicates.rows.length} nombres con duplicados.`);

    for (const row of duplicates.rows) {
      const docs = await pool.query(
        'SELECT id, created_at FROM documents WHERE name = $1 ORDER BY created_at DESC',
        [row.name]
      );
      
      const keepId = docs.rows[0].id;
      const deleteIds = docs.rows.slice(1).map(r => r.id);
      
      console.log(`📄 Documento: "${row.name}"`);
      console.log(`   ✅ Manteniendo más reciente: ${keepId} (${docs.rows[0].created_at})`);
      console.log(`   🗑️  Borrando ${deleteIds.length} versiones antiguas...`);
      
      if (deleteIds.length > 0) {
        await pool.query('DELETE FROM documents WHERE id = ANY($1)', [deleteIds]);
      }
    }

    // 2. Eliminar documentos sin chunks (inválidos para RAG)
    const zeroChunks = await pool.query(
      'SELECT d.id, d.name FROM documents d LEFT JOIN document_chunks c ON d.id = c.document_id WHERE c.id IS NULL'
    );
    
    console.log(`\n🔍 Encontrados ${zeroChunks.rows.length} documentos sin fragmentos.`);
    for (const doc of zeroChunks.rows) {
      console.log(`   🗑️  Borrando documento vacío: "${doc.name}" (${doc.id})`);
      await pool.query('DELETE FROM documents WHERE id = $1', [doc.id]);
    }

    // 3. Limpieza de huérfanos (por si acaso falló el CASCADE anteriormente)
    const orphanedChunks = await pool.query(
      'SELECT id FROM document_chunks WHERE document_id NOT IN (SELECT id FROM documents)'
    );
    if (orphanedChunks.rows.length > 0) {
      console.log(`\n🧹 Limpiando ${orphanedChunks.rows.length} chunks huérfanos...`);
      await pool.query('DELETE FROM document_chunks WHERE document_id NOT IN (SELECT id FROM documents)');
    }

    console.log('\n✨ Limpieza completada con éxito.');

  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await pool.end();
  }
}

cleanDatabase();
