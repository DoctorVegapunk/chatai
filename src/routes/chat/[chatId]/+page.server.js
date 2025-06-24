import { 
  getConversationHistory, 
  createScenarioCollection, 
  storeMessage, 
  generateMessageId,
  getNextTurnNumber
} from '$lib/zilliz';
import { db } from '../../../lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { fail } from '@sveltejs/kit';
import { VOYAGE_API_KEY, GROQ_API_KEY } from '$env/static/private';

async function getEmbedding(text) {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${VOYAGE_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: text, model: 'voyage-large-2' }),
  });
  
  if (!response.ok) throw new Error(`Voyage AI API error: ${response.status}`);
  const data = await response.json();
  if (!data.data?.[0]?.embedding) throw new Error('Invalid response structure from Voyage AI');
  return data.data[0].embedding;
}

async function generateAIReply(conversationHistory, currentMessage, scenarioData, aiCharacter, selectedModel = 'llama3-8b-8192') {
  const conversationContext = conversationHistory.slice(-10).map(msg => {
    const isPlayer = msg.sender_is_player;
    const characterName = isPlayer ? (scenarioData.characters?.find(c => c.isPlayer)?.name || 'Player') : (scenarioData.characters?.find(c => c.id === msg.sender_character_id)?.name || 'AI');
    return `${characterName}: ${msg.message_content_text}`;
  }).join('\n');

  const systemPrompt = `You are ${aiCharacter.name}, a character in a roleplay scenario.
Character Description: ${aiCharacter.description || 'No description provided'}
Character Personality: ${aiCharacter.personality || 'No personality provided'}
Scenario Context: ${scenarioData.description || 'No scenario description'}
Current Fictional Datetime: ${scenarioData.currentFictionalDateTime || 'Not specified'} 
Venue: ${scenarioData.venue || 'Not specified'}

Recent conversation:
${conversationContext}

Player's message to you: "${currentMessage}"

Respond as ${aiCharacter.name} would, staying in character. Keep responses engaging and appropriate to the scenario. 

FORMAT YOUR RESPONSE:
- Use (**action**) for any actions or physical descriptions
- Use ("dialogue") for any spoken words
- Example: (*walks closer and smiles*) ("Hello there, how are you doing today?")

Your response should be between 60-100 words. Be descriptive but concise.`;

  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: selectedModel.includes('llama') ? 'llama3-8b-8192' : selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: currentMessage }
      ],
      max_tokens: 150,
      temperature: 0.75,
    }),
  });

  if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
  const data = await response.json();
  if (!data.choices?.[0]?.message?.content) throw new Error('Invalid response structure from Groq');
  return data.choices[0].message.content;
}

export async function load({ params, depends }) {
  // Add this line to make the load function re-run when data is invalidated
  depends('chat:messages');
  const chatId = params.chatId;
  let scenarioData = null;

  try {
    const scenarioDocRef = doc(db, 'scenarios', chatId);
    const docSnap = await getDoc(scenarioDocRef);
    if (docSnap.exists()) {
      scenarioData = { id: docSnap.id, ...docSnap.data() };
      await createScenarioCollection(chatId);
    }
  } catch (e) {
    console.error('[Load] Error:', e);
  }

  let historyMessages = [];
  if (scenarioData) {
    try {
      const history = await getConversationHistory(chatId);
      historyMessages = history.map(msg => ({
        id: msg.message_id,
        text: msg.message_content_text,
        sender: msg.sender_is_player ? 'user' : 'bot',
        timestamp: msg.real_timestamp_utc_ms,
        characterId: msg.sender_character_id,
        characterName: msg.sender_is_player 
            ? (scenarioData.characters?.find(c => c.isPlayer)?.name || 'Player') 
            : (scenarioData.characters?.find(c => c.id === msg.sender_character_id)?.name || 'AI'),
        messageType: msg.message_type
      }));
    } catch (e) {
      console.error('[Load] Error fetching history:', e);
    }
  }

  const serializableScenarioData = scenarioData ? {
      ...scenarioData,
      createdAt: scenarioData.createdAt?.toDate?.()?.toISOString() || scenarioData.createdAt,
      updatedAt: scenarioData.updatedAt?.toDate?.()?.toISOString() || scenarioData.updatedAt,
      characters: scenarioData.characters?.map(char => ({
          ...char,
          createdAt: char.createdAt?.toDate?.()?.toISOString() || char.createdAt,
          updatedAt: char.updatedAt?.toDate?.()?.toISOString() || char.updatedAt,
      })) || []
  } : null;

  return { 
    historyMessages, 
    scenarioData: serializableScenarioData,
    chatId // Add chatId to the returned data
  };
}

