import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from django.conf import settings
from urllib.parse import urlparse, parse_qs


def get_spotify_client():
    client_credentials_manager = SpotifyClientCredentials(
        client_id=settings.SPOTIFY_CLIENT_ID,
        client_secret=settings.SPOTIFY_CLIENT_SECRET
    )
    return spotipy.Spotify(client_credentials_manager=client_credentials_manager)

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
        return [
            {
                'title': track['track']['name'],
                'artist': track['track']['artists'][0]['name'],
                'album': track['track']['album']['name'],
                'spotify_id': track['track']['id']
            }
            for track in tracks
        ]
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
    return {
        'title': track['name'],
        'artist': track['artists'][0]['name'],
        'album': track['album']['name'],
        'spotify_id': track['id']
    }

