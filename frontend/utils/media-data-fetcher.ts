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
  searchResults?: MediaPreviewData[] // Added to store multiple search results
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

// Ensure cleanYouTubeTitle helper function is defined or imported in this file
// (Adding a basic version here if it wasn't already present)
const cleanYouTubeTitle = (title: string | undefined, artist: string | undefined): string => {
  if (!title) return 'Untitled Track';
  let cleanedTitle = title;
  // Basic cleaning, assuming the more complex logic exists elsewhere or is added here
  cleanedTitle = cleanedTitle
    .replace(/\(Official Music Video\)/gi, '')
    .replace(/\(Official Video\)/gi, '')
    .replace(/\(Lyrics\)/gi, '')
    .replace(/\(Lyric Video\)/gi, '')
    .replace(/\(Audio\)/gi, '')
    .replace(/\(Official Audio\)/gi, '')
    .replace(/\[\s*HD\s*\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (artist) {
      // Remove duplicate artist pattern like "Artist - Artist - Title"
      // Escape special regex characters in artist name
      const escapedArtist = artist.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const doubleArtistPattern = new RegExp(`^${escapedArtist}\\s*-\\s*${escapedArtist}\\s*-`, 'i');
      if (doubleArtistPattern.test(cleanedTitle)) {
        cleanedTitle = cleanedTitle.replace(doubleArtistPattern, `${artist} -`);
      }
      // Simpler check for "Any Name - Same Name - Title"
      const duplicateArtistPatternSimple = /^([^-]+)\s*-\s*\1\s*-/i;
      const match = cleanedTitle.match(duplicateArtistPatternSimple);
      if (match) {
        const repeatedPart = match[1].trim();
        // Only replace if the repeated part is reasonably long to avoid accidental replacements
        if (repeatedPart.length > 2) {
           cleanedTitle = cleanedTitle.replace(duplicateArtistPatternSimple, `${repeatedPart} -`);
        }
      }
  }
  return cleanedTitle;
};


// Fetch YouTube data (video or playlist)
export const fetchYouTubeData = async (videoId: string, isPlaylist: boolean, playlistId?: string, fullUrl?: string): Promise<MediaPreviewData> => {
  // IMPORTANT: Access API key from environment variables
  const YOUTUBE_API_KEY = process.env.NEXT_PUBLIC_YOUTUBE;

  try {
    // Check if it's identified as a search query from the URL flag
    const urlParams = new URLSearchParams(fullUrl?.split('?')[1]);
    const isSearchQuery = urlParams.get('isSearchQuery') === 'true';

    if (isSearchQuery) {
      if (!YOUTUBE_API_KEY) {
        console.error("YouTube API Key is missing. Please set NEXT_PUBLIC_YOUTUBE environment variable.");
        throw new Error("YouTube API Key is missing.");
      }
      const searchQuery = decodeURIComponent(videoId); // videoId contains the search query here
      console.log(`Performing YouTube API search for: "${searchQuery}"`);

      const searchApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&maxResults=5&key=${YOUTUBE_API_KEY}`;

      const searchResponse = await fetch(searchApiUrl);
      if (!searchResponse.ok) {
        const errorData = await searchResponse.json();
        console.error('YouTube API search error:', errorData);
        throw new Error(`YouTube API search failed: ${errorData.error?.message || searchResponse.statusText}`);
      }
      const searchData = await searchResponse.json();
      console.log('YouTube API search results:', searchData);
      if (!searchData.items || searchData.items.length === 0) {
        throw new Error(`No YouTube video results found for "${searchQuery}"`);
      }

      const firstResult = searchData.items[0];
      const resultVideoId = firstResult.id.videoId;
      const resultSnippet = firstResult.snippet;

      // Clean title and artist similar to how it's done for direct URLs
      let artistName = resultSnippet.channelTitle || 'Unknown Artist';
      artistName = artistName.replace(/VEVO$/i, '').replace(/Official$/i, '').replace(/Topic$/i, '').replace(/\s{2,}/g, ' ').trim();

      let videoTitle = resultSnippet.title || 'YouTube Video';
      // Apply the title cleaning logic (assuming cleanYouTubeTitle is available)
      videoTitle = cleanYouTubeTitle(videoTitle, artistName);

      let thumbnailUrl = resultSnippet.thumbnails?.high?.url || resultSnippet.thumbnails?.medium?.url || resultSnippet.thumbnails?.default?.url || '/default-song-cover.jpg';

      console.log(`YouTube API search found video: ID=${resultVideoId}, Title=${videoTitle}, Artist=${artistName}`);

      // Process all search results
      const allSearchResults: MediaPreviewData[] = searchData.items.map((item: any) => {
        const itemVideoId = item.id.videoId;
        const itemSnippet = item.snippet;
        
        let itemArtistName = itemSnippet.channelTitle || 'Unknown Artist';
        itemArtistName = itemArtistName.replace(/VEVO$/i, '').replace(/Official$/i, '').replace(/Topic$/i, '').replace(/\s{2,}/g, ' ').trim();
        
        let itemVideoTitle = itemSnippet.title || 'YouTube Video';
        itemVideoTitle = cleanYouTubeTitle(itemVideoTitle, itemArtistName);
        
        let itemThumbnailUrl = itemSnippet.thumbnails?.high?.url || 
                          itemSnippet.thumbnails?.medium?.url || 
                          itemSnippet.thumbnails?.default?.url || 
                          '/default-song-cover.jpg';
        
        return {
          title: itemVideoTitle,
          artist: itemArtistName,
          thumbnail: itemThumbnailUrl,
          platform: 'youtube',
          isPlaylist: false,
          url: `https://www.youtube.com/watch?v=${itemVideoId}`,
          id: itemVideoId
        };
      });

      // Return data for the *found video*, not the search query itself, but include all results
      return {
        title: videoTitle,
        artist: artistName,
        thumbnail: thumbnailUrl,
        platform: 'youtube',
        isPlaylist: false,
        // Use the actual video URL for the preview and download
        url: `https://www.youtube.com/watch?v=${resultVideoId}`,
        id: resultVideoId, // Use the actual video ID now
        // No longer need isSearchQuery flag here, as we resolved it to a video
        searchResults: allSearchResults // Include all search results
      };
    }

    // --- Existing logic for Playlists and direct Video URLs ---
    if (isPlaylist && playlistId) {
      // ...existing playlist logic...
      let firstVideoId = videoId; // This might be the playlist ID itself if 'v' wasn't present
      let playlistSongCount: number | undefined = undefined; // Initialize song count

      try {
        const playlistItemsResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`);
        if (playlistItemsResponse.ok) {
           const playlistData = await playlistItemsResponse.json();
           const thumbnailUrl = playlistData.thumbnail_url;
           if (thumbnailUrl && typeof thumbnailUrl === 'string') {
             const videoIdMatch = thumbnailUrl.match(/vi\/([a-zA-Z0-9_-]{11})\//);
             if (videoIdMatch && videoIdMatch[1]) {
               firstVideoId = videoIdMatch[1]; // Use first video's ID for thumbnail
             }
           }
           // Attempt to get song count from noembed data if available
           if (playlistData.videos && typeof playlistData.videos === 'number') {
               playlistSongCount = playlistData.videos;
           }
        }
      } catch (itemError) {
          console.warn("Could not fetch first video details for playlist thumbnail, using fallback.", itemError);
          // If fetching first video fails, try using the playlist ID itself for thumbnail (might work)
          firstVideoId = playlistId;
      }

      const playlistResponse = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/playlist?list=${playlistId}`).catch(() => null);

      if (playlistResponse?.ok) {
        const data = await playlistResponse.json();
        // Update song count if not already found and available in this response
        if (playlistSongCount === undefined && data.videos && typeof data.videos === 'number') {
            playlistSongCount = data.videos;
        }
        return {
          title: data.title || 'YouTube Playlist',
          artist: data.author_name || 'Various Artists',
          // Use firstVideoId (either from thumbnail URL or playlist ID as fallback)
          thumbnail: `https://img.youtube.com/vi/${firstVideoId}/maxresdefault.jpg`,
          platform: 'youtube',
          isPlaylist: true,
          songCount: playlistSongCount, // Use the determined song count (number or undefined)
          url: fullUrl || `https://www.youtube.com/playlist?list=${playlistId}`,
          id: playlistId
        };
      }

      // Fallback if noembed fails for playlist
      return {
        title: 'YouTube Playlist',
        artist: 'Various Artists',
        thumbnail: `https://img.youtube.com/vi/${firstVideoId}/maxresdefault.jpg`, // Use best guess for thumbnail
        platform: 'youtube',
        isPlaylist: true,
        songCount: undefined, // Set to undefined in fallback
        url: fullUrl || `https://www.youtube.com/playlist?list=${playlistId}`,
        id: playlistId
      };
    } else {
      // --- Existing Direct Video URL Logic (using noembed) ---
      const response = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);

      if (!response.ok) {
        // If noembed fails for a direct video ID, it's likely invalid
        console.warn(`noembed fetch failed for video ID: ${videoId}.`);
        throw new Error(`Could not fetch data for YouTube video ID: ${videoId}`);
      }

      // If noembed succeeds, process as video
      const data = await response.json();

      // ... existing video data cleaning ...
      let artistName = data.author_name || 'Unknown Artist';
      artistName = artistName
        .replace(/VEVO$/i, '')
        .replace(/Official$/i, '')
        .replace(/Topic$/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      let videoTitle = data.title || 'YouTube Video';
      // Apply cleaning
      videoTitle = cleanYouTubeTitle(videoTitle, artistName);

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
    // Provide a more specific error based on the context
    const urlParams = new URLSearchParams(fullUrl?.split('?')[1]);
    const isSearchQueryFlag = urlParams.get('isSearchQuery') === 'true';
    const originalInput = isSearchQueryFlag ? decodeURIComponent(videoId) : videoId;

    // Rethrow a user-friendly error
    throw new Error(`Failed to get YouTube data for "${originalInput}": ${error instanceof Error ? error.message : String(error)}`);
  }
}


