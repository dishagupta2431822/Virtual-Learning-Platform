import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';

const app = express();
app.use(cors());
app.use(express.json());

// Set your API keys in environment variables or pass them directly here
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "YOUR_OPENAI_API_KEY";
const LUMA_API_KEY = process.env.LUMA_API_KEY || "YOUR_LUMA_API_KEY";

/**
 * 1. Expand raw input into a detailed AI video prompt & voiceover script using GPT-4o-mini
 */
async function expandPromptWithLLM(userInput, contentType = "Cooking Game Step") {
  const systemMessage = `
You are an expert commercial video director and AI prompt engineer.
Your task is to expand user input into a hyper-realistic AI video prompt optimized for video models (Luma, Runway).

Format output strictly as JSON with two fields:
{
  "video_prompt": "Cinematic close-up macro shot... [detailed description]",
  "voiceover_script": "Engaging 1-sentence voiceover script"
}
  `.trim();

  const userMessage = `Content Type: ${contentType}\nUser Input: ${userInput}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: userMessage }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to expand prompt with OpenAI");
  }

  return JSON.parse(data.choices[0].message.content);
}

/**
 * 2. Send video prompt to Luma Dream Machine API
 */
async function triggerLumaVideoGeneration(prompt, aspectRatio = "16:9") {
  const response = await fetch("https://api.lumalabs.ai/v1/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${LUMA_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt: prompt,
      aspect_ratio: aspectRatio,
      loop: false
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || "Failed to trigger video generation with Luma");
  }

  return data.id; // Returns the generation ID
}

/**
 * 3. Poll Luma API until video status is 'completed'
 */
async function pollLumaVideoStatus(generationId, intervalMs = 5000, maxAttempts = 30) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));

    const response = await fetch(`https://api.lumalabs.ai/v1/generations/${generationId}`, {
      headers: {
        "Authorization": `Bearer ${LUMA_API_KEY}`
      }
    });

    const data = await response.json();

    if (data.state === "completed") {
      return data.assets.video; // Returns direct MP4 URL
    } else if (data.state === "failed") {
      throw new Error(`Video generation failed: ${data.failure_reason}`);
    }

    console.log(`[Job ${generationId}] Status: ${data.state}... waiting`);
  }

  throw new Error("Video generation timed out.");
}

/**
 * Main API Endpoint: /api/generate-full-video
 */
app.post('/api/generate-full-video', async (req, res) => {
  try {
    const { userInput, contentType = "Cooking Game Step", aspectRatio = "16:9" } = req.body;

    if (!userInput) {
      return res.status(400).json({ success: false, error: "userInput field is required" });
    }

    console.log(`Processing request: "${userInput}"`);

    // Step 1: Prompt Expansion
    console.log("Expanding prompt via OpenAI...");
    const expanded = await expandPromptWithLLM(userInput, contentType);
    console.log("Expanded Video Prompt:", expanded.video_prompt);

    // Step 2: Trigger Video Generation
    console.log("Triggering video generation via Luma API...");
    const generationId = await triggerLumaVideoGeneration(expanded.video_prompt, aspectRatio);

    // Step 3: Poll for Completion
    console.log(`Generation started (ID: ${generationId}). Polling for result...`);
    const videoUrl = await pollLumaVideoStatus(generationId);

    console.log("Video generation successful!");

    // Return final result to frontend
    res.json({
      success: true,
      data: {
        video_url: videoUrl,
        voiceover_script: expanded.voiceover_script,
        original_prompt: userInput,
        expanded_prompt: expanded.video_prompt
      }
    });

  } catch (error) {
    console.error("Error generating video:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AI Video Generator Backend running on port ${PORT}`);
});