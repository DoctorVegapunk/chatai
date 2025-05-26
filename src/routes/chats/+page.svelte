<script>
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { db } from '../../lib/firebase'; // Adjust path if necessary
  import { collection, getDocs, query, orderBy } from 'firebase/firestore';

  let chats = [];
  let isLoading = true;

  onMount(async () => {
    try {
      const chatsCollection = collection(db, 'scenarios'); // Updated collection name
      // You might want to add 'where' clauses here to filter by user, e.g., where('userId', '==', currentUserId)
      // And order by a timestamp field, e.g., orderBy('timestamp', 'desc')
      const q = query(chatsCollection, orderBy('createdAt', 'desc')); // Updated timestamp field 
      const querySnapshot = await getDocs(q);
      chats = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error fetching scenarios: ", error);
      // Handle error display to the user if needed
    } finally {
      isLoading = false;
    }
  });
  
  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffInDays === 1) {
      return 'Yesterday';
    } else if (diffInDays < 7) {
      return date.toLocaleDateString([], { weekday: 'long' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }
  
  function openChat(chatId) {
    goto(`/chat/${chatId}`);
  }

  function getFirstNonPlayerAvatar(characters) {
    if (!characters || !Array.isArray(characters) || characters.length === 0) {
      return '🤖';
    }
    const firstNonPlayer = characters.find(c => !c.isPlayer);
    return firstNonPlayer ? firstNonPlayer.avatar : '🤖';
  }

  function getCharacterColor(item) {
    if (item && item.characters && Array.isArray(item.characters)) {
        const firstNonPlayer = item.characters.find(c => !c.isPlayer);
        if (firstNonPlayer && firstNonPlayer.color) return firstNonPlayer.color;
    }
    return item && item.color ? item.color : 'gray';
  }
</script>

<div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="flex justify-between items-center mb-8">
    <div>
      <h1 class="text-3xl font-bold text-white">My Chats</h1>
      <p class="text-gray-400">Your conversations with AI assistants</p>
    </div>
    <a 
      href="/" 
      class="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
    >
      + New Chat
    </a>
  </div>
  
  <div class="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
    {#if isLoading}
      <div class="p-8 text-center text-white">
        <p>Loading scenarios...</p>
      </div>
    {:else if chats.length === 0}
      <div class="p-8 text-center">
        <div class="text-5xl mb-4">💬</div>
        <h3 class="text-xl font-semibold text-white mb-2">No chats yet</h3>
        <p class="text-gray-400 mb-6">Start a new chat to see it appear here</p>
        <a 
          href="/" 
          class="inline-block px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
        >
          Start a New Chat
        </a>
      </div>
    {:else}
      <ul class="divide-y divide-gray-700">
        {#each chats as chat (chat.id)}
          <div 
            class="p-4 hover:bg-gray-700/50 cursor-pointer transition-colors group"
            on:click={() => openChat(chat.id)}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && openChat(chat.id)}
          >
            <div class="flex items-center">
              <div class={`w-12 h-12 rounded-full bg-${getCharacterColor(chat)}-600 flex-shrink-0 flex items-center justify-center text-2xl mr-4 overflow-hidden`}>
                {#if getFirstNonPlayerAvatar(chat.characters) && getFirstNonPlayerAvatar(chat.characters).includes('http')}
                  <img src={getFirstNonPlayerAvatar(chat.characters)} alt={chat.title || 'Chat'} class="w-full h-full object-cover" />
                {:else}
                  {getFirstNonPlayerAvatar(chat.characters)}
                {/if}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex justify-between items-center">
                  <h3 class="text-lg font-medium text-white truncate">{chat.title || 'Untitled Chat'}</h3>
                  <span class="text-xs text-gray-500 ml-2 whitespace-nowrap">
                    {formatDate(chat.createdAt.toDate())}
                  </span>
                </div>
                <p class="text-gray-400 text-sm truncate">
                  {chat.lastMessage || chat.description || 'No description'}
                </p>
              </div>
              {#if chat.unread > 0}
                <span class="ml-4 bg-indigo-600 text-white text-xs font-medium px-2 py-0.5 rounded-full">
                  {chat.unread}
                </span>
              {/if}
            </div>
          </div>
        {/each}
      </ul>
    {/if}
  </div>
</div>
