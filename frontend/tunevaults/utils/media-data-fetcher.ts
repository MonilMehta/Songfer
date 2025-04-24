// Utility functions for fetching media data from various platforms

export interface MediaPreviewData {
  title: string
  artist: string
  thumbnail: string
  platform: 'youtube' | 'spotify'
  isPlaylist: boolean
  songCount?: number
  url: string
  id: string
  isSearchQuery?: boolean // Added to identify search queries
}

// Extracts video/track ID from URLs
export const extractVideoId = (url: string): { id: string, platform: 'youtube' | 'spotify', isPlaylist: boolean, playlistId?: string, isSearchQuery?: boolean } | null => {
  try {
      // Check if it's a simple search query without URL format
      if (!url.includes('://') && !url.includes('www.') && url.trim().length > 0) {
          return { 
              id: encodeURIComponent(url.trim()),
              platform: 'youtube',
              isPlaylist: false, 
              isSearchQuery: true
          };
      }
      
      const cleanedUrl = new URL(url);
      const pathSegments = cleanedUrl.pathname.split('/').filter(Boolean);

      // Handle YouTube search results URL
      if (cleanedUrl.hostname.includes('youtube.com') && cleanedUrl.pathname.includes('/results') && cleanedUrl.searchParams.has('search_query')) {
          const searchQuery = cleanedUrl.searchParams.get('search_query');
          if (searchQuery) {
              return { 
                  id: searchQuery,
                  platform: 'youtube',
                  isPlaylist: false,
                  isSearchQuery: true
              };
          }
      }

      if ((cleanedUrl.hostname.includes('youtube.com') && cleanedUrl.searchParams.has('v')) || cleanedUrl.hostname.includes('youtu.be')) {
          const videoId = cleanedUrl.hostname.includes('youtu.be') ? pathSegments[0] : cleanedUrl.searchParams.get('v');
          if (!videoId || videoId.length !== 11) return null;
          const isPlaylist = cleanedUrl.searchParams.has('list');
          const playlistId = isPlaylist ? cleanedUrl.searchParams.get('list') || undefined : undefined;
          return { id: videoId, platform: 'youtube', isPlaylist, playlistId };
      }

      if (cleanedUrl.hostname.includes('youtube.com') && (cleanedUrl.searchParams.has('list') || pathSegments[0] === 'playlist')) {
           const playlistId = cleanedUrl.searchParams.get('list') || (pathSegments[0] === 'playlist' ? pathSegments[1] : undefined);
          if (!playlistId) return null;
          return { id: playlistId, platform: 'youtube', isPlaylist: true };
      }

      // More robust Spotify track ID extraction
      if (cleanedUrl.hostname.includes('spotify.com') && pathSegments[0] === 'track') {
          let trackId = pathSegments[1];
          // Some Spotify URLs have shortened IDs, extract them properly
          if (trackId) {
              // Remove any query parameters that might be in the ID
              trackId = trackId.split('?')[0];
              console.log('Extracted Spotify track ID:', trackId);
              return { id: trackId, platform: 'spotify', isPlaylist: false };
          }
          return null;
      }

      if (cleanedUrl.hostname.includes('spotify.com') && pathSegments[0] === 'playlist' && pathSegments[1]) {
          let playlistId = pathSegments[1];
          // Some Spotify URLs have shortened IDs, extract them properly
          if (playlistId) {
              // Remove any query parameters that might be in the ID
              playlistId = playlistId.split('?')[0];
              console.log('Extracted Spotify playlist ID:', playlistId);
              return { id: playlistId, platform: 'spotify', isPlaylist: true };
          }
          return null;
      }

  } catch (e) {
      console.error("Error parsing URL:", e);
      return null;
  }

  return null;
}

