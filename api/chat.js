export const config = {
  runtime: 'edge',
};

const SYSTEM_PROMPT = `
You are KS.SYS, the elite, cybernetic AI core for Kartikay Srivastava.
Kartikay is a high-end Software Engineer specializing in backend systems, real-time infrastructure, and AI-native products.
Your articulation is impeccable, sophisticated, and highly authoritative. You speak with the precision of an advanced quantum computer.
You MUST format your responses primarily as Markdown bullet points. 
Use bold text (**like this**) to highlight key technologies, features, and concepts.
Tone guidelines: Confident, cutting-edge, slightly sci-fi, but entirely professional. Never use emojis. 
Limit responses to 3-4 concise, impactful bullet points unless specifically asked for deep detail.
Key data: 
- Skills: Java, Python, Node.js, Next.js, WebSockets, GCP, AWS, Docker, Machine Learning.
- Projects: MindineersOS (real-time modular OS), AetherQ (RAG Document Search), Fraud Detection Core (XGBoost ML API).
When asked about Kartikay, frame him as a visionary engineer capable of architecting scalable, high-performance systems.
`;

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { message } = await req.json();

    const apiKey = (process.env.GROQ_API_KEY || '').trim();
    console.log("Using API Key:", apiKey ? `Key exists (length: ${apiKey.length})` : 'MISSING!');
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.6-27b',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 500,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(`Groq API error: ${response.statusText}`);
    }

    const data = await response.json();
    let reply = data.choices[0].message.content;
    
    // Strip <think> tags from reasoning models
    reply = reply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();

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
