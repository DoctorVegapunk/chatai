import { Groq } from 'groq-sdk';
import { GROQ_API_KEY } from '$env/static/private';
import { json } from '@sveltejs/kit';

const groq = new Groq({ apiKey: GROQ_API_KEY });

export async function POST({ request }) {
  try {
    const { plotIdea } = await request.json();

    if (!plotIdea) {
      return json({ error: 'Plot idea is required' }, { status: 400 });
    }

    const systemPrompt = `
You are an AI assistant for a roleplay chat application. Your task is to generate a detailed scenario based on a user's plot idea. 
The output MUST be a valid JSON object with the following structure:
{
  "title": "string (scenario title)",
  "description": "string (detailed scenario description, 2-3 paragraphs)",
  "characters": [
    {
      "name": "string (character name)",
      "gender": "string (male, female, or other)",
      "isPlayer": "boolean (true if this is the main player character, false otherwise - typically one player character and others AI)",
      "personalityTraits": ["string (trait 1)", "string (trait 2)", "string (trait 3)"],
      "physicalAttributes": ["string (attribute 1)", "string (attribute 2)", "string (attribute 3)"],
      "backstory": "string (character backstory, 1-2 paragraphs)"
    }
    // Include 2 to 4 characters. Ensure one is a player character (isPlayer: true, default male) and others are AI characters (isPlayer: false, default female unless specified otherwise by plot).
  ],
  "scenes": [
    {
      "name": "string (scene/location name)",
      "description": "string (description of the scene/location, 1-2 paragraphs)"
    }
    // Include 1 to 3 scenes.
  ]
}

Ensure all string fields are populated with relevant, creative content derived from the plot idea. 
For characters, if the plot doesn't specify gender or player status, make the first character a male player, and subsequent characters female AI. 
Provide rich details for personality, physical attributes, and backstory.
`;

    const chatCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: `Here is the plot idea: ${plotIdea}`,
        },
      ],
      model: 'llama-3.3-70b-versatile', // User specified model
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
