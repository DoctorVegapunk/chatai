<script>
  import { onMount } from 'svelte';
  import { db } from '../../../lib/firebase'; // Adjust path if necessary
  import { doc, getDoc } from 'firebase/firestore';
  import { page } from '$app/stores';
  
  // Get chat ID from URL
  let chatId = $page.params.chatId;
  
  let scenarioData = null;
  let isLoadingScenario = true;
  let messages = [];

  let playerCharacter = null;
  let aiCharacters = [];

  $: if (scenarioData && scenarioData.characters && Array.isArray(scenarioData.characters)) {
    playerCharacter = scenarioData.characters.find(c => c.isPlayer);
    aiCharacters = scenarioData.characters.filter(c => !c.isPlayer);
  } else {
    playerCharacter = null;
    aiCharacters = [];
  }
  let input = '';
  let isFullscreen = false;
  let isLoading = false;
  
  function sendMessage() {
    if (!input.trim()) return;
    
    // Add user message
    messages = [...messages, { text: input, sender: 'user' }];
    const userMessage = input;
    input = '';
    
    // Simulate bot thinking
    isLoading = true;
    
    // Add bot response after a short delay
    setTimeout(() => {
      const botReply = scenarioData?.defaultResponse || "Thanks for your message! What else would you like to discuss?";
      messages = [...messages, { text: botReply, sender: 'bot' }];
      isLoading = false;
      
      // Auto-scroll to bottom
      setTimeout(() => {
        const chatContainer = document.querySelector('.chat-container');
        if (chatContainer) {
          chatContainer.scrollTop = chatContainer.scrollHeight;
        }
      }, 100);
      
      // In a real app, you would save the conversation here
    }, 800);
  }
  
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }
  
  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      document.documentElement.requestFullscreen().catch(console.error);
    } else if (document.fullscreenElement) {
      document.exitFullscreen().catch(console.error);
    }
  }
  
  onMount(async () => {
    if (!chatId) {
      console.error("Chat ID is missing");
      isLoadingScenario = false;
      messages = [{ text: "Error: Chat ID is missing.", sender: 'bot' }];
      return;
    }

    try {
      const scenarioDocRef = doc(db, 'scenarios', chatId);
      const docSnap = await getDoc(scenarioDocRef);
      if (docSnap.exists()) {
        scenarioData = { id: docSnap.id, ...docSnap.data() };
        const greeting = scenarioData.initialGreeting || scenarioData.description || `Welcome to "${scenarioData.name || 'the chat'}"!`;
        messages = [{ text: greeting, sender: 'bot' }];
      } else {
        console.error("No such scenario!", chatId);
        scenarioData = { name: "Unknown Chat", avatar: "❓", description: "This chat could not be found.", color: "gray" };
        messages = [{ text: "Error: Chat not found.", sender: 'bot' }];
      }
    } catch (error) {
      console.error("Error fetching scenario: ", error);
      scenarioData = { name: "Error", avatar: "⚠️", description: "Could not load chat details.", color: "red" };
      messages = [{ text: "Error loading chat details.", sender: 'bot' }];
    } finally {
      isLoadingScenario = false;
    }
    
    // Auto-scroll to bottom on initial load
    setTimeout(() => {
      const chatContainer = document.querySelector('.chat-container');
      if (chatContainer) {
        chatContainer.scrollTop = chatContainer.scrollHeight;
      }
    }, 100);
  });
</script>

