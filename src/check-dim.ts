import { generateEmbedding } from './gemini';

async function checkDim() {
  try {
    const emb = await generateEmbedding('test');
    console.log('Dimension:', emb.length);
  } catch (e) {
    console.error(e);
  }
}

checkDim();