// Fetch YouTube data (video or playlist)
export const fetchYouTubeData = async (videoId: string, isPlaylist: boolean, playlistId?: string, fullUrl?: string): Promise<MediaPreviewData> => {
  try {
    // Handle search queries
    if (fullUrl && fullUrl.includes('isSearchQuery=true')) {
      try {
        // For search queries, we need to fetch the first result from YouTube search
        const searchQuery = decodeURIComponent(videoId);
        console.log(`Processing YouTube search query: "${searchQuery}"`);
        
        // Create a properly formatted YouTube search URL
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`;
        
        // For search queries, return placeholder data first, then backend will handle the actual search
        return {
          title: `Search: ${searchQuery}`,
          artist: 'YouTube Search Result',
          thumbnail: '/default-song-cover.jpg', // Use a default thumbnail for search queries
          platform: 'youtube',
          isPlaylist: false,
          url: searchUrl, // Send the search URL to the backend
          id: videoId, // Keep the encoded search query as ID
          isSearchQuery: true
        };
      } catch (searchError) {
        console.error('Error processing YouTube search query:', searchError);
        throw searchError;
      }
    }
    
    if (isPlaylist && playlistId) {
      let firstVideoId = videoId;
      try {
        const playlistItemsResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`);
        if (playlistItemsResponse.ok) {
           const playlistData = await playlistItemsResponse.json();
           const thumbnailUrl = playlistData.thumbnail_url;
           if (thumbnailUrl && typeof thumbnailUrl === 'string') {
             const videoIdMatch = thumbnailUrl.match(/vi\/([a-zA-Z0-9_-]{11})\//);
             if (videoIdMatch && videoIdMatch[1]) {
               firstVideoId = videoIdMatch[1];
             }
           }
        }
      } catch (itemError) {
          console.warn("Could not fetch first video details for playlist thumbnail, using fallback.", itemError);
      }

      const playlistResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`).catch(() => null);

      if (playlistResponse?.ok) {
        const data = await playlistResponse.json();
        return {
          title: data.title || 'YouTube Playlist',
          artist: data.author_name || 'Various Artists',
          thumbnail: `https://img.youtube.com/vi/${firstVideoId}/maxresdefault.jpg`,
          platform: 'youtube',
          isPlaylist: true,
          songCount: data.videos || 'Multiple',
          url: fullUrl || `https://www.youtube.com/playlist?list=${playlistId}`,
          id: playlistId
        };
      }
      
      return {
        title: 'YouTube Playlist',
        artist: 'Various Artists',
        thumbnail: `https://img.youtube.com/vi/${firstVideoId}/maxresdefault.jpg`,
        platform: 'youtube',
        isPlaylist: true,
        songCount: 'Multiple',
        url: fullUrl || `https://www.youtube.com/playlist?list=${playlistId}`,
        id: playlistId
      };
    } else {
      const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch video data');
      }

      const data = await response.json();
      
      // Clean up artist name - remove VEVO, Official, Topic, etc.
      let artistName = data.author_name || 'Unknown Artist';
      artistName = artistName
        .replace(/VEVO$/i, '')
        .replace(/Official$/i, '')
        .replace(/Topic$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      
      // Just clean up the title - removing common decorators
      let videoTitle = data.title || 'YouTube Video';
      videoTitle = videoTitle
        .replace(/\(Official Music Video\)/gi, '')
        .replace(/\(Official Video\)/gi, '')
        .replace(/\(Lyrics\)/gi, '')
        .replace(/\(Lyric Video\)/gi, '')
        .replace(/\(Audio\)/gi, '')
        .replace(/\(Official Audio\)/gi, '')
        .replace(/\[\s*HD\s*\]/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      // Simple fix for titles with duplicates: keep only content after first dash
      // This handles cases like "Artist - Artist - Song Name" by keeping only "Artist - Song Name"
      const dashIndex = videoTitle.indexOf('-');
      if (dashIndex > 0) {
        videoTitle = videoTitle.substring(dashIndex + 1).trim();
      }

      let thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      try {
          const imgResponse = await fetch(thumbnailUrl, { method: 'HEAD' });
          if (!imgResponse.ok) {
               thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
          }
      } catch (imgError) {
           thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      return {
        title: videoTitle,
        artist: artistName,
        thumbnail: thumbnailUrl,
        platform: 'youtube',
        isPlaylist: false,
        url: fullUrl || `https://www.youtube.com/watch?v=${videoId}`,
        id: videoId
      };
    }
  } catch (error) {
    console.error('Error fetching YouTube data:', error);
    throw error;
  }
}

