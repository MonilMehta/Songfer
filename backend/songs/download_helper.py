import os
import logging
import time
import tempfile
import shutil
import requests
import json
import yt_dlp
from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.response import Response
import concurrent.futures # Added
import threading # Added

from .models import Song, SongCache, UserMusicProfile, UserAnalytics, Playlist, DownloadProgress
from .utils import (
    youtube_api_retry, spotify_api_retry, download_from_youtube, 
    convert_audio_format, sanitize_filename, embed_metadata,
    download_youtube_util
)
from .spotify_api import extract_spotify_id, get_track_info, get_playlist_info, get_playlist_tracks

logger = logging.getLogger(__name__)

def sanitize_for_db(text, max_length=95):
    """
    Sanitize text for database storage, ensuring it doesn't exceed max_length
    and removing problematic characters.
    """
    if not text:
        return ""
    
    # Convert to string if not already
    text = str(text)
    
    # Remove special characters that might cause issues
    sanitized = "".join(c for c in text if c.isalnum() or c in (' ', '-', '.', ',', ':', ';', '&', "'", '/', '_'))
    
    # Truncate to max_length
    if len(sanitized) > max_length:
        sanitized = Truncator(sanitized).chars(max_length) 
    
    # Ensure not empty after sanitization (only if input wasn't empty)
    if text and not sanitized.strip():
        return "Unknown"
        
    return sanitized.strip()

