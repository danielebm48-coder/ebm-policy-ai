import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function diagnoseEmbeddings() {
  try {
    console.log('🔍 Diagnosticando base de datos vectorial...');

    // 1b. Verificar restricción de dimensión real
    const dimLimit = await pool.query(`
      SELECT atttypmod FROM pg_attribute 
      WHERE attrelid = 'document_chunks'::regclass AND attname = 'embedding'
    `);
    console.log('Restricción atttypmod (dimensión):', dimLimit.rows[0].atttypmod);

    // 2. Contar chunks con y sin embedding
    const counts = await pool.query(`
      SELECT 
        count(*) as total,
        count(embedding) as with_embedding,
        count(*) - count(embedding) as without_embedding
      FROM document_chunks
    `);
    console.log('Estadísticas de chunks:', counts.rows[0]);

    // 3. Verificar dimensión si existen
    if (parseInt(counts.rows[0].with_embedding) > 0) {
      const dim = await pool.query(
        "SELECT vector_dims(embedding) as dimension FROM document_chunks WHERE embedding IS NOT NULL LIMIT 1"
      );
      console.log('Dimensión real en los datos:', dim.rows[0].dimension);
    }

    // 4. Verificar la función match_documents
    const funcInfo = await pool.query(`
      SELECT routine_name, data_type, routine_definition
      FROM information_schema.routines 
      WHERE routine_name = 'match_documents'
    `);
    console.log('Existencia de match_documents:', funcInfo.rows.length > 0);
    
    const funcArgs = await pool.query(`
      SELECT pg_get_function_arguments(oid) as args 
      FROM pg_proc WHERE proname = 'match_documents'
    `);
    // 5. Listar documentos con chunks sin embedding
    const missingDocs = await pool.query(`
      SELECT d.name, count(*) as missing_chunks
      FROM documents d
      JOIN document_chunks c ON d.id = c.document_id
      WHERE c.embedding IS NULL
      GROUP BY d.name
    `);
    console.log('\nDocumentos con fragmentos sin vector:');
    console.table(missingDocs.rows);

  } catch (error) {
    console.error('❌ Error en diagnóstico:', error);
  } finally {
    await pool.end();
  }
}

diagnoseEmbeddings();
