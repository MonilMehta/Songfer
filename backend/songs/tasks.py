import os
import tempfile
from celery import shared_task
from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
from datetime import datetime
import yt_dlp
import logging
from .models import Song, Playlist, DownloadProgress, UserMusicProfile, SongCache
from .spotify_api import get_playlist_tracks, get_track_info

logger = logging.getLogger(__name__)
User = get_user_model()

def download_audio(query, output_path, task_id, is_url=False):
    """Helper function to download audio using yt-dlp"""
    logger.info(f"Downloading audio: {query} to {output_path}")
    
    # Create a progress hook that updates the DownloadProgress object
    def progress_hook(d):
        if d['status'] == 'downloading':
            try:
                # Try to find the progress object, but don't fail if it doesn't exist
                progress = DownloadProgress.objects.filter(task_id=task_id).first()
                if progress:
                    if 'total_bytes' in d and d['total_bytes'] > 0:
                        percent = d['downloaded_bytes'] / d['total_bytes'] * 100
                        progress.current_progress = min(int(percent), 99)  # Cap at 99% until complete
                    elif 'total_bytes_estimate' in d and d['total_bytes_estimate'] > 0:
                        percent = d['downloaded_bytes'] / d['total_bytes_estimate'] * 100
                        progress.current_progress = min(int(percent), 99)
                    
                    if 'filename' in d:
                        progress.current_file = os.path.basename(d['filename'])
                    
                    progress.save()
                else:
                    # No progress object found, just log the progress
                    if 'total_bytes' in d and d['total_bytes'] > 0:
                        percent = d['downloaded_bytes'] / d['total_bytes'] * 100
                        logger.info(f"Download progress: {percent:.1f}% for {os.path.basename(d.get('filename', 'unknown'))}")
            except Exception as e:
                logger.error(f"Error updating progress: {e}")
    
    # Extract base path and filename without extension
    base_path = os.path.splitext(output_path)[0]
    
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_path,
        'default_search': 'ytsearch' if not is_url else None,
        'progress_hooks': [progress_hook],
        'writethumbnail': True,  # Enable thumbnail download
        'noplaylist': True,  # Only download the single video, not the playlist
        'cookiesfile': os.path.join(settings.BASE_DIR, 'cookies.txt'),  # Use cookies to avoid bot detection
        'nocheckcertificate': True,  # Sometimes helps with HTTPS issues
        'ignoreerrors': False,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            if is_url:
                info = ydl.extract_info(query, download=True)
            else:
                info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
            
            # Try to find the thumbnail file that was downloaded
            thumbnail_path = None
            for ext in ['jpg', 'png', 'webp']:
                possible_path = f"{base_path}.{ext}"
                if os.path.exists(possible_path):
                    thumbnail_path = possible_path
                    break
                    
            # Add thumbnail path to info if found
            if thumbnail_path:
                info['local_thumbnail'] = thumbnail_path
                logger.info(f"Found local thumbnail: {thumbnail_path}")
            
            return info
        except Exception as e:
            logger.error(f"Error in download_audio: {e}", exc_info=True)
            raise

