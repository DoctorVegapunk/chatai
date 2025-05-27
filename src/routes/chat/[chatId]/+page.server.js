import { 
  getConversationHistory, 
  createScenarioCollection, 
  storeMessage, 
  generateMessageId,
  getNextTurnNumber,
  searchSimilarMessages
} from '$lib/zilliz'; // Assuming zilliz.js is in $lib
import { db } from '../../../lib/firebase'; // Adjust if your path is different
import { doc, getDoc } from 'firebase/firestore';
import { fail } from '@sveltejs/kit'; // Removed 'error' as it wasn't used
import { VOYAGE_API_KEY, GROQ_API_KEY } from '$env/static/private';

// Function to generate embeddings using Voyage AI
async function getEmbedding(text) {
  try {
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
        model: 'voyage-large-2'
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Embedding] API error (${response.status}):`, errorText);
      throw new Error(`Voyage AI API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data?.[0]?.embedding) {
      throw new Error('Invalid response structure from Voyage AI');
    }
    
    const embedding = data.data[0].embedding;
    console.log(`[Embedding] Created for text: "${text.length > 50 ? text.substring(0, 50) + '...' : text}"`);
    return embedding;
  } catch (error) {
    console.error('[Embedding] Error:', error.message);
    throw error;
  }
}

// Function to generate AI reply using Groq
async function generateAIReply(conversationHistory, currentMessage, scenarioData, aiCharacter, selectedModel = 'llama3-8b-8192') {
  console.log(`[Groq] Generating AI reply for ${aiCharacter.name}. Model: ${selectedModel}. Current message: "${currentMessage.substring(0,50)}..."`);
  try {
    const conversationContext = conversationHistory.slice(-10).map(msg => {
      const isPlayer = msg.sender_is_player; // Assuming history from Zilliz uses snake_case
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

    const groqModelToUse = selectedModel.includes('llama') ? 'llama3-8b-8192' : selectedModel; // Or a more robust mapping
    console.log(`[Groq] Using actual model for API call: ${groqModelToUse}`);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: groqModelToUse,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: currentMessage }
        ],
        max_tokens: 150, // Adjusted for 60-100 word responses
        temperature: 0.75,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Groq] Groq API error (${response.status}):`, errorText);
      throw new Error(`Groq API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
      console.error('[Groq] Invalid response structure from Groq:', data);
      throw new Error('Invalid response structure from Groq');
    }
    const reply = data.choices[0].message.content;
    console.log(`[Groq] Successfully generated AI reply for ${aiCharacter.name}: "${reply.substring(0, 100)}..."`);
    return reply;
  } catch (error) {
    console.error(`[Groq] Error generating AI reply for ${aiCharacter.name}:`, error.message);
    throw error;
  }
}

export async function load({ params }) {
  const chatId = params.chatId;
  console.log(`[Load] Loading data for chatId: ${chatId}`);
  let scenarioData = null;
  let playerCharacterId = null; // Not strictly needed to be returned if only used server-side

  try {
    const scenarioDocRef = doc(db, 'scenarios', chatId);
    const docSnap = await getDoc(scenarioDocRef);
    if (docSnap.exists()) {
      const rawData = docSnap.data();
      scenarioData = { id: docSnap.id, ...rawData }; // Keep Firebase Timestamps as they are for now, or convert if needed for client
      playerCharacterId = scenarioData.characters?.find(c => c.isPlayer)?.id || 'player_fallback_id'; // Ensure a value
      console.log(`[Load] Fetched scenarioData for ${chatId}:`, scenarioData.name);
    } else {
      console.warn(`[Load] Scenario not found in Firestore for chatId: ${chatId}`);
      // Consider throwing SvelteKit error(404, 'Scenario not found') here
    }
  } catch (e) {
    console.error('[Load] Error fetching scenario from Firestore:', e);
    // Consider throwing SvelteKit error(500, 'Could not load scenario')
  }

  if (scenarioData) {
    try {
      console.log(`[Load] Ensuring Zilliz collection exists for chatId: ${chatId}`);
      await createScenarioCollection(chatId); // This will also handle loading
    } catch (e) {
      console.error('[Load] Error creating/ensuring Zilliz collection:', e);
    }
  }

  let historyMessages = [];
  if (scenarioData) {
    try {
      console.log(`[Load] Fetching chat history from Zilliz for chatId: ${chatId}`);
      const history = await getConversationHistory(chatId); // getConversationHistory uses snake_case
      historyMessages = history.map(msg => ({
        id: msg.message_id,
        text: msg.message_content_text,
        sender: msg.sender_is_player ? 'user' : 'bot',
        timestamp: msg.real_timestamp_utc_ms,
        characterId: msg.sender_character_id, // This is snake_case from Zilliz
        characterName: msg.sender_is_player 
            ? (scenarioData.characters?.find(c => c.isPlayer)?.name || 'Player') 
            : (scenarioData.characters?.find(c => c.id === msg.sender_character_id)?.name || 'AI'),
        messageType: msg.message_type
      }));
      console.log(`[Load] Fetched ${historyMessages.length} history messages from Zilliz for ${chatId}`);
    } catch (e) {
      console.error('[Load] Error fetching history from Zilliz:', e);
    }
  }

  // Ensure data returned to the client is serializable (e.g., convert Firebase Timestamps if they are still objects)
  const serializableScenarioData = scenarioData ? {
      ...scenarioData,
      createdAt: scenarioData.createdAt?.toDate ? scenarioData.createdAt.toDate().toISOString() : scenarioData.createdAt,
      updatedAt: scenarioData.updatedAt?.toDate ? scenarioData.updatedAt.toDate().toISOString() : scenarioData.updatedAt,
      characters: scenarioData.characters?.map(char => ({
          ...char,
          createdAt: char.createdAt?.toDate ? char.createdAt.toDate().toISOString() : char.createdAt,
          updatedAt: char.updatedAt?.toDate ? char.updatedAt.toDate().toISOString() : char.updatedAt,
      })) || []
  } : null;


  return {
    historyMessages, // Already mapped to camelCase for client if needed, or keep consistent
    scenarioData: serializableScenarioData,
    // playerCharacterId // No longer explicitly returning this unless client needs it directly
  };
}

