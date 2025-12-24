import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
// Note: In a real production app, ensure strict domain restrictions on your API Key
// @ts-ignore - Vite uses import.meta.env
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || localStorage.getItem('gemini_api_key') || '';
const ai = new GoogleGenAI({ apiKey });

export const generateArticleSummary = async (prompt: string, _contentHtml?: string): Promise<string> => {
  // Accept single prompt argument or (title, content) format for backward compatibility
  let content: string = prompt;
  
  if (_contentHtml !== undefined) {
    // Legacy format: (title, content)
    content = `Article Title: ${prompt}\n\nArticle Content:\n${_contentHtml}`;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash',
      contents: content,
    });

    return response.text || "Could not generate summary.";
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Failed to generate summary");
  }
};

export const polishTranscript = async (title: string, rawDescription: string): Promise<string> => {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = rawDescription;
  const cleanText = tempDiv.textContent || tempDiv.innerText || "";
  // Ensure we have something to send
  const textToProcess = cleanText.trim().length > 0 ? cleanText.substring(0, 25000) : "No description provided.";

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash',
      contents: `You are a professional video editor and copywriter.
      
      I am providing you with metadata/description from a video. 
      
      YOUR DIRECT TASK:
      1. Output a polished summary of what this video is about. 
      2. If the text allows, format it as a "Smart Transcript" with headers.
      3. Identify speakers if possible.
      4. Fix grammar and formatting.
      5. Highlight 3 "Key Takeaways" at the top.
      
      DO NOT respond with "Okay" or "I am ready". Just output the content immediately.

      Video Title: ${title}
      Raw Text: ${textToProcess}`,
    });

    return response.text || "Could not generate transcript.";
  } catch (error) {
    console.error("Gemini Transcript Error:", error);
    throw new Error("Failed to generate transcript");
  }
}
