import { Groq } from 'groq-sdk';
import { GROQ_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';

const groq = new Groq({ apiKey: GROQ_API_KEY });

export async function POST({ request }) {
  try {
    const { plotIdea, existingScenario, taskType, improvementInstructions } = await request.json();

    if (!taskType || (taskType !== 'generate' && taskType !== 'improve')) {
      return json({ error: 'Valid taskType (generate or improve) is required' }, { status: 400 });
    }

    if (taskType === 'generate' && !plotIdea) {
      return json({ error: 'Plot idea is required for generate task' }, { status: 400 });
    }

    if (taskType === 'improve' && !existingScenario) {
      return json({ error: 'Existing scenario data is required for improve task' }, { status: 400 });
    }

    let systemPrompt = '';
    let userMessageContent = '';

    const commonStructureInstructions = `
The output MUST be a valid JSON object with the following structure:
{
  "title": "string (scenario title)",
  "description": "string (detailed scenario description, 2-3 paragraphs)",
  "characters": [
    {
      "name": "string (character name)",
      "gender": "string (male, female, or other)",
      "isPlayer": "boolean (true if this is the main player character, false otherwise)",
      "personalityTraits": ["string (trait 1)", "string (trait 2)", "string (trait 3)"],
      "physicalAttributes": ["string (attribute 1)", "string (attribute 2)", "string (attribute 3)"],
      "backstory": "string (character backstory, 1-2 paragraphs)"
    }
    // Ensure 2 to 4 characters. Preserve isPlayer status if improving, otherwise ensure one player character.
  ],
  "scenes": [
    {
      "name": "string (scene/location name)",
      "description": "string (description of the scene/location, 1-2 paragraphs)"
    }
    // Ensure 1 to 3 scenes.
  ]
}
Ensure all string fields are populated with relevant, creative content. Provide rich details.`;

    if (taskType === 'generate') {
      systemPrompt = `You are an AI assistant for a roleplay chat application. Your task is to generate a detailed scenario based on a user's plot idea. 
For characters, if the plot doesn't specify gender or player status, make the first character a male player, and subsequent characters female AI. 
${commonStructureInstructions}`;
      userMessageContent = `Here is the plot idea: ${plotIdea}`;
    } else { // taskType === 'improve'
      systemPrompt = `You are an AI assistant for a roleplay chat application. Your task is to improve and refine an existing scenario. 
The user will provide the current scenario data. Enhance its details, creativity, and coherence. 
${improvementInstructions ? `Focus on these specific instructions from the user: ${improvementInstructions}` : 'Generally improve the scenario, making it more engaging and detailed.'}
Preserve the core elements and character roles (like isPlayer status) unless the improvement instructions explicitly ask for changes. 
${commonStructureInstructions}`;
      userMessageContent = `Here is the scenario to improve: ${JSON.stringify(existingScenario)}. ${improvementInstructions ? `My specific instructions for improvement are: ${improvementInstructions}` : ''}`;
    }

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt.trim(), // Ensure no leading/trailing whitespace issues
        },
        {
          role: 'user',
          content: userMessageContent,
        },
      ],
      model: 'llama3-70b-8192', // Corrected model name
      temperature: 0.7, // Adjusted for more creative but coherent output
      max_tokens: 2048, // Increased to allow for more detailed scenarios
      top_p: 1,
      stream: false, // We need the full JSON object, not a stream
      response_format: { type: 'json_object' }, // Ensure JSON output
      stop: null,
    });

    const generatedContent = chatCompletion.choices[0]?.message?.content;

    if (!generatedContent) {
      return json({ error: 'Failed to generate scenario from AI' }, { status: 500 });
    }

    try {
      const scenarioData = JSON.parse(generatedContent);
      return json(scenarioData, { status: 200 });
    } catch (parseError) {
      console.error('Error parsing Groq response:', parseError);
      console.error('Groq raw response:', generatedContent);
      return json({ error: 'Failed to parse AI response into valid JSON', rawResponse: generatedContent }, { status: 500 });
    }

  } catch (error) {
    console.error('Error in groqScenarioGenerator endpoint:', error);
    let errorMessage = 'An unexpected error occurred.';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return json({ error: errorMessage }, { status: 500 });
  }
}
