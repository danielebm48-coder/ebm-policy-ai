import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function resetAll() {
  try {
    console.log('🗑️  INICIANDO BORRADO TOTAL DEL REPOSITORIO...');

    // Desactivar temporalmente constraints si fuera necesario, 
    // pero CASCADE debería encargarse.
    
    console.log('1. Eliminando todos los documentos (Hard Delete)...');
    const resDocs = await pool.query('DELETE FROM documents');
    console.log(`   ✅ ${resDocs.rowCount} documentos eliminados.`);

    console.log('2. Eliminando roles (excepto básicos si fuera necesario)...');
    // Mantenemos los roles base
    
    console.log('3. Limpiando historial de consultas...');
    const resQueries = await pool.query('DELETE FROM ai_queries');
    console.log(`   ✅ ${resQueries.rowCount} consultas eliminadas.`);

    console.log('4. Limpiando auditoría...');
    const resAudit = await pool.query('DELETE FROM document_audit_logs');
    console.log(`   ✅ ${resAudit.rowCount} logs eliminados.`);

    console.log('\n✨ EL SISTEMA ESTÁ TOTALMENTE LIMPIO.');
    console.log('Ahora puedes subir tu documento de prueba desde el panel y la IA lo procesará desde cero.');

  } catch (error) {
    console.error('❌ Error durante el reset:', error);
  } finally {
    await pool.end();
  }
}

resetAll();
