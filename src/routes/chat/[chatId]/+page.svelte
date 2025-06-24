<script>
  import { onMount } from 'svelte';
  // Remove the enhance import for now
  // import { enhance } from '$app/forms'; // Comment this out
  import { db } from '../../../lib/firebase';
  import { doc, getDoc } from 'firebase/firestore';
  import { page } from '$app/stores';
  import { navbarCollapsed, toggleNavbar } from '$lib/stores/navbar';

  // Reactive variables
  $: chatId = $page.params.chatId;
  let scenarioData = null, isLoadingScenario = true, messages = [];
  let playerCharacter = null, aiCharacters = [];
  let input = '', isLoading = false;
  let testMessages = [], isTesting = false, testError = '', testAbortController = null;
  let processingComplete = false, waitingForCompletion = false, aiCharacterIndex = 0;

  const GROQ_MODELS = ["llama-3.3-70b-versatile", "distil-whisper-large-v3-en", "qwen-qwq-32b", "deepseek-r1-distill-llama-70b", "mistral-saba-24b"];
  let selectedModel = GROQ_MODELS[0];
  const testModeDescription = `Upload a JSON file with an array of messages (strings or {"text": "string"} objects) to simulate a conversation.`;

  // Update characters when scenario changes
  $: if (scenarioData?.characters) {
    const chars = scenarioData.characters.map(c => ({ id: c.id || c.name, ...c }));
    playerCharacter = chars.find(c => c.isPlayer) || null;
    aiCharacters = chars.filter(c => !c.isPlayer);
  } else {
    playerCharacter = null;
    aiCharacters = [];
  }

  function formatMessageText(text) {
    if (!text) return '';
    return text
      .replace(/\(\*([^*]+)\*\)/g, '<em class="text-gray-300 italic">$1</em>')
      .replace(/\(\s*"([^"]+)"\s*\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\(\s*"([^"]*)"[^)]*\)/g, '$1')
      .replace(/\(\s*\*?"([^"]*)"[^)]*\)/g, '$1')
      .replace(/\(\s*([^)]+)\s*\)/g, '<em class="text-gray-300 italic">$1</em>')
      .replace(/\*+(?![^<]*>)/g, '')
      .replace(/"+(?![^<]*>)/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getCharacterById(characterId, characterName, messageIndex = null) {
    if (!scenarioData?.characters) return null;
    const chars = scenarioData.characters.map(c => ({ id: c.id || c.name, ...c }));
    let character = chars.find(c => c.id === characterId) || chars.find(c => c.name === characterName);
    
    if (!character && characterName === "AI" && aiCharacters.length > 0) {
      if (messageIndex !== null) {
        const aiMessagesBefore = messages.slice(0, messageIndex).filter(m => m.sender === 'bot' && m.characterName === 'AI').length;
        character = aiCharacters[aiMessagesBefore % aiCharacters.length];
      } else {
        character = aiCharacters[aiCharacterIndex % aiCharacters.length];
        aiCharacterIndex++;
      }
    }
    return character || null;
  }

  // Update handleSubmitResult to be more defensive
  function handleSubmitResult({ result }) {
  console.log('Handling submit result:', result);
  
  isLoading = false;
  processingComplete = false;
  
  let actualData;
  
  // Handle SvelteKit form response format
  if (result.type === 'success' && result.data) {
    try {
      // Parse the JSON string from SvelteKit's data field
      actualData = JSON.parse(result.data);
      console.log('Parsed actual data:', actualData);
    } catch (parseError) {
      console.error('Failed to parse result data:', parseError);
      messages = [...messages, { 
        id: 'error_' + Date.now(),
        text: 'Error: Invalid response format from server', 
        sender: 'bot', 
        characterName: 'System' 
      }];
      processingComplete = true;
      scrollToBottom();
      return;
    }
  } else {
    // Direct result (for fetch-based submissions)
    actualData = result;
  }
  
  // Now process the actual data
  if (actualData?.success && Array.isArray(actualData.replies)) {
    const newMsgs = actualData.replies.map(r => ({
      id: r.messageId || 'ai_' + Date.now() + Math.random(), 
      text: r.reply, 
      sender: 'bot',
      characterName: r.characterName, 
      characterId: r.characterId
    }));
    messages = [...messages, ...newMsgs];
    processingComplete = actualData.processingComplete || false;
  } else if (actualData?.success && actualData.reply) {
    messages = [...messages, {
      id: actualData.aiMessageId || 'ai_' + Date.now(), 
      text: actualData.reply, 
      sender: 'bot',
      characterName: actualData.characterName, 
      characterId: actualData.characterId
    }];
    processingComplete = true;
  } else if (actualData?.error || actualData?.message) {
    console.error('Server error:', actualData);
    messages = [...messages, { 
      id: 'error_' + Date.now(),
      text: actualData?.message || actualData?.error || 'Error getting AI reply', 
      sender: 'bot', 
      characterName: 'System' 
    }];
    processingComplete = true;
  } else {
    console.error('Unexpected response format:', actualData);
    messages = [...messages, { 
      id: 'error_' + Date.now(),
      text: 'Error: Unexpected response format', 
      sender: 'bot', 
      characterName: 'System' 
    }];
    processingComplete = true;
  }
  scrollToBottom();
}

  async function handleFileChange(event) {
    const file = event.target.files[0];
    if (!file) { testMessages = []; testError = ''; return; }
    if (file.type !== 'application/json') {
      testError = 'Invalid file type. Please upload a JSON file.';
      testMessages = [];
      event.target.value = null;
      return;
    }
    try {
      const fileContent = await file.text();
      const parsedMessages = JSON.parse(fileContent);
      if (!Array.isArray(parsedMessages) || !parsedMessages.every(m => typeof m === 'string' || (typeof m === 'object' && typeof m.text === 'string'))) {
        testError = 'Invalid JSON format. Expected an array of strings or objects with a "text" property.';
        testMessages = [];
      } else {
        testMessages = parsedMessages.map(m => (typeof m === 'string' ? { text: m } : m));
        testError = '';
      }
    } catch (error) {
      testError = 'Error reading or parsing JSON file: ' + error.message;
      testMessages = [];
    }
    event.target.value = null;
  }

  async function startTestMode() {
    if (!testMessages.length || isTesting || isLoading) return;
    if (!playerCharacter) {
      testError = "Player character not defined. Cannot start test mode.";
      messages = [...messages, { text: `--- Test Mode Error: Player character not found. ---`, sender: 'system', characterName: 'System' }];
      scrollToBottom();
      return;
    }

    isTesting = true;
    testError = '';
    testAbortController = new AbortController();
    messages = [...messages, { text: `--- Test Mode Started (${testMessages.length} messages, 2 per minute) ---`, sender: 'system', characterName: 'System' }];
    scrollToBottom();

    try {
      for (let i = 0; i < testMessages.length; i++) {
        if (testAbortController.signal.aborted) break;
        const messageContent = testMessages[i].text;
        if (!messageContent?.trim()) continue;

        if (i > 0) {
          const delayMs = 25000;
          messages = [...messages, { text: `--- Waiting ${delayMs/1000} seconds before next message (rate limited to 2/min) ---`, sender: 'system', characterName: 'System' }];
          scrollToBottom();
          
          const chunks = Math.ceil(delayMs / 1000);
          for (let j = 0; j < chunks; j++) {
            if (testAbortController.signal.aborted) break;
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          if (testAbortController.signal.aborted) break;
        }

        const success = await sendTestMessage(messageContent, i + 1);
        if (!success) break;
      }

      if (!testAbortController.signal.aborted) {
        messages = [...messages, { text: `--- Test Mode Completed ---`, sender: 'system', characterName: 'System' }];
        scrollToBottom();
      }
    } catch (error) {
      messages = [...messages, { text: `--- Test Mode Error: ${error.message} ---`, sender: 'system', characterName: 'System' }];
      scrollToBottom();
    } finally {
      isTesting = false;
      testAbortController = null;
    }
  }

  async function sendTestMessage(messageContent, messageNumber) {
  try {
    messages = [...messages, { text: messageContent, sender: 'user', characterName: playerCharacter?.name, characterId: playerCharacter?.id || playerCharacter?.name }];
    scrollToBottom();

    isLoading = true;
    processingComplete = false;

    const formData = new FormData();
    formData.append('message', messageContent);
    formData.append('selectedModel', selectedModel);
    if (playerCharacter) {
      formData.append('playerCharacterId', playerCharacter.id || playerCharacter.name);
      formData.append('playerCharacterName', playerCharacter.name);
    } else {
      formData.append('playerCharacterName', 'Player');
    }

    const response = await fetch(`?/sendMessage`, { method: 'POST', body: formData, signal: testAbortController?.signal });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: `Server error: ${response.status} ${response.statusText}` }));
      messages = [...messages, { text: `--- Test Mode Error (Message ${messageNumber}): ${errorData.message || 'Unknown server error'} ---`, sender: 'system', characterName: 'System' }];
      scrollToBottom();
      return false;
    }

    const result = await response.json();
    console.log('Test message server response (raw):', result);
    
    // Pass the result to handleSubmitResult which will now properly parse it
    handleSubmitResult({ result });

    waitingForCompletion = true;
    const maxWaitTime = 30000, waitStartTime = Date.now();
    while ((!processingComplete || isLoading) && !testAbortController?.signal?.aborted) {
      await new Promise(resolve => setTimeout(resolve, 100));
      if (Date.now() - waitStartTime > maxWaitTime) break;
    }
    waitingForCompletion = false;
    return !testAbortController?.signal?.aborted;
  } catch (error) {
    if (error.name === 'AbortError') return false;
    messages = [...messages, { text: `--- Test Mode Network Error (Message ${messageNumber}): ${error.message} ---`, sender: 'system', characterName: 'System' }];
    scrollToBottom();
    return false;
  } finally {
    isLoading = false;
    processingComplete = true;
    waitingForCompletion = false;
  }
}

  function stopTestMode() {
    if (!isTesting) return;
    if (testAbortController) testAbortController.abort();
    messages = [...messages, { text: `--- Test Mode Stopped ---`, sender: 'system', characterName: 'System' }];
    scrollToBottom();
    isTesting = false;
    testAbortController = null;
  }

  function scrollToBottom() {
    setTimeout(() => {
      const container = document.querySelector('.chat-container');
      if (container) container.scrollTo(0, container.scrollHeight);
    }, 50);
  }

  async function handleSubmit() {
  if (!input.trim() || isLoading) return;
  
  const userMsg = { 
    text: input, 
    sender: 'user', 
    characterName: playerCharacter?.name, 
    characterId: playerCharacter?.id,
    id: 'temp_' + Date.now()
  };
  messages = [...messages, userMsg];
  
  const messageToSend = input;
  input = '';
  isLoading = true;
  processingComplete = false;
  scrollToBottom();
  
  try {
    // Use SvelteKit's form action approach
    const formData = new FormData();
    formData.append('message', messageToSend);
    formData.append('selectedModel', selectedModel);
    if (playerCharacter) {
      formData.append('playerCharacterId', playerCharacter.id || playerCharacter.name);
      formData.append('playerCharacterName', playerCharacter.name);
    }

    const response = await fetch(`?/sendMessage`, { 
      method: 'POST', 
      body: formData 
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Server response (raw):', result);
    
    // Pass the result to handleSubmitResult which will now properly parse it
    handleSubmitResult({ result });
    
  } catch (error) {
    console.error('Submit error:', error);
    handleSubmitResult({ 
      result: { 
        success: false,
        message: 'Failed to send message. Please try again.' 
      } 
    });
  } finally {
    isLoading = false;
  }
}

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }
  export let data;
  $: ({ historyMessages = [] } = data || {});

  // Add this reactive statement to merge server data with local messages
  $: allMessages = [
    ...historyMessages,
    ...messages.filter(msg => !historyMessages.find(h => h.id === msg.id))
  ];

  let hasInitialized = false;
  onMount(async () => {
    if (hasInitialized) return;
    hasInitialized = true;
    
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
        messages = historyMessages.length ? historyMessages : [];
      } else {
        messages = [{ text: 'Scenario not found', sender: 'bot' }];
      }
    } catch (err) {
      messages = [{ text: 'Error loading scenario', sender: 'bot' }];
    } finally {
      isLoadingScenario = false;
      scrollToBottom();
    }
  });
