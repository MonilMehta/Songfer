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
    """Extract Spotify ID from a full Spotify URL."""
    print("Extracting Spotify ID from URL:", spotify_url)
    parsed_url = urlparse(spotify_url)
    
    # Handle different URL formats
    if 'spotify.com' in parsed_url.netloc:
        # Remove query parameters and split path
        path_segments = parsed_url.path.split('/')
        # The ID is usually the last segment
        return path_segments[-1].split('?')[0]
    return None

def get_playlist_tracks(playlist_url):
    print("Getting playlist tracks for URL:", playlist_url)
    playlist_id = extract_spotify_id(playlist_url)
    if not playlist_id:
        raise ValueError("Invalid Spotify playlist URL")
    
    print("Extracted Playlist ID:", playlist_id)
    sp = get_spotify_client()
    
    try:
        results = sp.playlist_tracks(playlist_id,limit=20, offset=0)
        print("Initial results from Spotify API:", results)
        tracks = results['items']
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
            
        return track_details
    except Exception as e:
        print("Error during Spotify API interaction:", str(e))
        raise


def get_track_info(track_url):
    """Get track information from a Spotify track URL."""
    track_id = extract_spotify_id(track_url)
    if not track_id:
        raise ValueError("Invalid Spotify track URL")
    print(track_id)
        
    sp = get_spotify_client()
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
    
    return {
        'title': track['name'],
        'artist': track['artists'][0]['name'],
        'album': album['name'],
        'spotify_id': track['id'],
        'image_url': image_url,
        'year': release_year,
        'genre': genre
    }

