<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { db } from '$lib/firebase';
  import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
  
  let scenarioId = '';
  let scenario = {
    title: '',
    description: '',
    characters: [],
    scenes: [],
    // No createdAt here, it's set on creation and not edited
    // We will add/update an updatedAt timestamp
  };

  let originalCharacterAvatars = {}; // To store original avatar URLs

  let isLoading = true;
  let isSubmitting = false;
  let errorMessage = '';
  let successMessage = '';

  // AI Scenario Generation State
  let plotIdea = ''; 
  let isGeneratingAIScenario = false;
  let aiGenerationError = '';
  let aiTaskMode = 'improve'; // 'generate' or 'improve', default to 'improve' for edit page
  let improvementInstructions = '';

  // History for Undo/Redo
  let history = [];
  let historyIndex = -1;

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function saveState() {
    if (isLoading) return; // Don't save during initial load or if load failed
    // If we've undone, and then make a new change, clear the "future" history
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    history.push(deepCopy(scenario));
    historyIndex = history.length - 1;
    history = [...history]; // Trigger reactivity
    console.log('[EDIT PAGE] State saved. History length:', history.length, 'Index:', historyIndex, 'Current Scenario Title:', scenario.title);
    console.log('[EDIT PAGE] Saved state:', JSON.parse(JSON.stringify(history[historyIndex])));
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      scenario = deepCopy(history[historyIndex]);
      console.log('[EDIT PAGE] Undo. History index:', historyIndex, 'Restored Scenario Title:', scenario.title);
      console.log('[EDIT PAGE] Restored state:', JSON.parse(JSON.stringify(scenario)));
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      scenario = deepCopy(history[historyIndex]);
      console.log('[EDIT PAGE] Redo. History index:', historyIndex, 'Restored Scenario Title:', scenario.title);
      console.log('[EDIT PAGE] Restored state:', JSON.parse(JSON.stringify(scenario)));
    }
  }

  onMount(async () => {
    console.log('Edit page onMount, $page.params:', $page.params);
    scenarioId = $page.params.scenarioId;
    console.log('Scenario ID from params:', scenarioId);
    if (scenarioId) {
      await loadScenarioData(scenarioId);
    } else {
      console.error('No scenarioId found in params.');
      errorMessage = 'Scenario ID not found in URL. Cannot load data.';
      isLoading = false; // Ensure loading state is updated
    }
  });

  async function loadScenarioData(id) {
    console.log('loadScenarioData called with ID:', id);
    isLoading = true;
    errorMessage = '';
    try {
      console.log('Attempting to get doc reference for scenarios/', id);
      const scenarioRef = doc(db, 'scenarios', id);
      console.log('Doc reference obtained. Calling getDoc...');
      const scenarioSnap = await getDoc(scenarioRef);
      console.log('getDoc call completed.');

      if (scenarioSnap.exists()) {
        console.log('Scenario snapshot exists. Data:', scenarioSnap.data());
        const data = scenarioSnap.data();
        scenario = {
          title: data.title || '',
          description: data.description || '',
          characters: (data.characters || []).map(char => ({
            ...char,
            avatarFile: null, // Reset file input
            avatarPreview: char.avatar || '', // Show current avatar
            personalityTraits: Array.isArray(char.personalityTraits) ? char.personalityTraits : ['', '', ''],
            physicalAttributes: Array.isArray(char.physicalAttributes) ? char.physicalAttributes : ['', '', ''],
          })),
          scenes: data.scenes || [{ name: '', description: '' }],
        };
        // Store original avatars to check if they changed
        console.log('Mapped scenario data before storing original avatars:', JSON.parse(JSON.stringify(scenario)));
        originalCharacterAvatars = {}; // Initialize before populating
        scenario.characters.forEach((char, index) => {
          originalCharacterAvatars[index] = char.avatar;
        });
        // Successfully loaded, now save initial state for undo/redo
        // Ensure isLoading is false before saving to avoid premature saveState calls if loadScenarioData is complex
        // The 'finally' block sets isLoading = false, so we defer saveState until after that, or check isLoading here.
        // For simplicity, we'll ensure saveState is called after isLoading is confirmed false.
      } else {
        console.log('Scenario snapshot does NOT exist for ID:', id);
        errorMessage = 'Scenario not found.';
        // Optionally, redirect: goto('/');
      }
    } catch (error) {
      console.error('Error in loadScenarioData:', error);
      errorMessage = 'Failed to load scenario data. ' + error.message;
    } finally {
      console.log('loadScenarioData finally block. Setting isLoading to false.');
      isLoading = false;
      if (!errorMessage && scenario.title) { // Only save initial state if loading was successful
        saveState();
      }
    }
  }
  
  function addCharacter() {
    scenario.characters = [
      ...scenario.characters,
      {
        name: 'New AI Character',
        avatar: '',
        avatarFile: null,
        avatarPreview: '',
        personalityTraits: ['', '', ''],
        physicalAttributes: ['', '', ''],
        backstory: '',
        isPlayer: false,
        gender: 'female'
      }
    ];
  }
  
  function removeCharacter(index) {
    scenario.characters = scenario.characters.filter((_, i) => i !== index);
    // Adjust originalCharacterAvatars mapping if needed, though direct mutation might be complex here
    // For simplicity, avatar re-upload might be required if characters are reordered and one is removed.
  }
  
  function addScene() {
    scenario.scenes = [
      ...scenario.scenes, 
      { name: '', description: '' }
    ];
  }
  
  function removeScene(index) {
    scenario.scenes = scenario.scenes.filter((_, i) => i !== index);
  }
  
  function addPersonalityTrait(characterIndex) {
    scenario.characters[characterIndex].personalityTraits = [
      ...scenario.characters[characterIndex].personalityTraits, 
      ''
    ];
  }
  
  function removePersonalityTrait(characterIndex, traitIndex) {
    scenario.characters[characterIndex].personalityTraits = 
      scenario.characters[characterIndex].personalityTraits.filter((_, i) => i !== traitIndex);
  }
  
  function addPhysicalAttribute(characterIndex) {
    scenario.characters[characterIndex].physicalAttributes = [
      ...scenario.characters[characterIndex].physicalAttributes, 
      ''
    ];
  }
  
  function removePhysicalAttribute(characterIndex, attrIndex) {
    scenario.characters[characterIndex].physicalAttributes = 
      scenario.characters[characterIndex].physicalAttributes.filter((_, i) => i !== attrIndex);
  }
  
  function handleFileUpload(event, characterIndex) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image.*')) {
      errorMessage = 'Please select an image file';
      return;
    }
    
    scenario.characters[characterIndex].avatarFile = file;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      scenario.characters[characterIndex].avatarPreview = e.target.result;
      scenario.characters = [...scenario.characters];
    };
    reader.readAsDataURL(file);
  }
  
  async function uploadToUploadThing(file) {
    try {
      const formData = new FormData();
      formData.append('files', file);
      
      const response = await fetch('/api/uploadthing', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      return data[0].url;
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error('Failed to upload image: ' + error.message);
    }
  }

  async function handleAIAssistance() {
    if (aiTaskMode === 'generate' && !plotIdea.trim()) {
      aiGenerationError = 'Please enter a plot idea to generate a new scenario (this will replace current content).';
      return;
    }
    // For 'improve' mode, the scenario itself is the basis, instructions are optional.
    isGeneratingAIScenario = true;
    aiGenerationError = '';
    successMessage = '';
    errorMessage = '';

    try {
      let requestBody = {};
      if (aiTaskMode === 'generate') {
        requestBody = { plotIdea, taskType: 'generate' };
      } else { // improve
        const scenarioToImprove = JSON.parse(JSON.stringify(scenario));
        scenarioToImprove.characters = scenarioToImprove.characters.map(char => {
          const { avatarFile, avatarPreview, ...rest } = char;
          return rest; 
        });
        delete scenarioToImprove.id; // API doesn't need existing ID for improvement logic
        
        requestBody = { 
          existingScenario: scenarioToImprove, 
          taskType: 'improve', 
          improvementInstructions: improvementInstructions.trim() 
        };
      }

      const response = await fetch('/api/groqScenarioGenerator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to generate scenario. Server returned an error.' }));
        throw new Error(errorData.error || `HTTP error! Status: ${response.status}`);
      }

      const generatedData = await response.json();
      scenario.title = generatedData.title || scenario.title;
      scenario.description = generatedData.description || scenario.description;
      
      if (Array.isArray(generatedData.characters) && generatedData.characters.length > 0) {
        scenario.characters = generatedData.characters.map((char, index) => ({
          name: char.name || 'AI Character',
          avatar: originalCharacterAvatars[index] || '', // Preserve original avatar unless new one is uploaded
          avatarFile: null,
          avatarPreview: originalCharacterAvatars[index] || '',
          gender: char.gender || 'female',
          isPlayer: typeof char.isPlayer === 'boolean' ? char.isPlayer : false,
          personalityTraits: Array.isArray(char.personalityTraits) ? char.personalityTraits.slice(0, 3) : ['', '', ''],
          physicalAttributes: Array.isArray(char.physicalAttributes) ? char.physicalAttributes.slice(0, 3) : ['', '', ''],
          backstory: char.backstory || '',
        }));
      } 

      if (Array.isArray(generatedData.scenes) && generatedData.scenes.length > 0) {
        scenario.scenes = generatedData.scenes.map(scene => ({
          name: scene.name || 'New Scene',
          description: scene.description || '',
        }));
      }
      successMessage = 'Scenario fields updated by AI! Review and save changes.';
      console.log('[EDIT PAGE] AI Assistance success, about to save state.');
      saveState(); // Save the new state after AI assistance
    } catch (err) {
      console.error('[EDIT PAGE] AI Assistance Error in handleAIAssistance:', err);
      aiGenerationError = err.message || 'Failed to get AI assistance.';
    } finally {
      isGeneratingAIScenario = false;
    }
  }
  
  async function handleSubmit() {
    if (!scenario.title.trim()) {
      errorMessage = 'Please enter a scenario title';
      return;
    }
    if (scenario.characters.length === 0) {
      errorMessage = 'Please add at least one character';
      return;
    }
    for (const character of scenario.characters) {
      if (!character.name.trim()) {
        errorMessage = 'All characters must have a name';
        return;
      }
      if (!character.avatar && !character.avatarFile) { // Check existing avatar URL or new file
        errorMessage = `Character ${character.name} must have an avatar.`;
        return;
      }
    }

    isSubmitting = true;
    errorMessage = '';
    successMessage = '';

    try {
      const charactersData = [];
      for (let i = 0; i < scenario.characters.length; i++) {
        let char = scenario.characters[i];
        let avatarUrl = char.avatar; // Keep existing avatar by default

        if (char.avatarFile) { // If a new file is selected, upload it
          avatarUrl = await uploadToUploadThing(char.avatarFile);
        }
        
        charactersData.push({
          name: char.name,
          avatar: avatarUrl,
          personalityTraits: char.personalityTraits.filter(trait => trait.trim()),
          physicalAttributes: char.physicalAttributes.filter(attr => attr.trim()),
          backstory: char.backstory,
          isPlayer: char.isPlayer,
          gender: char.gender
        });
      }
      
      const scenarioDataToUpdate = {
        title: scenario.title,
        description: scenario.description,
        characters: charactersData,
        scenes: scenario.scenes.map(scene => ({ 
          name: scene.name.trim(), 
          description: scene.description.trim() 
        })).filter(scene => scene.name || scene.description),
        updatedAt: serverTimestamp()
      };

      const scenarioRef = doc(db, 'scenarios', scenarioId);
      await updateDoc(scenarioRef, scenarioDataToUpdate);
      
      successMessage = 'Scenario updated successfully!';
      // Optionally, clear avatarFile and avatarPreview for next edit or reset form
      scenario.characters.forEach(char => {
          char.avatarFile = null;
          // char.avatarPreview = char.avatar; // Keep preview as the saved avatar
      });
      originalCharacterAvatars = {}; // Reset after successful save
      scenario.characters.forEach((char, index) => {
          originalCharacterAvatars[index] = char.avatar;
      });

      setTimeout(() => {
        goto('/'); // Navigate back to homepage or scenario list
      }, 1500);

    } catch (error) {
      console.error('Error updating scenario:', error);
      errorMessage = 'Failed to update scenario. ' + error.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-900 text-gray-100 pb-12">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">Edit Scenario</h1>
      {#if scenario.title}<p class="text-gray-400 mt-1">Editing: {scenario.title}</p>{/if}
    </div>

    {#if isLoading}
      <div class="p-8 text-center text-white">
        <p>Loading scenario data...</p>
        <!-- Basic spinner -->
        <svg class="animate-spin h-8 w-8 text-white mx-auto mt-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    {:else if errorMessage && !scenario.title} <!-- Show only if initial load failed catastrophically -->
      <div class="bg-red-900 text-white p-4 rounded-md">
        <p>{errorMessage}</p>
        <a href="/" class="text-indigo-300 hover:text-indigo-200 mt-2 inline-block">Go to Homepage</a>
      </div>
    {:else}
      <!-- Undo/Redo Buttons -->
      <div class="my-6 flex items-center justify-start space-x-3 p-4 bg-gray-800 rounded-lg border border-gray-700">
        <h3 class="text-lg font-medium text-gray-200 mr-4">AI Edit History:</h3>
        <button 
          type="button" 
          on:click={undo} 
          disabled={historyIndex <= 0}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" /></svg>
          Undo
        </button>
        <button 
          type="button" 
          on:click={redo} 
          disabled={historyIndex >= history.length - 1 || history.length === 0}
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150"
        >
          Redo
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 inline ml-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
        </button>
        <span class="text-sm text-gray-400">({historyIndex >=0 ? historyIndex + 1 : 0} / {history.length} states)</span>
      </div>

      <!-- AI Powered Scenario Assistance -->
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
        <h2 class="text-xl font-semibold mb-4">AI Powered Scenario Assistance</h2>

        <div class="mb-4">
          <span class="block text-sm font-medium text-gray-300 mb-2">AI Task:</span>
          <div class="flex items-center space-x-4">
            <label class="flex items-center space-x-2 cursor-pointer">
              <input type="radio" bind:group={aiTaskMode} name="aiTaskModeEdit" value="improve" class="form-radio text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
              <span class="text-gray-300">Improve Current Scenario</span>
            </label>
            <label class="flex items-center space-x-2 cursor-pointer">
              <input type="radio" bind:group={aiTaskMode} name="aiTaskModeEdit" value="generate" class="form-radio text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
              <span class="text-gray-300">Generate New (Replaces Current)</span>
            </label>
          </div>
        </div>

        {#if aiTaskMode === 'generate'}
          <p class="text-gray-400 mb-4">
            Enter a plot idea to generate a completely new scenario. <strong>Warning: This will replace all current scenario content.</strong>
          </p>
          <div class="mb-4">
            <label for="plot-idea-edit" class="block text-sm font-medium text-gray-300 mb-2">Your Plot Idea</label>
            <textarea 
              id="plot-idea-edit" 
              bind:value={plotIdea} 
              rows="3"
              class="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., A fantasy quest to find a lost artifact."
            ></textarea>
          </div>
        {/if}

        {#if aiTaskMode === 'improve'}
          <p class="text-gray-400 mb-4">
            Provide specific instructions to enhance the current scenario, or let the AI generally improve it.
          </p>
          <div class="mb-4">
            <label for="improvement-instructions-edit" class="block text-sm font-medium text-gray-300 mb-2">Improvement Instructions (Optional)</label>
            <textarea 
              id="improvement-instructions-edit" 
              bind:value={improvementInstructions} 
              rows="3"
              class="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="e.g., Make the villain more compelling, add a plot twist to the first scene..."
            ></textarea>
          </div>
        {/if}

        <button 
          type="button" 
          on:click={handleAIAssistance} 
          disabled={isGeneratingAIScenario}
          class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md disabled:opacity-50 transition duration-150 ease-in-out"
        >
          {#if isGeneratingAIScenario}
            Processing...
          {:else if aiTaskMode === 'generate'}
            Generate with AI (Replace Current)
          {:else}
            Improve with AI
          {/if}
        </button>

        {#if aiGenerationError}
          <p class="text-red-400 mt-4">{aiGenerationError}</p>
        {/if}
      </div>

      <form on:submit|preventDefault={handleSubmit} class="space-y-8">
        <!-- Basic Scenario Information -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <h2 class="text-xl font-semibold mb-4">Scenario Details</h2>
          
          <div class="mb-4">
            <label for="title" class="block text-sm font-medium text-gray-300 mb-2">Scenario Title</label>
            <input type="text" id="title" bind:value={scenario.title} required class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white">
          </div>
          
          <div class="mb-4">
            <label for="description" class="block text-sm font-medium text-gray-300 mb-2">Scenario Description</label>
            <textarea id="description" bind:value={scenario.description} rows="4" class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white"></textarea>
          </div>
        </div>

        <!-- Characters -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">Characters ({scenario.characters.length})</h2>
            <button 
              type="button" 
              on:click={addCharacter} 
              class="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-800"
            >
              Add Character
            </button>
          </div>
          <div class="space-y-8">
            {#each scenario.characters as character, characterIndex (characterIndex)} <!-- Consider more robust key if names can change and be non-unique temporarily -->
              <div class="p-4 border border-gray-600 rounded-lg">
                <div class="flex justify-between items-center mb-4">
                  <h3 class="text-lg font-medium">Character {characterIndex + 1}</h3>
                  {#if scenario.characters.length > 0}
                    <button 
                      type="button" 
                      on:click={() => removeCharacter(characterIndex)} 
                      class="text-sm text-red-400 hover:text-red-300"
                    >
                      Remove Character
                    </button>
                  {/if}
                </div>
                
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label for={`charName-${characterIndex}`} class="block text-sm font-medium text-gray-300 mb-2">Name</label>
                    <input type="text" id={`charName-${characterIndex}`} bind:value={character.name} required class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white">
                  </div>
                  
                  <div>
                    <label for={`charRole-${characterIndex}`} class="block text-sm font-medium text-gray-300 mb-2">Role</label>
                    <select id={`charRole-${characterIndex}`} bind:value={character.isPlayer} class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white">
                      <option value={true}>Player</option>
                      <option value={false}>AI</option>
                    </select>
                  </div>
                </div>

                <div class="mt-4">
                  <label class="block text-sm font-medium text-gray-300 mb-2">Gender</label>
                  <div class="flex items-center space-x-4">
                    <label class="inline-flex items-center">
                      <input type="radio" bind:group={character.gender} value="male" class="form-radio h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
                      <span class="ml-2 text-gray-300">Male</span>
                    </label>
                    <label class="inline-flex items-center">
                      <input type="radio" bind:group={character.gender} value="female" class="form-radio h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
                      <span class="ml-2 text-gray-300">Female</span>
                    </label>
                    <label class="inline-flex items-center">
                      <input type="radio" bind:group={character.gender} value="other" class="form-radio h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
                      <span class="ml-2 text-gray-300">Other</span>
                    </label>
                  </div>
                </div>
                
                <div class="mt-4">
                  <label class="block text-sm font-medium text-gray-300 mb-2">Character Avatar</label>
                  <input 
                    type="file" 
                    accept="image/*" 
                    on:change={(e) => handleFileUpload(e, characterIndex)} 
                    class="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700 cursor-pointer"
                  >
                  {#if character.avatarPreview}
                    <div class="mt-2">
                      <img src={character.avatarPreview} alt="Avatar preview" class="w-24 h-24 rounded-md object-cover border border-gray-600">
                    </div>
                  {/if}
                </div>

                <div class="mt-4">
                  <div class="flex justify-between items-center mb-2">
                    <label class="block text-sm font-medium text-gray-300">Personality Traits ({character.personalityTraits.length})</label>
                    <button type="button" on:click={() => addPersonalityTrait(characterIndex)} class="text-xs text-indigo-400 hover:text-indigo-300">+ Add Trait</button>
                  </div>
                  {#each character.personalityTraits as trait, traitIndex}
                    <div class="flex items-center mb-2">
                      <input type="text" bind:value={character.personalityTraits[traitIndex]} placeholder={`Trait ${traitIndex + 1}`} class="flex-grow bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white">
                      <button type="button" on:click={() => removePersonalityTrait(characterIndex, traitIndex)} class="ml-2 text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  {/each}
                </div>

                <div class="mt-4">
                  <div class="flex justify-between items-center mb-2">
                    <label class="block text-sm font-medium text-gray-300">Physical Attributes ({character.physicalAttributes.length})</label>
                    <button type="button" on:click={() => addPhysicalAttribute(characterIndex)} class="text-xs text-indigo-400 hover:text-indigo-300">+ Add Attribute</button>
                  </div>
                  {#each character.physicalAttributes as attr, attrIndex}
                    <div class="flex items-center mb-2">
                      <input type="text" bind:value={character.physicalAttributes[attrIndex]} placeholder={`Attribute ${attrIndex + 1}`} class="flex-grow bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white">
                      <button type="button" on:click={() => removePhysicalAttribute(characterIndex, attrIndex)} class="ml-2 text-xs text-red-400 hover:text-red-300">Remove</button>
                    </div>
                  {/each}
                </div>

                <div class="mt-4">
                  <label for={`charBackstory-${characterIndex}`} class="block text-sm font-medium text-gray-300 mb-2">Backstory</label>
                  <textarea id={`charBackstory-${characterIndex}`} bind:value={character.backstory} rows="3" class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white"></textarea>

                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Scenes -->
        <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
          <div class="flex justify-between items-center mb-4">
            <h2 class="text-xl font-semibold">Scenes ({scenario.scenes.length})</h2>
            <button 
              type="button" 
              on:click={addScene} 
              class="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 focus:ring-offset-gray-800"
            >
              Add Scene
            </button>
          </div>
          <div class="space-y-6">
            {#each scenario.scenes as scene, sceneIndex}
              <div class="p-4 border border-gray-600 rounded-lg">
                <div class="flex justify-between items-center mb-2">
                  <h3 class="text-lg font-medium">Scene {sceneIndex + 1}</h3>
                  {#if scenario.scenes.length > 0}
                    <button 
                      type="button" 
                      on:click={() => removeScene(sceneIndex)} 
                      class="text-sm text-red-400 hover:text-red-300"
                    >
                      Remove Scene
                    </button>
                  {/if}
                </div>
                <div class="mb-4">
                  <label for={`sceneName-${sceneIndex}`} class="block text-sm font-medium text-gray-300 mb-2">Scene Name</label>
                  <input type="text" id={`sceneName-${sceneIndex}`} bind:value={scene.name} class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white">
                </div>
                <div>
                  <label for={`sceneDesc-${sceneIndex}`} class="block text-sm font-medium text-gray-300 mb-2">Scene Description</label>
                  <textarea id={`sceneDesc-${sceneIndex}`} bind:value={scene.description} rows="3" class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white"></textarea>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Error/Success messages -->
        {#if errorMessage && scenario.title} <!-- Only show submit related errors if form is loaded -->
          <div class="bg-red-900 text-white p-4 rounded-md">
            <p>{errorMessage}</p>
          </div>
        {/if}
        {#if successMessage}
          <div class="bg-green-700 text-white p-4 rounded-md">
            <p>{successMessage}</p>
          </div>
        {/if}

        <!-- Submit Button -->
        <div class="pt-2">
          <button 
            type="submit" 
            disabled={isSubmitting || isLoading}
            class="w-full flex justify-center items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:bg-gray-500 disabled:cursor-not-allowed focus:ring-offset-gray-800"
          >
            {#if isSubmitting}
              <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving Changes...
            {:else}
              Save Changes
            {/if}
          </button>
        </div>
      </form>
    {/if} <!-- End of main content block after loading -->
  </div>
</div>
