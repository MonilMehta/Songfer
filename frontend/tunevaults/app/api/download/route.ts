import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const spotifyId = request.nextUrl.searchParams.get('spotify_id');

  if (!spotifyId) {
    return NextResponse.json(
      { error: 'Spotify ID is required' },
      { status: 400 }
    );
  }

  try {
    // In a real production app, you would use proper Spotify API authentication
    // This is a simplified example that redirects to Spotify's track page
    
    // Create a Spotify URL for the track
    const spotifyUrl = `https://open.spotify.com/track/${spotifyId}`;
    
    // Return a redirect to Spotify
    return NextResponse.redirect(spotifyUrl);
    
    /* 
    // Alternative implementation if you had Spotify API credentials:
    
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    
    // Get access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });
    
    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;
    
    // Get track details including preview URL
    const trackResponse = await fetch(`https://api.spotify.com/v1/tracks/${spotifyId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const trackData = await trackResponse.json();
    
    // If there's a preview URL, return it as a downloadable file
    if (trackData.preview_url) {
      const previewResponse = await fetch(trackData.preview_url);
      const previewBuffer = await previewResponse.arrayBuffer();
      
      return new NextResponse(previewBuffer, {
        headers: {
          'Content-Type': 'audio/mpeg',
          'Content-Disposition': `attachment; filename="${trackData.name}.mp3"`
        }
      });
    } else {
      // No preview available, redirect to Spotify
      return NextResponse.redirect(spotifyUrl);
    }
    */
  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to download track' },
      { status: 500 }
    );
  }
} 