// Fetch Spotify data (track or playlist)
export const fetchSpotifyData = async (id: string, isPlaylist: boolean, url: string, authToken?: string): Promise<MediaPreviewData> => {
  try {
    // First try the Spotify oEmbed API directly - this works without authentication
    try {
      const embedResponse = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
      
      if (embedResponse.ok) {
        const embedData = await embedResponse.json();
        console.log('Spotify embed data:', embedData);
        
        // The title is usually in format "Artist - Title" 
        if (embedData.title) {
          const parts = embedData.title.split(' - ');
          if (parts.length >= 2) {
            const artist = parts[0].trim();
            const title = parts.slice(1).join(' - ').trim();
            
            console.log(`Successfully extracted Spotify metadata from embed: Artist="${artist}", Title="${title}"`);
            
            return {
              title: title,
              artist: artist,
              thumbnail: embedData.thumbnail_url || '/default-song-cover.jpg',
              platform: 'spotify',
              isPlaylist,
              songCount: isPlaylist ? undefined : undefined,
              url,
              id
            };
          }
        }
      }
    } catch (embedError) {
      console.warn('Error fetching Spotify embed data:', embedError);
      // Continue with regular API calls
    }
    
    // If embed API didn't work, fall back to the regular API calls
    const token = authToken;
    if (!token) {
      console.warn("Authentication token missing for Spotify data fetch");
      // Extract track title from the embedded iframe when possible
      try {
        // Create a temporary iframe to get the metadata
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `https://open.spotify.com/embed/track/${id}`;
        document.body.appendChild(iframe);
        
        // Wait for iframe to load
        await new Promise(resolve => {
          iframe.onload = resolve;
          // Safety timeout
          setTimeout(resolve, 2000);
        });
        
        // Try to extract title from iframe document
        let extractedTitle = '';
        let extractedArtist = '';
        
        try {
          if (iframe.contentDocument) {
            const titleElement = iframe.contentDocument.querySelector('[data-testid="track-title"]');
            const artistElement = iframe.contentDocument.querySelector('[data-testid="track-artist"]');
            
            if (titleElement) extractedTitle = titleElement.textContent || '';
            if (artistElement) extractedArtist = artistElement.textContent || '';
            
            console.log('Extracted from iframe:', { extractedTitle, extractedArtist });
          }
        } catch (iframeError) {
          console.warn('Error accessing iframe content:', iframeError);
        }
        
        // Clean up
        document.body.removeChild(iframe);
        
        if (extractedTitle || extractedArtist) {
          return {
            title: extractedTitle || 'Track',
            artist: extractedArtist || 'Unknown Artist',
            thumbnail: '/default-song-cover.jpg',
            platform: 'spotify',
            isPlaylist,
            songCount: undefined,
            url,
            id
          };
        }
      } catch (iframeError) {
        console.warn('Error with iframe extraction:', iframeError);
      }
      
      return {
        title: 'Track',
        artist: 'Unknown Artist',
        thumbnail: '/default-song-cover.jpg',
        platform: 'spotify',
        isPlaylist,
        songCount: isPlaylist ? undefined : undefined,
        url,
        id
      };
    }

    const endpoint = isPlaylist ? 'playlists' : 'tracks';
    
    const fetchUrl = `https://songporter.onrender.com/api/songs/spotify/${endpoint}/${id}/`;
    
    console.log(`Fetching Spotify data from: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
         headers: {
            'Authorization': `Token ${token}`,
         }
    }).catch(error => {
      console.error("Network error fetching Spotify data:", error);
      return null; // Return null on network error to handle below
    });

    if (!response || !response.ok) {
        console.log(`First Spotify URL failed, trying alternate URL format...`);
        
        const altUrl = `https://songporter.onrender.com/api/songs/spotify-${isPlaylist ? 'playlist' : 'track'}/${id}/`;
        
        console.log(`Trying alternate URL: ${altUrl}`);
        const altResponse = await fetch(altUrl, {
          headers: {
              'Authorization': `Token ${token}`,
          }
        }).catch(error => {
          console.error("Network error fetching Spotify data (alt URL):", error);
          return null;
        });
        
        if (!altResponse || !altResponse.ok) {
            const thirdUrl = `https://songporter.onrender.com/api/spotify/${endpoint}/${id}/`;
            console.log(`Trying third URL format: ${thirdUrl}`);
            
            const thirdResponse = await fetch(thirdUrl, {
              headers: {
                'Authorization': `Token ${token}`,
              }
            }).catch(error => {
              console.error("Network error fetching Spotify data (third URL):", error);
              return null;
            });
            
            if (!thirdResponse || !thirdResponse.ok) {
              // If all three attempts fail, return a placeholder
              console.warn("All Spotify API endpoints failed, using fallback data");
              return {
                title: 'Track',
                artist: 'Unknown Artist',
                thumbnail: '/default-song-cover.jpg',
                platform: 'spotify',
                isPlaylist,
                songCount: isPlaylist ? undefined : undefined,
                url,
                id
              };
            }
            
            const data = await thirdResponse.json();
            return processSpotifyData(data, isPlaylist, id, url);
        }
        
        const data = await altResponse.json();
        return processSpotifyData(data, isPlaylist, id, url);
    }

    const data = await response.json();
    return processSpotifyData(data, isPlaylist, id, url);
  } catch (error) {
    console.error('Error in fetchSpotifyData:', error);
    
    return {
      title: 'Track',
      artist: 'Unknown Artist',
      thumbnail: '/default-song-cover.jpg',
      platform: 'spotify',
      isPlaylist,
      songCount: isPlaylist ? undefined : undefined,
      url,
      id
    };
  }
}

