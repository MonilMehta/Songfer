import os
from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
import yt_dlp
import logging
from .models import Song, Playlist
from .spotify_api import get_track_info, get_spotify_client, get_playlist_tracks
import spotipy

logger = logging.getLogger(__name__)
User = get_user_model()

@shared_task
def download_song(song_info, user_id, playlist_id=None):
    """
    Celery task to download a song from Spotify or YouTube search
    
    Args:
        song_info (dict): Dictionary containing song details
        user_id (int): ID of the user downloading the song
        playlist_id (int, optional): ID of the playlist to associate the song with
    """
    try:
        # Retrieve the user
        user = User.objects.get(id=user_id)
        
        # Determine song details
        if isinstance(song_info, str):
            # If song_info is a Spotify track URL
            track_info = get_track_info(song_info)
        else:
            # If song_info is a dictionary with track details
            track_info = song_info
        
        # Prepare download query
        query = f"{track_info['title']} {track_info['artist']}"
        
        # YouTube download options
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
            'default_search': 'ytsearch',
            'nooverwrites': True,
            'no_color': True
        }

        # Download song using yt-dlp
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
            filename = ydl.prepare_filename(info)
            filename = os.path.splitext(filename)[0] + '.mp3'

        # Create Song object
        song = Song.objects.create(
            user=user,
            title=track_info['title'],
            artist=track_info['artist'],
            album=track_info.get('album', 'Unknown'),
            file=os.path.relpath(filename, settings.MEDIA_ROOT),
            source='youtube',
            spotify_id=track_info.get('spotify_id')
        )

        # Associate with playlist if provided
        if playlist_id:
            playlist = Playlist.objects.get(id=playlist_id)
            playlist.songs.add(song)

        logger.info(f"Successfully downloaded song: {song.title} by {song.artist}")
        return song.id

    except Exception as e:
        logger.error(f"Error downloading song: {str(e)}", exc_info=True)
        return None

@shared_task
def download_spotify_playlist(playlist_url, user_id):
    """
    Celery task to download an entire Spotify playlist
    
    Args:
        playlist_url (str): Spotify playlist URL
        user_id (int): ID of the user downloading the playlist
    """
    try:
        # Retrieve the user
        user = User.objects.get(id=user_id)
        
        # Get Spotify client and playlist tracks
        client = get_spotify_client()
        playlist_id = playlist_url.split("/")[-1].split("?")[0]
        playlist_tracks = get_playlist_tracks(playlist_id)

        # Create Playlist object
        playlist = Playlist.objects.create(
            user=user,
            name=f"Spotify Playlist {playlist_id}",
            source="spotify",
            source_url=playlist_url
        )

        # Trigger individual song downloads
        for track in playlist_tracks:
            download_song.delay(track, user_id=user.id, playlist_id=playlist.id)

        return playlist.id

    except Exception as e:
        logger.error(f"Error downloading Spotify playlist: {str(e)}", exc_info=True)
        return None