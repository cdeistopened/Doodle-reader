import { YoutubeTranscript } from 'youtube-transcript';

export async function handler(event, context) {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  try {
    const { videoId } = event.queryStringParameters || {};
    
    if (!videoId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing videoId parameter' })
      };
    }

    console.log(`[Netlify Function] Fetching transcript for ${videoId}...`);
    
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptArray || transcriptArray.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'No transcript found' })
      };
    }

    const transcript = transcriptArray
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        transcript,
        length: transcript.length,
        segments: transcriptArray.length 
      })
    };
    
  } catch (error) {
    console.error('[Netlify Function] Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: error.message || 'Failed to fetch transcript' 
      })
    };
  }
}