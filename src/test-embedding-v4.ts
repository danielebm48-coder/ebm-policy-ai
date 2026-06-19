import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = fs.existsSync(path.join(process.cwd(), '.env.development')) 
  ? '.env.development' 
  : '.env';
dotenv.config({ path: envPath });

async function testEmbedding() {
  const key = process.env.GEMINI_API_KEY;
  const model = 'gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${key}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text: 'Hola mundo' }] },
        outputDimensionality: 1536
      })
    });
    
    const data = await response.json();
    console.log('Embedding Response:', JSON.stringify(data, null, 2));
    if (data.embedding) {
      console.log('Dimensions:', data.embedding.values.length);
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

testEmbedding();