def download_song_direct(song_info, user_id, playlist_id=None, parent_task_id=None):
    """Direct download function (not a Celery task) for single songs"""
    progress = None
    
    # Generate a task ID for direct calls
    task_id = parent_task_id or f"direct-{datetime.now().timestamp()}"
    logger.info(f"Direct call to download_song with task_id: {task_id}")
    
    try:
        logger.info(f"download_song: Getting user {user_id}")
        user = User.objects.get(id=user_id)
        
        # Get track info
        if isinstance(song_info, str):
            logger.info(f"download_song: Getting track info for URL: {song_info}")
            track_info = get_track_info(song_info)
        else:
            logger.info(f"download_song: Using provided track info: {song_info.get('title')}")
            track_info = song_info

        # Initialize or update progress
        if parent_task_id:
            # If called with a parent task, don't create a new progress object
            logger.info(f"download_song: Using parent progress object for task_id: {parent_task_id}")
            progress = DownloadProgress.objects.filter(task_id=parent_task_id).first()
        else:
            # Create a new progress object for this task
            logger.info(f"download_song: Creating new progress object for task_id: {task_id}")
            progress = DownloadProgress.objects.create(
                task_id=task_id,
                total_items=1,
                current_progress=0,
                current_file=f"{track_info['title']} - {track_info['artist']}"
            )

        # Create temporary directory for download
        logger.info(f"download_song: Creating temporary directory for download")
        with tempfile.TemporaryDirectory() as temp_dir:
            filename = f"{track_info['title']} - {track_info['artist']}.mp3"
            safe_filename = "".join(c for c in filename if c.isalnum() or c in (' ', '-', '.'))
            
            # Create paths
            temp_path = os.path.join(temp_dir, safe_filename)
            media_path = os.path.join(settings.MEDIA_ROOT, 'songs', safe_filename)
            logger.info(f"download_song: Temp path: {temp_path}")
            logger.info(f"download_song: Final media path: {media_path}")

            # Download audio
            logger.info(f"download_song: Starting audio download for: {track_info['title']}")
            info = download_audio(
                track_info['url'] if 'url' in track_info else f"{track_info['title']} {track_info['artist']}", 
                temp_path,
                task_id,
                is_url='url' in track_info
            )
            logger.info(f"download_song: Audio download complete for: {track_info['title']}")
            
            # Get thumbnail URL - first try from track_info, then from YouTube info
            thumbnail_url = track_info.get('image_url')
            logger.info(f"download_song: Initial thumbnail URL from track_info: {thumbnail_url}")
            
            # If we have a local thumbnail file, use that
            if info and 'local_thumbnail' in info:
                # Create a relative path for the thumbnail
                rel_thumbnail_path = os.path.relpath(info['local_thumbnail'], settings.MEDIA_ROOT)
                thumbnail_url = f"/media/{rel_thumbnail_path}"
                logger.info(f"download_song: Using local thumbnail: {thumbnail_url}")
            # Otherwise try to get thumbnail from YouTube info
            elif not thumbnail_url and info:
                for key in ['thumbnail', 'thumbnails']:
                    if key in info and info[key]:
                        if isinstance(info[key], list) and len(info[key]) > 0:
                            thumbnail_url = info[key][0].get('url')
                        else:
                            thumbnail_url = info[key]
                        logger.info(f"download_song: Using YouTube thumbnail: {thumbnail_url}")
                        break

            # Create the song object
            logger.info(f"download_song: Creating song record for: {track_info['title']}")
            song = Song.objects.create(
                user=user,
                title=track_info['title'],
                artist=track_info['artist'],
                album=track_info.get('album', 'Unknown'),
                source='spotify' if 'spotify_id' in track_info else 'youtube',
                spotify_id=track_info.get('spotify_id'),
                thumbnail_url=thumbnail_url,
                song_url=track_info.get('url')
            )
            logger.info(f"download_song: Created song record with ID: {song.id}")

            # Save the file directly to the media directory
            logger.info(f"download_song: Saving file to media directory: {safe_filename}")
            
            # The actual file has .mp3 extension added by the postprocessor
            source_file = temp_path + '.mp3'
            
            # Ensure the songs directory exists
            os.makedirs(os.path.dirname(media_path), exist_ok=True)
            
            # Copy the file to media directory
            import shutil
            logger.info(f"download_song: Copying from {source_file} to {media_path}")
            shutil.copy2(source_file, media_path)
            
            # Set the file field relative to MEDIA_ROOT
            rel_path = os.path.join('songs', safe_filename)
            song.file = rel_path
            song.save()
            
            logger.info(f"download_song: File saved to: {song.file.name}")

            # Add to playlist if needed
            if playlist_id:
                try:
                    logger.info(f"download_song: Adding song to playlist {playlist_id}")
                    playlist = Playlist.objects.get(id=playlist_id, user=user)
                    playlist.songs.add(song)
                    logger.info(f"download_song: Added song to playlist {playlist_id}")
                except Playlist.DoesNotExist:
                    logger.error(f"download_song: Playlist {playlist_id} not found")
            
            # Update user's music profile
            try:
                logger.info(f"download_song: Updating user profile for song: {song.id}")
                profile, created = UserMusicProfile.objects.get_or_create(user=user)
                profile.update_profile(song)
                logger.info(f"download_song: Updated user profile for song: {song.id}")
            except Exception as profile_error:
                logger.warning(f"download_song: Error updating user profile: {profile_error}")

            # Record download in analytics
            try:
                from .models import UserAnalytics
                UserAnalytics.record_download(user)
                logger.info(f"download_song: Recorded download in analytics for song: {song.id}")
            except Exception as analytics_error:
                logger.warning(f"download_song: Error recording download in analytics: {analytics_error}")

            # Update progress to 100% if this is a standalone task
            if not parent_task_id and progress:
                logger.info(f"download_song: Marking task as complete")
                progress.current_progress = 100
                progress.current_file = "Complete"
                progress.save()
                logger.info(f"download_song: Download complete for song: {song.id}")

            logger.info(f"download_song: Returning song ID: {song.id}")
            return song.id

    except Exception as e:
        logger.error(f"download_song: Error downloading song: {str(e)}", exc_info=True)
        if progress and not parent_task_id:
            progress.delete()
        raise

