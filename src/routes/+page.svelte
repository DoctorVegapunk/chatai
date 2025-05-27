<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { db } from '../lib/firebase'; // Adjust path if necessary
  import { collection, getDocs, query, orderBy, limit, doc, deleteDoc } from 'firebase/firestore';

  let scenarios = [];
  let recentChats = [];
  let isLoadingScenarios = true;
  let isLoadingRecentChats = true;

  onMount(async () => {
    // Fetch all scenarios for 'Start a New Chat'
    try {
      const scenariosCollection = collection(db, 'scenarios');
      const scenariosQuery = query(scenariosCollection, orderBy('createdAt', 'desc')); // Or any other field you prefer for ordering scenarios
      const scenariosSnapshot = await getDocs(scenariosQuery);
      scenarios = scenariosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error fetching scenarios: ", error);
    } finally {
      isLoadingScenarios = false;
    }

    // Fetch recent chats/scenarios for 'My Chats' preview
    try {
      const recentChatsCollection = collection(db, 'scenarios'); // Assuming recent chats are also from scenarios
      const recentChatsQuery = query(recentChatsCollection, orderBy('createdAt', 'desc'), limit(3));
      const recentChatsSnapshot = await getDocs(recentChatsQuery);
      recentChats = recentChatsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error fetching recent chats: ", error);
    } finally {
      isLoadingRecentChats = false;
    }
  });
  
  function startNewChat(scenarioId) {
    goto(`/chat/${scenarioId}`);
  }

  function handleEditScenario(scenarioId) {
    goto(`/scenarios/${scenarioId}/edit`);
  }

  async function handleDeleteScenario(scenarioId, scenarioTitle) {
    if (!window.confirm(`Are you sure you want to delete the scenario "${scenarioTitle}"? This action will delete all associated messages and cannot be undone.`)) {
      return;
    }
    
    isLoadingScenarios = true; // Indicate loading state

    try {
      const response = await fetch(`/api/scenarios/${scenarioId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (response.ok) {
        console.log(`Scenario "${scenarioTitle}" (ID: ${scenarioId}) deleted successfully:`, result.message);
        scenarios = scenarios.filter(s => s.id !== scenarioId);
        alert(result.message || `Scenario "${scenarioTitle}" deleted successfully.`);
      } else {
        console.error(`Failed to delete scenario "${scenarioTitle}" (ID: ${scenarioId}):`, result.error || response.statusText);
        alert(`Failed to delete scenario: ${result.error || 'Unknown server error'}`);
      }
    } catch (error) {
      console.error("Error calling delete API for scenario: ", error);
      alert(`An error occurred while trying to delete the scenario: ${error.message}`);
    } finally {
      isLoadingScenarios = false;
    }
  }

  function getFirstNonPlayerAvatar(characters) {
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return '🤖'; // Default avatar if no characters array
    }
    const firstNonPlayer = characters.find(c => !c.isPlayer);
    return firstNonPlayer ? firstNonPlayer.avatar : '🤖'; // Default if no non-player found
  }

  function getCharacterColor(item) {
    if (item && item.characters && Array.isArray(item.characters)) {
        const firstNonPlayer = item.characters.find(c => !c.isPlayer);
        if (firstNonPlayer && firstNonPlayer.color) return firstNonPlayer.color;
    }
    return item && item.color ? item.color : 'gray'; // Fallback to item's color or default
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <!-- Hero Section -->
  <div class="text-center mb-12">
    <h1 class="text-4xl font-bold text-white mb-4">Welcome to ChatAI</h1>
    <p class="text-xl text-gray-300 max-w-3xl mx-auto">
      Start a conversation with one of our AI assistants or continue an existing chat.
    </p>
  </div>
  
  <!-- Available Scenarios -->
  <div class="mb-12">
    <h2 class="text-2xl font-semibold text-white mb-6">Start a New Chat</h2>
    {#if isLoadingScenarios}
      <div class="p-8 text-center text-white">
        <p>Loading scenarios...</p>
      </div>
    {:else if scenarios.length === 0}
      <div class="p-8 text-center text-white">
        <p>No scenarios available at the moment. Please check back later.</p>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {#each scenarios as scenario}
        <div 
          class="bg-gray-800 rounded-lg p-6 cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700"
          on:click={() => startNewChat(scenario.id)}
          on:keydown={(e) => e.key === 'Enter' && startNewChat(scenario.id)}
          role="button"
          tabindex="0"
        >
          <div class="flex items-center mb-4">
            <div class={`w-12 h-12 rounded-full bg-${getCharacterColor(scenario)}-600 flex items-center justify-center text-2xl mr-4 overflow-hidden`}>
              {#if getFirstNonPlayerAvatar(scenario.characters) && getFirstNonPlayerAvatar(scenario.characters).includes('http')}
                <img src={getFirstNonPlayerAvatar(scenario.characters)} alt={scenario.title || 'Scenario'} class="w-full h-full object-cover" />
              {:else}
                {getFirstNonPlayerAvatar(scenario.characters)}
              {/if}
            </div>
            <h3 class="text-xl font-semibold text-white truncate" title="{scenario.title || 'Untitled Scenario'}">{scenario.title || 'Untitled Scenario'}</h3>
          </div>
          <p class="text-gray-300 mb-4 min-h-[60px] overflow-hidden text-ellipsis">{scenario.description || 'No description available.'}</p>
          <div class="mt-4 flex justify-between items-center">
            <span class="text-sm text-${getCharacterColor(scenario)}-400">
              Start chatting →
            </span>
            <div class="flex items-center space-x-2">
              <button 
                on:click|stopPropagation={() => handleEditScenario(scenario.id)} 
                class="text-xs text-blue-400 hover:text-blue-300 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                aria-label={`Edit ${scenario.title || 'scenario'}`}
              >
                Edit
              </button>
              <button 
                on:click|stopPropagation={() => handleDeleteScenario(scenario.id, scenario.title || 'Untitled Scenario')} 
                class="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-gray-700 transition-colors"
                aria-label={`Delete ${scenario.title || 'scenario'}`}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
        {/each}
      </div>
    {/if}
  </div>
  
  <!-- Recent Chats (Preview) -->
  <div>
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-semibold text-white">My Chats</h2>
      <a 
        href="/chats" 
        class="text-indigo-400 hover:text-indigo-300 text-sm font-medium"
      >
        View all →
      </a>
    </div>
    {#if isLoadingRecentChats}
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center text-white">
        <p>Loading recent chats...</p>
      </div>
    {:else if recentChats.length === 0}
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <p class="text-gray-400 text-center">
          You don't have any recent chats. Start a new chat above!
        </p>
      </div>
    {:else}
      <div class="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
        <ul class="divide-y divide-gray-700">
          {#each recentChats as chat (chat.id)}
            <div 
              class="p-4 hover:bg-gray-700/50 cursor-pointer transition-colors group"
              on:click={() => goto(`/chat/${chat.id}`)}
              role="button" 
              tabindex="0"
              on:keydown={(e) => e.key === 'Enter' && goto(`/chat/${chat.id}`)}
            >
              <div class="flex items-center">
                {#if chat.avatar}
                <div class={`w-10 h-10 rounded-full bg-${getCharacterColor(chat)}-600 flex-shrink-0 flex items-center justify-center text-xl mr-3 overflow-hidden`}>
                  {#if getFirstNonPlayerAvatar(chat.characters) && getFirstNonPlayerAvatar(chat.characters).includes('http')}
                    <img src={getFirstNonPlayerAvatar(chat.characters)} alt={chat.title || 'Chat'} class="w-full h-full object-cover" />
                  {:else}
                    {getFirstNonPlayerAvatar(chat.characters)}
                  {/if}
                </div>
                {/if}
                <div class="flex-1 min-w-0">
                  <h3 class="text-md font-medium text-white truncate">{chat.title || 'Untitled Chat'}</h3>
                  {#if chat.lastMessage} <!-- You might need to adapt this if 'lastMessage' isn't directly on scenario objects -->
                    <p class="text-gray-400 text-sm truncate">{chat.lastMessage}</p>
                  {:else}
                    <p class="text-gray-400 text-sm truncate">{chat.description || 'No description'}</p>
                  {/if}
                </div>
                <!-- Add timestamp or unread indicator if available and desired -->
              </div>
            </div>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</div>