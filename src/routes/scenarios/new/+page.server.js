import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { ZILLIZ_CLUSTER_URI, ZILLIZ_CLUSTER_TOKEN } from '$env/static/private';
import { db } from '$lib/firebase'; // Ensure this path is correct for your Firebase init
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { fail, redirect } from '@sveltejs/kit';

function findUndefinedPaths(obj, currentPath = '', paths = []) {
  if (obj === null || typeof obj !== 'object') {
    return paths;
  }
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newPath = currentPath ? `${currentPath}.${key}` : key;
    if (value === undefined) {
      paths.push(newPath);
    } else if (typeof value === 'object') {
      findUndefinedPaths(value, newPath, paths);
    }
  });
  return paths;
}

export const actions = {
  default: async ({ request }) => {
    const formData = await request.formData();
    const scenarioDataJson = formData.get('scenarioDataJson');
    let scenarioData;

    if (!scenarioDataJson) {
      return fail(400, { error: "Required form field 'scenarioDataJson' is missing or empty.", receivedValue: scenarioDataJson });
    }

    try {
      scenarioData = JSON.parse(scenarioDataJson);
    } catch (e) {
      console.error('Failed to parse scenarioDataJson:', e);
      return fail(400, { error: 'Invalid scenario data format.', scenarioDataJson });
    }

    // --- Avatar Handling Placeholder ---
    // As mentioned, this implementation assumes avatar URLs are final in scenarioData.
    // If scenarioData.characters[i].avatarFile or similar temporary client-side fields
    // were included in scenarioDataJson, they should ideally be cleaned up before sending
    // or handled/removed here if they are not intended for Firestore.
    // For example, ensure `avatar` fields are strings (URLs).
    scenarioData.characters = scenarioData.characters.map(char => ({
      ...char,
      avatar: char.avatar || char.avatarPreview || '', // Prioritize existing avatar URL or preview
      // Remove client-specific file objects if they were passed
      avatarFile: undefined,
      avatarPreview: (typeof char.avatarPreview === 'string' && char.avatarPreview.startsWith('blob:')) ? '' : (char.avatarPreview || char.avatar || ''),
    }));

    // Add server-side timestamps
    scenarioData.createdAt = serverTimestamp();
    // Remove any 'id' if it was part of a template scenario to ensure Firestore generates a new one
    delete scenarioData.id;

    let scenarioId;
    let milvusClient;

    try {
      // 1. Save to Firestore
      if (scenarioData && Array.isArray(scenarioData.characters)) {
        scenarioData.characters.forEach(character => {
          delete character.avatarPreview; // Ensure avatarPreview is not sent to Firestore
          delete character.avatarFile;    // Ensure avatarFile is not sent to Firestore
        });
      }
      console.log('Server-side scenarioData (cleaned) before addDoc:', JSON.stringify(scenarioData, null, 2)); // Log the cleaned data

      const undefinedPaths = findUndefinedPaths(scenarioData);
      if (undefinedPaths.length > 0) {
        console.error('Error: Found undefined values at the following paths:', undefinedPaths);
        // Optionally, you could return a fail() here to prevent Firestore call with bad data
        // return fail(400, { error: `Data integrity issue: undefined values found at ${undefinedPaths.join(', ')}` });
      }

      const docRef = await addDoc(collection(db, 'scenarios'), scenarioData);
      scenarioId = docRef.id;

      // 2. Initialize Zilliz Client
      if (!ZILLIZ_CLUSTER_URI || !ZILLIZ_CLUSTER_TOKEN) {
        console.error('Zilliz URI or Token is not configured in .env. Check $env/static/private setup.');
        return fail(500, { error: 'Zilliz configuration error on server. Admin check needed.' });
      }
      
      milvusClient = new MilvusClient({
        address: ZILLIZ_CLUSTER_URI,
        token: ZILLIZ_CLUSTER_TOKEN,
        // secure: true, // Usually true for cloud endpoints, SDK might default based on https URI
      });

      // 3. Define Zilliz Collection
      const collectionName = `scenario_messages_${scenarioId}`;
      const dimension = 1536; // Embedding dimension

      const createCollectionParams = {
        collection_name: collectionName,
        fields: [
          // --- Core Identifiers & Timestamps ---
          {
            name: 'message_id',
            data_type: DataType.VarChar,
            is_primary_key: true,
            autoID: false, // We will generate UUIDs
            max_length: 36,
            description: 'Unique UUID for the message entry'
          },
          {
            name: 'scenario_id',
            data_type: DataType.VarChar,
            max_length: 36,
            description: 'ID of the scenario this message belongs to (FK to Firestore)'
            // is_partition_key: true, // Consider for very large scale, requires enterprise Zilliz
          },
          {
            name: 'turn_number',
            data_type: DataType.Int64,
            description: 'Sequential turn number for messages within the scenario'
          },
          {
            name: 'real_timestamp_utc_ms',
            data_type: DataType.Int64,
            description: 'Real-world UTC timestamp in milliseconds of message creation'
          },

          // --- WHO (Sender Information) ---
          {
            name: 'sender_character_id',
            data_type: DataType.VarChar,
            max_length: 36, // Assuming character IDs are UUIDs or similar length
            description: 'ID of the character (player or AI) who authored this message'
          },
          {
            name: 'sender_is_player',
            data_type: DataType.Bool,
            description: 'True if the sender is the human player, false if an AI character'
          },

          // --- WHERE (Location & Environment) ---
          {
            name: 'venue_name',
            data_type: DataType.VarChar,
            max_length: 255,
            description: 'Name of the general venue or scene (e.g., "Blackstone Manor - Library")'
            // Note: Zilliz generally doesn't have a direct 'nullable' flag in schema;
            // you handle nulls by not including the field during insert or using default values if appropriate.
          },
          {
            name: 'sub_location_in_venue',
            data_type: DataType.VarChar,
            max_length: 255,
            description: 'Specific location of the sender within the venue (e.g., "by the window")'
          },
          {
            name: 'present_character_ids_at_location',
            data_type: DataType.Array,
            element_type: DataType.VarChar,
            max_length: 36, // Max length for each character_id string in the array
            max_capacity: 10, // Max number of characters present
            description: 'IDs of characters present at this sub_location during this message'
          },

          // --- WHEN (Fictional Time) ---
          {
            name: 'fictional_datetime_iso',
            data_type: DataType.VarChar,
            max_length: 35, // ISO 8601 format e.g. "2077-10-23T18:35:00.123Z"
            description: 'Fictional in-game date and time (ISO 8601 format)'
          },
          {
            name: 'fictional_total_time_elapsed_seconds',
            data_type: DataType.Int64,
            description: 'Total fictional time in seconds elapsed since the scenario began'
          },

          // --- WHAT (Message Content & Semantics) ---
          {
            name: 'message_content_text',
            data_type: DataType.VarChar,
            max_length: 65535, // Max for Zilliz VarChar, consider practical limits for embedding and LLM context
            description: 'The textual content of the message'
          },
          {
            name: 'message_embedding',
            data_type: DataType.FloatVector,
            dim: dimension, // Ensure 'dimension' variable is defined (e.g., 1536)
            description: 'Vector embedding of the message content (or a composite representation)'
          },
          {
            name: 'message_type',
            data_type: DataType.VarChar,
            max_length: 50,
            description: 'Categorization of the message (e.g., dialogue, action, narration)'
          },
          {
            name: 'action_details',
            data_type: DataType.VarChar, // Could also be DataType.JSON if storing structured action data
            max_length: 1024, // Increased length for potentially structured JSON string or detailed text
            description: 'Details if message_type is an action (e.g., JSON string or descriptive text)'
          },
          {
            name: 'dialogue_target_ids',
            data_type: DataType.Array,
            element_type: DataType.VarChar,
            max_length: 36,
            max_capacity: 5, // Max number of dialogue targets
            description: 'IDs of characters this dialogue is primarily addressed to'
          },
          {
            name: 'mentioned_character_ids_in_content',
            data_type: DataType.Array,
            element_type: DataType.VarChar,
            max_length: 36,
            max_capacity: 10, // Max number of mentioned characters
            description: 'IDs of characters explicitly mentioned in the message content'
          },
          {
            name: 'key_topics_or_entities',
            data_type: DataType.Array,
            element_type: DataType.VarChar,
            max_length: 100, // Max length for each keyword/entity string
            max_capacity: 20, // Max number of key topics/entities
            description: 'AI-extracted key topics or entities from the message content'
          },
          {
            name: 'sender_expressed_emotion',
            data_type: DataType.VarChar,
            max_length: 50,
            description: 'Dominant emotion expressed by the sender in this message (AI-extracted)'
          },

          // --- HOW (Contextual Links & Significance for RAG) ---
          {
            name: 'references_previous_message_ids',
            data_type: DataType.Array,
            element_type: DataType.VarChar,
            max_length: 36,
            max_capacity: 5, // Max number of referenced messages
            description: 'IDs of previous messages this one directly references or replies to'
          },
          {
            name: 'plot_relevance_score',
            data_type: DataType.Float,
            description: 'AI-assessed score (0.0-1.0) of this message plot relevance/significance'
          }
        ],
        description: `Stores messages and their embeddings for scenario ${scenarioId}`,
        // consistency_level: 'Strong', // Default is Bounded. Choose based on your app's needs.
      };

      console.log(`Attempting to create Zilliz collection: ${collectionName} with schema:`, JSON.stringify(createCollectionParams.fields, null, 2));
      const createCollectionRes = await milvusClient.createCollection(createCollectionParams);
      if (createCollectionRes.error_code !== 'Success') {
        console.error('Failed to create collection:', createCollectionRes);
        throw new Error(`Failed to create Zilliz collection ${collectionName}: ${createCollectionRes.reason || createCollectionRes.error_code}`);
      }
      console.log(`Successfully created Zilliz collection shell: ${collectionName} for scenario ${scenarioId}`);

      // 4. Create Index for the vector field
      const indexParamsForCreation = {
        collection_name: collectionName,
        field_name: 'message_embedding',
        index_name: `idx_embedding_${scenarioId.substring(0, 8)}`,
        index_type: 'HNSW',
        metric_type: 'L2',
        params: { M: 16, efConstruction: 64 },
      };

      console.log(`Attempting to create index: ${indexParamsForCreation.index_name} on field ${indexParamsForCreation.field_name} in collection ${collectionName}`);
      const createIndexRes = await milvusClient.createIndex(indexParamsForCreation);
      // Note: Successful createIndex in SDK v2.2.x might return { error_code: 'Success', value: true } or just { value: true }
      // SDK v2.3.x and later should consistently return { code: 0 } for success.
      // We'll check for a truthy response or an explicit success code.
      if (!createIndexRes || (createIndexRes.error_code && createIndexRes.error_code !== 'Success' && createIndexRes.code !== 0) ) {
        console.error('Failed to create index:', createIndexRes);
        throw new Error(`Failed to create index on ${collectionName}: ${createIndexRes.reason || createIndexRes.error_code || 'Unknown error'}`);
      }
      console.log(`Successfully created index: ${indexParamsForCreation.index_name}`);

      // 5. Load the Collection
      console.log(`Attempting to load collection: ${collectionName}`);
      const loadCollectionRes = await milvusClient.loadCollectionSync({ collection_name: collectionName });
      if (loadCollectionRes.error_code !== 'Success' && loadCollectionRes.code !== 0) {
        console.error('Failed to load collection:', loadCollectionRes);
        throw new Error(`Failed to load collection ${collectionName}: ${loadCollectionRes.reason || loadCollectionRes.error_code}`);
      }
      console.log(`Successfully loaded collection: ${collectionName}`);

      // Optional: Close Milvus client connection if your serverless environment prefers it.
      // For long-running servers, you might manage a persistent client.
      // await milvusClient.closeConnection();

    } catch (error) {
      console.error(`Error during scenario creation (ID: ${scenarioId || 'N/A'}) or Zilliz setup:`, error);
      // Attempt to clean up Firestore entry if Zilliz setup failed?
      // This can be complex (e.g., what if cleanup fails?). For now, log and report.
      let userErrorMessage = 'Failed to create scenario or initialize message storage.';
      if (error.message && error.message.includes('already exist')) {
        userErrorMessage = `A message storage collection for this scenario may already exist or there was a conflict. Scenario ID: ${scenarioId}`;
      } else if (error.message) {
        userErrorMessage += ` Details: ${error.message}`;
      }
      return fail(500, { error: userErrorMessage, scenarioIdIfCreated: scenarioId });
    }

    // If successful, redirect to the edit page of the new scenario
    throw redirect(303, `/scenarios/${scenarioId}/edit`); 
  }
};
