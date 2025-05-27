import { MilvusClient } from "@zilliz/milvus2-sdk-node";
import { ZILLIZ_CLUSTER_TOKEN, ZILLIZ_URI } from '$env/static/private';

// Ensure ZILLIZ_URI is just the hostname, e.g., "in03-xxxxxxxxxxxx.serverless.gcp-us-west1.cloud.zilliz.com"
const effectiveAddress = ZILLIZ_URI; // Potentially clean up if it includes https://
const effectiveToken = ZILLIZ_CLUSTER_TOKEN;

console.log(`[Zilliz] Initializing MilvusClient with Address: ${effectiveAddress}, Token Provided: ${!!effectiveToken}`);

// Initialize Zilliz client
const milvusClient = new MilvusClient({
  address: effectiveAddress,
  token: effectiveToken,
  ssl: true // Assuming SSL is needed for Zilliz Cloud serverless
});

const DIMENSION = 1024; // Dimension for Voyage AI embeddings (voyage-large-2)

// Create a new collection for a scenario with detailed schema
export async function createScenarioCollection(scenarioId) {
  console.log(`[Zilliz] createScenarioCollection called for scenarioId: ${scenarioId}`);
  const collectionName = `scenario_messages_${scenarioId}`;
  
  try {
    console.log(`[Zilliz] Checking if collection '${collectionName}' exists...`);
    const hasCollection = await milvusClient.hasCollection({
      collection_name: collectionName,
    });
    console.log(`[Zilliz] hasCollection response for '${collectionName}':`, hasCollection);

    if (hasCollection && hasCollection.status && hasCollection.status.error_code !== 'Success') {
        console.error(`[Zilliz] Error checking collection status for '${collectionName}':`, hasCollection.status);
        // Potentially throw an error or handle it if critical
    }

    if (!hasCollection || !hasCollection.value) {
      console.log(`[Zilliz] Collection '${collectionName}' does not exist. Creating...`);
      const createCollectionParams = {
        collection_name: collectionName,
        fields: [
          { name: 'message_id', data_type: 'VarChar', is_primary_key: true, max_length: 64 },
          { name: 'message_embedding', data_type: 'FloatVector', dim: DIMENSION },
          { name: 'scenario_id', data_type: 'VarChar', max_length: 64 },
          { name: 'turn_number', data_type: 'Int64' },
          { name: 'real_timestamp_utc_ms', data_type: 'Int64' },
          { name: 'sender_character_id', data_type: 'VarChar', max_length: 64 },
          { name: 'sender_is_player', data_type: 'Bool' },
          { name: 'venue_name', data_type: 'VarChar', max_length: 256 },
          { name: 'sub_location_in_venue', data_type: 'VarChar', max_length: 256 },
          { name: 'present_character_ids_at_location', data_type: 'JSON' },
          { name: 'fictional_datetime_iso', data_type: 'VarChar', max_length: 32 },
          { name: 'fictional_total_time_elapsed_seconds', data_type: 'Int64' },
          { name: 'message_content_text', data_type: 'VarChar', max_length: 4000 },
          { name: 'message_type', data_type: 'VarChar', max_length: 32 },
          { name: 'action_details', data_type: 'JSON' },
          { name: 'dialogue_target_ids', data_type: 'JSON' },
          { name: 'mentioned_character_ids_in_content', data_type: 'JSON' },
          { name: 'key_topics_or_entities', data_type: 'JSON' },
          { name: 'sender_expressed_emotion', data_type: 'VarChar', max_length: 64 },
          { name: 'references_previous_message_ids', data_type: 'JSON' },
          { name: 'plot_relevance_score', data_type: 'Float' },
        ],
      };
      console.log(`[Zilliz] Creating collection '${collectionName}' with params:`, JSON.stringify(createCollectionParams, null, 2));
      const createStatus = await milvusClient.createCollection(createCollectionParams);
      console.log(`[Zilliz] createCollection response for '${collectionName}':`, createStatus);
      if (createStatus && createStatus.error_code !== 'Success') {
        console.error(`[Zilliz] Failed to create collection '${collectionName}':`, createStatus.reason);
        throw new Error(`Failed to create collection: ${createStatus.reason}`);
      }

      console.log(`[Zilliz] Creating index for 'message_embedding' in '${collectionName}'...`);
      const indexParams = {
        collection_name: collectionName,
        field_name: 'message_embedding',
        index_type: 'AUTOINDEX', // Using AUTOINDEX for simplicity, ensure it's suitable for serverless. Or use IVF_FLAT if preferred.
        metric_type: 'L2',
        // params: { nlist: 1024 }, // Not needed for AUTOINDEX, but needed for IVF_FLAT
      };
      console.log(`[Zilliz] Index params for '${collectionName}':`, JSON.stringify(indexParams, null, 2));
      const indexStatus = await milvusClient.createIndex(indexParams);
      console.log(`[Zilliz] createIndex response for '${collectionName}':`, indexStatus);
      if (indexStatus && indexStatus.error_code !== 'Success') {
        console.error(`[Zilliz] Failed to create index for '${collectionName}':`, indexStatus.reason);
        // Not throwing error here as collection might still be usable for some operations or index might be created asynchronously
      }

      console.log(`[Zilliz] Loading collection '${collectionName}' into memory...`);
      const loadStatus = await milvusClient.loadCollection({
        collection_name: collectionName,
      });
      console.log(`[Zilliz] loadCollection response for '${collectionName}':`, loadStatus);
      if (loadStatus && loadStatus.error_code !== 'Success') {
        console.error(`[Zilliz] Failed to load collection '${collectionName}':`, loadStatus.reason);
        // Not throwing error here as it might load eventually or might not be critical for insert
      }
      console.log(`[Zilliz] Collection '${collectionName}' setup complete.`);
    } else {
      console.log(`[Zilliz] Collection '${collectionName}' already exists. Ensuring it's loaded...`);
      // Optionally, ensure it's loaded if it exists but might not be loaded
      // This might be redundant if load is persistent, but good for robustness
      const loadStatus = await milvusClient.loadCollectionSync({ // Using loadCollectionSync for existing collections
         collection_name: collectionName,
      });
      console.log(`[Zilliz] loadCollectionSync response for existing '${collectionName}':`, loadStatus);
       if (loadStatus && loadStatus.error_code !== 'Success' && loadStatus.error_code !== 'CollectionAlreadyLoaded') { // Check for specific error codes
        console.warn(`[Zilliz] Issue loading existing collection '${collectionName}':`, loadStatus.reason);
      }
    }
    return collectionName;
  } catch (error) {
    console.error(`[Zilliz] Error in createScenarioCollection for '${collectionName}':`, error.message, error.stack);
    throw error; // Re-throw the error to be caught by the caller
  }
}