export const actions = {
  sendMessage: async ({ request, params }) => {
    // Properly destructure chatId from params
    const { chatId } = params;
    
    // Add debug logging
    console.log("[Action] chatId from params:", chatId);
    
    // Validate route parameters
    if (!chatId) {
      console.error("[Action] chatId is undefined!");
      return fail(400, { success: false, message: "Missing chat ID" });
    }
    const formData = await request.formData();
    const message = formData.get('message')?.toString().trim();
    const selectedModel = formData.get('selectedModel')?.toString() || 'llama3-8b-8192'; // Default model

    console.log(`[Action SendMessage] Received for chatId: ${chatId}. Message: "${message ? message.substring(0,50) : 'EMPTY'}...". Model: ${selectedModel}`);

    if (!message) {
      console.warn('[Action SendMessage] Message cannot be empty.');
      return fail(400, { success: false, message: 'Message cannot be empty' });
    }

    try {
      const scenarioDocRef = doc(db, 'scenarios', chatId);
      const docSnap = await getDoc(scenarioDocRef);
      
      if (!docSnap.exists()) {
        console.error(`[Action SendMessage] Scenario not found for chatId: ${chatId}`);
        return fail(404, { success: false, message: 'Scenario not found' });
      }

      const scenarioData = { id: docSnap.id, ...docSnap.data() };
      console.log(`[Action SendMessage] Scenario "${scenarioData.name}" loaded.`);

      const playerCharacter = scenarioData.characters?.find(c => c.isPlayer);
      const aiCharacters = scenarioData.characters?.filter(c => !c.isPlayer) || [];
      
      if (aiCharacters.length === 0) {
        console.warn('[Action SendMessage] No AI characters found in scenario.');
        return fail(400, { success: false, message: 'No AI characters found in scenario' });
      }
      
      console.log(`[Action SendMessage] Player: ${playerCharacter?.name}, AI Characters: ${aiCharacters.map(c => c.name).join(', ')}`);

      // Ensure Zilliz collection is ready (idempotent call)
      await createScenarioCollection(chatId);

      const conversationHistory = await getConversationHistory(chatId); // Expects snake_case fields from Zilliz
      const nextTurnNumber = await getNextTurnNumber(chatId);
      console.log(`[Action SendMessage] Current turn: ${nextTurnNumber -1}. Next turn: ${nextTurnNumber}. History length: ${conversationHistory.length}`);

      // --- User Message Processing ---
      console.log('[Action SendMessage] Processing user message...');
      const userMessageEmbedding = await getEmbedding(message);
      const userMessageId = generateMessageId();
      const userTimestamp = Date.now();

      const userMessageData = {
        message_id: userMessageId || crypto.randomUUID(),
        message_embedding: userMessageEmbedding || Array(1536).fill(0),
        scenario_id: chatId || 'default_scenario_id',
        turn_number: nextTurnNumber ?? 0,
        real_timestamp_utc_ms: userTimestamp ?? Date.now(),
        sender_character_id: playerCharacter?.id || 'player_default_id',
        sender_is_player: true,
        venue_name: scenarioData?.venue_name || scenarioData?.venue || 'Unknown Venue',
        sub_location_in_venue: scenarioData?.sub_location_in_venue || 'Unknown Location',
        present_character_ids_at_location: [
          playerCharacter?.id || 'player_default_id',
          ...(Array.isArray(aiCharacters) ? aiCharacters.map(c => c?.id).filter(id => id != null) : [])
        ],
        fictional_datetime_iso: scenarioData?.currentFictionalDateTime || new Date().toISOString(),
        fictional_total_time_elapsed_seconds: scenarioData?.fictionalTotalTimeElapsedSeconds ?? 0,
        message_content_text: message || '[User message missing]',
        message_type: 'dialogue',
        action_details: '',
        dialogue_target_ids: Array.isArray(aiCharacters) ? aiCharacters.map(c => c?.id).filter(id => id != null) : [],
        mentioned_character_ids_in_content: [],
        key_topics_or_entities: [],
        sender_expressed_emotion: '',
        references_previous_message_ids: [],
        plot_relevance_score: 0.0
      };
      console.log(`[Action SendMessage] Storing user message (ID: ${userMessageId})...`);
      await storeMessage(userMessageData);
      console.log(`[Action SendMessage] User message (ID: ${userMessageId}) stored.`);

      // --- AI Replies Generation for Each Character ---
      console.log(`[Action SendMessage] Generating replies for ${aiCharacters.length} AI characters...`);
      
      const aiReplies = [];
      const aiMessageIds = [];
      
      // Update conversation history to include the user message we just stored
      const updatedHistory = [...conversationHistory, {
        sender_is_player: true,
        sender_character_id: playerCharacter?.id || 'player_default_id',
        message_content_text: message,
      }];

      for (let i = 0; i < aiCharacters.length; i++) {
        const aiCharacter = aiCharacters[i];
        console.log(`[Action SendMessage] Processing AI character ${i + 1}/${aiCharacters.length}: ${aiCharacter.name}`);
        
        try {
          // Generate AI reply for this specific character
          const historyForAI = updatedHistory.map(h => ({
            sender_is_player: h.sender_is_player,
            sender_character_id: h.sender_character_id,
            message_content_text: h.message_content_text,
          }));
          
          const aiReply = await generateAIReply(historyForAI, message, scenarioData, aiCharacter, selectedModel);
          const aiMessageEmbedding = await getEmbedding(aiReply);
          const aiMessageId = generateMessageId();
          const aiTimestamp = Date.now() + i; // Small offset to ensure unique timestamps
          
          console.log(`[Action SendMessage] AI character ${aiCharacter.name} ID:`, aiCharacter?.id);
          
          const aiMessageData = {
            message_id: aiMessageId || crypto.randomUUID(),
            message_embedding: aiMessageEmbedding || Array(1536).fill(0),
            scenario_id: chatId || 'default_scenario_id',
            turn_number: nextTurnNumber ?? 0,
            real_timestamp_utc_ms: aiTimestamp ?? Date.now(),
            sender_character_id: aiCharacter?.id || 'ai_default_id',
            sender_is_player: false,
            venue_name: scenarioData?.venue_name || scenarioData?.venue || 'Unknown Venue',
            sub_location_in_venue: scenarioData?.sub_location_in_venue || 'Unknown Location',
            present_character_ids_at_location: [
              playerCharacter?.id || 'player_default_id',
              ...(Array.isArray(aiCharacters) ? aiCharacters.map(c => c?.id).filter(id => id != null) : [])
            ],
            fictional_datetime_iso: scenarioData?.currentFictionalDateTime || new Date().toISOString(),
            fictional_total_time_elapsed_seconds: scenarioData?.fictionalTotalTimeElapsedSeconds ?? 0,
            message_content_text: aiReply || '[AI reply missing]',
            message_type: 'dialogue',
            action_details: '',
            dialogue_target_ids: [playerCharacter?.id || 'player_default_id'],
            mentioned_character_ids_in_content: [],
            key_topics_or_entities: [],
            sender_expressed_emotion: '',
            references_previous_message_ids: [userMessageId || 'unknown_msg_id'],
            plot_relevance_score: 0.0
          };
          
          console.log(`[Action SendMessage] Storing AI message for ${aiCharacter.name} (ID: ${aiMessageId})...`);
          await storeMessage(aiMessageData);
          console.log(`[Action SendMessage] AI message for ${aiCharacter.name} (ID: ${aiMessageId}) stored.`);
          
          // Add to our response arrays
          aiReplies.push({
            reply: aiReply,
            characterName: aiCharacter.name || 'AI',
            characterId: aiCharacter.id || 'ai_default_id',
            messageId: aiMessageId,
            timestamp: aiTimestamp
          });
          
          aiMessageIds.push(aiMessageId);
          
          // Update the history for the next character to see previous AI responses in this turn
          updatedHistory.push({
            sender_is_player: false,
            sender_character_id: aiCharacter?.id || 'ai_default_id',
            message_content_text: aiReply,
          });
          
        } catch (error) {
          console.error(`[Action SendMessage] Error processing AI character ${aiCharacter.name}:`, error.message);
          // Continue with other characters even if one fails
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

      return { // This is what `handleSubmitResult` on client receives in `result.result.data`
        success: true,
        replies: aiReplies, // Array of all AI character responses
        userMessageId: userMessageId, // For UI key or state
        aiMessageIds: aiMessageIds, // Array of all AI message IDs
        timestamp: userTimestamp, // For UI
        characterCount: aiCharacters.length
      };

    } catch (err) {
      console.error('[Action SendMessage] Error processing message:', err.message, err.stack);
      return fail(500, { success: false, message: `Failed to process message: ${err.message}` });
    }
  },
};