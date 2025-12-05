import { GoogleGenAI } from "@google/genai";

// Initialize Gemini Client
// Note: In a real production app, ensure strict domain restrictions on your API Key
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const generateArticleSummary = async (title: string, contentHtml: string): Promise<string> => {
  // Strip HTML for token efficiency
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = contentHtml;
  const cleanText = tempDiv.textContent || tempDiv.innerText || "";
  
  // Truncate to avoid massive context (approx 10k chars is plenty for a summary)
  const truncatedText = cleanText.substring(0, 15000);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `You are a helpful news assistant. 
      
      Task: Summarize the following article into exactly 3 concise bullet points. 
      Style: Objective, journalistic, and dense.
      
      Article Title: ${title}
      Article Content: ${truncatedText || "(Content missing, please summarize based on title if possible)"}`,
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
      model: 'gemini-2.5-flash',
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