// Fetch Spotify data (track or playlist) - Relies only on oEmbed
export const fetchSpotifyData = async (id: string, isPlaylist: boolean, url: string): Promise<MediaPreviewData> => {
  try {
    // Use the Spotify oEmbed API directly - this works without authentication
    const embedResponse = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);

    if (embedResponse.ok) {
      const embedData = await embedResponse.json();
      console.log('Spotify embed data:', embedData);

      let title = 'Unknown Title';
      let artist = 'Unknown Artist';
      const thumbnail = embedData.thumbnail_url || '/default-song-cover.jpg';
      let songCount: number | undefined = undefined; // Initialize songCount

      if (embedData.title) {
        if (isPlaylist) {
          // For playlists, the title is usually just the playlist name
          title = embedData.title;
          // Artist might not be directly available, use provider name or fallback
          artist = embedData.provider_name || 'Various Artists'; // Or potentially parse from description if needed
          // Song count isn't available from oEmbed for playlists
          songCount = undefined; // Explicitly set as undefined for playlists from oEmbed
        } else {
          // For tracks, the title is usually in format "Artist - Title"
          const parts = embedData.title.split(' - ');
          if (parts.length >= 2) {
            artist = parts[0].trim();
            title = parts.slice(1).join(' - ').trim();
          } else {
            // Fallback if title format is unexpected
            title = embedData.title;
          }
        }
        console.log(`Successfully extracted Spotify metadata from embed: Artist="${artist}", Title="${title}"`);
      } else {
         // Fallback if embedData.title is missing
         title = isPlaylist ? 'Spotify Playlist' : 'Spotify Track';
      }


      return {
        title: title,
        artist: artist,
        thumbnail: thumbnail,
        platform: 'spotify',
        isPlaylist,
        songCount: songCount, // Use the determined songCount
        url,
        id
      };
    } else {
      // oEmbed fetch failed
      console.warn(`Spotify oEmbed fetch failed for URL: ${url}. Status: ${embedResponse.status}`);
      // Return fallback data if oEmbed fails
      return {
        title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
        artist: 'Unknown Artist',
        thumbnail: '/default-song-cover.jpg',
        platform: 'spotify',
        isPlaylist,
        songCount: undefined,
        url,
        id
      };
    }
  } catch (error) {
    console.error('Error fetching or processing Spotify oEmbed data:', error);
    // Return fallback data on any other error
    return {
      title: isPlaylist ? 'Spotify Playlist' : 'Spotify Track',
      artist: 'Unknown Artist',
      thumbnail: '/default-song-cover.jpg',
      platform: 'spotify',
      isPlaylist,
      songCount: undefined,
      url,
      id
    };
  }
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

// Clean up filename for better readability (This seems redundant with generateFilename, consider merging)
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