import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = fs.existsSync(path.join(process.cwd(), '.env.development')) 
  ? '.env.development' 
  : '.env';
dotenv.config({ path: envPath });

async function testGemini() {
  const key = process.env.GEMINI_API_KEY;
  console.log('Testing Gemini Key:', key ? 'Key exists' : 'Key MISSING');
  
  const model = (process.env.GEMINI_CHAT_MODEL || 'gemini-3.5-flash-lite').replace(/^models\//, '');
  const apiUrl = (process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/$/, '');
  const url = `${apiUrl}/${model}:generateContent?key=${key}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hola, di "Conexión exitosa"' }] }]
      })
    });
    
    const data = await response.json();
    console.log('Response:', JSON.stringify(data, null, 2));
  } catch (e) {
    console.error('Error:', e);
  }
}

testGemini();