// Store a message in Zilliz with full schema
export async function storeMessage(messageData) {
  const { scenario_id: scenarioId, message_id, message_content_text } = messageData;
  if (!scenarioId) {
    throw new Error('scenarioId is required but was undefined');
  }
  const collectionName = `scenario_messages_${scenarioId}`;
  
  try {
    const insertPayload = {
      collection_name: collectionName,
      data: [messageData],
    };
    
    console.log(`[Zilliz] Storing message '${message_id}' (${message_content_text?.substring(0, 30)}${message_content_text?.length > 30 ? '...' : ''})`);
    
    const insertResponse = await milvusClient.insert(insertPayload);

    if (insertResponse.status?.error_code !== 'Success') {
      console.error(`[Zilliz] Insert failed for '${message_id}': ${insertResponse.status?.reason || 'Unknown error'}`);
      throw new Error(`Insert failed: ${insertResponse.status?.reason || 'Unknown error'}`);
    }

    console.log(`[Zilliz] Message '${message_id}' stored successfully`);
    return { 
      messageId: message_id, 
      timestamp: messageData.real_timestamp_utc_ms, 
      status: insertResponse.status 
    };
  } catch (error) {
    console.error(`[Zilliz] Error storing '${message_id}' in '${collectionName}':`, error.message);
    if (error.response?.data) {
        console.error('[Zilliz] Error details:', JSON.stringify(error.response.data));
    }
    throw error;
  }
}

// Get conversation history with detailed fields
export async function getConversationHistory(scenarioId, limit = 50) {
  const collectionName = `scenario_messages_${scenarioId}`;
  console.log(`[Zilliz] getConversationHistory called for scenarioId: ${scenarioId}, limit: ${limit}`);
  
  try {
    const queryParams = {
      collection_name: collectionName,
      expr: `scenario_id == "${scenarioId}"`, // Ensure scenarioId is properly quoted if it's a string
      output_fields: [
        'message_id', 'scenario_id', 'turn_number', 'real_timestamp_utc_ms',
        'sender_character_id', 'sender_is_player', 'venue_name', 
        'message_content_text', 'message_type', 'sender_expressed_emotion'
      ],
      limit,
    };
    console.log(`[Zilliz] Querying '${collectionName}' with params:`, JSON.stringify(queryParams, null, 2));
    const result = await milvusClient.query(queryParams);

    if (result.status && result.status.error_code !== 'Success') {
      console.error(`[Zilliz] Error querying conversation history for '${collectionName}':`, result.status.reason);
      return [];
    }
    
    console.log(`[Zilliz] Successfully fetched ${result.data ? result.data.length : 0} messages for '${collectionName}'.`);
    // Sort by timestamp since Milvus doesn't guarantee order from query
    const sortedResults = (result.data || []).sort((a, b) => 
      a.real_timestamp_utc_ms - b.real_timestamp_utc_ms
    );
    return sortedResults;
  } catch (error) {
    console.error(`[Zilliz] Error in getConversationHistory for '${collectionName}':`, error.message, error.stack);
    return [];
  }
}

