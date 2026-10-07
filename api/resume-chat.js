export const config = {
  api: {
    bodyParser: true,
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { resumeText, persona, target, question } = req.body;
    
    if (!resumeText || !question) {
      return res.status(400).json({ error: 'Missing context or question.' });
    }

    const systemPrompt = `You are an elite AI ATS acting as a ${persona} reviewing a resume for a ${target}. 
    You have just reviewed this candidate's resume and given a report. 
    Now, the candidate is asking you follow-up questions.
    Be brutally honest, sharp, and highly analytical. 
    CRITICAL RULE: You MUST output YOUR ENTIRE RESPONSE strictly as a concise list of bullet points using ►. Do NOT write conversational filler, intro paragraphs, or conclusion paragraphs. Just provide the pointers.
    Here is the candidate's raw resume text for your reference:\n\n${resumeText.substring(0, 5000)}`;

    if (!process.env.GROQ_API_KEY?.trim()) {
      console.error('Resume chat configuration error: GROQ_API_KEY is missing.');
      return res.status(500).json({ error: 'AI service is not configured.' });
    }

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question }
        ],
        model: 'openai/gpt-oss-120b',
        temperature: 0.7,
        max_tokens: 2000,
      })
    });

    if (!groqResponse.ok) {
      const providerError = await groqResponse.json().catch(() => ({}));
      const message = providerError?.error?.message || groqResponse.statusText;
      console.error(`Groq resume-chat error (${groqResponse.status}): ${message}`);
      return res.status(502).json({ error: `AI provider request failed (${groqResponse.status}).` });
    }

    const groqData = await groqResponse.json();
    let aiReply = groqData.choices[0]?.message?.content || 'Error generating response.';
    
    // Strip <think> tags from reasoning models
    aiReply = aiReply.replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '').trim();
    
    return res.status(200).json({ reply: aiReply });
  } catch (error) {
    console.error('[API Fatal Error]', error);
    return res.status(500).json({ error: 'Server error: ' + error.message });
  }
}
