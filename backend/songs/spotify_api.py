import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from django.conf import settings
from urllib.parse import urlparse, parse_qs
import logging

logger = logging.getLogger(__name__)

def get_spotify_client():
    """
    Create and return a properly configured Spotify client.
    """
    try:
        logger.info("Creating Spotify client with credentials from settings")
        client_credentials_manager = SpotifyClientCredentials(
            client_id=settings.SPOTIFY_CLIENT_ID,
            client_secret=settings.SPOTIFY_CLIENT_SECRET
        )
        sp = spotipy.Spotify(client_credentials_manager=client_credentials_manager)
        
        # Test the client with a simple API call
        try:
            sp.artist('0OdUWJ0sBjDrqHygGUXeCF')  # Test with Arcade Fire's ID
            logger.info("Successfully tested Spotify client")
        except Exception as e:
            logger.warning(f"Spotify client test failed: {e}")
            
        return sp
    except Exception as e:
        logger.error(f"Failed to create Spotify client: {e}", exc_info=True)
        # Return a client anyway to avoid breaking callers
        return spotipy.Spotify(client_credentials_manager=SpotifyClientCredentials(
            client_id=settings.SPOTIFY_CLIENT_ID,
            client_secret=settings.SPOTIFY_CLIENT_SECRET
        ))
 
def extract_spotify_id(spotify_url):
    """
    Extract Spotify ID and resource type from a full Spotify URL.
    
    Args:
        spotify_url (str): Spotify URL (track, album, playlist, etc.)
        
    Returns:
        tuple: (resource_type, spotify_id) where resource_type is 'track', 'playlist', 'album', etc.
    """
    logger.info(f"Extracting Spotify ID from URL: {spotify_url}")
    parsed_url = urlparse(spotify_url)
    
    # Handle different URL formats
    if 'spotify.com' in parsed_url.netloc:
        # Remove query parameters and split path
        path_segments = parsed_url.path.split('/')
        
        # Need at least 3 segments: ['', 'resource_type', 'id']
        if len(path_segments) >= 3:
            resource_type = path_segments[1]  # track, album, playlist, etc.
            spotify_id = path_segments[2].split('?')[0]  # Remove query params
            
            logger.info(f"Extracted Spotify {resource_type} ID: {spotify_id}")
            return resource_type, spotify_id
            
    logger.error(f"Could not extract ID from Spotify URL: {spotify_url}")
    return None, None

def get_playlist_tracks(playlist_url):
    """Get detailed track information from a Spotify playlist URL."""
    logger.info(f"Getting playlist tracks for URL: {playlist_url}")
    
    resource_type, playlist_id = extract_spotify_id(playlist_url)
    if not playlist_id or resource_type != 'playlist':
        raise ValueError("Invalid Spotify playlist URL")
    
    logger.info(f"Extracted Playlist ID: {playlist_id}")
    sp = get_spotify_client()
    
    try:
        results = sp.playlist_tracks(playlist_id, limit=20, offset=0)
        logger.info(f"Initial results from Spotify API: {len(results['items'])} tracks")
        tracks = results['items']
        
        # Get all tracks through pagination
        while results['next']:
            results = sp.next(results)
            tracks.extend(results['items'])

        # Extract required track details
        track_details = []
        for track in tracks:
            track_data = track['track']
            if not track_data:  # Skip empty tracks
                continue
                
            # Get album details
            album = track_data['album']
            
            # Get image URL (use the largest available)
            image_url = None
            if album['images']:
                image_url = album['images'][0]['url']
            
            # Get release year
            release_year = None
            if 'release_date' in album:
                release_year = album['release_date'][:4]
            
            # Get track details
            track_details.append({
                'title': track_data['name'],
                'artist': track_data['artists'][0]['name'],
                'album': album['name'],
                'spotify_id': track_data['id'],
                'image_url': image_url,
                'year': release_year,
                'genre': 'Unknown'  # Spotify doesn't provide genre at track level
            })
            
        logger.info(f"Processed {len(track_details)} tracks from playlist")
        return track_details
        
    except Exception as e:
        logger.error(f"Error during Spotify API interaction: {str(e)}")
        raise


def get_track_info(track_url):
    """Get track information from a Spotify track URL."""
    resource_type, track_id = extract_spotify_id(track_url)
    if not track_id or resource_type != 'track':
        raise ValueError(f"Invalid Spotify track URL or not a track: {track_url}")
    
    logger.info(f"Getting info for Spotify track ID: {track_id}")
    sp = get_spotify_client()
    
    try:
        track = sp.track(track_id)
        
        # Get album details
        album = track['album']
        
        # Get image URL (use the largest available)
        image_url = None
        if album['images']:
            image_url = album['images'][0]['url']
        
        # Get release year
        release_year = None
        if 'release_date' in album:
            release_year = album['release_date'][:4]
        
        # Try to get artist genres
        artist_id = track['artists'][0]['id']
        artist_info = sp.artist(artist_id)
        genres = artist_info.get('genres', ['Unknown'])
        genre = genres[0] if genres else 'Unknown'
        
        track_info = {
            'title': track['name'],
            'artist': track['artists'][0]['name'],
            'album': album['name'],
            'spotify_id': track['id'],
            'image_url': image_url,
            'year': release_year,
            'genre': genre
        }
        
        logger.info(f"Got track info: {track_info['title']} by {track_info['artist']}")
        return track_info
    
    except Exception as e:
        logger.error(f"Error getting Spotify track info: {e}", exc_info=True)
        raise

def get_playlist_info(playlist_url):
    """
    Get comprehensive playlist information including title, description, and all track URLs.
    Works with both Spotify and YouTube playlists.
    """
    # For Spotify playlists
    if 'spotify.com' in playlist_url:
        resource_type, playlist_id = extract_spotify_id(playlist_url)
        if not playlist_id or resource_type != 'playlist':
            raise ValueError("Invalid Spotify playlist URL")
            
        logger.info(f"Getting Spotify playlist info for ID: {playlist_id}")
        sp = get_spotify_client()
        
        try:
            # Get playlist metadata
            playlist_data = sp.playlist(playlist_id)
            
            # Get basic info
            playlist_info = {
                'title': playlist_data['name'],
                'description': playlist_data.get('description', ''),
                'owner': playlist_data['owner']['display_name'],
                'image_url': playlist_data['images'][0]['url'] if playlist_data['images'] else None,
                'track_count': playlist_data['tracks']['total'],
                'track_urls': []
            }
            
            # Get all tracks
            results = sp.playlist_tracks(playlist_id)
            tracks = results['items']
            
            # Paginate if needed
            while results['next']:
                results = sp.next(results)
                tracks.extend(results['items'])
            
            # Extract track URLs
            for track in tracks:
                track_data = track.get('track')
                if track_data:
                    track_url = f"https://open.spotify.com/track/{track_data['id']}"
                    playlist_info['track_urls'].append(track_url)
            
            logger.info(f"Extracted {len(playlist_info['track_urls'])} track URLs from playlist")
            return playlist_info
            
        except Exception as e:
            logger.error(f"Error getting Spotify playlist info: {e}", exc_info=True)
            raise
    
    # For YouTube playlists
    elif 'youtube.com' in playlist_url or 'youtu.be' in playlist_url:
        from .utils import get_youtube_playlist_info
        return get_youtube_playlist_info(playlist_url)
    
    else:
        raise ValueError("Unsupported playlist URL. Only Spotify and YouTube playlists are supported.")

