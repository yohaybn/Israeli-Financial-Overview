/** Gemini / Vertex style message when the model is overloaded (503). */
export const AI_MODEL_HIGH_DEMAND_ERROR_KEY = 'AI_MODEL_HIGH_DEMAND' as const;

export function isAiModelHighDemandMessage(message: string): boolean {
  return (
    message.includes('[503 Service Unavailable]') &&
    message.includes('This model is currently experiencing high demand')
  );
}
