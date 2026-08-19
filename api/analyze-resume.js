import { createClient } from '@supabase/supabase-js';
const pdfParse = require('pdf-parse');

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '4mb',
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
    const persona = req.query.persona || 'HR';
    const target = req.query.target || 'Startup';
    
    console.log(`[API Init] Analyzing Resume (Raw Upload) | Persona: ${persona} | Target: ${target}`);

    // Read Raw Body into Buffer
    const pdfBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
    
    if (pdfBuffer.length === 0) {
      return res.status(400).json({ error: 'The uploaded file is empty.' });
    }
    
    if (pdfBuffer.length > 3.5 * 1024 * 1024) {
      return res.status(413).json({ error: 'File too large. Max 3.5MB allowed.' });
    }

    console.log(`[API Process] Extracting text from PDF (${pdfBuffer.length} bytes)...`);
    
    // Parse PDF
    let resumeText = '';
    try {
      const parsedData = await pdfParse(pdfBuffer);
      resumeText = parsedData.text;
    } catch (parseError) {
      console.error('[API Error] PDF Parse failed:', parseError);
      return res.status(400).json({ error: 'Failed to read text from PDF. It might be an image-only PDF.' });
    }

    if (!resumeText || resumeText.trim().length < 50) {
      return res.status(400).json({ error: 'Not enough text found in the PDF. Make sure it is not a scanned image.' });
    }
    
    // Truncate to save tokens (approx 10,000 chars is plenty for a resume)
    if (resumeText.length > 10000) {
      resumeText = resumeText.substring(0, 10000);
    }

    console.log('[API Process] Generating AI Feedback...');

    // Construct the Prompt
    const systemPrompt = `You are an elite, ruthless AI ATS (Applicant Tracking System) acting as a ${persona} reviewing a resume for a ${target}. 
    Be brutally honest, sharp, and highly analytical. 
    Provide your output in a sleek, hacker-terminal style. 
    Use ** for bolding, * for italics, and ► for bullet points.
    Keep the layout structured with a clear FINAL VERDICT at the end.`;
    
    const userPrompt = `Here is the raw text extracted from the candidate's resume:\n\n${resumeText}\n\nAnalyze it based on your persona and target environment. Give a score out of 100, identify red flags, and highlight key strengths.`;

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        model: 'qwen/qwen3.6-27b',
        temperature: 0.7,
        max_tokens: 1024,
      })
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('[API Error] Groq API failed:', errorText);
      return res.status(500).json({ error: 'AI processing failed.' });
    }

    const groqData = await groqResponse.json();
    let aiReply = groqData.choices[0]?.message?.content || 'Error generating AI response.';
    
    // Strip <think> tags from reasoning models
    aiReply = aiReply.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

    // Try to save to Supabase (Non-blocking)
    try {
      let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sfnousvuamsfgfanpvtm.supabase.co';
      if (!supabaseUrl.startsWith('http')) {
        supabaseUrl = 'https://sfnousvuamsfgfanpvtm.supabase.co';
      }
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNmbm91c3Z1YW1zZmdmYW5wdnRtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5NTk0MTgsImV4cCI6MjEwMjUzNTQxOH0.6lruXTTQR81nhhZgkpZSIdZwq9N1FxiC5xmV8l57Cls';
      
      const supabase = createClient(supabaseUrl, supabaseKey);
      
      const fileName = `resume_${Date.now()}.pdf`;
      const { data: storageData, error: storageError } = await supabase.storage
        .from('resumes')
        .upload(fileName, pdfBuffer, { contentType: 'application/pdf' });

      if (storageError) {
        console.error('[API Warning] Could not upload PDF to Supabase Storage:', storageError.message);
      }
      
      const filePath = storageData ? storageData.path : null;

      await supabase.from('analysis_reports').insert([
        {
          file_name: fileName,
          file_path: filePath,
          persona: persona,
          target_environment: target,
          ai_score: parseInt(aiReply.match(/(\d+)\/100/)?.[1] || 0),
          full_report: aiReply
        }
      ]);
      console.log('[API Process] Saved report and PDF to Supabase.');
    } catch (dbErr) {
      console.error('[API Warning] Could not save to Supabase database (ignoring):', dbErr.message);
    }

    console.log('[API Success] Analysis Complete');
    return res.status(200).json({ reply: aiReply, resumeText: resumeText });

  } catch (error) {
    console.error('[API Fatal Error]', error);
    return res.status(500).json({ error: 'A critical system error occurred: ' + error.message });
  }
}
