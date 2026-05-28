import dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

const envPath = fs.existsSync(path.join(process.cwd(), '.env.development')) 
  ? '.env.development' 
  : '.env';
dotenv.config({ path: envPath });

async function test768() {
  const key = process.env.GEMINI_API_KEY;
  // Using the exact name from the list-models output
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${key}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/gemini-embedding-001',
        content: { parts: [{ text: 'test' }] }
      })
    });
    
    const data = await response.json();
    if (data.embedding) {
      console.log('Success! Dimension:', data.embedding.values.length);
    } else {
      console.log('Error:', JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.error(e);
  }
}

test768();
