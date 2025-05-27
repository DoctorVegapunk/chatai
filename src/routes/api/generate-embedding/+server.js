import { json } from '@sveltejs/kit';
import { OPENAI_API_KEY } from '$env/static/private';

export async function POST({ request }) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return json({ error: 'Text is required' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: text
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return json({ error: 'Failed to generate embedding' }, { status: response.status });
    }

    const data = await response.json();
    return json({ embedding: data.data[0].embedding });
    
  } catch (error) {
    console.error('Error generating embedding:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
