import { YoutubeTranscript } from 'youtube-transcript';

export async function handler(event, context) {
  // Handle CORS preflight
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
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

    console.log(`[Netlify] Fetching transcript for ${videoId}...`);
    
    // Use the working youtube-transcript package
    // This uses the Innertube API approach that actually works
    const transcriptArray = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (!transcriptArray || transcriptArray.length === 0) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ 
          error: 'No transcript found',
          videoId 
        })
      };
    }

    // Convert to plain text
    const transcript = transcriptArray
      .map(item => item.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`[Netlify] Success: ${transcript.length} characters, ${transcriptArray.length} segments`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        transcript,
        length: transcript.length,
        segments: transcriptArray.length,
        videoId,
        // Include raw segments for advanced use cases
        raw: transcriptArray.slice(0, 5) // First 5 segments as sample
      })
    };
    
  } catch (error) {
    console.error('[Netlify] Error:', error);
    
    // Provide helpful error messages
    let errorMessage = error.message || 'Failed to fetch transcript';
    
    if (error.message?.includes('Could not retrieve a transcript')) {
      errorMessage = 'No transcript available for this video (may be private or have captions disabled)';
    } else if (error.message?.includes('429')) {
      errorMessage = 'Rate limited by YouTube - try again later';
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        videoId: event.queryStringParameters?.videoId 
      })
    };
  }
}