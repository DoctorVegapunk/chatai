import { json } from '@sveltejs/kit';
import { GROQ_API_KEY } from '$env/static/private';

export async function POST({ request }) {
  try {
    const { prompt, character, history = [], scenario } = await request.json();
    
    if (!prompt) {
      return json({ error: 'Prompt is required' }, { status: 400 });
    }
    
    // Format the conversation history for the prompt
    const formattedHistory = history.map(msg => 
      `${msg.role === 'user' ? 'User' : character?.name || 'AI'}: ${msg.content}`
    ).join('\n');
    
    // Create the system prompt with character and scenario context
    const systemPrompt = `You are ${character?.name || 'an AI assistant'} in a roleplaying scenario. 
      ${character?.personality ? `Your personality: ${character.personality}\n` : ''}
      ${character?.background ? `Your background: ${character.background}\n` : ''}
      ${scenario?.description ? `Scenario: ${scenario.description}\n` : ''}
      Stay in character and respond naturally to the user's messages.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama3-70b-8192',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1024,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Groq API error:', errorData);
      return json({ error: 'Failed to generate response' }, { status: response.status });
    }

    const data = await response.json();
    return json({ response: data.choices[0]?.message?.content || "I'm not sure how to respond to that." });
    
  } catch (error) {
    console.error('Error generating AI response:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
