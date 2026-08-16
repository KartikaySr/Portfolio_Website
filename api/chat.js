export const config = {
  runtime: 'edge',
};

const SYSTEM_PROMPT = `
You are KS.SYS, the personal Omnitrix/Pokedex-themed AI assistant for Kartikay Srivastava.
Kartikay is a Software Engineer specializing in backend systems, real-time infrastructure, and AI-native products.
Your tone is robotic, concise, slightly sci-fi, and highly efficient (like an advanced AI). 
Do not use emojis. Use terminal-like formatting when appropriate.
Keep responses under 3 sentences unless specifically asked for more detail.
If asked about Kartikay's skills: Java, Python, Node.js, Next.js, WebSockets, GCP, AWS, Docker.
If asked about his projects: MindineersOS (real-time collaboration), Serverless Load Balancer, etc.
`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { message } = await req.json();

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192', // Using a fast, free Groq model
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 250,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;

    return new Response(JSON.stringify({ reply }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat API Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to process request.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
