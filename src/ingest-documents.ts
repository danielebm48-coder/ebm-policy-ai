import * as fs from 'fs';
import * as path from 'path';
import { createDocument, supabaseAdmin } from './document-service';
import { normalizeText } from './utils/encoding';
const pdf = require('pdf-parse');
const mammoth = require('mammoth');

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  
  if (ext === '.md' || ext === '.txt') {
    return fs.readFileSync(filePath, 'utf-8');
  }
  
  if (ext === '.pdf') {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdf(dataBuffer);
      return data.text;
    } catch (e) {
      console.error(`Error extraíndo PDF ${filePath}:`, e);
      return '';
    }
  }
  
  if (ext === '.docx') {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      return result.value;
    } catch (e) {
      console.error(`Error extraíndo DOCX ${filePath}:`, e);
      return '';
    }
  }
  
  return '';
}

async function ingestPolicies() {
  console.log('🚀 Iniciando ingesta masiva de documentos para Escuela Bilingüe Maquilishuat...');

  const policiesDir = path.join(process.cwd(), 'data', 'to_ingest');
  if (!fs.existsSync(policiesDir)) {
    console.error(`❌ La carpeta ${policiesDir} no existe.`);
    return;
  }
  
  const files = fs.readdirSync(policiesDir);
  console.log(`Encontrados ${files.length} archivos para procesar.`);

  const roles = ['profesor', 'alumno', 'padre', 'directivo', 'admin'];

  for (const file of files) {
    const filePath = path.join(policiesDir, file);
    const ext = path.extname(file).toLowerCase();
    
    if (['.md', '.pdf', '.docx', '.txt'].includes(ext)) {
      console.log(`\n📄 Procesando: ${file}...`);

      try {
        const content = await extractText(filePath);
        if (!content || content.trim().length === 0) {
          console.warn(`⚠️  No se pudo extraer texto de ${file}`);
          continue;
        }

        const rawName = file.replace(ext, '').replace(/[-_]/g, ' ').trim();
        const name = normalizeText(rawName);
        
        // Determinar categoría y tipo básico
        let type: 'policy' | 'manual' | 'procedure' | 'handbook' | 'other' = 'policy';
        let category = 'General';

        const lowerFile = file.toLowerCase();
        if (lowerFile.includes('manual')) type = 'manual';
        if (lowerFile.includes('protocolo')) type = 'procedure';
        if (lowerFile.includes('perfil') || lowerFile.includes('descripcion')) type = 'other';

        if (lowerFile.includes('convivencia')) category = 'Convivencia';
        else if (lowerFile.includes('evaluacion') || lowerFile.includes('evaluación')) category = 'Académico';
        else if (lowerFile.includes('seguridad')) category = 'Seguridad';
        else if (lowerFile.includes('inclusion') || lowerFile.includes('inclusión')) category = 'Inclusión';
        else if (lowerFile.includes('linguistica') || lowerFile.includes('lingüística')) category = 'Lingüística';

        console.log(`Ingestando como [${type}] en categoría [${category}]...`);

        const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
        const doc = await createDocument(
          capitalized,
          type,
          category,
          content,
          'u_system',
          `Documento institucional de E.B. Maquilishuat: ${file}`
        );

        console.log(`✅ Documento creado con ID: ${doc.id}`);

        if (supabaseAdmin) {
          console.log(`🔐 Configurando permisos para todos los roles...`);
          const accessInserts = roles.map(role => ({
            document_id: doc.id,
            role_id: role,
            access_level: 'ask'
          }));

          const { error } = await supabaseAdmin.from('document_access_policies').upsert(accessInserts, { onConflict: 'document_id,role_id' });
          if (error) console.error(`❌ Error configurando permisos: ${error.message}`);
        }

      } catch (error) {
        console.error(`❌ Error al procesar ${file}:`, error);
      }
    }
  }

  console.log('\n✨ Ingesta de Escuela Bilingüe Maquilishuat completada.');
}

ingestPolicies().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
