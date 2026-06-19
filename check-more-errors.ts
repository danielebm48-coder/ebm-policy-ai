import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './src/config/env';

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function checkErrors() {
  const { data, error } = await supabase
    .from('ai_queries')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching queries:', error);
    return;
  }

  console.log('Recent Queries:');
  data.forEach(q => {
    console.log(`- ID: ${q.id} | Status: ${q.status} | Model used in metadata: ${q.model_used}`);
    console.log(`  Question: ${q.question}`);
    console.log(`  Error: ${q.error_message}`);
    console.log('---');
  });
}

checkErrors();
