import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { ZILLIZ_CLUSTER_URI, ZILLIZ_CLUSTER_TOKEN } from '$env/static/private';
import { db } from '$lib/firebase'; // Ensure this path is correct for your Firebase init
import { doc, deleteDoc, getDoc } from 'firebase/firestore';
import { json } from '@sveltejs/kit';

// Initialize Milvus Client
let milvusClient;
try {
    milvusClient = new MilvusClient({
        address: ZILLIZ_CLUSTER_URI,
        token: ZILLIZ_CLUSTER_TOKEN,
    });
    console.log('Milvus client initialized for delete endpoint.');
} catch (e) {
    console.error("Failed to initialize Milvus client in delete endpoint:", e);
}

export async function DELETE({ params }) {
  const { scenarioId } = params;

  if (!scenarioId) {
    return json({ error: 'Scenario ID is required' }, { status: 400 });
  }

  if (!milvusClient) {
    console.error('Milvus client is not available for delete operation.');
    return json({ error: 'Message storage service is currently unavailable.' }, { status: 503 });
  }

  const collectionName = `scenario_messages_${scenarioId}`;
  let firestoreDeleted = false;
  let zillizDropped = false;

  try {
    // 1. Delete from Firestore
    const scenarioRef = doc(db, 'scenarios', scenarioId);
    const scenarioSnap = await getDoc(scenarioRef);

    if (scenarioSnap.exists()) {
      await deleteDoc(scenarioRef);
      console.log(`Successfully deleted scenario ${scenarioId} from Firestore.`);
      firestoreDeleted = true;
    } else {
      console.warn(`Scenario document ${scenarioId} not found in Firestore. It might have been already deleted.`);
      firestoreDeleted = true; 
    }

    // 2. Delete (drop) collection from Zilliz
    console.log(`Attempting to drop Zilliz collection: ${collectionName}`);
    
    const checkCollectionRes = await milvusClient.hasCollection({ collection_name: collectionName });
    
    if (checkCollectionRes.value) { 
        const dropCollectionRes = await milvusClient.dropCollection({ collection_name: collectionName });
        if (dropCollectionRes.error_code === 'Success' || dropCollectionRes.code === 0) {
            console.log(`Successfully dropped Zilliz collection: ${collectionName}`);
            zillizDropped = true;
        } else {
            console.error(`Failed to drop Zilliz collection ${collectionName}:`, dropCollectionRes.reason || dropCollectionRes.error_code);
        }
    } else {
        console.log(`Zilliz collection ${collectionName} does not exist or already deleted. No action needed for Zilliz.`);
        zillizDropped = true;
    }

    if (firestoreDeleted && zillizDropped) {
        return json({ message: `Scenario ${scenarioId} and its message storage deleted successfully.` }, { status: 200 });
    } else if (firestoreDeleted && !zillizDropped) {
        return json({ message: `Scenario ${scenarioId} deleted from Firestore, but failed to delete its message storage. Please check server logs.`, partialSuccess: true }, { status: 207 });
    } else {
        // This case should ideally not be reached if firestoreDeleted was set to true even if doc didn't exist.
        // If firestoreDeleted is false here, it means getDoc failed or deleteDoc failed unexpectedly.
        return json({ error: 'An unexpected state occurred during Firestore deletion or Zilliz processing.'}, { status: 500 });
    }

  } catch (error) {
    console.error(`Error during unified deletion for scenario ${scenarioId} (collection ${collectionName}):`, error);
    let errorMessage = `Failed to delete scenario: ${error.message}`;
    if (firestoreDeleted && !zillizDropped) {
         errorMessage = `Scenario ${scenarioId} was deleted from database, but an error occurred deleting its message storage: ${error.message}`;
    }
    return json({ error: errorMessage, firestoreDeleted, zillizDropped }, { status: 500 });
  }
}