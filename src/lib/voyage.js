import Voyage from 'voyageai';
import { VOYAGE_API_KEY } from '$env/static/private';

const voyage = new Voyage({ apiKey: VOYAGE_API_KEY });

/**
 * Embed a message using VoyageAI
 * @param {string} text - The text to embed
 * @returns {Promise<number[]>} The embedding vector
 */
export async function embedWithVoyage(text) {
  const response = await voyage.embed({
    input: [text],
    model: 'voyage-2',
  });
  return response.data[0].embedding;
}
