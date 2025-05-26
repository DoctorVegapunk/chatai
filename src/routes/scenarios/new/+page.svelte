<script>
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { db } from '$lib/firebase';
  import { collection, addDoc, serverTimestamp, getDocs } from 'firebase/firestore';
  
  // Character and scenario data

  // Define the initial state for a new scenario
  const initialScenarioState = {
    title: '',
    description: '',
    characters: [
      {
        name: 'Player',
        avatar: '',
        avatarFile: null,
        avatarPreview: '',
        personalityTraits: ['', '', ''],
        physicalAttributes: ['', '', ''],
        backstory: '',
        isPlayer: true,
        gender: 'male'
      },
      {
        name: 'AI Character',
        avatar: '',
        avatarFile: null,
        avatarPreview: '',
        personalityTraits: ['', '', ''],
        physicalAttributes: ['', '', ''],
        backstory: '',
        isPlayer: false,
        gender: 'female'
      }
    ],
    scenes: [
      {
        name: '',
        description: ''
      }
    ],
    createdAt: null // Will be set by serverTimestamp on save
  };

  let scenario = JSON.parse(JSON.stringify(initialScenarioState)); // Initialize scenario with a deep copy

  // History for Undo/Redo
  let history = [];
  let historyIndex = -1;

  // For AI Change Summary
  let lastAiChange = { before: null, after: null };
  let showChangeSummary = false;

  function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function saveState() {
    // If we've undone, and then make a new change, clear the "future" history
    if (historyIndex < history.length - 1) {
      history = history.slice(0, historyIndex + 1);
    }
    history.push(deepCopy(scenario));
    historyIndex = history.length - 1;
    history = [...history]; 
    console.log('[NEW PAGE] State saved. History length:', history.length, 'Index:', historyIndex, 'Current Scenario Title:', scenario.title);
  }

  function undo() {
    if (historyIndex > 0) {
      historyIndex--;
      scenario = deepCopy(history[historyIndex]);
      console.log('[NEW PAGE] Undo. History index:', historyIndex, 'Restored Scenario Title:', scenario.title);
    }
  }

  function redo() {
    if (historyIndex < history.length - 1) {
      historyIndex++;
      scenario = deepCopy(history[historyIndex]);
      console.log('[NEW PAGE] Redo. History index:', historyIndex, 'Restored Scenario Title:', scenario.title);
    }
  }

  let existingScenarios = [];
  let selectedScenarioId = ''; // To bind with the select dropdown
  
  let isSubmitting = false;
  let errorMessage = '';
  let successMessage = '';

  onMount(async () => {
    saveState(); // Save the initial blank/default state of 'scenario'
    try {
      const scenariosCollection = collection(db, 'scenarios');
      const querySnapshot = await getDocs(scenariosCollection);
      existingScenarios = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort scenarios by title for easier selection
      existingScenarios.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      existingScenarios = [...existingScenarios]; // Trigger reactivity 
    } catch (error) {
      console.error("Error fetching existing scenarios:", error);
      errorMessage = "Could not load existing scenarios. Please try refreshing the page.";
    }
  });

  function handleScenarioSelection() {
    if (!selectedScenarioId) {
      scenario = deepCopy(initialScenarioState);
      plotIdea = ''; 
      aiTaskMode = 'generate'; 
      improvementInstructions = '';
    } else {
      const selected = existingScenarios.find(s => s.id === selectedScenarioId);
      if (selected) {
        let tempScenario = deepCopy(selected);
        delete tempScenario.id; 
        delete tempScenario.createdAt; // Will be set on new save
        tempScenario.updatedAt = null; // Clear updatedAt if it exists from template

        tempScenario.characters = (tempScenario.characters || []).map(char => ({
          ...initialScenarioState.characters[0], // Base structure from initial state
          ...char,
          avatarFile: null, 
          avatarPreview: char.avatar || '', 
        }));
        
        if (!tempScenario.scenes || tempScenario.scenes.length === 0) {
          tempScenario.scenes = [{ name: '', description: '' }];
        } else {
          tempScenario.scenes = tempScenario.scenes.map(scene => ({
              name: scene.name || '',
              description: scene.description || ''
          }));
        }
        scenario = tempScenario;
        plotIdea = ''; 
        aiTaskMode = 'generate'; 
        improvementInstructions = ''; 
      } else {
        // Fallback if selectedId is somehow invalid, reset to initial
        scenario = deepCopy(initialScenarioState);
        plotIdea = '';
        aiTaskMode = 'generate';
        improvementInstructions = ''; // Clear instructions
        console.log('[NEW PAGE] AI Assistance success, about to save state.');
        saveState(); // Save the new state after AI assistance scenario has been updated by selection or reset
      }
    }
    saveState(); // Save state after scenario has been updated by selection or reset
  }

  // AI Scenario Generation State
  let plotIdea = '';
  let isGeneratingAIScenario = false;
  let aiGenerationError = '';
  let aiTaskMode = 'generate'; // 'generate' or 'improve'
  let improvementInstructions = '';
  
  // Avatar options (defaultAvatars array removed)
  
  // Writing style options (writingStyles array removed)
  
  function addCharacter() {
    scenario.characters = [
      ...scenario.characters,
      {
        name: 'New AI Character', // Default name for newly added
        avatar: '',
        avatarFile: null,
        avatarPreview: '',
        personalityTraits: ['', '', ''],
        physicalAttributes: ['', '', ''],
        backstory: '',
        isPlayer: false, // Default to AI
        gender: 'female' // Default gender
      }
    ];
  }
  
  function removeCharacter(index) {
    scenario.characters = scenario.characters.filter((_, i) => i !== index);
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
  
  // handleAvatarSelect function removed as default emoji avatars are removed.
  
  function handleFileUpload(event, characterIndex) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!file.type.match('image.*')) {
      errorMessage = 'Please select an image file';
      return;
    }
    
    scenario.characters[characterIndex].avatarFile = file;
    
    // Create a preview
    const reader = new FileReader();
    reader.onload = (e) => {
      scenario.characters[characterIndex].avatarPreview = e.target.result;
      scenario.characters = [...scenario.characters]; // Trigger reactivity
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
        throw new Error('Upload failed');
      }
      
      const data = await response.json();
      return data[0].url; // UploadThing returns an array of uploaded files
    } catch (error) {
      console.error('Upload error:', error);
      throw new Error('Failed to upload image');
    }
  }
  
  async function handleAIAssistance() {
    const scenarioSnapshotBeforeAI = deepCopy(scenario);
    if (aiTaskMode === 'generate' && !plotIdea.trim()) {
      aiGenerationError = 'Please enter a plot idea to generate a new scenario.';
      return;
    }
    if (aiTaskMode === 'improve' && !scenario.title.trim() && !scenario.description.trim()) {
      aiGenerationError = 'Please fill in some scenario details (like title or description) or load an existing one to use the AI improvement feature.';
      return;
    }
    isGeneratingAIScenario = true;
    aiGenerationError = '';
    successMessage = ''; // Clear other messages
    errorMessage = '';

    try {
      let requestBody = {};
      if (aiTaskMode === 'generate') {
        requestBody = { plotIdea, taskType: 'generate' };
      } else { // improve
        // Create a clean version of the scenario, removing client-side only properties
        const scenarioToImprove = JSON.parse(JSON.stringify(scenario));
        scenarioToImprove.characters = scenarioToImprove.characters.map(char => {
          const { avatarFile, avatarPreview, ...rest } = char;
          return rest; // Keep avatar URL if present, but not file/preview
        });
        delete scenarioToImprove.id; // Ensure no ID is sent if it's a template
        
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

      // Update scenario object with AI generated data
      // Ensure a robust mapping, especially for arrays and nested objects
      scenario.title = generatedData.title || '';
      scenario.description = generatedData.description || '';
      
      if (Array.isArray(generatedData.characters) && generatedData.characters.length > 0) {
        scenario.characters = generatedData.characters.map(char => ({
          name: char.name || 'AI Character',
          avatar: '', // Avatar will be handled manually
          avatarFile: null,
          avatarPreview: '',
          gender: char.gender || 'female',
          isPlayer: typeof char.isPlayer === 'boolean' ? char.isPlayer : false,
          personalityTraits: Array.isArray(char.personalityTraits) ? char.personalityTraits.slice(0, 3) : ['', '', ''],
          physicalAttributes: Array.isArray(char.physicalAttributes) ? char.physicalAttributes.slice(0, 3) : ['', '', ''],
          backstory: char.backstory || '',
        }));
      } else {
        // Fallback if AI doesn't provide characters as expected
        scenario.characters = [
          {
            name: 'Player',
            avatar: '', avatarFile: null, avatarPreview: '',
            personalityTraits: ['', '', ''], physicalAttributes: ['', '', ''],
            backstory: '', isPlayer: true, gender: 'male'
          },
          {
            name: 'AI Character 1',
            avatar: '', avatarFile: null, avatarPreview: '',
            personalityTraits: ['', '', ''], physicalAttributes: ['', '', ''],
            backstory: '', isPlayer: false, gender: 'female'
          }
        ];
      }

      if (Array.isArray(generatedData.scenes) && generatedData.scenes.length > 0) {
        scenario.scenes = generatedData.scenes.map(scene => ({
          name: scene.name || 'New Scene',
          description: scene.description || '',
        }));
      } else {
        scenario.scenes = [{ name: 'Scene 1', description: '' }];
      }
      
      successMessage = 'Scenario generated by AI! Review and make any adjustments.';
      lastAiChange = { before: scenarioSnapshotBeforeAI, after: deepCopy(scenario) };
      console.log('[NEW PAGE] AI Assistance success, updated lastAiChange, about to save state.');
      saveState(); // Save state after successful AI operation
    } catch (error) {
      console.error('[NEW PAGE] AI Scenario Generation Error in handleAIAssistance:', error);
      aiGenerationError = error.message || 'Failed to generate scenario.';
    } finally {
      isGeneratingAIScenario = false;
    }
  }

  async function handleSubmit() {
    // Validate form
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
      
      if (!character.avatar && !character.avatarFile) {
        errorMessage = 'All characters must have an avatar';
        return;
      }
    }
    
    try {
      isSubmitting = true;
      errorMessage = '';
      
      // Process avatars: upload files if necessary
      for (let i = 0; i < scenario.characters.length; i++) {
        const character = scenario.characters[i];
        
        if (character.avatarFile) {
          // If it's a file upload, upload to UploadThing
          character.avatar = await uploadToUploadThing(character.avatarFile);
          character.avatarFile = null;
          character.avatarPreview = '';
        }
      }
      
      // Prepare data for Firestore
      const scenarioData = {
        title: scenario.title,
        description: scenario.description,
        characters: scenario.characters.map(char => ({
          name: char.name,
          avatar: char.avatar,
          personalityTraits: char.personalityTraits.filter(trait => trait.trim()),
          physicalAttributes: char.physicalAttributes.filter(attr => attr.trim()),
          backstory: char.backstory,
          isPlayer: char.isPlayer,
          gender: char.gender
        })),
        scenes: scenario.scenes.map(scene => ({
          name: scene.name,
          description: scene.description
        })).filter(scene => scene.name.trim() || scene.description.trim()),
        createdAt: serverTimestamp()
      };
      
      // Save to Firestore
      const docRef = await addDoc(collection(db, 'scenarios'), scenarioData);
      
      successMessage = 'Scenario created successfully!';
      
      // Redirect after a brief delay
      setTimeout(() => {
        goto('/scenarios/' + docRef.id);
      }, 2000);
      
    } catch (error) {
      console.error('Error creating scenario:', error);
      errorMessage = 'Error creating scenario: ' + error.message;
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="min-h-screen bg-gray-900 text-gray-100 pb-12">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white">Create New Scenario</h1>
      <p class="text-gray-400 mt-2">Design your AI roleplay scenario with characters, settings, and story elements</p>
    </div>
    
    <!-- Form -->
    <!-- AI Powered Scenario Assistance -->
    <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
      <h2 class="text-xl font-semibold mb-4">AI Powered Scenario Assistance</h2>

      <div class="mb-4">
        <span class="block text-sm font-medium text-gray-300 mb-2">AI Task:</span>
        <div class="flex items-center space-x-4">
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="radio" bind:group={aiTaskMode} name="aiTaskMode" value="generate" class="form-radio text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
            <span class="text-gray-300">Generate New Scenario</span>
          </label>
          <label class="flex items-center space-x-2 cursor-pointer">
            <input type="radio" bind:group={aiTaskMode} name="aiTaskMode" value="improve" class="form-radio text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
            <span class="text-gray-300">Improve Current Scenario</span>
          </label>
        </div>
      </div>

      {#if aiTaskMode === 'generate'}
        <p class="text-gray-400 mb-4">
          Need inspiration? Enter a plot idea below and let AI help you draft a new scenario from scratch.
        </p>
        <div class="mb-4">
          <label for="plot-idea" class="block text-sm font-medium text-gray-300 mb-2">Your Plot Idea</label>
          <textarea 
            id="plot-idea" 
            bind:value={plotIdea} 
            rows="3"
            class="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., A detective investigating a mysterious disappearance in a futuristic city."
          ></textarea>
        </div>
      {/if}

      {#if aiTaskMode === 'improve'}
        <p class="text-gray-400 mb-4">
          Want to enhance the current scenario? Provide specific instructions or let the AI generally improve it.
        </p>
        <div class="mb-4">
          <label for="improvement-instructions" class="block text-sm font-medium text-gray-300 mb-2">Improvement Instructions (Optional)</label>
          <textarea 
            id="improvement-instructions" 
            bind:value={improvementInstructions} 
            rows="3"
            class="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="e.g., Make the characters more conflicted, add a surprising twist to the plot, expand the description of the main scene..."
          ></textarea>
        </div>
      {/if}

      <button 
        type="button" 
        on:click={handleAIAssistance} 
        disabled={isGeneratingAIScenario || (aiTaskMode === 'improve' && !scenario.title && !scenario.description && !selectedScenarioId)}
        class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-md disabled:opacity-50 transition duration-150 ease-in-out"
      >
        {#if isGeneratingAIScenario}
          Processing...
        {:else if aiTaskMode === 'generate'}
          Generate with AI
        {:else} <!-- aiTaskMode === 'improve' -->
          Improve with AI
        {/if}
      </button>
    </div>

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
      <span class="text-sm text-gray-400 mr-auto">({historyIndex >=0 ? historyIndex + 1 : 0} / {history.length} states)</span>
      <button
        type="button"
        on:click={() => showChangeSummary = !showChangeSummary}
        disabled={!lastAiChange.after}
        class="ml-4 px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-indigo-300 font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-opacity duration-150"
      >
        {showChangeSummary ? 'Hide' : 'Show'} Last AI Edit Summary
      </button>
    </div>

    {#if showChangeSummary && lastAiChange.before && lastAiChange.after}
      <div class="change-summary bg-gray-800 p-4 rounded-lg mt-0 mb-6 border border-gray-700 text-sm">
        <h4 class="font-semibold mb-3 text-md text-gray-200">Summary of Last AI Edit:</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          
          <div>
            <strong class="block text-gray-400 mb-0.5">Title:</strong>
            <p class="text-xs text-red-400 line-through">{lastAiChange.before.title || 'N/A'}</p>
            <p class="text-xs text-green-400">{lastAiChange.after.title || 'N/A'}</p>
          </div>

          <div>
            <strong class="block text-gray-400 mb-0.5">Writing Style:</strong>
            <p class="text-xs text-red-400 line-through">{lastAiChange.before.writingStyle || 'N/A'}</p>
            <p class="text-xs text-green-400">{lastAiChange.after.writingStyle || 'N/A'}</p>
          </div>

          <div class="md:col-span-2">
            <strong class="block text-gray-400 mb-0.5">Description:</strong>
            <p class="text-xs text-red-400 line-through whitespace-pre-line">{lastAiChange.before.description || 'N/A'}</p>
            <p class="text-xs text-green-400 whitespace-pre-line">{lastAiChange.after.description || 'N/A'}</p>
          </div>
          
          <div class="md:col-span-2">
            <strong class="block text-gray-400 mb-0.5">Story Outline:</strong>
            <p class="text-xs text-red-400 line-through whitespace-pre-line">{lastAiChange.before.storyOutline || 'N/A'}</p>
            <p class="text-xs text-green-400 whitespace-pre-line">{lastAiChange.after.storyOutline || 'N/A'}</p>
          </div>

          <div>
            <strong class="block text-gray-400 mb-0.5">Characters ({lastAiChange.before.characters?.length || 0} &rarr; {lastAiChange.after.characters?.length || 0}):</strong>
            <p class="text-xs text-red-400 line-through">{(lastAiChange.before.characters || []).map(c => c.name).join(', ') || 'N/A'}</p>
            <p class="text-xs text-green-400">{(lastAiChange.after.characters || []).map(c => c.name).join(', ') || 'N/A'}</p>
          </div>

          <div>
            <strong class="block text-gray-400 mb-0.5">Scenes ({lastAiChange.before.scenes?.length || 0} &rarr; {lastAiChange.after.scenes?.length || 0}):</strong>
            <p class="text-xs text-red-400 line-through">{(lastAiChange.before.scenes || []).map(s => s.name).join(', ') || 'N/A'}</p>
            <p class="text-xs text-green-400">{(lastAiChange.after.scenes || []).map(s => s.name).join(', ') || 'N/A'}</p>
          </div>

        </div>
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit} class="space-y-8">
      <!-- Select Existing Scenario -->
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 mb-8">
        <h2 class="text-xl font-semibold mb-4">Start from Existing Scenario (Optional)</h2>
        <label for="existing-scenario-select" class="block text-sm font-medium text-gray-300 mb-2">
          Select a scenario to use as a template:
        </label>
        {#if existingScenarios.length > 0}
          <select
            id="existing-scenario-select"
            bind:value={selectedScenarioId}
            on:change={handleScenarioSelection}
            class="w-full bg-gray-700 border border-gray-600 text-white rounded-md shadow-sm p-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            <option value="">-- Create New From Scratch --</option>
            {#each existingScenarios as existing}
              <option value={existing.id}>{existing.title || 'Untitled Scenario'}</option>
            {/each}
          </select>
        {:else if errorMessage && errorMessage.includes("Could not load existing scenarios")}
          <p class="text-red-400">{errorMessage}</p>
        {:else}
          <p class="text-gray-400">Loading existing scenarios or none found...</p>
        {/if}
      </div>
      <!-- Basic Scenario Information -->
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <h2 class="text-xl font-semibold mb-4">Scenario Details</h2>
        
        <div class="space-y-4">
          <div>
            <label for="title" class="block text-sm font-medium text-gray-300 mb-1">Scenario Title</label>
            <input 
              type="text" 
              id="title" 
              bind:value={scenario.title} 
              class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Enter a title for your scenario"
            />
          </div>
          
          <div>
            <label for="description" class="block text-sm font-medium text-gray-300 mb-1">Scenario Description</label>
            <textarea 
              id="description" 
              bind:value={scenario.description} 
              rows="3" 
              class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              placeholder="Describe the overall plot and setting of your scenario"
            ></textarea>
          </div>
        </div>
      </div>
      
      <!-- Scenes -->
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">Scenes</h2>
          <button 
            type="button" 
            on:click={addScene} 
            class="px-3 py-1 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
          >
            + Add Scene
          </button>
        </div>
        
        <div class="space-y-6">
          {#each scenario.scenes as scene, i}
            <div class="border border-gray-700 rounded-lg p-4">
              <div class="flex justify-between items-center mb-3">
                <h3 class="text-lg font-medium">Scene {i + 1}</h3>
                {#if scenario.scenes.length > 1}
                  <button 
                    type="button" 
                    on:click={() => removeScene(i)}
                    class="px-2 py-1 bg-red-800 text-white text-sm rounded hover:bg-red-700"
                    aria-label="Remove scene"
                  >
                    Remove Scene
                  </button>
                {/if}
              </div>
              
              <div class="space-y-4">
                <div>
                  <label for={`scene-name-${i}`} class="block text-sm font-medium text-gray-300 mb-1">Scene Name</label>
                  <input
                    type="text"
                    id={`scene-name-${i}`}
                    bind:value={scenario.scenes[i].name}
                    class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="e.g., The Enchanted Forest, Space Station Omega"
                  />
                </div>
                
                <div>
                  <label for={`scene-desc-${i}`} class="block text-sm font-medium text-gray-300 mb-1">Scene Description</label>
                  <textarea 
                    id={`scene-desc-${i}`} 
                    bind:value={scenario.scenes[i].description}
                    rows="3" 
                    class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    placeholder="Describe this scene in detail - the atmosphere, key features, and any important elements"
                  ></textarea>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Characters -->
      <div class="bg-gray-800 rounded-lg p-6 border border-gray-700">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-semibold">Characters ({scenario.characters.length})</h2>
          <button 
            type="button" 
            on:click={addCharacter} 
            class="px-3 py-1 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700"
          >
            + Add Character
          </button>
        </div>
        
        <div class="space-y-8">
          {#each scenario.characters as character, characterIndex}
            <div class="p-4 border border-gray-600 rounded-lg">
              <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-medium">Character {characterIndex + 1}</h3>
                {#if scenario.characters.length > 1}
                  <button 
                    type="button" 
                    on:click={() => removeCharacter(characterIndex)}
                    class="px-2 py-1 bg-red-800 text-white text-sm rounded hover:bg-red-700"
                  >
                    Remove
                  </button>
                {/if}
              </div>
              
              <!-- Basic character info -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div class="mb-4">
                  <label for={`characterName-${characterIndex}`} class="block text-sm font-medium text-gray-300 mb-2">Character Name</label>
                  <input 
                    type="text" 
                    id={`characterName-${characterIndex}`} 
                    bind:value={character.name} 
                    placeholder="e.g., Elara Moonwhisper"
                    class="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm text-white"
                    required
                  />
                </div>
                <!-- Gender Selection -->
                <fieldset class="mb-4">
                  <legend class="block text-sm font-medium text-gray-300 mb-2">Gender</legend>
                  <div class="flex space-x-4">
                    <label class="inline-flex items-center" for={"gender-male-option-" + characterIndex}>
                      <input type="radio" id={"gender-male-option-" + characterIndex} bind:group={character.gender} value="male" class="form-radio text-indigo-600 bg-gray-700 border-gray-600 focus:ring-indigo-500">
                      <span class="ml-2 text-gray-300">Male</span>
                    </label>
                    <label class="inline-flex items-center" for={"gender-female-option-" + characterIndex}>
                      <input type="radio" id={"gender-female-option-" + characterIndex} bind:group={character.gender} value="female" class="form-radio text-pink-600 bg-gray-700 border-gray-600 focus:ring-pink-500">
                      <span class="ml-2 text-gray-300">Female</span>
                    </label>
                    <label class="inline-flex items-center" for={"gender-other-option-" + characterIndex}>
                      <input type="radio" id={"gender-other-option-" + characterIndex} bind:group={character.gender} value="other" class="form-radio text-purple-600 bg-gray-700 border-gray-600 focus:ring-purple-500">
                      <span class="ml-2 text-gray-300">Other</span>
                    </label>
                  </div>
                </fieldset>
                
                <div>
                  <label class="block text-sm font-medium text-gray-300 mb-1">Role</label>
                  <div class="flex items-center space-x-4">
                    <label class="inline-flex items-center">
                      <input 
                        type="radio" 
                        bind:group={character.isPlayer} 
                        value={false} 
                        class="text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-gray-700 border-gray-600"
                      />
                      <span class="ml-2">AI Character</span>
                    </label>
                    <label class="inline-flex items-center">
                      <input 
                        type="radio" 
                        bind:group={character.isPlayer} 
                        value={true} 
                        class="text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-gray-700 border-gray-600"
                      />
                      <span class="ml-2">Player Character</span>
                    </label>
                  </div>
                </div>
              </div>
              
              <!-- Avatar selection -->
              <div class="mb-4">
                <label class="block text-sm font-medium text-gray-300 mb-2">Character Avatar</label>
                
                <div class="grid grid-cols-2 gap-4">
                  
                  <!-- Custom avatar upload -->
                  <div>
                    <p class="text-sm text-gray-400 mb-2">Or upload image:</p>
                    <input 
                      type="file"
                      accept="image/*"
                      on:change={(e) => handleFileUpload(e, characterIndex)}
                      class="block w-full text-sm text-gray-400
                        file:mr-4 file:py-2 file:px-4
                        file:rounded file:border-0
                        file:text-sm file:font-medium
                        file:bg-indigo-600 file:text-white
                        hover:file:bg-indigo-700"
                    />
                  </div>
                </div>
                
                <!-- Avatar preview -->
                {#if character.avatar || character.avatarPreview}
                  <div class="mt-3 flex items-center">
                    <div class="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                      {#if character.avatarPreview}
                        <img src={character.avatarPreview} alt="Avatar preview" class="w-full h-full object-cover" />
                      {:else if character.avatar.startsWith('http')}
                        <img src={character.avatar} alt="Avatar" class="w-full h-full object-cover" />
                      {:else}
                        <span class="text-4xl">{character.avatar}</span>
                      {/if}
                    </div>
                    <span class="ml-3 text-sm text-gray-300">Selected avatar</span>
                  </div>
                {/if}
              </div>
              
              <!-- Personality traits -->
              <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                  <label class="block text-sm font-medium text-gray-300">Personality Traits</label>
                  <button 
                    type="button" 
                    on:click={() => addPersonalityTrait(characterIndex)} 
                    class="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                  >
                    + Add Trait
                  </button>
                </div>
                
                <div class="space-y-2">
                  {#each character.personalityTraits as trait, traitIndex}
                    <div class="flex items-center space-x-2">
                      <input 
                        type="text" 
                        bind:value={character.personalityTraits[traitIndex]} 
                        class="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Kind, Brave, Mysterious"
                      />
                      <button 
                        type="button" 
                        on:click={() => removePersonalityTrait(characterIndex, traitIndex)}
                        class="px-2 py-1 bg-red-800 text-white text-xs rounded hover:bg-red-700"
                      >
                        &times;
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
              
              <!-- Physical attributes -->
              <div class="mb-4">
                <div class="flex justify-between items-center mb-2">
                  <label class="block text-sm font-medium text-gray-300">Physical Attributes</label>
                  <button 
                    type="button" 
                    on:click={() => addPhysicalAttribute(characterIndex)} 
                    class="px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                  >
                    + Add Attribute
                  </button>
                </div>
                
                <div class="space-y-2">
                  {#each character.physicalAttributes as attr, attrIndex}
                    <div class="flex items-center space-x-2">
                      <input 
                        type="text" 
                        bind:value={character.physicalAttributes[attrIndex]} 
                        class="flex-1 px-3 py-1.5 bg-gray-700 border border-gray-600 rounded-md text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        placeholder="e.g., Tall, Blue eyes, Long hair"
                      />
                      <button 
                        type="button" 
                        on:click={() => removePhysicalAttribute(characterIndex, attrIndex)}
                        class="px-2 py-1 bg-red-800 text-white text-xs rounded hover:bg-red-700"
                      >
                        &times;
                      </button>
                    </div>
                  {/each}
                </div>
              </div>
              
              <!-- Backstory -->
              <div>
                <label for={`backstory-${characterIndex}`} class="block text-sm font-medium text-gray-300 mb-1">Backstory</label>
                <textarea 
                  id={`backstory-${characterIndex}`} 
                  bind:value={character.backstory} 
                  rows="4" 
                  class="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Character's background, history, and motivations"
                ></textarea>
              </div>
            </div>
          {/each}
        </div>
      </div>
      
      <!-- Error/Success messages -->
      {#if errorMessage}
        <div class="bg-red-900 text-white p-4 rounded-md">
          {errorMessage}
        </div>
      {/if}
      
      {#if successMessage}
        <div class="bg-green-900 text-white p-4 rounded-md">
          {successMessage}
        </div>
      {/if}
      
      <!-- Submit button -->
      <div class="flex justify-end gap-4">
        <a
          href="/chats"
          class="px-6 py-3 bg-gray-700 text-white font-medium rounded-lg hover:bg-gray-600"
        >
          Cancel
        </a>
        <button
          type="submit"
          disabled={isSubmitting}
          class="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
        >
          {#if isSubmitting}
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Creating...
          {:else}
            Create Scenario
          {/if}
        </button>
      </div>
    </form>
  </div>
</div>