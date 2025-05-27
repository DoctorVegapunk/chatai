<script>
  import { onMount } from 'svelte';
  import { db } from '../../../lib/firebase'; // Adjust path if necessary
  import { doc, getDoc } from 'firebase/firestore';
  import { page } from '$app/stores';
  import { navbarCollapsed, toggleNavbar } from '$lib/stores/navbar';
  import { enhance } from '$app/forms';
  
  // Reactive chat ID from URL
  $: chatId = $page.params.chatId;
  
  let scenarioData = null;
  let isLoadingScenario = true;
  let messages = [];

  let playerCharacter = null;
  let aiCharacters = [];

  $: if (scenarioData?.characters) {
    // Ensure characters have unique ids (e.g., by name)
    const chars = scenarioData.characters.map(c => ({ id: c.id || c.name, ...c }));
    playerCharacter = chars.find(c => c.isPlayer) || null;
    aiCharacters = chars.filter(c => !c.isPlayer);
  } else {
    playerCharacter = null;
    aiCharacters = [];
  }

  let input = '';
  let isFullscreen = false;
  let isLoading = false;

  // Model selection for Groq
  const GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "distil-whisper-large-v3-en",
    "qwen-qwq-32b",
    "deepseek-r1-distill-llama-70b",
    "mistral-saba-24b"
  ];
  let selectedModel = GROQ_MODELS[0];

  let formElement;

  function formatMessageText(text) {
    if (!text) return '';
    return text
      .replace(/\(\*([^*]+)\*\)/g, '<em class="text-gray-300 italic">$1</em>')
      .replace(/\("([^"]+)"\)/g, '$1')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  // Lookup by name or id
  function getCharacterById(characterId, characterName) {
    if (!scenarioData?.characters) return null;
    const chars = scenarioData.characters.map(c => ({ id: c.id || c.name, ...c }));
    return chars.find(c => c.id === characterId || c.name === characterName) || null;
  }

  function handleSubmitResult({ result }) {
    isLoading = false;
    if (result?.type === 'success') {
      const data = result.data;
      if (data.success && Array.isArray(data.replies)) {
        const newMsgs = data.replies.map(r => ({
          id: r.messageId,
          text: r.reply,
          sender: 'bot',
          characterName: r.characterName,
          characterId: r.characterId
        }));
        messages = [...messages, ...newMsgs];
      } else if (data.success && data.reply) {
        messages = [...messages, {
          id: data.aiMessageId,
          text: data.reply,
          sender: 'bot',
          characterName: data.characterName,
          characterId: data.characterId
        }];
      } else {
        console.warn('Unexpected AI format', data);
      }
    } else {
      const error = result?.data;
      messages = [...messages, { text: error?.message || 'Error getting AI reply', sender: 'bot', characterName: 'System' }];
    }
    scrollToBottom();
  }

  function scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.chat-container');
      if (container) container.scrollTo(0, container.scrollHeight);
    }, 50);
  }

  async function handleSubmit() {
    if (!input.trim() || !formElement) return;
    const userMsg = { text: input, sender: 'user', characterName: playerCharacter?.name, characterId: playerCharacter?.id };
    messages = [...messages, userMsg];
    isLoading = true;
    formElement.requestSubmit();
    input = '';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) document.documentElement.requestFullscreen().catch(console.error);
    else if (document.fullscreenElement) document.exitFullscreen().catch(console.error);
  }

  export let data;
  $: ({ historyMessages = [] } = data || {});

  onMount(async () => {
    if (!chatId) {
      messages = [{ text: 'Error: Missing Chat ID', sender: 'bot' }];
      isLoadingScenario = false;
      return;
    }
    try {
      const docRef = doc(db, 'scenarios', chatId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        scenarioData = { id: snap.id, ...snap.data() };
        messages = historyMessages.length ? historyMessages : [{ text: scenarioData.description || `Welcome to ${scenarioData.title}`, sender: 'bot', characterName: 'System' }];
      } else {
        messages = [{ text: 'Scenario not found', sender: 'bot' }];
      }
    } catch (err) {
      console.error(err);
      messages = [{ text: 'Error loading scenario', sender: 'bot' }];
    } finally {
      isLoadingScenario = false;
      scrollToBottom();
    }
  });
</script>