</script>

<div class="flex flex-col h-screen bg-gray-900 text-gray-100 relative">
  <!-- Collapse button -->
  <button class="absolute top-2 right-2 z-10 p-1 text-gray-400 hover:text-white transition-colors duration-200" on:click={toggleNavbar} aria-label={$navbarCollapsed ? 'Show navigation' : 'Hide navigation'}>
    <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      {#if $navbarCollapsed}
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
      {:else}
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      {/if}
    </svg>
  </button>

  {#if isLoadingScenario && !scenarioData}
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
          <div class="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-2xl font-bold cursor-pointer hover:bg-slate-700 transition-colors overflow-hidden" title={playerCharacter.name}>
            {#if playerCharacter.avatar}
              <img src={playerCharacter.avatar} alt={playerCharacter.name} class="w-full h-full object-cover object-center" />
            {:else}
              {playerCharacter.name?.charAt(0) || '🧑'}
            {/if}
          </div>
        {/if}
        {#if playerCharacter && aiCharacters.length > 0}<div class="w-3"></div>{/if}
        {#if aiCharacters.length > 0}
          <div class="flex -space-x-3 items-center">
            {#each aiCharacters as char (char.name)}
              <div class="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center text-xl font-semibold shadow-md overflow-hidden" title={char.name}>
                {#if char.avatar}
                  <img src={char.avatar} alt={char.name} class="w-full h-full object-cover object-center" />
                {:else}
                  {char.name?.charAt(0) || '🤖'}
                {/if}
              </div>
            {/each}
          </div>
        {/if}
        {#if !playerCharacter && aiCharacters.length === 0}
          <div class="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center text-2xl font-bold">{'❓'}</div>
        {/if}
      </div>

      <!-- Title and Description -->
      <div class="flex-1 min-w-0">
        <h1 class="text-xl font-bold truncate">{scenarioData.title || 'Chat'}</h1>
        <p class="text-sm text-gray-400 truncate">{scenarioData.description || (scenarioData.title ? `Talking about ${scenarioData.title}` : 'Ready to chat.')}</p>
      </div>

      <!-- Back to Chats link -->
      <div class="ml-auto pl-3 flex-shrink-0">
        <a href="/chats" class="text-gray-400 hover:text-white px-3 py-1 text-sm font-medium">← Back to Chats</a>
      </div>
    </div>
    
    <!-- Chat messages -->
    <div class="flex-1 overflow-y-auto chat-container p-4 space-y-4 mt-2">
      {#each allMessages as message, index}
        <div class={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} items-start space-x-3`}>
          {#if message.sender === 'bot'}
            {@const character = getCharacterById(message.characterId, message.characterName, index)}
            <div class="flex-shrink-0">
              <div class="w-14 h-14 rounded-full bg-gray-600 flex items-center justify-center text-sm font-semibold overflow-hidden" title={character?.name || message.characterName}> 
                {#if character?.avatar}
                  <img src={character.avatar} alt={character.name} class="w-full h-full object-cover object-center" />
                {:else}
                  {character?.name?.charAt(0) || message.characterName?.charAt(0) || '🤖'}
                {/if}
              </div>
            </div>
          {/if}

          <div class="flex flex-col max-w-3/4">
            {#if message.sender === 'bot'}
              {@const character = getCharacterById(message.characterId, message.characterName, index)}
              <div class="text-sm text-gray-300 mb-1 font-medium">{character?.name || message.characterName}</div>
            {/if}
            <div class={`rounded-lg p-4 ${message.sender === 'user' ? 'bg-slate-600 text-white rounded-br-none' : 'bg-gray-800 text-gray-100 rounded-bl-none'}`}> 
              {@html formatMessageText(message.text)}
            </div>
          </div>

          {#if message.sender === 'user'}
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center text-sm font-semibold overflow-hidden" title={playerCharacter?.name || message.characterName}>
                {#if playerCharacter?.avatar}
                  <img src={playerCharacter.avatar} alt={playerCharacter.name} class="w-full h-full object-cover object-center" />
                {:else}
                  {playerCharacter?.name?.charAt(0) || message.characterName?.charAt(0) || '🧑'}
                {/if}
              </div>
            </div>
          {/if}
        </div>
      {/each}
      
      {#if isLoading}
        <div class="flex justify-start items-start space-x-3">
          <div class="flex-shrink-0">
            <div class="w-14 h-14 rounded-full bg-gray-600 flex items-center justify-center text-sm">🤖</div>
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
    
    <!-- Advanced Options -->
    <div class="px-4 pt-2 pb-1">
      <details class="border border-base-300 bg-base-200">
        <summary class="text-sm font-medium text-indigo-400 hover:text-indigo-300">Advanced Options</summary>
        <div class="mt-4 p-4 border border-gray-700 rounded-lg bg-gray-800">
          <div class="flex justify-between items-center mb-2">
            <h3 class="text-lg font-semibold text-yellow-400">Test Mode</h3>
            {#if isTesting}
              <button on:click={stopTestMode} class="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded">Stop Test</button>
            {:else}
              <button on:click={startTestMode} disabled={!testMessages.length || isLoading} class="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded disabled:opacity-50 disabled:cursor-not-allowed">Start Test</button>
            {/if}
          </div>
          
          <div class="mb-3">
            <label class="block text-sm font-medium text-gray-300 mb-1">Upload Test Messages (JSON)</label>
            <input type="file" accept=".json" on:change={handleFileChange} class="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" disabled={isTesting} />
            <p class="mt-1 text-xs text-gray-400">{testMessages.length ? `Loaded ${testMessages.length} test message${testMessages.length !== 1 ? 's' : ''}` : testError || 'No test messages loaded'}</p>
          </div>
          
          {#if isTesting}
            <div class="mt-2 text-xs flex items-center space-x-4">
              <div class="flex items-center text-yellow-400">
                <div class="w-2 h-2 bg-yellow-400 rounded-full animate-pulse mr-2"></div>Test mode running...
              </div>
              {#if waitingForCompletion}
                <div class="flex items-center text-blue-400">
                  <div class="w-2 h-2 bg-blue-400 rounded-full animate-bounce mr-2"></div>Waiting for processing to complete...
                </div>
              {/if}
              {#if isLoading}
                <div class="flex items-center text-orange-400">
                  <div class="w-2 h-2 bg-orange-400 rounded-full animate-spin mr-2"></div>Generating response...
                </div>
              {/if}
              {#if !isLoading && !waitingForCompletion && processingComplete}
                <div class="flex items-center text-green-400">
                  <div class="w-2 h-2 bg-green-400 rounded-full mr-2"></div>Ready for next message
                </div>
              {/if}
            </div>
          {/if}
          
          <p class="mt-2 text-xs text-gray-400">{testModeDescription}</p>
        </div>
      </details>
    </div>
    
    <!-- Model selection and Message input -->
    <div class="border-t border-gray-700 bg-gray-800 p-4">
      <div class="flex flex-col sm:flex-row sm:items-center sm:space-x-2 space-y-2 sm:space-y-0">
        <select bind:value={selectedModel} class="bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" aria-label="Select Groq Model">
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
          {isLoading ? 'Sending...' : 'Send'}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .chat-container::-webkit-scrollbar { width: 6px; }
  .chat-container::-webkit-scrollbar-track { background: transparent; }
  .chat-container::-webkit-scrollbar-thumb { background: #4B5563; border-radius: 3px; }
  .chat-container::-webkit-scrollbar-thumb:hover { background: #6B7280; }
  @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
  .animate-bounce { animation: bounce 1s infinite; }
</style>