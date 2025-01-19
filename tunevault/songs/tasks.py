import os
import tempfile
import zipfile
from celery import shared_task, current_task
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files import File
from django.core.files.temp import NamedTemporaryFile
import yt_dlp
import logging
import requests
from datetime import datetime, timedelta
from .models import Song, Playlist, DownloadProgress
from .spotify_api import get_playlist_tracks,get_spotify_client,get_track_info

logger = logging.getLogger(__name__)
User = get_user_model()

class ProgressHook:
    def __init__(self, task_id):
        self.task_id = task_id
        self.progress = DownloadProgress.objects.create(
            task_id=task_id,
            total_items=1,
            started_at=datetime.now()
        )

    def __call__(self, d):
        if d['status'] == 'downloading':
            try:
                downloaded = d.get('downloaded_bytes', 0)
                total = d.get('total_bytes', 0)
                if total > 0:
                    percentage = (downloaded / total) * 100
                    self.progress.current_progress = percentage
                    self.progress.current_file = d.get('filename', '')
                    
                    # Calculate estimated time
                    if percentage > 0:
                        elapsed = datetime.now() - self.progress.started_at
                        estimated_total = elapsed * (100 / percentage)
                        self.progress.estimated_completion_time = (
                            self.progress.started_at + estimated_total
                        )
                    
                    self.progress.save()
            except Exception as e:
                logger.error(f"Error updating progress: {e}")

def download_audio(query, output_path, task_id, is_url=False):
    """Helper function to download audio using yt-dlp"""
    progress_hook = ProgressHook(task_id)
    
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
        'no_color': True,
        'progress_hooks': [progress_hook],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        if is_url:
            info = ydl.extract_info(query, download=True)
        else:
            info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
        
        return info

@shared_task(bind=True)
def download_song(self, song_info, user_id, playlist_id=None):
    """
    Celery task to download a song from Spotify or YouTube search
    """
    try:
        # Initialize progress tracking
        progress = DownloadProgress.objects.create(
            task_id=self.request.id,
            total_items=1,
            started_at=datetime.now()
        )
        
        user = User.objects.get(id=user_id)
        
        # Get track info
        if isinstance(song_info, str):
            track_info = get_track_info(song_info)
        else:
            track_info = song_info

        progress.current_file = f"{track_info['title']} - {track_info['artist']}"
        progress.save()

        # Create temporary directory for download
        with tempfile.TemporaryDirectory() as temp_dir:
            # Prepare paths
            filename = f"{track_info['title']} - {track_info['artist']}.mp3"
            safe_filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '.'))
            output_path = os.path.join(temp_dir, safe_filename)

            # Download audio
            query = f"{track_info['title']} {track_info['artist']}"
            info = download_audio(query, output_path, self.request.id)

            progress.current_progress = 50
            progress.save()

            # Embed metadata and save to media directory
            # ... rest of the song download logic ...
            
            progress.current_progress = 100
            progress.save()

            return song.id

    except Exception as e:
        logger.error(f"Error downloading song: {str(e)}", exc_info=True)
        if progress:
            progress.delete()
        raise

@shared_task(bind=True)
def download_youtube_playlist(self, url, user_id):
    """
    Celery task to download a YouTube playlist
    """
    try:
        # Initialize progress tracking
        with yt_dlp.YoutubeDL() as ydl:
            info = ydl.extract_info(url, download=False)
            total_videos = len(info['entries'])
            
            progress = DownloadProgress.objects.create(
                task_id=self.request.id,
                total_items=total_videos,
                started_at=datetime.now()
            )
        
        user = User.objects.get(id=user_id)
        
        # Create playlist
        playlist = Playlist.objects.create(
            user=user,
            name=info.get('title', 'YouTube Playlist'),
            source="youtube",
            source_url=url
        )

        # Process each video
        for index, entry in enumerate(info['entries'], 1):
            if entry is None:
                continue
                
            track_info = {
                'title': entry['title'],
                'artist': entry.get('uploader', 'Unknown Artist'),
                'album': entry.get('album', 'Unknown'),
                'image_url': entry.get('thumbnail')
            }
            
            progress.current_progress = index
            progress.current_file = track_info['title']
            progress.save()
            
            download_song.delay(track_info, user_id=user.id, playlist_id=playlist.id)

        return playlist.id

    except Exception as e:
        logger.error(f"Error downloading YouTube playlist: {str(e)}", exc_info=True)
        if progress:
            progress.delete()
        raise

@shared_task(bind=True)
def download_spotify_playlist(self, playlist_url, user_id):
    """
    Celery task to download a Spotify playlist
    """
    try:
        # Get playlist tracks first to know total
        playlist_tracks = get_playlist_tracks(playlist_url)
        
        progress = DownloadProgress.objects.create(
            task_id=self.request.id,
            total_items=len(playlist_tracks),
            started_at=datetime.now()
        )
        
        user = User.objects.get(id=user_id)
        
        playlist = Playlist.objects.create(
            user=user,
            name=f"Spotify Playlist {playlist_url.split('/')[-1].split('?')[0]}",
            source="spotify",
            source_url=playlist_url
        )

        for index, track in enumerate(playlist_tracks, 1):
            progress.current_progress = index
            progress.current_file = f"{track['title']} - {track['artist']}"
            progress.save()
            
            download_song.delay(track, user_id=user.id, playlist_id=playlist.id)

        return playlist.id

    except Exception as e:
        logger.error(f"Error downloading Spotify playlist: {str(e)}", exc_info=True)
        if progress:
            progress.delete()
        raise