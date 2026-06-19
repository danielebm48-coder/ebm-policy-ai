import { Pool } from 'pg';
import { loadEnv } from './config/env';

loadEnv();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyQALayer() {
  try {
    console.log('🧐 Verificando la nueva Capa de Escenarios Q&A...');

    const res = await pool.query(
      "SELECT role_id, count(*) as total FROM document_qa_scenarios GROUP BY role_id"
    );
    
    if (res.rows.length === 0) {
      console.log('⚠️ No se han generado escenarios aún. Es posible que el proceso asíncrono aún esté trabajando o haya fallado.');
    } else {
      console.log('✅ Escenarios encontrados por rol:');
      console.table(res.rows);

      const samples = await pool.query(
        "SELECT role_id, question FROM document_qa_scenarios LIMIT 5"
      );
      console.log('\nÚltimas preguntas predictivas generadas:');
      console.table(samples.rows);
    }

  } catch (error) {
    console.error('❌ Error al verificar:', error);
  } finally {
    await pool.end();
  }
}

verifyQALayer();