<div class="flex flex-col h-screen bg-gray-900 text-gray-100">
  {#if isLoadingScenario}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-xl">Loading chat...</p>
    </div>
  {:else if !scenarioData}
    <div class="flex-1 flex items-center justify-center">
      <p class="text-xl text-red-500">Could not load chat information.</p>
       <a href="/chats" class="ml-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Back to Chats</a>
    </div>
  {:else}
    <!-- Header with bot info -->
    <div class="flex items-center p-4 border-b border-gray-700 bg-gray-800">
      <!-- Avatars section -->
      <div class="flex items-center mr-3 flex-shrink-0">
        {#if playerCharacter}
          <div
            class={`w-12 h-12 rounded-full bg-${playerCharacter.color || 'indigo'}-600 flex items-center justify-center text-2xl font-bold cursor-pointer hover:bg-${playerCharacter.color || 'indigo'}-700 transition-colors overflow-hidden`}
            on:click={toggleFullscreen}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && toggleFullscreen()}
            title={playerCharacter.name || 'Player'}
          >
            {#if playerCharacter.avatar && playerCharacter.avatar.includes('http')}
              <img src={playerCharacter.avatar} alt={playerCharacter.name || 'Player'} class="w-full h-full object-cover" />
            {:else}
              {playerCharacter.avatar || '🧑'}
            {/if}
          </div>
        {/if}
        {#if playerCharacter && aiCharacters.length > 0}
          <div class="w-3"></div> <!-- Gap -->
        {/if}
        {#if aiCharacters.length > 0}
          <div class="flex -space-x-3 items-center">
            {#each aiCharacters as char (char.id || char.name)} <!-- Assuming char has a unique id or name for keying -->
              <div
                class={`w-10 h-10 rounded-full bg-${char.color || 'gray'}-600 flex items-center justify-center text-xl font-semibold shadow-md overflow-hidden`}
                title={char.name || 'AI Character'}
              >
                {#if char.avatar && char.avatar.includes('http')}
                  <img src={char.avatar} alt={char.name || 'AI Character'} class="w-full h-full object-cover" />
                {:else}
                  {char.avatar || '🤖'}
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if !playerCharacter && aiCharacters.length === 0} <!-- Fallback if no characters -->
          <div class={`w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-2xl font-bold`}>
            {'❓'}
          </div>
        {/if}
      </div>

      <!-- Title and Description -->
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-bold truncate">{scenarioData.title || 'Chat'}</h1>
        <p class="text-sm text-gray-400 truncate">
          {scenarioData.description || (scenarioData.title ? `Talking about ${scenarioData.title}` : 'Ready to chat.')}
        </p>
      </div>

      <!-- Back to Chats link -->
      <div class="ml-auto pl-3 flex-shrink-0">
        <a 
          href="/chats" 
          class="text-gray-400 hover:text-white px-3 py-1 text-sm font-medium"
        >
          ← Back to Chats
        </a>
      </div>
    </div>
    
    <!-- Chat messages -->
    <div class="flex-1 overflow-y-auto p-4 space-y-4 chat-container">
    {#each messages as message, i}
      <div class={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
        <div 
          class={`max-w-3/4 rounded-lg p-4 ${
            message.sender === 'user' 
              ? 'bg-indigo-600 text-white rounded-br-none' 
              : 'bg-gray-800 text-gray-100 rounded-bl-none'
          }`}
        >
          {message.text}
        </div>
      </div>
    {/each}
    
    {#if isLoading}
      <div class="flex justify-start">
        <div class="bg-gray-800 text-gray-100 rounded-lg p-4 rounded-bl-none">
          <div class="flex space-x-2">
            <div class="w-2 h-2 rounded-full bg-gray-400 animate-bounce"></div>
            <div class="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0.2s"></div>
            <div class="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style="animation-delay: 0.4s"></div>
          </div>
        </div>
      </div>
    {/if}
  </div>
  
  <!-- Message input -->
  <div class="p-4 border-t border-gray-700 bg-gray-800">
    <div class="flex space-x-2">
      <input
        type="text"
        bind:value={input}
        on:keydown={handleKeyDown}
        placeholder="Type a message..."
        class="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        on:click={sendMessage}
        disabled={!input.trim() || isLoading}
        class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Send
      </button>
    </div>
  </div>
  {/if}
</div>

<style>
  /* Custom scrollbar */
  .chat-container::-webkit-scrollbar {
    width: 6px;
  }
  
  .chat-container::-webkit-scrollbar-track {
    background: transparent;
  }
  
  .chat-container::-webkit-scrollbar-thumb {
    background: #4B5563;
    border-radius: 3px;
  }
  
  .chat-container::-webkit-scrollbar-thumb:hover {
    background: #6B7280;
  }
  
  /* Animation for bouncing dots */
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-5px); }
  }
  
  .animate-bounce {
    animation: bounce 1s infinite;
  }
</style>