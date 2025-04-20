import os
import logging
import time
import tempfile
import shutil
import yt_dlp
from django.conf import settings
from django.http import FileResponse
from django.utils import timezone
from datetime import timedelta
from rest_framework import status
from rest_framework.response import Response

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
        if cached_song:
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
        # Generate a temporary filename
        temp_filename = os.path.join(temp_dir, sanitize_filename(f'download-{int(time.time())}'))
        
        # Define download options
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': temp_filename,
            'writethumbnail': True,
            'noplaylist': True,  # Only download the single video, not the playlist
        }

        # Download the file using our retry-enabled function
        info = download_from_youtube(url, temp_filename, **ydl_opts)
        
        # The actual file has .mp3 extension added by the postprocessor
        temp_mp3_filename = temp_filename + '.mp3'
        
        # Convert to requested format if different from mp3
        if output_format and output_format != 'mp3':
            final_filename = convert_audio_format(temp_mp3_filename, output_format)
        else:
            final_filename = temp_mp3_filename
        
        # Get thumbnail path - first check for local files
        thumbnail_path = None
        for ext in ['jpg', 'png', 'webp']:
            possible_path = f"{temp_filename}.{ext}"
            if os.path.exists(possible_path):
                thumbnail_path = possible_path
                break
        
        # Create destination paths
        formatted_filename = f"{info['title']} - {info.get('uploader', 'Unknown Artist')}.{output_format or 'mp3'}"
        formatted_filename = sanitize_filename(formatted_filename)
        
        # Copy to media directory
        media_dir = os.path.join(settings.MEDIA_ROOT, 'songs')
        os.makedirs(media_dir, exist_ok=True)
        media_path = os.path.join(media_dir, formatted_filename)
        
        shutil.copy2(final_filename, media_path)
        
        # Copy thumbnail if it exists
        thumbnail_url = None
        if (thumbnail_path):
            thumb_filename = f"{info['title']} - {info.get('uploader', 'Unknown Artist')}.{os.path.splitext(thumbnail_path)[1][1:]}"
            thumb_filename = sanitize_filename(thumb_filename)
            thumb_media_path = os.path.join(media_dir, thumb_filename)
            shutil.copy2(thumbnail_path, thumb_media_path)
            thumbnail_url = f"/media/songs/{thumb_filename}"
        
        # If no local thumbnail, try to get from info
        if not thumbnail_url:
            for key in ['thumbnail', 'thumbnails']:
                if key in info and info[key]:
                    if isinstance(info[key], list) and len(info[key]) > 0:
                        # Get highest quality thumbnail
                        best_thumb = max(info[key], key=lambda x: x.get('height', 0) if isinstance(x, dict) else 0)
                        thumbnail_url = best_thumb.get('url') if isinstance(best_thumb, dict) else best_thumb
                    else:
                        thumbnail_url = info[key]
                    break
        
        # Create the song record
        rel_path = os.path.join('songs', formatted_filename)
        rel_path = sanitize_filename(rel_path, max_length=95)
        
        # Embed metadata including thumbnail into the MP3 file
        embed_metadata(
            mp3_path=media_path,
            title=info['title'],
            artist=info.get('uploader', 'Unknown Artist'),
            album=info.get('album', 'Unknown'),
            thumbnail_url=thumbnail_url,
            year=info.get('upload_date', '')[:4] if info.get('upload_date') else None,
            album_artist=info.get('channel', info.get('uploader', 'Unknown Artist')),
            youtube_id=info.get('id')
        )
        
        song = Song.objects.create(
            user=request.user,
            title=sanitize_for_db(info['title']),
            artist=sanitize_for_db(info.get('uploader', 'Unknown Artist')),
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
                'artist': info.get('uploader', 'Unknown Artist'),
                'album': info.get('album', 'Unknown'),
                'thumbnail_url': thumbnail_url,
                'source': 'youtube',
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
        response['x-song-artist'] = info.get('uploader', 'Unknown Artist')
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
        temp_filename = os.path.join(temp_dir, sanitize_filename(f'download-{int(time.time())}'))
        
        # Download from YouTube using yt-dlp
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': temp_filename,
            'writethumbnail': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"Downloading using YouTube search: ytsearch:{query}")
            info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
            filename = ydl.prepare_filename(info)
            base_filename = os.path.splitext(filename)[0]
            mp3_filename = base_filename + '.mp3'
            
            logger.info(f"Downloaded file to: {mp3_filename}")
            
            # Always prioritize Spotify thumbnail if available
            if not thumbnail_url:
                logger.warning("No Spotify thumbnail URL available, will use YouTube thumbnail")
                # If no Spotify thumbnail, check for local files
                for ext in ['jpg', 'png', 'webp']:
                    possible_path = f"{base_filename}.{ext}"
                    if os.path.exists(possible_path):
                        thumbnail_path = possible_path
                        # Copy this to media and create a URL
                        thumb_filename = f"{sanitize_filename(track_info['title'])} - {sanitize_filename(track_info['artist'])}.{ext}"
                        media_thumb_path = os.path.join(settings.MEDIA_ROOT, 'songs', thumb_filename)
                        os.makedirs(os.path.dirname(media_thumb_path), exist_ok=True)
                        shutil.copy2(possible_path, media_thumb_path)
                        thumbnail_url = f"/media/songs/{thumb_filename}"
                        logger.info(f"Using local thumbnail: {thumbnail_url}")
                        break
            
            # If still no thumbnail, try to get from YouTube info
            if not thumbnail_url:
                for key in ['thumbnail', 'thumbnails']:
                    if key in info and info[key]:
                        if isinstance(info[key], list) and len(info[key]) > 0:
                            # Get highest quality thumbnail
                            best_thumb = max(info[key], key=lambda x: x.get('height', 0) if isinstance(x, dict) else 0)
                            thumbnail_url = best_thumb.get('url') if isinstance(best_thumb, dict) else best_thumb
                            logger.info(f"Using YouTube thumbnail: {thumbnail_url}")
                        else:
                            thumbnail_url = info[key]
                        break
            
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
                
                # Embed metadata including thumbnail into the MP3 file
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
                shutil.copy2(mp3_filename, cache_full_path)
                
                # Calculate file size
                file_size = os.path.getsize(mp3_filename)
                
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
            
            # Serve the file from the permanent media location
            response = FileResponse(
                open(media_path, 'rb'),
                as_attachment=True,
                filename=formatted_filename
            )
            response['Content-Type'] = 'audio/mpeg'
            
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
    """Download a playlist from YouTube or Spotify"""
    url = request.data.get('url')
    if not url:
        return Response({"error": "URL is required"}, status=status.HTTP_400_BAD_REQUEST)
    
    try:
        # Extract playlist info to get track URLs
        try:
            playlist_info = get_playlist_info(url)
        except Exception as e:
            logger.error(f"Failed to get playlist info: {str(e)}")
            return Response({"error": f"Failed to get playlist information: {str(e)}"}, 
                           status=status.HTTP_400_BAD_REQUEST)
            
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
            thumbnail_url=playlist_image_url  # Add the playlist thumbnail URL
        )
        
        # Track task progress
        download_progress = DownloadProgress.objects.create(
            task_id=f"playlist-{playlist.id}-{int(time.time())}",
            total_items=len(track_urls),
            current_progress=0,
            current_file="Starting playlist download..."
        )
        
        # Keep a separate counter for completed downloads
        completed_downloads = 0
        
        for track_url in track_urls:
            try:
                # First check if the user already has this song
                existing_song = Song.objects.filter(user=request.user, song_url=track_url).first()
                if (existing_song):
                    # Song already exists, just add it to the playlist
                    playlist.songs.add(existing_song)
                    
                    # Update progress
                    completed_downloads += 1
                    download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                    download_progress.current_file = f"{existing_song.title} - {existing_song.artist}"
                    download_progress.save()
                    logger.info(f"Added existing song to playlist: {track_url}")
                    continue
                    
                # Next check if the song is already in cache
                cached_song = SongCache.get_cached_song(track_url)
                
                if cached_song:
                    # Get metadata from cache - handle the case where metadata might not exist
                    metadata = {}
                    
                    # Try to get metadata from the new JSON field first
                    if hasattr(cached_song, 'metadata') and cached_song.metadata:
                        metadata = cached_song.metadata
                    # Fall back to individual fields if metadata JSON field is not available
                    else:
                        metadata = {
                            'title': cached_song.title or 'Unknown Title',
                            'artist': cached_song.artist or 'Unknown Artist',
                            'album': 'Unknown Album'
                        }
                        
                    title = metadata.get('title', cached_song.title or 'Unknown Title')
                    artist = metadata.get('artist', cached_song.artist or 'Unknown Artist')
                    album = metadata.get('album', 'Unknown Album')
                    
                    # Make sure we have a valid path in the cached_song
                    if not hasattr(cached_song, 'local_path') and hasattr(cached_song, 'file_path'):
                        cached_file_path = cached_song.file_path
                    else:
                        cached_file_path = cached_song.local_path if hasattr(cached_song, 'local_path') else None
                        
                    # Verify the file actually exists
                    if cached_file_path:
                        file_exists = False
                        if isinstance(cached_file_path, str):
                            full_path = os.path.join(settings.MEDIA_ROOT, cached_file_path)
                            file_exists = os.path.exists(full_path)
                        else:
                            # Handle FileField types
                            try:
                                full_path = os.path.join(settings.MEDIA_ROOT, cached_file_path.name)
                                file_exists = os.path.exists(full_path)
                            except:
                                file_exists = False
                        
                        if not file_exists:
                            # Skip this cached song since file is missing
                            logger.warning(f"Cached file not found for {track_url}, will download again")
                            raise FileNotFoundError("Cached file not found")
                        
                        # Create a song entry for this user if they don't already have it
                        if not Song.objects.filter(user=request.user, song_url=track_url).exists():
                            # Create the song record
                            song = Song.objects.create(
                                user=request.user,
                                title=title,
                                artist=artist,
                                album=album,
                                file=cached_file_path,
                                source='playlist',
                                spotify_id=metadata.get('spotify_id'),
                                thumbnail_url=sanitize_for_db(metadata.get('thumbnail_url', ''), max_length=190),
                                song_url=track_url
                            )
                            
                            # Add song to playlist
                            playlist.songs.add(song)
                            
                            # Update user's music profile
                            try:
                                profile, created = UserMusicProfile.objects.get_or_create(user=request.user)
                                profile.update_profile(song)
                            except Exception as profile_error:
                                logger.warning(f"Error updating user profile: {profile_error}")
                        else:
                            # If song exists, just add it to the playlist
                            try:
                                song = Song.objects.filter(user=request.user, song_url=track_url).first()
                                if song:
                                    playlist.songs.add(song)
                                else:
                                    logger.warning(f"No song found with URL {track_url} for user {request.user.id}")
                            except Exception as e:
                                logger.error(f"Error adding existing song to playlist: {e}")
                                continue
                        
                        # Update progress
                        completed_downloads += 1
                        download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                        download_progress.current_file = f"{title} - {artist}"
                        download_progress.save()
                        logger.info(f"Added cached song to playlist: {track_url}")
                        continue
                
                # If we get here, we need to download the song
                # Download the song using the appropriate method based on URL
                if 'youtube.com' in track_url or 'youtu.be' in track_url:
                    try:
                        info_dict = download_youtube_util(track_url, output_path=settings.MEDIA_ROOT)
                        file_path = info_dict.get('filepath')
                        
                        if file_path:
                            # Check if this song already exists for this user before creating a new one
                            existing_song = Song.objects.filter(
                                user=request.user, 
                                song_url=track_url
                            ).first()
                            
                            if existing_song:
                                song = existing_song
                                # Update the thumbnail if it was missing
                                if not existing_song.thumbnail_url and info_dict.get('thumbnail'):
                                    existing_song.thumbnail_url = sanitize_for_db(info_dict.get('thumbnail', ''), max_length=190)
                                    existing_song.save()
                            else:
                                song = Song.objects.create(
                                    user=request.user,
                                    title=sanitize_for_db(info_dict.get('title', 'Unknown Title')),
                                    artist=sanitize_for_db(info_dict.get('artist', 'Unknown')),
                                    album=sanitize_for_db(info_dict.get('album', 'Unknown')),
                                    file=os.path.relpath(file_path, settings.MEDIA_ROOT),
                                    thumbnail_url=sanitize_for_db(info_dict.get('thumbnail', ''), max_length=190),
                                    source='youtube',
                                    song_url=track_url
                                )
                            
                            # Add to cache
                            try:
                                formatted_filename = f"{song.title} - {song.artist}.mp3"
                                formatted_filename = sanitize_filename(formatted_filename)
                                cache_path = os.path.join('cache', formatted_filename)
                                cache_full_path = os.path.join(settings.MEDIA_ROOT, cache_path)
                                
                                # Make sure the cache directory exists
                                os.makedirs(os.path.dirname(cache_full_path), exist_ok=True)
                                
                                # Copy the file to the cache directory
                                if not os.path.exists(cache_full_path):
                                    shutil.copy2(file_path, cache_full_path)
                                
                                # Calculate file size
                                file_size = os.path.getsize(file_path)
                                
                                # Embed metadata including thumbnail
                                if song.thumbnail_url:
                                    embed_metadata(
                                        mp3_path=file_path,
                                        title=song.title,
                                        artist=song.artist,
                                        album=song.album,
                                        thumbnail_url=song.thumbnail_url,
                                        youtube_id=track_url.split('v=')[-1].split('&')[0] if 'v=' in track_url else None
                                    )
                                
                                # Prepare metadata
                                metadata = {
                                    'title': song.title,
                                    'artist': song.artist,
                                    'album': song.album,
                                    'thumbnail_url': song.thumbnail_url,
                                    'source': 'youtube'
                                }
                                
                                # Create or update cache entry with metadata in the JSON field
                                SongCache.objects.update_or_create(
                                    song_url=track_url,
                                    defaults={
                                        'file_path': cache_path,
                                        'file_size': file_size,
                                        'expires_at': timezone.now() + timedelta(days=7),  # Cache for 7 days
                                        'metadata': metadata,
                                        'title': song.title,     # Store these for backward compatibility
                                        'artist': song.artist
                                    }
                                )
                                logger.info(f"Added YouTube song to cache from playlist: {track_url}")
                            except Exception as cache_error:
                                logger.warning(f"Error adding YouTube song to cache from playlist: {cache_error}")
                            
                            # Add song to playlist
                            playlist.songs.add(song)
                        else:
                            logger.warning(f"No file path returned for {track_url}")
                    except Exception as yt_error:
                        logger.error(f"Error downloading YouTube track {track_url}: {str(yt_error)}")
                        continue
                elif 'spotify.com' in track_url:
                    try:
                        # Simplified download for Spotify tracks in playlists
                        track_info = get_track_info(track_url)
                        query = f"{track_info['title']} {track_info['artist']}"
                        
                        # Get the Spotify thumbnail URL from the track info
                        thumbnail_url = track_info.get('image_url')
                        logger.info(f"Spotify track info: {track_info['title']} - {track_info['artist']}, thumbnail: {thumbnail_url}")
                        
                        ydl_opts = {
                            'format': 'bestaudio/best',
                            'postprocessors': [{
                                'key': 'FFmpegExtractAudio',
                                'preferredcodec': 'mp3',
                                'preferredquality': '192',
                            }],
                            'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
                            'writethumbnail': True,
                        }
                        
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
                            filename = ydl.prepare_filename(info)
                            base_filename = os.path.splitext(filename)[0]
                            mp3_filename = base_filename + '.mp3'
                            
                            # If no Spotify thumbnail, check for local files
                            if not thumbnail_url:
                                for ext in ['jpg', 'png', 'webp']:
                                    possible_path = f"{base_filename}.{ext}"
                                    if os.path.exists(possible_path):
                                        # Copy thumbnail to media directory
                                        thumb_basename = f"{sanitize_filename(track_info['title'])} - {sanitize_filename(track_info['artist'])}.{ext}"
                                        thumb_path = os.path.join(settings.MEDIA_ROOT, 'songs', thumb_basename)
                                        os.makedirs(os.path.dirname(thumb_path), exist_ok=True)
                                        shutil.copy2(possible_path, thumb_path)
                                        thumbnail_url = f"/media/songs/{thumb_basename}"
                                        logger.info(f"Using local thumbnail for Spotify track: {thumbnail_url}")
                                        break
                            
                            # If still no thumbnail, try to get from YouTube info
                            if not thumbnail_url:
                                for key in ['thumbnail', 'thumbnails']:
                                    if key in info and info[key]:
                                        if isinstance(info[key], list) and len(info[key]) > 0:
                                            # Get highest quality thumbnail
                                            best_thumb = max(info[key], key=lambda x: x.get('height', 0) if isinstance(x, dict) else 0)
                                            thumbnail_url = best_thumb.get('url') if isinstance(best_thumb, dict) else best_thumb
                                            logger.info(f"Using YouTube thumbnail for Spotify track: {thumbnail_url}")
                                        else:
                                            thumbnail_url = info[key]
                                        break
                            
                            # Check if this song already exists for this user before creating a new one
                            existing_song = Song.objects.filter(
                                user=request.user, 
                                song_url=track_url
                            ).first()
                            
                            if existing_song:
                                song = existing_song
                                # Update the thumbnail URL if it was missing before
                                if thumbnail_url and not existing_song.thumbnail_url:
                                    existing_song.thumbnail_url = sanitize_for_db(thumbnail_url, max_length=190)
                                    existing_song.save()
                            else:
                                # Sanitize file path for database
                                rel_path = os.path.relpath(mp3_filename, settings.MEDIA_ROOT)
                                rel_path = sanitize_filename(rel_path, max_length=95)
                                
                                # Embed metadata including thumbnail into the MP3 file
                                embed_metadata(
                                    mp3_path=mp3_filename,
                                    title=track_info['title'],
                                    artist=track_info['artist'],
                                    album=track_info.get('album', 'Unknown'),
                                    thumbnail_url=thumbnail_url,
                                    year=track_info.get('year'),
                                    genre=track_info.get('genre', 'Unknown'),
                                    album_artist=track_info.get('album_artist', track_info['artist']),
                                    spotify_id=track_info.get('spotify_id')
                                )
                                
                                song = Song.objects.create(
                                    user=request.user,
                                    title=sanitize_for_db(track_info['title']),
                                    artist=sanitize_for_db(track_info['artist']),
                                    album=sanitize_for_db(track_info.get('album', 'Unknown')),
                                    file=rel_path,
                                    source='spotify',
                                    spotify_id=track_info.get('spotify_id'),
                                    thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190) if thumbnail_url else None,
                                    song_url=track_url
                                )
                            
                            # Add to cache
                            try:
                                formatted_filename = f"{track_info['title']} - {track_info['artist']}.mp3"
                                formatted_filename = sanitize_filename(formatted_filename)
                                cache_path = os.path.join('cache', formatted_filename)
                                cache_full_path = os.path.join(settings.MEDIA_ROOT, cache_path)
                                
                                # Make sure the cache directory exists
                                os.makedirs(os.path.dirname(cache_full_path), exist_ok=True)
                                
                                # Copy the file to the cache directory
                                if not os.path.exists(cache_full_path):
                                    shutil.copy2(mp3_filename, cache_full_path)
                                
                                # Calculate file size
                                file_size = os.path.getsize(mp3_filename)
                                
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
                                    song_url=track_url,
                                    defaults={
                                        'file_path': cache_path,
                                        'file_size': file_size,
                                        'expires_at': timezone.now() + timedelta(days=7),  # Cache for 7 days
                                        'metadata': metadata,
                                        'title': song.title,     # Store these for backward compatibility
                                        'artist': song.artist
                                    }
                                )
                                logger.info(f"Added Spotify song to cache from playlist: {track_url}")
                            except Exception as cache_error:
                                logger.warning(f"Error adding Spotify song to cache from playlist: {cache_error}")
                            
                            # Add song to playlist
                            playlist.songs.add(song)
                    except Exception as spotify_error:
                        logger.error(f"Error downloading Spotify track {track_url}: {str(spotify_error)}")
                        continue
                else:
                    logger.warning(f"Unsupported URL: {track_url}")
                    continue
                
                # Update progress for non-cached songs
                completed_downloads += 1
                download_progress.current_progress = int(completed_downloads / download_progress.total_items * 100)
                download_progress.current_file = f"Track {completed_downloads}/{len(track_urls)}"
                download_progress.save()
            
            except Exception as track_error:
                logger.error(f"Error downloading track {track_url}: {track_error}")
                continue
        
        # Update final progress
        download_progress.current_progress = 100
        download_progress.current_file = "Playlist download complete"
        download_progress.save()
        
        # Check if we managed to download any songs
        if completed_downloads == 0:
            return Response({
                "warning": f"Could not download any tracks from playlist '{playlist_title}'",
                "playlist_id": playlist.id
            }, status=status.HTTP_206_PARTIAL_CONTENT)
            
        # Increment download count for each successful track
        request.user.bulk_increment_download_count(completed_downloads)
        
        # Record all downloads in analytics
        try:
            for _ in range(completed_downloads):
                UserAnalytics.record_download(request.user)
        except Exception as analytics_error:
            logger.warning(f"Error recording downloads in analytics: {analytics_error}")

        return Response({
            "message": f"Playlist '{playlist_title}' downloaded successfully",
            "playlist_id": playlist.id,
            "total_tracks": len(track_urls),
            "downloaded_tracks": completed_downloads
        })

    except Exception as e:
        logger.error(f"Playlist download error: {e}", exc_info=True)
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

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