<div class="flex flex-col h-screen bg-gray-900 text-gray-100 relative">
  <!-- Collapse button -->
  <button 
    class="absolute top-2 right-2 z-10 p-1 text-gray-400 hover:text-white transition-colors duration-200"
    on:click={toggleNavbar}
    aria-label={$navbarCollapsed ? 'Show navigation' : 'Hide navigation'}
  >
    <svg 
      class="w-4 h-4" 
      fill="none" 
      viewBox="0 0 24 24" 
      stroke="currentColor"
    >
      {#if $navbarCollapsed}
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      {:else}
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      {/if}
    </svg>
  </button>
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
            class="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-2xl font-bold cursor-pointer hover:bg-indigo-700 transition-colors overflow-hidden"
            on:click={toggleFullscreen}
            role="button"
            tabindex="0"
            on:keydown={(e) => e.key === 'Enter' && toggleFullscreen()}
            title={playerCharacter.name}
          >
            {#if playerCharacter.avatar}
              <img src={playerCharacter.avatar} alt={playerCharacter.name} class="w-full h-full object-cover" />
            {:else}
              {playerCharacter.name?.charAt(0) || '🧑'}
            {/if}
          </div>
        {/if}
        {#if playerCharacter && aiCharacters.length > 0}
          <div class="w-3"></div> <!-- Gap -->
        {/if}
        {#if aiCharacters.length > 0}
          <div class="flex -space-x-3 items-center">
            {#each aiCharacters as char (char.name)}
              <div
                class="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-xl font-semibold shadow-md overflow-hidden"
                title={char.name}
              >
                {#if char.avatar}
                  <img src={char.avatar} alt={char.name} class="w-full h-full object-cover" />
                {:else}
                  {char.name?.charAt(0) || '🤖'}
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if !playerCharacter && aiCharacters.length === 0}
          <div class="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-2xl font-bold">
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
    <div class="flex-1 overflow-y-auto chat-container p-4 space-y-4 mt-2">
      {#each messages as message}
      <div class={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} items-start space-x-3`}>
        {#if message.sender === 'bot'}
          {@const character = getCharacterById(message.characterId, message.characterName)}
          <div class="flex-shrink-0">
            <div class="w-14 h-14 rounded-full bg-gray-600 flex items-center justify-center text-sm font-semibold overflow-hidden" title={message.characterName}> 
              {#if character?.avatar}
                <img src={character.avatar} alt={message.characterName} class="w-full h-full object-cover" />
              {:else}
                {character?.name?.charAt(0) || message.characterName?.charAt(0) || '🤖'}
              {/if}
            </div>
          </div>
        {/if}

        <div class="flex flex-col max-w-3/4">
          {#if message.sender === 'bot'}
            <div class="text-sm text-gray-300 mb-1 font-medium">{message.characterName}</div>
          {/if}
          <div class={`rounded-lg p-4 ${message.sender === 'user' ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none'}`}> 
            {@html formatMessageText(message.text)}
          </div>
        </div>

        {#if message.sender === 'user'}
          <div class="flex-shrink-0">
            <div class="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-semibold overflow-hidden" title={message.characterName}>
              {#if playerCharacter?.avatar}
                <img src={playerCharacter.avatar} alt={message.characterName} class="w-full h-full object-cover" />
              {:else}
                {playerCharacter?.name?.charAt(0) || '🧑'}
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/each}
    
    {#if isLoading}
      <div class="flex justify-start items-start space-x-3">
        <div class="flex-shrink-0">
          <div class="w-14 h-14 rounded-full bg-gray-600 flex items-center justify-center text-sm">
            🤖
          </div>
        </div>
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
  
  <!-- Hidden form for form actions -->
  <form
  bind:this={formElement}
  method="POST"
  action="?/sendMessage"
  use:enhance={enhance(handleSubmitResult)}
  style="display: none;"
>
  <input type="hidden" name="message" bind:value={input} />
  <input type="hidden" name="selectedModel" bind:value={selectedModel} />
</form>

  
  <!-- Model selection and Message input -->
  <div class="border-t border-gray-700 bg-gray-800 p-4">
    <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0">
      <select
        bind:value={selectedModel}
        class="bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        aria-label="Select Groq Model"
      >
        {#each GROQ_MODELS as model}
          <option value={model}>{model}</option>
        {/each}
      </select>
      <input
        type="text"
        bind:value={input}
        on:keydown={handleKeyDown}
        placeholder="Type a message..."
        class="flex-1 bg-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      <button
        on:click={handleSubmit}
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
  em {
    font-style: italic;
    color: #d1d5db;
  }
  
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