export const actions = {
  sendMessage: async ({ request, params }) => {
    console.log('SendMessage action called'); // Add logging
    
    const { chatId } = params;
    if (!chatId) {
      console.log('Missing chat ID'); // Add logging
      return fail(400, { success: false, message: "Missing chat ID" });
    }
    
    const formData = await request.formData();
    const message = formData.get('message')?.toString().trim();
    const selectedModel = formData.get('selectedModel')?.toString() || 'llama3-8b-8192';

    console.log('Received message:', message); // Add logging
    console.log('Selected model:', selectedModel); // Add logging

    if (!message) {
      console.log('Empty message'); // Add logging
      return fail(400, { success: false, message: 'Message cannot be empty' });
    }

    try {
      console.log('Fetching scenario data...'); // Add logging
      
      const scenarioDocRef = doc(db, 'scenarios', chatId);
      const docSnap = await getDoc(scenarioDocRef);
      if (!docSnap.exists()) {
        console.log('Scenario not found'); // Add logging
        return fail(404, { success: false, message: 'Scenario not found' });
      }

      const scenarioData = { id: docSnap.id, ...docSnap.data() };
      console.log('Scenario loaded:', scenarioData.title); // Add logging
      
      const playerCharacter = scenarioData.characters?.find(c => c.isPlayer);
      const aiCharacters = scenarioData.characters?.filter(c => !c.isPlayer) || [];
      
      if (aiCharacters.length === 0) {
        console.log('No AI characters found in scenario'); // Add logging
        return fail(400, { success: false, message: 'No AI characters found in scenario' });
      }
      
      console.log(`Found ${aiCharacters.length} AI characters`); // Add logging

      await createScenarioCollection(chatId);
      const conversationHistory = await getConversationHistory(chatId);
      const nextTurnNumber = await getNextTurnNumber(chatId);

      // Store user message
      console.log('Generating embedding for user message...'); // Add logging
      const userMessageEmbedding = await getEmbedding(message);
      const userMessageId = generateMessageId();
      const userTimestamp = Date.now();
      console.log('Generated user message ID:', userMessageId); // Add logging

      const createMessageData = (isUser, messageId, embedding, content, characterId, timestamp) => ({
        message_id: messageId || crypto.randomUUID(),
        message_embedding: embedding || Array(1536).fill(0),
        scenario_id: chatId || 'default_scenario_id',
        turn_number: nextTurnNumber ?? 0,
        real_timestamp_utc_ms: timestamp ?? Date.now(),
        sender_character_id: characterId || (isUser ? 'player_default_id' : 'ai_default_id'),
        sender_is_player: isUser,
        venue_name: scenarioData?.venue_name || scenarioData?.venue || 'Unknown Venue',
        sub_location_in_venue: scenarioData?.sub_location_in_venue || 'Unknown Location',
        present_character_ids_at_location: [
          playerCharacter?.id || 'player_default_id',
          ...aiCharacters.map(c => c?.id).filter(id => id != null)
        ],
        fictional_datetime_iso: scenarioData?.currentFictionalDateTime || new Date().toISOString(),
        fictional_total_time_elapsed_seconds: scenarioData?.fictionalTotalTimeElapsedSeconds ?? 0,
        message_content_text: content || (isUser ? '[User message missing]' : '[AI reply missing]'),
        message_type: 'dialogue',
        action_details: '',
        dialogue_target_ids: isUser ? aiCharacters.map(c => c?.id).filter(id => id != null) : [playerCharacter?.id || 'player_default_id'],
        mentioned_character_ids_in_content: [],
        key_topics_or_entities: [],
        sender_expressed_emotion: '',
        references_previous_message_ids: isUser ? [] : [userMessageId || 'unknown_msg_id'],
        plot_relevance_score: 0.0
      });

      await storeMessage(createMessageData(true, userMessageId, userMessageEmbedding, message, playerCharacter?.id, userTimestamp));

      // Generate AI replies
      console.log('Generating AI replies...'); // Add logging
      const aiReplies = [];
      const aiMessageIds = [];
      const updatedHistory = [...conversationHistory, {
        sender_is_player: true,
        sender_character_id: playerCharacter?.id || 'player_default_id',
        message_content_text: message,
      }];
      
      console.log(`Processing ${aiCharacters.length} AI characters`); // Add logging

      const allProcessingPromises = [];

      for (let i = 0; i < aiCharacters.length; i++) {
        const aiCharacter = aiCharacters[i];
        
        try {
          const historyForAI = updatedHistory.map(h => ({
            sender_is_player: h.sender_is_player,
            sender_character_id: h.sender_character_id,
            message_content_text: h.message_content_text,
          }));
          
          const aiReply = await generateAIReply(historyForAI, message, scenarioData, aiCharacter, selectedModel);
          const aiMessageEmbedding = await getEmbedding(aiReply);
          const aiMessageId = generateMessageId();
          const aiTimestamp = Date.now() + i;
          
          const aiMessageData = createMessageData(false, aiMessageId, aiMessageEmbedding, aiReply, aiCharacter?.id, aiTimestamp);
          
          const storePromise = storeMessage(aiMessageData).then(() => ({ characterName: aiCharacter.name, messageId: aiMessageId, status: 'stored' }));
          allProcessingPromises.push(storePromise);
          
          aiReplies.push({
            reply: aiReply,
            characterName: aiCharacter.name || 'AI',
            characterId: aiCharacter.id || 'ai_default_id',
            messageId: aiMessageId,
            timestamp: aiTimestamp
          });
          
          aiMessageIds.push(aiMessageId);
          updatedHistory.push({
            sender_is_player: false,
            sender_character_id: aiCharacter?.id || 'ai_default_id',
            message_content_text: aiReply,
          });
          
        } catch (error) {
          console.error(`Error processing AI character ${aiCharacter.name}:`, error.message);
          aiReplies.push({
            reply: `Error: Could not generate response for ${aiCharacter.name}`,
            characterName: aiCharacter.name || 'AI',
            characterId: aiCharacter.id || 'ai_default_id',
            messageId: 'error_' + Date.now(),
            timestamp: Date.now(),
            error: true
          });
        }
      }

      console.log('Waiting for all processing to complete...'); // Add logging
      const processingResults = await Promise.allSettled(allProcessingPromises);
      
      const result = {
        type: 'success',
        success: true,
        replies: aiReplies,
        userMessageId: userMessageId,
        aiMessageIds: aiMessageIds,
        timestamp: userTimestamp,
        characterCount: aiCharacters.length,
        processingComplete: true,
        completedOperations: processingResults.length
      };
      
      console.log('Returning success with', aiReplies.length, 'replies'); // Add logging
      return result;

    } catch (err) {
      console.error('[Action SendMessage] Error:', err.message);
      return fail(500, { success: false, message: `Failed to process message: ${err.message}` });
    }
  },
};