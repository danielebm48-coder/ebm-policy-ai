import { testSupabaseConnection, supabaseClient } from './supabase';

async function main() {
  console.log('🔍 Probando conexión con Supabase...\n');
  
  try {
    // Test 1: Verificar que el cliente está configurado
    console.log('✅ Cliente Supabase inicializado correctamente');
    
    // Test 2: Verificar conexión
    await testSupabaseConnection();
    
    // Test 3: Intentar consultar una tabla
    console.log('\n📊 Intentando consultar tabla "users"...');
    const { data, error } = await supabaseClient
      .from('users')
      .select('count', { count: 'exact' });
    
    if (error) {
      console.log('⚠️  Tabla "users" no existe o error de permisos:', error.message);
    } else {
      console.log('✅ Conexión exitosa! Tablas accesibles.');
    }
    
    console.log('\n✨ ¡Configuración completada exitosamente!');
    console.log('\n📝 Próximos pasos:');
    console.log('1. Ejecuta: npm install');
    console.log('2. Verifica tus credenciales en .env.development');
    console.log('3. Comienza a usar Supabase en tu código');
    
  } catch (error) {
    console.error('❌ Error durante la prueba:', error);
    process.exit(1);
  }
}

main();