// Get the next turn number for a scenario
export async function getNextTurnNumber(scenarioId) {
  const collectionName = `scenario_messages_${scenarioId}`;
  console.log(`[Zilliz] getNextTurnNumber called for scenarioId: ${scenarioId}`);
  
  try {
    // Query for the highest turn_number. Milvus query doesn't directly support MAX aggregation easily without complex expressions.
    // A common approach is to fetch all turn numbers and find max, or fetch sorted by turn_number desc.
    // For simplicity, fetching a larger set and finding max, or if data is small, fetch all.
    // Let's refine this to be more efficient if possible or rely on the existing logic.
    // The existing logic fetches 1 record, which isn't correct for finding MAX.
    // It should fetch all records (or a sample sorted by turn_number DESC) to find the max.
    // However, if the goal is just to increment, fetching all and finding max is safer.

    const queryParams = {
      collection_name: collectionName,
      expr: `scenario_id == "${scenarioId}"`,
      output_fields: ['turn_number'],
      // limit: 1000, // Fetch a reasonable number of recent messages to find max turn. Adjust as needed.
      // Or, if your dataset is small, you can remove the limit or set it high.
      // Milvus doesn't support ORDER BY in the query API directly in older versions.
      // The SDK might offer sorting options or you sort client-side.
    };
    console.log(`[Zilliz] Querying for turn numbers in '${collectionName}':`, JSON.stringify(queryParams, null, 2));
    const result = await milvusClient.query(queryParams);

    if (result.status && result.status.error_code !== 'Success') {
      console.error(`[Zilliz] Error querying for turn numbers in '${collectionName}':`, result.status.reason);
      return 1; // Default to 1 on error
    }

    if (!result.data || result.data.length === 0) {
      console.log(`[Zilliz] No messages found for turn number calculation in '${collectionName}'. Defaulting to 1.`);
      return 1;
    }

    const maxTurn = Math.max(...result.data.map(r => r.turn_number || 0), 0); // Ensure we handle null/undefined turn_number and empty array
    const nextTurn = maxTurn + 1;
    console.log(`[Zilliz] Max turn for '${collectionName}' is ${maxTurn}. Next turn number: ${nextTurn}`);
    return nextTurn;

  } catch (error) {
    console.error(`[Zilliz] Error in getNextTurnNumber for '${collectionName}':`, error.message, error.stack);
    return 1; // Default to 1 on error
  }
}

// Search for similar messages using vector similarity
export async function searchSimilarMessages(scenarioId, queryEmbedding, limit = 5) {
  const collectionName = `scenario_messages_${scenarioId}`;
  console.log(`[Zilliz] searchSimilarMessages called for scenarioId: ${scenarioId}, limit: ${limit}`);
  
  try {
    const searchParams = {
      collection_name: collectionName,
      vectors: [queryEmbedding], // Ensure queryEmbedding is a single vector (array of floats)
      search_params: {
        anns_field: 'message_embedding',
        topk: limit,
        metric_type: 'L2', // Or 'IP' depending on your embedding model
        params: JSON.stringify({ nprobe: 10 }), // Params should be a JSON string for some SDK versions
      },
      output_fields: [
        'message_id', 'message_content_text', 'sender_character_id', 
        'sender_is_player', 'real_timestamp_utc_ms'
      ],
      consistency_level: "Eventually" // Or "Strong" if immediate consistency is critical
    };
    console.log(`[Zilliz] Searching '${collectionName}' with params (embedding omitted for brevity):`, JSON.stringify({...searchParams, vectors: ['...embedding...']}, null, 2));
    const result = await milvusClient.search(searchParams);

    if (result.status && result.status.error_code !== 'Success') {
      console.error(`[Zilliz] Error searching similar messages in '${collectionName}':`, result.status.reason);
      return [];
    }
    
    console.log(`[Zilliz] Search in '${collectionName}' found ${result.results ? result.results.length : 0} results.`);
    return result.results || [];
  } catch (error) {
    console.error(`[Zilliz] Error in searchSimilarMessages for '${collectionName}':`, error.message, error.stack);
    return [];
  }
}

// Generate a unique message ID
export function generateMessageId() {
  const id = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  // console.log(`[Zilliz] Generated messageId: ${id}`); // Optional: can be noisy
  return id;
}

// Cleanup and close client (for graceful shutdown)
export async function closeClient() {
  if (milvusClient) {
    console.log("[Zilliz] Closing Milvus client connection...");
    try {
        await milvusClient.closeConnection();
        console.log("[Zilliz] Milvus client connection closed.");
    } catch(e) {
        console.error("[Zilliz] Error closing Milvus client connection:", e);
    }
  }
}
