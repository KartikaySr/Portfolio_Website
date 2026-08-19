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
    Use ** for bolding, * for italics, and ► for bullet points.
    Here is the candidate's raw resume text for your reference:\n\n${resumeText.substring(0, 5000)}`;

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
        model: 'qwen/qwen3.6-27b',
        temperature: 0.7,
        max_tokens: 500,
      })
    });

    if (!groqResponse.ok) {
      return res.status(500).json({ error: 'AI chat processing failed.' });
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