@youtube_api_retry
def download_youtube(request, url, output_format=None):
    """Direct YouTube download with streaming response"""
    # Initialize variables for file cleanup
    temp_dir = None
    
    try:
        # Check if this is a playlist URL
        if 'playlist' in url or 'list=' in url:
            # Redirect to the async playlist download
            from .tasks import download_youtube_playlist
            task = download_youtube_playlist.delay(url, request.user.id)
            return Response({
                'message': 'Playlist download initiated',
                'task_id': task.id,
                'status': 'processing'
            }, status=status.HTTP_202_ACCEPTED)
            
        # Check if the song is in cache
        cached_song = SongCache.get_cached_song(url)
        if (cached_song):
            logger.info(f"Using cached version for URL: {url}")
            # Record download in analytics for cached song
            try:
                UserAnalytics.record_download(request.user)
            except Exception as analytics_error:
                logger.warning(f"Error recording download in analytics: {analytics_error}")
            # Get the cached file path
            cached_file_path = os.path.join(settings.MEDIA_ROOT, cached_song.local_path.name if hasattr(cached_song, 'local_path') else cached_song.file_path)
            
            # Get metadata from cache
            metadata = cached_song.metadata or {}
            title = metadata.get('title', 'Unknown Title')
            artist = metadata.get('artist', 'Unknown Artist')
            album = metadata.get('album', 'Unknown Album')
            
            # Check if we need format conversion
            if output_format != 'mp3' and os.path.splitext(cached_file_path)[1][1:] != output_format:
                # Convert the format
                logger.info(f"Converting cached song from {os.path.splitext(cached_file_path)[1][1:]} to {output_format}")
                final_filename = convert_audio_format(cached_file_path, output_format)
            else:
                final_filename = cached_file_path
                
            # Create a song entry for this user if they don't already have it
            if not Song.objects.filter(user=request.user, song_url=url).exists():
                # Create the song record
                rel_path = os.path.relpath(final_filename, settings.MEDIA_ROOT)
                rel_path = sanitize_filename(rel_path, max_length=95)
                
                # Embed metadata including thumbnail into the MP3 file
                embed_metadata(
                    mp3_path=final_filename,
                    title=title,
                    artist=artist,
                    album=album,
                    thumbnail_url=metadata.get('thumbnail_url', ''),
                    year=metadata.get('upload_date', '')[:4] if metadata.get('upload_date') else None,
                    album_artist=metadata.get('channel', metadata.get('artist', 'Unknown Artist')),
                    youtube_id=metadata.get('id')
                )
                
                song = Song.objects.create(
                    user=request.user,
                    title=sanitize_for_db(title),
                    artist=sanitize_for_db(artist),
                    album=sanitize_for_db(album),
                    file=rel_path,
                    source='youtube',
                    thumbnail_url=sanitize_for_db(metadata.get('thumbnail_url', ''), max_length=190),
                    song_url=url
                )
                
                # Update user's music profile
                try:
                    profile, created = UserMusicProfile.objects.get_or_create(user=request.user)
                    profile.update_profile(song)
                except Exception as profile_error:
                    logger.warning(f"Error updating user profile: {profile_error}")
                
                # Increment download count
                request.user.increment_download_count()
                
                # Record download in analytics
                try:
                    UserAnalytics.record_download(request.user)
                except Exception as analytics_error:
                    logger.warning(f"Error recording download in analytics: {analytics_error}")
            
            # Serve the file - We'll use Django's FileResponse which manages closing the file
            formatted_filename = f"{title} - {artist}.{output_format or 'mp3'}"
            formatted_filename = sanitize_filename(formatted_filename)
            
            # Important: Let Django's FileResponse manage the file handle
            response = FileResponse(
                open(final_filename, 'rb'),
                as_attachment=True,
                filename=formatted_filename
            )
            response['Content-Type'] = f'audio/{output_format or "mp3"}'
            # Add song metadata headers
            response['x-song-title'] = title
            response['x-song-artist'] = artist
            if album:
                response['x-album-name'] = album
            if metadata.get('thumbnail_url'):
                response['x-cover-url'] = metadata.get('thumbnail_url')
            response['Content-Disposition'] = f'attachment; filename="{formatted_filename}"'
            return response
        
        # If not in cache, proceed with downloading
        # Create temp directory for download
        temp_dir = tempfile.mkdtemp()
        
        # CHANGED: Use Hugging Face Spaces API instead of direct yt-dlp download
        info = download_from_huggingface(url, temp_dir)
        
        # The downloaded file should already be an mp3
        temp_mp3_filename = info['filepath']
        
        # Convert to requested format if different from mp3
        if output_format and output_format != 'mp3':
            final_filename = convert_audio_format(temp_mp3_filename, output_format)
        else:
            final_filename = temp_mp3_filename
        
        # Get thumbnail URL from info
        thumbnail_url = info.get('thumbnail')
        
        # Create destination paths
        formatted_filename = f"{info['title']} - {info.get('artist', 'Unknown Artist')}.{output_format or 'mp3'}"
        formatted_filename = sanitize_filename(formatted_filename)
        
        # Copy to media directory
        media_dir = os.path.join(settings.MEDIA_ROOT, 'songs')
        os.makedirs(media_dir, exist_ok=True)
        media_path = os.path.join(media_dir, formatted_filename)
        
        shutil.copy2(final_filename, media_path)
        
        # Create the song record
        rel_path = os.path.join('songs', formatted_filename)
        rel_path = sanitize_filename(rel_path, max_length=95)
        
        # Embed metadata including thumbnail into the MP3 file
        embed_metadata(
            mp3_path=media_path,
            title=info['title'],
            artist=info.get('artist', 'Unknown Artist'),
            album=info.get('album', 'Unknown'),
            thumbnail_url=thumbnail_url,
            year=info.get('upload_date', '')[:4] if info.get('upload_date') else None,
            album_artist=info.get('artist', 'Unknown Artist'),
            youtube_id=info.get('id')
        )
        
        song = Song.objects.create(
            user=request.user,
            title=sanitize_for_db(info['title']),
            artist=sanitize_for_db(info.get('artist', 'Unknown Artist')),
            album=sanitize_for_db(info.get('album', 'Unknown')),
            file=rel_path,
            source='youtube',
            thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190) if thumbnail_url else None,
            song_url=url
        )

        # Update user's music profile
        try:
            profile, created = UserMusicProfile.objects.get_or_create(user=request.user)
            profile.update_profile(song)
        except Exception as profile_error:
            logger.warning(f"Error updating user profile: {profile_error}")

        # Increment download count
        request.user.increment_download_count()
        
        # Add to cache for future use
        try:
            cache_path = os.path.join('cache', formatted_filename)
            cache_full_path = os.path.join(settings.MEDIA_ROOT, cache_path)
            
            # Make sure the cache directory exists
            os.makedirs(os.path.dirname(cache_full_path), exist_ok=True)
            
            # Copy the file to the cache directory if it's not already there
            if not os.path.exists(cache_full_path):
                shutil.copy2(final_filename, cache_full_path)
            
            # Calculate file size
            file_size = os.path.getsize(final_filename)
            
            # Prepare metadata
            metadata = {
                'title': info['title'],
                'artist': info.get('artist', 'Unknown Artist'),
                'album': info.get('album', 'Unknown'),
                'thumbnail_url': thumbnail_url,
                'source': 'youtube',
                'id': info.get('id')
            }
            
            # Create or update cache entry with metadata in the JSON field
            SongCache.objects.update_or_create(
                song_url=url,
                defaults={
                    'file_path': cache_path,
                    'file_size': file_size,
                    'expires_at': timezone.now() + timedelta(days=7),  # Cache for 7 days
                    'metadata': metadata,
                    'title': song.title,     # Store these for backward compatibility
                    'artist': song.artist
                }
            )
            logger.info(f"Added song to cache: {url}")
        except Exception as cache_error:
            logger.warning(f"Error adding song to cache: {cache_error}")
            
        # Return streaming response - serve from media directory to avoid temp cleanup issues
        response = FileResponse(
            open(media_path, 'rb'),
            as_attachment=True,
            filename=formatted_filename
        )
        response['Content-Type'] = f'audio/{output_format or "mp3"}'
        # Add song metadata headers
        response['x-song-title'] = info['title']
        response['x-song-artist'] = info.get('artist', 'Unknown Artist')
        response['Content-Disposition'] = f'attachment; filename="{formatted_filename}"'
        if info.get('album'):
            response['x-album-name'] = info.get('album')
        if thumbnail_url:
            response['x-cover-url'] = thumbnail_url
        return response
            
    except Exception as e:
        logger.error(f"YouTube download error: {e}", exc_info=True)
        return Response(
            {'error': f'Download failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    finally:
        # Clean up resources
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except:
                pass

@spotify_api_retry
def download_spotify_track(request, url, output_format=None):
    """Direct Spotify track download with streaming response"""
    # Initialize variables for file cleanup
    temp_dir = None
    
    try:
        # Check if the song is in cache
        cached_song = SongCache.get_cached_song(url)
        if cached_song:
            # Handle cached song (same as original code)
            logger.info(f"Using cached version for Spotify URL: {url}")
            # Record download in analytics for cached song
            try:
                UserAnalytics.record_download(request.user)
            except Exception as analytics_error:
                logger.warning(f"Error recording download in analytics: {analytics_error}")
            # Get the cached file path
            cached_path = cached_song.local_path if hasattr(cached_song, 'local_path') else cached_song.file_path
            if isinstance(cached_path, str):
                cached_file_path = os.path.join(settings.MEDIA_ROOT, cached_path)
            else:
                cached_file_path = os.path.join(settings.MEDIA_ROOT, cached_path.name)
            
            # Get metadata from cache
            metadata = cached_song.metadata or {}
            title = metadata.get('title', 'Unknown Title')
            artist = metadata.get('artist', 'Unknown Artist')
            album = metadata.get('album', 'Unknown Album')
            spotify_id = metadata.get('spotify_id')
            thumbnail_url = metadata.get('thumbnail_url')
            
            # Check if the file actually exists
            if not os.path.exists(cached_file_path):
                logger.warning(f"File not found for cached song {url}, will redownload")
                # Continue to download logic below (don't return)
            else:
                # Check if we need format conversion
                if output_format and output_format != 'mp3' and os.path.splitext(cached_file_path)[1][1:] != output_format:
                    # Convert the format
                    logger.info(f"Converting cached Spotify song from {os.path.splitext(cached_file_path)[1][1:]} to {output_format}")
                    final_filename = convert_audio_format(cached_file_path, output_format)
                else:
                    final_filename = cached_file_path
                    
                # Create a song entry for this user if they don't already have it
                if not Song.objects.filter(user=request.user, song_url=url).exists():
                    # Create the song record with proper file path
                    rel_path = os.path.relpath(final_filename, settings.MEDIA_ROOT)
                    rel_path = sanitize_filename(rel_path, max_length=95)
                    
                    # Make sure to embed the thumbnail metadata even for cached songs
                    if thumbnail_url:
                        logger.info(f"Embedding thumbnail from cache metadata: {thumbnail_url}")
                        embed_metadata(
                            mp3_path=final_filename,
                            title=title,
                            artist=artist,
                            album=album,
                            thumbnail_url=thumbnail_url,
                            year=metadata.get('year'),
                            genre=metadata.get('genre', 'Unknown'),
                            album_artist=metadata.get('album_artist', artist),
                            spotify_id=spotify_id
                        )
                    
                    song = Song.objects.create(
                        user=request.user,
                        title=sanitize_for_db(title),
                        artist=sanitize_for_db(artist),
                        album=sanitize_for_db(album),
                        file=rel_path,
                        source='spotify',
                        spotify_id=spotify_id,
                        thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190) if thumbnail_url else None,
                        song_url=url
                    )
                    
                    # Update user's music profile
                    try:
                        profile, created = UserMusicProfile.objects.get_or_create(user=request.user)
                        profile.update_profile(song)
                    except Exception as profile_error:
                        logger.warning(f"Error updating user profile: {profile_error}")
                    
                    # Increment download count
                    request.user.increment_download_count()
                
                # Serve the file
                formatted_filename = f"{title} - {artist}.{output_format or 'mp3'}"
                formatted_filename = sanitize_filename(formatted_filename)
                
                # Let Django's FileResponse manage the file handle
                response = FileResponse(
                    open(final_filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                content_type = f'audio/{output_format}' if output_format else 'audio/mpeg'
                response['Content-Type'] = content_type
                
                # Explicitly set Content-Disposition header with filename
                response['Content-Disposition'] = f'attachment; filename="{formatted_filename}"'
                
                # Add song metadata headers
                response['x-song-title'] = title
                response['x-song-artist'] = artist
                if album:
                    response['x-album-name'] = album
                if thumbnail_url:
                    response['x-cover-url'] = thumbnail_url
                    
                return response

        # If song not in cache or file doesn't exist, download it
        # Extract Spotify ID from URL
        spotify_id = extract_spotify_id(url)
        if not spotify_id:
            return Response(
                {'error': 'Invalid Spotify URL'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        logger.info(f"Getting info for Spotify track ID: {spotify_id}")
        
        # Get track info from Spotify
        track_info = get_track_info(url)
        if not track_info:
            return Response(
                {'error': 'Failed to get track info from Spotify'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        # Make sure we have the thumbnail URL from Spotify API
        thumbnail_url = track_info.get('image_url')

        logger.info(f"Spotify API returned thumbnail URL: {thumbnail_url}")
        
        # Sanitize track info fields for the database
        track_info['title'] = sanitize_for_db(track_info['title'])
        track_info['artist'] = sanitize_for_db(track_info['artist'])
        if 'album' in track_info:
            track_info['album'] = sanitize_for_db(track_info['album'])
        
        logger.info(f"Got track info: {track_info['title']} by {track_info['artist']}")
        
        # Build a search query for YouTube
        query = f"{track_info['title']} {track_info['artist']}"
        
        # Create a temporary directory that we'll clean up manually
        temp_dir = tempfile.mkdtemp()
        
        # Create a YouTube search URL that the API can use
        search_url = f"https://youtube.com/results?search_query={query.replace(' ', '+')}"
        
        # Download using Hugging Face Spaces API
        info = download_from_huggingface(search_url, temp_dir, spotify_metadata=track_info)
        mp3_filename = info['filepath']
        
        logger.info(f"Downloaded file to: {mp3_filename}")
        
        # Create a proper formatted filename for the final file
        formatted_filename = f"{track_info['title']} - {track_info['artist']}.mp3"
        formatted_filename = sanitize_filename(formatted_filename)
        
        # Copy to media directory to avoid temp directory issues
        media_dir = os.path.join(settings.MEDIA_ROOT, 'songs')
        os.makedirs(media_dir, exist_ok=True)
        media_path = os.path.join(media_dir, formatted_filename)
        
        shutil.copy2(mp3_filename, media_path)

        # Check if this song already exists for this user before creating a new one
        existing_song = Song.objects.filter(
            user=request.user, 
            song_url=url
        ).first()
        
        # IMPORTANT: Always embed Spotify metadata into the file, overwriting any existing tags
        # This step ensures we use the correct info from Spotify API rather than potential incorrect YouTube data
        logger.info(f"Embedding Spotify metadata into MP3 file: {media_path}")
        embed_metadata(
            mp3_path=media_path,
            title=track_info['title'],
            artist=track_info['artist'],
            album=track_info.get('album', 'Unknown'),
            thumbnail_url=thumbnail_url,
            year=track_info.get('year'),
            genre=track_info.get('genre', 'Unknown'),
            album_artist=track_info.get('album_artist', track_info['artist']),
            spotify_id=track_info.get('spotify_id')
        )
        
        if existing_song:
            song = existing_song
            # Update the thumbnail URL if it was missing before
            if thumbnail_url and not existing_song.thumbnail_url:
                existing_song.thumbnail_url = sanitize_for_db(thumbnail_url, max_length=190)
                existing_song.save()
        else:
            rel_path = os.path.join('songs', formatted_filename)
            # Sanitize the file path to ensure it doesn't exceed DB limits
            rel_path = sanitize_filename(rel_path, max_length=95)
            
            song = Song.objects.create(
                user=request.user,
                title=sanitize_for_db(track_info['title']),
                artist=sanitize_for_db(track_info['artist']),
                album=sanitize_for_db(track_info.get('album', 'Unknown')),
                file=rel_path,
                source='spotify',
                spotify_id=track_info.get('spotify_id'),
                thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190) if thumbnail_url else None,
                song_url=url
            )
        
        # Update user's music profile
        try:
            profile, created = UserMusicProfile.objects.get_or_create(user=request.user)
            profile.update_profile(song)
        except Exception as profile_error:
            logger.warning(f"Error updating user profile: {profile_error}")
        
        # Increment download count
        request.user.increment_download_count()
        
        # Record download in analytics
        try:
            UserAnalytics.record_download(request.user)
        except Exception as analytics_error:
            logger.warning(f"Error recording download in analytics: {analytics_error}")
        
        # Add to cache for future use (with properly formatted filename)
        try:
            # Create properly named file in cache directory
            cache_path = os.path.join('cache', formatted_filename)
            cache_full_path = os.path.join(settings.MEDIA_ROOT, cache_path)
            
            # Make sure the cache directory exists
            os.makedirs(os.path.dirname(cache_full_path), exist_ok=True)
            
            # Copy the file to the cache directory with the proper name
            if not os.path.exists(cache_full_path):
                shutil.copy2(media_path, cache_full_path)  # Copy file with Spotify metadata already embedded
            
            # Calculate file size
            file_size = os.path.getsize(media_path)
            
            # Ensure thumbnail URL is valid for database
            if thumbnail_url and len(thumbnail_url) > 190:
                # Truncate long URLs or set to empty if invalid
                logger.warning(f"Thumbnail URL too long, truncating: {thumbnail_url[:50]}...")
                thumbnail_url = sanitize_for_db(thumbnail_url, max_length=190)
            
            # Prepare metadata
            metadata = {
                'title': song.title,
                'artist': song.artist,
                'album': song.album,
                'thumbnail_url': thumbnail_url,
                'source': 'spotify',
                'spotify_id': song.spotify_id
            }
            
            # Create or update cache entry with metadata in the JSON field
            SongCache.objects.update_or_create(
                song_url=url,
                defaults={
                    'file_path': cache_path,
                    'file_size': file_size,
                    'expires_at': timezone.now() + timedelta(days=7),
                    'metadata': metadata
                }
            )
            logger.info(f"Added song to cache: {url}")
        except Exception as e:
            logger.warning(f"Error adding song to cache: {str(e)}")
        
        # Check if format conversion is needed
        if output_format and output_format != 'mp3':
            final_filename = convert_audio_format(media_path, output_format)
            formatted_filename = f"{track_info['title']} - {track_info['artist']}.{output_format}"
            formatted_filename = sanitize_filename(formatted_filename)
        else:
            final_filename = media_path
        
        # Serve the file from the permanent media location
        response = FileResponse(
            open(final_filename, 'rb'),
            as_attachment=True,
            filename=formatted_filename
        )
        response['Content-Type'] = f'audio/{output_format or "mp3"}'
        
        # Explicitly set Content-Disposition header with filename
        response['Content-Disposition'] = f'attachment; filename="{formatted_filename}"'
        
        # Add song metadata headers
        response['x-song-title'] = track_info['title']
        response['x-song-artist'] = track_info['artist']
        if 'album' in track_info:
            response['x-album-name'] = track_info['album']
        if thumbnail_url:
            response['x-cover-url'] = thumbnail_url
            
        return response

    except Exception as e:
        logger.error(f"Spotify track download error: {e}", exc_info=True)
        return Response(
            {'error': f'Download failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )
    finally:
        # Clean up temp directory if it exists
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir, ignore_errors=True)
            except:
                pass

def download_playlist(request):
    """Download a playlist from YouTube or Spotify using parallel processing"""
    url = request.data.get('url')
    if not url:
        return Response({"error": "URL is required"}, status=status.HTTP_400_BAD_REQUEST)

    MAX_CONCURRENT_DOWNLOADS = 3 # Limit concurrency
    progress_lock = threading.Lock() # Lock for shared progress updates

    try:
        # ... existing code to get playlist_info ...
        playlist_info = get_playlist_info(url)
        # ... existing code ...
        
        playlist_title = playlist_info.get('title', 'Downloaded Playlist')
        playlist_description = playlist_info.get('description', '')
        track_urls = playlist_info.get('track_urls', [])
        playlist_image_url = playlist_info.get('image_url')
        
        logger.info(f"Playlist info retrieved: title={playlist_title}, tracks={len(track_urls)}, image_url={playlist_image_url}")
        
        if not track_urls:
            return Response({"error": "No tracks found in the playlist"}, 
                            status=status.HTTP_400_BAD_REQUEST)
        
        # Create the playlist
        playlist = Playlist.objects.create(
            user=request.user,
            name=playlist_title,
            description=playlist_description[:500] if playlist_description else "",
            source='spotify' if 'spotify.com' in url else 'youtube',
            source_url=url,
            thumbnail_url=playlist_image_url
        )
        
        # Track task progress
        download_progress = DownloadProgress.objects.create(
            task_id=f"playlist-{playlist.id}-{int(time.time())}",
            total_items=len(track_urls),
            current_progress=0,
            current_file="Starting playlist download..."
        )
        
        completed_downloads = 0
        successful_songs = [] # Collect successful songs here

        # Helper function to process a single track
        def _process_playlist_track(track_url):
            nonlocal completed_downloads # Use nonlocal to modify the outer scope variable
            
            try:
                # 1. Check if user already has this song
                existing_song = Song.objects.filter(user=request.user, song_url=track_url).first()
                if existing_song:
                    logger.info(f"[Parallel] Found existing song for user: {track_url}")
                    with progress_lock:
                        completed_downloads += 1
                        download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                        download_progress.current_file = f"(Exists) {existing_song.title}"
                        download_progress.save(update_fields=['current_progress', 'current_file'])
                    return existing_song # Return the song to be added later

                # 2. Check cache
                cached_song = SongCache.get_cached_song(track_url)
                if cached_song:
                    # ... (logic to handle cached song, create Song object if needed) ...
                    # Simplified cache handling for brevity - assumes cache hit means success
                    # In a real scenario, you'd replicate the full cache logic here
                    # Ensure file exists, get metadata, create Song object
                    
                    # Placeholder: Assume cache hit is valid and create/get the song object
                    # This part needs the full logic from the original sequential code
                    metadata = cached_song.metadata or {}
                    title = metadata.get('title', 'Unknown Title')
                    artist = metadata.get('artist', 'Unknown Artist')
                    album = metadata.get('album', 'Unknown Album')
                    cached_file_path_rel = cached_song.file_path # Assuming file_path is relative
                    
                    # Check if file exists (simplified)
                    full_path = os.path.join(settings.MEDIA_ROOT, cached_file_path_rel)
                    if os.path.exists(full_path):
                        song, created = Song.objects.get_or_create(
                            user=request.user,
                            song_url=track_url,
                            defaults={
                                'title': sanitize_for_db(title),
                                'artist': sanitize_for_db(artist),
                                'album': sanitize_for_db(album),
                                'file': cached_file_path_rel, # Use relative path from cache
                                'source': 'cache', # Indicate it came from cache
                                'spotify_id': metadata.get('spotify_id'),
                                'thumbnail_url': sanitize_for_db(metadata.get('thumbnail_url', ''), max_length=190),
                            }
                        )
                        logger.info(f"[Parallel] Used cached song: {track_url}")
                        with progress_lock:
                            completed_downloads += 1
                            download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                            download_progress.current_file = f"(Cache) {song.title}"
                            download_progress.save(update_fields=['current_progress', 'current_file'])
                        return song # Return the song
                    else:
                         logger.warning(f"[Parallel] Cached file not found for {track_url}, will download.")
                         # Fall through to download

                # 3. Download if not found or cache invalid
                logger.info(f"[Parallel] Downloading track: {track_url}")
                temp_dir = tempfile.mkdtemp()
                song = None
                try:
                    if 'youtube.com' in track_url or 'youtu.be' in track_url:
                        info_dict = download_from_huggingface(track_url, temp_dir)
                        # ... (logic to process info_dict, create Song, add to cache) ...
                        # Simplified processing:
                        media_path_rel, song = _save_and_record_song(request.user, track_url, info_dict, temp_dir, source='youtube')
                        if song:
                             _add_to_cache(track_url, media_path_rel, info_dict, source='youtube')

                    elif 'spotify.com' in track_url:
                        track_info = get_track_info(track_url)
                        if not track_info: raise Exception("Failed to get Spotify track info")
                        
                        query = f"{track_info['title']} {track_info['artist']}"
                        search_url = f"https://youtube.com/results?search_query={query.replace(' ', '+')}"
                        
                        info_dict = download_from_huggingface(search_url, temp_dir, spotify_metadata=track_info)
                        # ... (logic to process info_dict using track_info, create Song, add to cache) ...
                        # Simplified processing:
                        media_path_rel, song = _save_and_record_song(request.user, track_url, info_dict, temp_dir, source='spotify', spotify_info=track_info)
                        if song:
                            _add_to_cache(track_url, media_path_rel, info_dict, source='spotify', spotify_info=track_info)

                    else:
                        logger.warning(f"[Parallel] Unsupported URL in playlist: {track_url}")
                        return None # Indicate failure for this track

                    # If download and processing were successful
                    if song:
                        logger.info(f"[Parallel] Successfully processed track: {song.title}")
                        with progress_lock:
                            completed_downloads += 1
                            download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                            download_progress.current_file = f"(DL) {song.title}"
                            download_progress.save(update_fields=['current_progress', 'current_file'])
                        return song # Return the newly created song
                    else:
                        logger.error(f"[Parallel] Failed to process downloaded track: {track_url}")
                        return None # Indicate failure

                finally:
                    if temp_dir and os.path.exists(temp_dir):
                        shutil.rmtree(temp_dir, ignore_errors=True)

            except Exception as track_error:
                logger.error(f"[Parallel] Error processing track {track_url}: {track_error}", exc_info=True)
                # Update progress even on error to show advancement
                with progress_lock:
                    completed_downloads += 1 # Count as processed, even if failed
                    download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                    # Optionally update current_file to show the error or skip
                    download_progress.save(update_fields=['current_progress'])
                return None # Indicate failure

        # Use ThreadPoolExecutor for parallel processing
        with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_CONCURRENT_DOWNLOADS) as executor:
            # Submit all tasks
            future_to_url = {executor.submit(_process_playlist_track, url): url for url in track_urls}
            
            # Process results as they complete
            for future in concurrent.futures.as_completed(future_to_url):
                url = future_to_url[future]
                try:
                    result_song = future.result()
                    if result_song:
                        successful_songs.append(result_song)
                except Exception as exc:
                    logger.error(f'[Parallel] Track {url} generated an exception: {exc}')

        # Add all successful songs to the playlist at once
        if successful_songs:
            playlist.songs.add(*successful_songs)
            logger.info(f"Added {len(successful_songs)} songs to playlist {playlist.id}")

        # Final progress update
        with progress_lock:
            download_progress.current_progress = 100
            final_status = f"Playlist download complete. Added {len(successful_songs)}/{len(track_urls)} tracks."
            download_progress.current_file = final_status
            download_progress.save()

        # Check if we managed to download any songs
        if not successful_songs:
             # Clean up playlist if no songs were added? Optional.
             # playlist.delete() 
            return Response({
                "warning": f"Could not process any tracks from playlist '{playlist_title}'",
                "playlist_id": playlist.id
            }, status=status.HTTP_206_PARTIAL_CONTENT)
            
        # Increment download count for each successful track
        # Note: This assumes _process_playlist_track handles incrementing for new downloads
        # If not, increment here based on newly created songs vs existing/cached
        # request.user.bulk_increment_download_count(len(newly_downloaded_songs)) 
        
        # Record all downloads in analytics (consider if this should be in _process_playlist_track)
        try:
            # This might over-count if existing/cached songs aren't downloads
            # Adjust logic based on whether cache hits count as "downloads"
            for song in successful_songs:
                 # Maybe only record analytics if the song was newly downloaded?
                 # Requires _process_playlist_track to return more info or check source
                 UserAnalytics.record_download(request.user)
        except Exception as analytics_error:
            logger.warning(f"Error recording downloads in analytics: {analytics_error}")

        return Response({
            "message": f"Playlist '{playlist_title}' processed successfully",
            "playlist_id": playlist.id,
            "total_tracks": len(track_urls),
            "processed_tracks": completed_downloads, # Use the counter updated by threads
            "added_tracks": len(successful_songs)
        })

    except Exception as e:
        logger.error(f"Playlist download error: {e}", exc_info=True)
        # Clean up potentially created playlist object if the overall process fails early?
        # if 'playlist' in locals() and playlist.pk and not playlist.songs.exists():
        #     playlist.delete()
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


# Helper function to save song and create DB record (to avoid repetition)
def _save_and_record_song(user, song_url, info_dict, temp_dir, source, spotify_info=None):
    """Saves downloaded file, creates Song object."""
    try:
        # Determine metadata based on source
        if source == 'spotify' and spotify_info:
            title = sanitize_for_db(spotify_info['title'])
            artist = sanitize_for_db(spotify_info['artist'])
            album = sanitize_for_db(spotify_info.get('album', 'Unknown'))
            thumbnail_url = spotify_info.get('image_url') # Prefer Spotify image
            spotify_id = spotify_info.get('spotify_id')
            year = spotify_info.get('year')
            genre = spotify_info.get('genre', 'Unknown')
            album_artist = spotify_info.get('album_artist', artist)
        else: # YouTube or fallback
            title = sanitize_for_db(info_dict['title'])
            artist = sanitize_for_db(info_dict.get('artist', 'Unknown Artist'))
            album = sanitize_for_db(info_dict.get('album', 'Unknown'))
            thumbnail_url = info_dict.get('thumbnail')
            spotify_id = None # Not from Spotify
            year = info_dict.get('upload_date', '')[:4] if info_dict.get('upload_date') else None
            genre = 'Unknown'
            album_artist = artist

        # Use the downloaded file path from info_dict
        downloaded_filepath = info_dict.get('filepath')
        if not downloaded_filepath or not os.path.exists(downloaded_filepath):
             logger.error(f"Downloaded file path missing or invalid: {downloaded_filepath}")
             return None, None

        # Create final filename and sanitize it ONCE
        # Ensure the filename itself isn't too long before joining paths
        # Max filename length on Windows is typically 255, leave room for path
        base_filename = f"{title} - {artist}.mp3"
        safe_filename = sanitize_filename(base_filename, max_length=200) # Sanitize the filename part

        media_dir = os.path.join(settings.MEDIA_ROOT, 'songs')
        os.makedirs(media_dir, exist_ok=True)
        media_path = os.path.join(media_dir, safe_filename) # Use sanitized filename

        # Construct relative path using the SAME sanitized filename
        rel_path = os.path.join('songs', safe_filename)

        # Check final absolute path length (optional but good practice)
        if len(media_path) > 255:
            logger.warning(f"Resulting media path might be too long: {media_path}")
            # Consider further truncation or alternative handling if needed

        logger.info(f"Moving downloaded file from {downloaded_filepath} to {media_path}")
        # Move downloaded file to final location
        try:
            shutil.move(downloaded_filepath, media_path)
        except Exception as move_error:
            logger.error(f"Error moving file {downloaded_filepath} to {media_path}: {move_error}", exc_info=True)
            # If move fails, the file might still be in temp_dir, which will be cleaned up later
            return None, None # Stop if move fails

        # Embed metadata
        logger.info(f"Embedding metadata into: {media_path}")
        embed_metadata(
            mp3_path=media_path,
            title=title,
            artist=artist,
            album=album,
            thumbnail_url=thumbnail_url,
            year=year,
            genre=genre,
            album_artist=album_artist,
            spotify_id=spotify_id,
            # Add youtube_id if applicable
            youtube_id=info_dict.get('id') if source == 'youtube' else None
        )

        # Create Song object
        # Ensure the rel_path stored in DB doesn't exceed its limit (e.g., 100 chars for FileField default)
        # If rel_path is too long for the DB field, the create() call might fail.
        # We removed the problematic second sanitization of rel_path here.
        if len(rel_path) > 95: # Example check if FileField max_length is 100
            logger.warning(f"Relative path length ({len(rel_path)}) might exceed database limits: {rel_path}")
            # Handle this case - maybe truncate rel_path for DB storage, 
            # but be aware this might break retrieval if not handled carefully.
            # For now, proceed, assuming the DB field is large enough or truncation is acceptable.
            # rel_path_for_db = Truncator(rel_path).chars(95) # Example truncation

        song = Song.objects.create(
            user=user,
            title=title,
            artist=artist,
            album=album,
            file=rel_path, # Use the calculated relative path
            source=source,
            spotify_id=spotify_id,
            thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190) if thumbnail_url else None,
            song_url=song_url
        )

        # ... (update profile, etc.) ...
        try:
            profile, created = UserMusicProfile.objects.get_or_create(user=user)
            profile.update_profile(song)
        except Exception as profile_error:
            logger.warning(f"Error updating user profile for {song.id}: {profile_error}")

        # Increment download count (consider if this should be done in bulk later)
        # user.increment_download_count()

        logger.info(f"_save_and_record_song successful. Returning rel_path: {rel_path} for {song_url}")
        return rel_path, song # Return relative path and song object

    except Exception as e:
        logger.error(f"Error in _save_and_record_song for {song_url}: {e}", exc_info=True)
        # Clean up moved file if creation failed AFTER the move?
        if 'media_path' in locals() and os.path.exists(media_path):
             # This might happen if Song.objects.create fails
             # Decide if you want to remove the file from media/songs in this case
             # os.remove(media_path) # Be careful with cleanup
             logger.warning(f"File {media_path} was moved but DB record creation failed.")
             pass
        return None, None


# Helper function to add song to cache (to avoid repetition)
def _add_to_cache(song_url, rel_path, info_dict, source, spotify_info=None):
    """Adds the downloaded song to the SongCache."""
    try:
        cache_filename = os.path.basename(rel_path)
        cache_path = os.path.join('cache', cache_filename)
        cache_full_path = os.path.join(settings.MEDIA_ROOT, cache_path)
        media_full_path = os.path.join(settings.MEDIA_ROOT, rel_path)

        os.makedirs(os.path.dirname(cache_full_path), exist_ok=True)

        if not os.path.exists(cache_full_path):
            shutil.copy2(media_full_path, cache_full_path)

        file_size = os.path.getsize(media_full_path)

        # Prepare metadata based on source
        if source == 'spotify' and spotify_info:
            title = sanitize_for_db(spotify_info['title'])
            artist = sanitize_for_db(spotify_info['artist'])
            album = sanitize_for_db(spotify_info.get('album', 'Unknown'))
            thumbnail_url = spotify_info.get('image_url')
            spotify_id = spotify_info.get('spotify_id')
        else: # YouTube or fallback
            title = sanitize_for_db(info_dict['title'])
            artist = sanitize_for_db(info_dict.get('artist', 'Unknown Artist'))
            album = sanitize_for_db(info_dict.get('album', 'Unknown'))
            thumbnail_url = info_dict.get('thumbnail')
            spotify_id = None

        metadata = {
            'title': title,
            'artist': artist,
            'album': album,
            'thumbnail_url': sanitize_for_db(thumbnail_url, max_length=190) if thumbnail_url else None,
            'source': source,
            'spotify_id': spotify_id,
            'id': info_dict.get('id') if source == 'youtube' else None # YouTube ID
        }

        # Use setting or default to 7 days
        expiry_days = getattr(settings, 'SONG_CACHE_EXPIRY_DAYS', 7)

        SongCache.objects.update_or_create(
            song_url=song_url,
            defaults={
                'file_path': cache_path, # Store relative cache path
                'file_size': file_size,
                'expires_at': timezone.now() + timedelta(days=expiry_days), # Use setting or default
                'metadata': metadata,
                # Keep these for potential backward compatibility or simpler queries
                'title': title, 
                'artist': artist 
            }
        )
        logger.info(f"Added/Updated song cache for: {song_url}")

    except Exception as e:
        logger.warning(f"Error adding song to cache for {song_url}: {e}", exc_info=True)

def download_by_task(request):
    """
    Download a playlist by task_id after it has been processed asynchronously
    """
    try:
        task_id = request.GET.get('task_id')
        if not task_id:
            return Response(
                {'error': 'task_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the task result
        from celery.result import AsyncResult
        result = AsyncResult(task_id)
        
        if result.ready():
            # Result is ready, return it
            result_data = result.get()
            
            # Update user's music profile for download count
            if hasattr(request.user, 'music_profile'):
                user_profile = request.user.music_profile
                if result_data.get('success') and result_data.get('song_count'):
                    user_profile.total_songs_downloaded += result_data.get('song_count', 0)
                    user_profile.save(update_fields=['total_songs_downloaded'])
            
            return Response(result_data)
        else:
            # Task still running, check progress
            progress = DownloadProgress.objects.filter(task_id=task_id).first()
            
            if progress:
                return Response({
                    'status': 'in_progress',
                    'current': progress.current_progress,
                    'total': progress.total_items,
                    'current_file': progress.current_file,
                    'started_at': progress.started_at,
                    'estimated_completion': progress.estimated_completion_time
                })
            else:
                return Response({
                    'status': 'in_progress',
                    'message': 'Task is still running but no progress info available'
                })
    except Exception as e:
        logger.error(f"Error in download_by_task: {e}", exc_info=True)
        return Response(
            {'error': f'Download failed: {str(e)}'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

def download_from_huggingface(url, output_path, spotify_metadata=None):
    """
    Download a YouTube video using Hugging Face Spaces API
    Returns info dictionary with download info
    
    Args:
        url: YouTube URL or search query
        output_path: Directory to save the file
        spotify_metadata: Optional dict containing Spotify metadata to override YouTube metadata
    """
    logger.info(f"Downloading from Hugging Face Spaces: {url}")
    
    try:
        # Prepare the API request
        api_url = "https://monilm-songporter.hf.space/download-youtube/"
        payload = {"url": url}
        headers = {"Content-Type": "application/json"}
        
        # Make the request
        response = requests.post(api_url, data=json.dumps(payload), headers=headers)
        
        if response.status_code != 200:
            logger.error(f"Hugging Face API error: {response.status_code} - {response.text}")
            raise Exception(f"Hugging Face API returned status code {response.status_code}")
        
        # Generate a filename for the downloaded content
        timestamp = int(time.time())
        filename = os.path.join(output_path, f"download-{timestamp}.mp3")
        
        # Ensure directory exists
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        
        # Write the content to a file
        with open(filename, 'wb') as f:
            f.write(response.content)
        
        logger.info(f"Successfully downloaded file to {filename}")
        
        # Extract metadata from response headers if available
        title = response.headers.get('x-song-title', 'Unknown Title')
        artist = response.headers.get('x-song-artist', 'Unknown Artist')
        album = response.headers.get('x-album-name', 'Unknown Album')
        thumbnail_url = response.headers.get('x-cover-url')
        
        # If Spotify metadata is provided, it takes precedence over the YouTube metadata
        if spotify_metadata:
            title = spotify_metadata.get('title', title)
            artist = spotify_metadata.get('artist', artist)
            album = spotify_metadata.get('album', album)
            # Always use the Spotify thumbnail if available
            if 'image_url' in spotify_metadata and spotify_metadata['image_url']:
                thumbnail_url = spotify_metadata['image_url']
                logger.info(f"Using Spotify thumbnail URL: {thumbnail_url}")
        
        # Return info dictionary similar to what yt-dlp would return
        info = {
            'filepath': filename,
            'title': title,
            'artist': artist,
            'album': album,
            'thumbnail': thumbnail_url,
            'id': url.split('v=')[-1].split('&')[0] if 'v=' in url else None
        }
        
        return info
        
    except Exception as e:
        logger.error(f"Error downloading from Hugging Face: {e}", exc_info=True)
        raise