@shared_task(bind=True)
def download_song(self, url, user_id):
    """
    Task to download a song from a URL (YouTube or Spotify)
    """
    from .models import Song, DownloadProgress, SongCache
    from django.contrib.auth import get_user_model
    from django.conf import settings
    import yt_dlp
    import os
    import json
    
    User = get_user_model()
    progress = None
    
    try:
        # Get the user
        user = User.objects.get(id=user_id)
        
        # Create or get progress object
        progress = DownloadProgress.objects.filter(task_id=self.request.id).first()
        if not progress:
            progress = DownloadProgress.objects.create(
                user=user,
                task_id=self.request.id,
                status='processing'
            )
        
        # Check if this song already exists for the user
        existing_song = Song.objects.filter(user=user, song_url=url).first()
        if existing_song:
            progress.status = 'completed'
            progress.song = existing_song
            progress.save()
            return f"Song already exists: {existing_song.id}"
        
        # Check if the song is in cache
        cached_song = None
        try:
            cached_song = SongCache.get_cached_song(url)
        except:
            pass
        
        if cached_song:
            try:
                # Create a new song from the cached data
                metadata = cached_song.metadata
                song = Song.objects.create(
                    user=user,
                    title=metadata.get('title', 'Unknown Title'),
                    artist=metadata.get('artist', 'Unknown Artist'),
                    album=metadata.get('album', 'Unknown'),
                    file=cached_song.local_path,  # Use the cached file
                    source=metadata.get('source', 'cache'),
                    spotify_id=metadata.get('spotify_id'),
                    thumbnail_url=metadata.get('thumbnail_url'),
                    song_url=url
                )
                
                # Increment the user's download count
                user.increment_download_count()
                
                # Update progress
                progress.status = 'completed'
                progress.song = song
                progress.title = song.title
                progress.artist = song.artist
                progress.thumbnail_url = song.thumbnail_url
                progress.save()
                
                return f"Song created from cache: {song.id}"
            except Exception as e:
                logger.error(f"Error creating song from cache: {e}", exc_info=True)
                # Fall through to regular download
        
        # Determine which service to use based on the URL
        if 'youtube.com' in url or 'youtu.be' in url:
            # Download from YouTube
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
                'cookiesfile': os.path.join(settings.BASE_DIR, 'cookies.txt'),  # Use cookies to avoid bot detection
                'nocheckcertificate': True,  # Sometimes helps with HTTPS issues
                'ignoreerrors': False,
            }
            
            # Extract the information first to get metadata
            with yt_dlp.YoutubeDL({'quiet': True}) as ydl:
                info = ydl.extract_info(url, download=False)
                
                # Update progress with title and thumbnail
                progress.title = info.get('title', 'Unknown Title')
                progress.artist = info.get('uploader', 'Unknown Artist')
                progress.thumbnail_url = info.get('thumbnail')
                progress.save()
            
            # Download the audio
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                result = ydl.extract_info(url, download=True)
                
                song_title = result.get('title', 'Unknown Title')
                artist = result.get('artist', 'Unknown Artist') or result.get('uploader', 'Unknown Artist')
                
                # Determine the local file path
                file_path = ydl.prepare_filename(result)
                # Replace the extension with .mp3 as it was processed
                file_path = os.path.splitext(file_path)[0] + '.mp3'
                
                # Create relative path for Django model
                rel_path = os.path.relpath(file_path, settings.MEDIA_ROOT)
                
                # Create a new Song instance and save it
                song = Song.objects.create(
                    user=user,
                    title=song_title,
                    artist=artist,
                    file=rel_path,
                    source='youtube',
                    song_url=url,
                    thumbnail_url=result.get('thumbnail')
                )
                
                # Get the file size
                try:
                    file_size = os.path.getsize(file_path)
                except:
                    file_size = 0
                
                # Increment the user's download count
                user.increment_download_count()
                
                # Record download in analytics
                try:
                    from .models import UserAnalytics
                    UserAnalytics.record_download(user)
                    logger.info(f"Recorded download in analytics for song: {song.id}")
                except Exception as analytics_error:
                    logger.warning(f"Error recording download in analytics: {analytics_error}")
                
                # Cache the song for future use
                try:
                    metadata = {
                        'title': song_title,
                        'artist': artist,
                        'album': result.get('album', 'Unknown'),
                        'source': 'youtube',
                        'thumbnail_url': result.get('thumbnail')
                    }
                    
                    SongCache.objects.create(
                        song_url=url,
                        local_path=rel_path,
                        file_size=file_size,
                        metadata=metadata
                    )
                except Exception as e:
                    logger.error(f"Error caching song: {e}", exc_info=True)
                
                # Update progress
                progress.status = 'completed'
                progress.song = song
                progress.save()
                
                return f"YouTube song downloaded: {song.id}"
        
        elif 'spotify.com' in url:
            # Download from Spotify
            from .spotify_downloader import download_spotify_track
            
            try:
                # Extract Spotify ID
                import re
                spotify_id = re.search(r'/track/([a-zA-Z0-9]+)', url).group(1)
                
                # Get Spotify track info
                import spotipy
                from spotipy.oauth2 import SpotifyClientCredentials
                
                # Get Spotify client credentials from settings
                client_id = settings.SPOTIFY_CLIENT_ID
                client_secret = settings.SPOTIFY_CLIENT_SECRET
                
                client_credentials_manager = SpotifyClientCredentials(client_id=client_id, client_secret=client_secret)
                sp = spotipy.Spotify(client_credentials_manager=client_credentials_manager)
                
                track = sp.track(spotify_id)
                
                # Update progress with title and thumbnail
                progress.title = track['name']
                progress.artist = ", ".join([artist['name'] for artist in track['artists']])
                progress.thumbnail_url = track['album']['images'][0]['url'] if track['album']['images'] else None
                progress.save()
                
                # Check if song already exists by Spotify ID
                existing_song = Song.objects.filter(user=user, spotify_id=spotify_id).first()
                if existing_song:
                    progress.status = 'completed'
                    progress.song = existing_song
                    progress.save()
                    return f"Song already exists by Spotify ID: {existing_song.id}"
                
                # Download the track
                song_data = download_spotify_track(track, user)
                
                if song_data:
                    # Get the file size
                    file_path = os.path.join(settings.MEDIA_ROOT, song_data['file_path'])
                    try:
                        file_size = os.path.getsize(file_path)
                    except:
                        file_size = 0
                    
                    # Cache the song for future use
                    try:
                        metadata = {
                            'title': song_data['title'],
                            'artist': song_data['artist'],
                            'album': song_data['album'],
                            'source': 'spotify',
                            'spotify_id': spotify_id,
                            'thumbnail_url': song_data['thumbnail_url']
                        }
                        
                        SongCache.objects.create(
                            song_url=url,
                            local_path=song_data['file_path'],
                            file_size=file_size,
                            metadata=metadata
                        )
                    except Exception as e:
                        logger.error(f"Error caching Spotify song: {e}", exc_info=True)
                    
                    # Update progress
                    progress.status = 'completed'
                    progress.song_id = song_data['song_id']
                    progress.save()
                    
                    return f"Spotify song downloaded: {song_data['song_id']}"
                else:
                    progress.status = 'failed'
                    progress.error = 'Failed to download Spotify track'
                    progress.save()
                    return "Failed to download Spotify track"
            
            except Exception as e:
                logger.error(f"Error downloading Spotify track: {e}", exc_info=True)
                if progress:
                    progress.status = 'failed'
                    progress.error = str(e)
                    progress.save()
                return f"Error downloading Spotify track: {str(e)}"
        
        else:
            # Unsupported URL
            if progress:
                progress.status = 'failed'
                progress.error = 'Unsupported URL'
                progress.save()
            return "Unsupported URL"
    
    except Exception as e:
        logger.error(f"Error in download_song task: {e}", exc_info=True)
        if progress:
            progress.status = 'failed'
            progress.error = str(e)
            progress.save()
        return f"Error: {str(e)}"