// Process Spotify API response data
export const processSpotifyData = (data: any, isPlaylist: boolean, id: string, url: string): MediaPreviewData => {
    // Log the full data structure to debug what's available
    console.log('Raw Spotify data received:', JSON.stringify(data, null, 2));
    
    // For tracks, look for specific track properties based on Spotify API response
    if (!isPlaylist && data) {
      // Get proper song title
      let title = data.name;
      
      // Get all artists if available
      let artist = '';
      if (data.artists && Array.isArray(data.artists) && data.artists.length > 0) {
        artist = data.artists.map((a: any) => a.name).join(', ');
      } else if (data.artist && data.artist.name) {
        // Some endpoints return artist in a different format
        artist = data.artist.name;
      }
      
      // Get album info if available
      let albumName = '';
      if (data.album && data.album.name) {
        albumName = data.album.name;
      }
      
      // For song titles that are just generic names like "Track" or numbers, 
      // enhance with album name if available
      if (title && (title.length < 3 || /^track\s*\d*$/i.test(title)) && albumName) {
        title = `${title} (${albumName})`;
      }
      
      console.log('Processed Spotify track data:', { title, artist, albumName, id });
      
      // If we still don't have a good title, try to extract it from the URL
      if (!title || title === 'Spotify Track' || title === 'Track') {
        // Try to parse the URL to get more info
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/');
          if (pathParts.length > 2 && pathParts[1] === 'track') {
            // Make a more informative title using the track ID
            title = 'Untitled Track';
          }
        } catch (e) {
          console.error('Error parsing Spotify URL:', e);
        }
      }
      
      return {
        title: title || 'Untitled Track',
        artist: artist || 'Unknown Artist',
        thumbnail: data.album?.images?.[0]?.url || '/default-song-cover.jpg',
        platform: 'spotify',
        isPlaylist,
        songCount: undefined,
        url,
        id: data.id || id
      };
    }
    
    // Handle playlists
    if (isPlaylist && data) {
      return {
        title: data.name || 'Spotify Playlist',
        artist: data.owner?.display_name || 'Various Artists',
        thumbnail: data.images?.[0]?.url || '/default-song-cover.jpg',
        platform: 'spotify',
        isPlaylist,
        songCount: data.tracks?.total,
        url,
        id: data.id || id
      };
    }
    
    // Fallback for invalid or incomplete data
    return {
      title: data?.name || (isPlaylist ? 'Playlist' : 'Track'),
      artist: isPlaylist ? (data?.owner?.display_name || 'Various Artists') : 
                        (data?.artists?.map((a: { name: string }) => a.name).join(', ') || 'Unknown Artist'),
      thumbnail: isPlaylist ? (data?.images?.[0]?.url || '/default-song-cover.jpg') : 
                           (data?.album?.images?.[0]?.url || '/default-song-cover.jpg'),
      platform: 'spotify',
      isPlaylist,
      songCount: isPlaylist ? data?.tracks?.total : undefined,
      url,
      id: data?.id || id
    };
}

