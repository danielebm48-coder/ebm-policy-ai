import { PolicyAnswer, PolicyQuery, PolicyReference } from '../models';

export function answerQuestion(query: PolicyQuery, references: PolicyReference[]): PolicyAnswer {
  const baseAnswer = `Respuesta para ${query.role}: ${query.question}`;
  const guidance = references.length
    ? 'Consulta las siguientes políticas como fuente de respaldo.'
    : 'No se encontraron referencias directas en el corpus normativo.';

  return {
    answer: `${baseAnswer} ${guidance}`,
    references,
    policyIds: references.map((item) => item.policyId),
    createdAt: new Date().toISOString(),
  };
}