def download_youtube_playlist_direct(url, user_id):
    """Direct download function (not a Celery task) for YouTube playlists"""
    logger.info(f"Starting direct YouTube playlist download: {url} for user {user_id}")
    
    task_id = f"direct-{datetime.now().timestamp()}"
    progress = None
    
    try:
        user = User.objects.get(id=user_id)
        
        # Get playlist info
        logger.info(f"Extracting playlist info from: {url}")
        try:
            with yt_dlp.YoutubeDL({'quiet': False, 'no_warnings': False}) as ydl:
                info = ydl.extract_info(url, download=False)
                
            if not info or not info.get('entries'):
                logger.error(f"No videos found in playlist: {url}")
                raise ValueError(f"No videos found in playlist: {url}")
                
            logger.info(f"Found playlist: {info.get('title')} with {len(info.get('entries', []))} entries")
        except Exception as e:
            logger.error(f"Error extracting playlist info: {str(e)}", exc_info=True)
            raise ValueError(f"Could not extract playlist info: {str(e)}")
            
        # Create playlist
        playlist = Playlist.objects.create(
            user=user,
            name=info.get('title', 'YouTube Playlist'),
            source="youtube",
            source_url=url
        )
        logger.info(f"Created playlist with ID: {playlist.id}")

        # Initialize progress tracking
        total_entries = len(info.get('entries', []))
        progress = DownloadProgress.objects.create(
            task_id=task_id,
            total_items=total_entries,
            current_progress=0,
            current_file="Initializing..."
        )
        
        # Process each video using the download_song function
        successful_songs = []
        
        for i, entry in enumerate(info.get('entries', [])):
            if entry is None:
                logger.warning(f"Skipping None entry at position {i}")
                continue
                
            logger.info(f"Processing entry {i+1}/{total_entries}: {entry.get('title')}")
            
            try:
                # Update progress
                progress.current_progress = int((i / total_entries) * 100)
                progress.current_file = entry.get('title', f"Track {i+1}")
                progress.save()
                
                # Prepare track info
                track_info = {
                    'title': entry.get('title', f"Track {i+1}"),
                    'artist': entry.get('uploader', 'Unknown Artist'),
                    'album': entry.get('album', 'Unknown'),
                    'image_url': entry.get('thumbnail'),
                    'url': entry.get('webpage_url')
                }
                
                # Call download_song directly
                song_id = download_song_direct(track_info, user_id, playlist.id, parent_task_id=task_id)
                
                if song_id:
                    successful_songs.append(song_id)
                    logger.info(f"Successfully downloaded: {track_info['title']}")
            
            except Exception as song_error:
                logger.error(f"Error downloading song {entry.get('title')}: {str(song_error)}", exc_info=True)
        
        # Check if any songs were successfully downloaded
        if not successful_songs:
            logger.error("No songs were successfully downloaded")
            
            # If progress exists, update it to show failure
            if progress:
                progress.current_progress = 100
                progress.current_file = "Failed - No songs downloaded"
                progress.save()
                
            # Delete the empty playlist
            playlist.delete()
            
            raise ValueError("Failed to download any songs from the playlist")
        else:
            # At least some songs were downloaded successfully
            logger.info(f"Playlist download complete. Downloaded {len(successful_songs)}/{total_entries} songs")
        
        # Update final progress
        progress.current_progress = 100
        progress.current_file = f"Complete - {len(successful_songs)} songs downloaded"
        progress.save()
        
        return playlist.id

    except Exception as e:
        logger.error(f"Error downloading YouTube playlist: {str(e)}", exc_info=True)
        # Clean up progress object if it exists
        if progress:
            progress.delete()
        raise

