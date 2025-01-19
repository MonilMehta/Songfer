import os
import tempfile
import zipfile
from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.files.temp import NamedTemporaryFile
import yt_dlp
import logging
import requests
from .models import Song, Playlist
from .spotify_api import get_track_info, get_spotify_client, get_playlist_tracks

logger = logging.getLogger(__name__)
User = get_user_model()

def embed_metadata(filename, track_info, thumbnail_url=None):
    """Helper function to embed metadata and thumbnail in MP3 file"""
    try:
        from mutagen.mp3 import MP3
        from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, error

        # Add ID3 tag if it doesn't exist
        try:
            audio = MP3(filename, ID3=ID3)
        except error:
            audio = MP3(filename)
            audio.add_tags()

        # Add metadata
        if thumbnail_url:
            response = requests.get(thumbnail_url)
            audio.tags.add(
                APIC(
                    encoding=3,
                    mime='image/jpeg',
                    type=3,
                    desc='Cover',
                    data=response.content
                )
            )

        audio.tags.add(TIT2(encoding=3, text=track_info['title']))
        audio.tags.add(TPE1(encoding=3, text=track_info['artist']))
        audio.tags.add(TALB(encoding=3, text=track_info.get('album', 'Unknown')))
        audio.save()

    except Exception as e:
        logger.error(f"Error embedding metadata: {e}", exc_info=True)

def download_audio(query, output_path, is_url=False):
    """Helper function to download audio using yt-dlp"""
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_path,
        'default_search': 'ytsearch' if not is_url else None,
        'nooverwrites': True,
        'no_color': True
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        if is_url:
            info = ydl.extract_info(query, download=True)
        else:
            info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
        
        return info

@shared_task
def download_song(song_info, user_id, playlist_id=None):
    """
    Celery task to download a song from Spotify or YouTube search
    """
    try:
        user = User.objects.get(id=user_id)
        
        # Get track info
        if isinstance(song_info, str):
            track_info = get_track_info(song_info)
        else:
            track_info = song_info

        # Create temporary directory for download
        with tempfile.TemporaryDirectory() as temp_dir:
            # Prepare paths
            filename = f"{track_info['title']} - {track_info['artist']}.mp3"
            safe_filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '.'))
            output_path = os.path.join(temp_dir, safe_filename)

            # Download audio
            query = f"{track_info['title']} {track_info['artist']}"
            info = download_audio(query, output_path)

            # Embed metadata
            embed_metadata(output_path, track_info, track_info.get('image_url'))

            # Save to media directory
            media_path = os.path.join('songs', safe_filename)
            final_path = os.path.join(settings.MEDIA_ROOT, media_path)
            os.makedirs(os.path.dirname(final_path), exist_ok=True)
            os.replace(output_path, final_path)

            # Create Song object
            song = Song.objects.create(
                user=user,
                title=track_info['title'],
                artist=track_info['artist'],
                album=track_info.get('album', 'Unknown'),
                file=media_path,
                source='spotify' if 'spotify_id' in track_info else 'youtube',
                spotify_id=track_info.get('spotify_id'),
                song_url=song_info if isinstance(song_info, str) else None
            )

            # Handle album artwork
            if track_info.get('image_url'):
                img_temp = NamedTemporaryFile(delete=True)
                img_temp.write(requests.get(track_info['image_url']).content)
                img_temp.flush()
                
                upload_result = cloudinary.uploader.upload(
                    img_temp.name,
                    public_id=f"songs/{track_info['title']}"
                )
                song.image = upload_result['secure_url']
                song.save()

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
def download_youtube_playlist(url, user_id):
    """
    Celery task to download a YouTube playlist
    """
    try:
        user = User.objects.get(id=user_id)
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # Download playlist info
            info = download_audio(url, os.path.join(temp_dir, '%(title)s.%(ext)s'), is_url=True)
            
            # Create playlist
            playlist = Playlist.objects.create(
                user=user,
                name=info.get('title', 'YouTube Playlist'),
                source="youtube",
                source_url=url
            )

            # Process each video
            for entry in info['entries']:
                if entry is None:
                    continue
                
                track_info = {
                    'title': entry['title'],
                    'artist': entry.get('uploader', 'Unknown Artist'),
                    'album': entry.get('album', 'Unknown'),
                    'image_url': entry.get('thumbnail')
                }
                
                download_song.delay(track_info, user_id=user.id, playlist_id=playlist.id)

            return playlist.id

    except Exception as e:
        logger.error(f"Error downloading YouTube playlist: {str(e)}", exc_info=True)
        return None

@shared_task
def download_spotify_playlist(playlist_url, user_id):
    """
    Celery task to download a Spotify playlist
    """
    try:
        user = User.objects.get(id=user_id)
        playlist_tracks = get_playlist_tracks(playlist_url)
        
        playlist = Playlist.objects.create(
            user=user,
            name=f"Spotify Playlist {playlist_url.split('/')[-1].split('?')[0]}",
            source="spotify",
            source_url=playlist_url
        )

        for track in playlist_tracks:
            download_song.delay(track, user_id=user.id, playlist_id=playlist.id)

        return playlist.id

    except Exception as e:
        logger.error(f"Error downloading Spotify playlist: {str(e)}", exc_info=True)
        return None