// Format filenames consistently
export const generateFilename = (preview: MediaPreviewData, format: string): string => {
  const extension = preview.isPlaylist ? 'zip' : format;
  
  // Start with the title, clean it up first
  let title = preview.title
    .replace(/\(Official Music Video\)/gi, '')
    .replace(/\(Official Video\)/gi, '')
    .replace(/\(Lyrics\)/gi, '')
    .replace(/\(Lyric Video\)/gi, '')
    .replace(/\(Audio\)/gi, '')
    .replace(/\(Official Audio\)/gi, '')
    .replace(/\[\s*HD\s*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  // For Spotify with missing title, use just "Track" without platform name
  if (preview.platform === 'spotify' && 
     (title === 'Spotify Track' || title === 'Spotify Playlist')) {
    title = preview.isPlaylist ? 'Playlist' : 'Track';
  }
  
  // Add artist if available (except for playlists)
  let filename = title;
  if (preview.artist && preview.artist !== '💿' && !preview.isPlaylist) {
    filename = `${preview.artist} - ${title}`;
  }
  
  // Clean up any invalid characters
  filename = filename.replace(/[/\\?%*:|"<>]/g, '-');
  
  return `${filename}.${extension}`;
}

// Clean up filename for better readability
export const cleanupFilename = (filename: string, preview: MediaPreviewData): string => {
  // If it's a YouTube video, remove common unnecessary text patterns
  if (preview.platform === 'youtube' && !preview.isPlaylist) {
    filename = filename
      .replace(/\(Official Music Video\)/gi, '')
      .replace(/\(Official Video\)/gi, '')
      .replace(/\(Lyrics\)/gi, '')
      .replace(/\(Lyric Video\)/gi, '')
      .replace(/\(Audio\)/gi, '')
      .replace(/\(Official Audio\)/gi, '')
      .replace(/\[\s*HD\s*\]/gi, '')
      .replace(/\s{2,}/g, ' ') // Remove extra spaces
      .trim();
  }
  
  return filename;
}

// Helper functions for playlist downloading
export interface PlaylistDownloadResponse {
  message: string;
  playlist_id: number;
  total_tracks: number;
  downloaded_tracks: number;
}

// Function to get the playlist download endpoint for a playlist ID
export const getPlaylistDownloadEndpoint = (playlistId: number | string): string => {
  return `https://songporter.onrender.com/api/songs/playlists/${playlistId}/download-all/`;
};

// Extracts metadata from response headers
export const extractMetadataFromHeaders = (headers: Headers): { 
  title?: string; 
  artist?: string; 
  album?: string; 
  duration?: string;
} => {
  // Get metadata from headers and log all headers
  const allHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    allHeaders[key] = value;
  });
  console.log('All response headers:', allHeaders);
  
  const songTitle = headers.get('x-song-title');
  const songArtist = headers.get('x-song-artist');
  const songAlbum = headers.get('x-album-name');
  const songDuration = headers.get('x-duration');
  
  console.log('Extracted metadata from headers:', { 
    songTitle, 
    songArtist, 
    songAlbum, 
    songDuration 
  });
  
  return {
    title: songTitle || undefined,
    artist: songArtist || undefined,
    album: songAlbum || undefined,
    duration: songDuration || undefined
  };
};