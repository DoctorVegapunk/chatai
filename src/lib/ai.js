import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';
import Groq from 'groq-sdk';
import { GROQ_API_KEY } from '$env/static/private';

const groq = new Groq({ apiKey: GROQ_API_KEY });

/**
 * Fetch the first AI character for a scenario from Firestore
 * @param {string} scenarioId
 * @returns {Promise<Object|null>} Character object or null
 */
export async function getAICharacter(scenarioId) {
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const snap = await getDoc(scenarioRef);
  const data = snap.data();
  if (!data || !Array.isArray(data.characters)) return null;
  return data.characters.find(c => !c.isPlayer) || null;
}

/**
 * Fetch player character for a scenario from Firestore
 * @param {string} scenarioId
 * @returns {Promise<Object|null>} Character object or null
 */
export async function getPlayerCharacter(scenarioId) {
  const scenarioRef = doc(db, 'scenarios', scenarioId);
  const snap = await getDoc(scenarioRef);
  const data = snap.data();
  if (!data || !Array.isArray(data.characters)) return null;
  return data.characters.find(c => c.isPlayer) || null;
}

/**
 * Generate an AI response as the character using Groq
 * @param {Object} params
 * @param {string} params.scenarioId
 * @param {string} params.userMessage
 * @returns {Promise<string>} AI-generated reply
 */
// Allowed Groq models
const GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "distil-whisper-large-v3-en",
  "qwen-qwq-32b",
  "deepseek-r1-distill-llama-70b",
  "mistral-saba-24b"
];

/**
 * Generate an AI response as the character using Groq
 * @param {Object} params
 * @param {string} params.scenarioId
 * @param {string} params.userMessage
 * @param {string} [params.model] - Groq model to use
 * @returns {Promise<string>} AI-generated reply
 */
export async function generateAIReply({ scenarioId, userMessage, model = "llama-3.3-70b-versatile" }) {
  const aiChar = await getAICharacter(scenarioId);
  if (!aiChar) return "Sorry, no AI character found.";

  // Compose a persona prompt
  let persona = `You are roleplaying as ${aiChar.name}. `;
  if (aiChar.backstory) persona += `Backstory: ${aiChar.backstory}. `;
  if (aiChar.personalityTraits && aiChar.personalityTraits.length > 0) {
    persona += `Personality traits: ${aiChar.personalityTraits.filter(Boolean).join(', ')}.`;
  }
  const prompt = `${persona}\n\nUser: ${userMessage}\n${aiChar.name}:`;

  const completion = await groq.chat.completions.create({
    messages: [
      { role: 'system', content: persona },
      { role: 'user', content: userMessage }
    ],
    model: GROQ_MODELS.includes(model) ? model : "llama-3.3-70b-versatile",
    max_tokens: 120,
    temperature: 0.8
  });
  return completion.choices[0].message.content.trim();
}