@shared_task(bind=True)
def download_youtube_playlist(self, url, user_id):
    """Celery task wrapper for YouTube playlist download"""
    logger.info(f"Celery task for YouTube playlist download: {url} for user {user_id}")
    return download_youtube_playlist_direct(url, user_id)

def download_spotify_playlist_direct(playlist_url, user_id):
    """Direct download function (not a Celery task) for Spotify playlists"""
    logger.info(f"Starting direct Spotify playlist download: {playlist_url} for user {user_id}")
    
    task_id = f"direct-{datetime.now().timestamp()}"
    progress = None
    
    try:
        user = User.objects.get(id=user_id)
        
        # Get playlist tracks
        logger.info(f"Fetching tracks from Spotify playlist: {playlist_url}")
        try:
            playlist_tracks = get_playlist_tracks(playlist_url)
            
            if not playlist_tracks:
                logger.error(f"No tracks found in Spotify playlist: {playlist_url}")
                raise ValueError(f"No tracks found in Spotify playlist: {playlist_url}")
                
            logger.info(f"Found {len(playlist_tracks)} tracks in Spotify playlist")
        except Exception as e:
            logger.error(f"Error extracting Spotify playlist info: {str(e)}", exc_info=True)
            raise ValueError(f"Could not extract playlist info: {str(e)}")
        
        # Create playlist
        playlist = Playlist.objects.create(
            user=user,
            name=f"Spotify Playlist {playlist_url.split('/')[-1].split('?')[0]}",
            source="spotify",
            source_url=playlist_url
        )
        logger.info(f"Created playlist with ID: {playlist.id}")

        # Initialize progress tracking
        total_tracks = len(playlist_tracks)
        progress = DownloadProgress.objects.create(
            task_id=task_id,
            total_items=total_tracks,
            current_progress=0,
            current_file="Initializing..."
        )

        # Process each track using the download_song function
        successful_songs = []
        
        for i, track_info in enumerate(playlist_tracks):
            logger.info(f"Processing track {i+1}/{total_tracks}: {track_info.get('title')}")
            
            try:
                # Update progress
                progress.current_progress = int((i / total_tracks) * 100)
                progress.current_file = track_info.get('title', f"Track {i+1}")
                progress.save()
                
                # Call download_song directly
                song_id = download_song_direct(track_info, user_id, playlist.id, parent_task_id=task_id)
                
                if song_id:
                    successful_songs.append(song_id)
                    logger.info(f"Successfully downloaded: {track_info['title']}")
            
            except Exception as song_error:
                logger.error(f"Error downloading song {track_info.get('title')}: {str(song_error)}", exc_info=True)
        
        # Check if any songs were successfully downloaded
        if not successful_songs:
            logger.error("No songs were successfully downloaded")
            
            # If progress exists, update it to show failure
            if progress:
                progress.current_progress = 100
                progress.current_file = "Failed - No songs downloaded"
                progress.save()
                
            # Delete the empty playlist
            playlist.delete()
            
            raise ValueError("Failed to download any songs from the playlist")
        
        # Update final progress
        progress.current_progress = 100
        progress.current_file = f"Complete - {len(successful_songs)} songs downloaded"
        progress.save()
        
        logger.info(f"Playlist download complete. Downloaded {len(successful_songs)}/{total_tracks} songs")
        
        return playlist.id

    except Exception as e:
        logger.error(f"Error downloading Spotify playlist: {str(e)}", exc_info=True)
        # Clean up progress object if it exists
        if progress:
            progress.delete()
        raise

@shared_task(bind=True)
def download_spotify_playlist(self, playlist_url, user_id):
    """Celery task wrapper for Spotify playlist download"""
    logger.info(f"Celery task for Spotify playlist download: {playlist_url} for user {user_id}")
    return download_spotify_playlist_direct(playlist_url, user_id)

@shared_task
def cleanup_cache():
    """Scheduled task to clean up expired cache files"""
    from django.core.management import call_command
    
    logger.info("Running scheduled cache cleanup task")
    
    # Run the cleanup_cache management command
    # Clean up entries older than 2 days and unused entries
    call_command('cleanup_cache', '--days=2', '--unused')
    
    logger.info("Cache cleanup task completed")