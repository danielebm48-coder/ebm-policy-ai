import { generateResponse } from './src/gemini';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.development' });

async function testIntent() {
  const question = "¿cuál es la función del coordinador PEP en la escuela?";
  const systemPrompt = `Clasifica la intención de la siguiente pregunta de un usuario de una escuela. 
Responde ÚNICAMENTE con una de estas dos palabras:
- CONVERSATIONAL: Si es un saludo, despedida, agradecimiento o charla trivial.
- KNOWLEDGE_QUERY: Si es una pregunta sobre reglamentos, políticas, fechas, calendarios o procedimientos de la escuela.

Pregunta: "${question}"`;

  try {
    const result = await generateResponse(question, [], systemPrompt);
    console.log("Clasificación:", result.answer);
  } catch (e) {
    console.error(e);
  }
}

testIntent();
