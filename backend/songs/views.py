import os
import json
import logging
import time
import tempfile
import shutil
import yt_dlp
from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.utils import timezone
from datetime import timedelta, datetime
from django.conf import settings
from django.http import JsonResponse, FileResponse, HttpResponse, StreamingHttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action, api_view
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from celery.result import AsyncResult
from .models import Song, Playlist, UserMusicProfile,DownloadProgress, SongCache, SongPlay, UserAnalytics
from .serializers import SongSerializer, PlaylistSerializer, UserMusicProfileSerializer, ArtistSerializer
from .tasks import download_song, download_spotify_playlist, download_youtube_playlist
from .spotify_api import get_playlist_tracks, get_spotify_client, get_track_info, get_playlist_info, extract_spotify_id
from rest_framework.views import APIView
from .recommendation import get_hybrid_recommendations, update_user_recommendations, get_recommender
from django.utils import timezone
from django.http import HttpResponse
from django_ratelimit.decorators import ratelimit
from django_ratelimit.exceptions import Ratelimited
from functools import wraps
from .utils import (
    youtube_api_retry, spotify_api_retry, download_from_youtube, 
    convert_audio_format, download_youtube_util, sanitize_filename, embed_metadata
)
from django.utils.text import Truncator


logger = logging.getLogger(__name__)

# Handler for rate limit exceeded
def ratelimited_error(request, exception):
    """Return a custom response for rate-limited requests"""
    return HttpResponse("Rate limit exceeded. Please try again later.", status=429)

# Custom rate limit decorator that combines both IP and user-based limits
def custom_ratelimit(group=None, key=None, rate=None, method=None, block=True):
    """
    Custom rate limit decorator that can be used with both function views and ViewSet methods
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapped_view(*args, **kwargs):
            # For ViewSet methods, the first argument is 'self' and the second is 'request'
            # For regular function views, the first argument is 'request'
            if len(args) > 1 and hasattr(args[0], 'request'):
                # This is a ViewSet method
                viewset_instance = args[0]
                request = args[1]
                
                # Make sure request is actually a request object and not a string
                if not hasattr(request, 'method'):
                    # If it's not a request object, just proceed with the view
                    logger.warning(f"Rate limit check skipped - invalid request object: {type(request)}")
                    return view_func(*args, **kwargs)
                
                # Apply rate limiting directly
                from django_ratelimit.core import is_ratelimited
                
                # Check if rate limited
                try:
                    if is_ratelimited(
                        request=request,
                        group=group or 'default',
                        key=key or 'ip',
                        rate=rate,
                        method=method or 'ALL',
                        increment=True
                    ):
                        if block:
                            # Rate limit exceeded
                            logger.warning(f"Rate limit exceeded for {request.path} from {request.META.get('REMOTE_ADDR')}")
                            return HttpResponse("Rate limit exceeded. Please try again later.", status=429)
                except Exception as e:
                    # Log the error but don't block the request
                    logger.error(f"Error in rate limiting: {e}")
                
                # Not rate limited, proceed with the view
                return view_func(*args, **kwargs)
            else:
                # This is a regular function view, use the standard decorator
                try:
                    # Apply IP-based rate limiting
                    ip_ratelimited = ratelimit(
                        key=key or 'ip',
                        rate=rate,
                        method=method or 'ALL',
                        block=block,
                        group=group or 'default'
                    )(view_func)
                    
                    return ip_ratelimited(*args, **kwargs)
                except Exception as e:
                    # Log the error but don't block the request
                    logger.error(f"Error in rate limiting: {e}")
                    return view_func(*args, **kwargs)
                
        return wrapped_view
    return decorator

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

class SongViewSet(viewsets.ModelViewSet):
    queryset = Song.objects.all()
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Song.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        
    def get_serializer_context(self):
        context = super().get_serializer_context()
        return context

    @action(detail=True, methods=['get'], permission_classes=[])
    @ratelimit(key='ip', rate='5/10m', block=True)
    def public_download(self, request, pk=None):
        """
        Public endpoint to download a song without authentication.
        Rate limited to prevent abuse.
        
        """
        self.permission_classes = []
        self.check_permissions(request)
        print(f"Public download requested for song ID: {pk}")
        try:
            # Get the song by ID without user filter since this is a public endpoint
            song = get_object_or_404(Song, id=pk)
            file_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
            
            if not os.path.exists(file_path):
                logger.warning(f"Public download requested for missing file: {file_path}")
                return Response(
                    {'error': 'File not found'}, 
                    status=status.HTTP_404_NOT_FOUND
                )

            # Log the download attempt with IP for monitoring
            ip_address = request.META.get('REMOTE_ADDR', 'unknown')
            logger.info(f"Public download requested for song {pk} from IP {ip_address}")
            
            # Serve the file
            filename = f"{song.title} - {song.artist}.mp3"
            filename = sanitize_filename(filename)
            response = FileResponse(
                open(file_path, 'rb'),
                as_attachment=True,
                filename=filename
            )
            response['Content-Type'] = 'audio/mpeg'
            # Add song metadata headers
            response['x-song-title'] = song.title
            response['x-song-artist'] = song.artist
            if song.album:
                response['x-album-name'] = song.album
            if song.thumbnail_url:
                response['x-cover-url'] = song.thumbnail_url
            return response
            
        except Exception as e:
            logger.error(f"Error in public_download: {e}", exc_info=True)
            return Response(
                {'error': 'Download failed'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
            
    @action(detail=False, methods=['post'], permission_classes=[])
    @ratelimit(key='ip', rate='5/10m', block=True)
    def public_download_by_url(self, request):
        """
        Public endpoint to download a song by URL without authentication.
        Rate limited to prevent abuse.
        """
        # Override permission check explicitly for this method
        self.permission_classes = []
        self.check_permissions(request)
        
        
        url = request.data.get('url')
        output_format = request.data.get('format', 'mp3')
        print(f"Public download by URL requested: {url}")
        
        if not url:
            return Response(
                {'error': 'URL is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Validate format
        if output_format not in settings.SUPPORTED_AUDIO_FORMATS:
            return Response(
                {'error': f'Unsupported format. Supported formats: {", ".join(settings.SUPPORTED_AUDIO_FORMATS)}'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Log the download attempt with IP for monitoring
            ip_address = request.META.get('REMOTE_ADDR', 'unknown')
            logger.info(f"Public download by URL requested for {url} from IP {ip_address}")
            
            # Check if the song with this URL already exists in the database (for any user)
            existing_song = Song.objects.filter(song_url=url).first()
            
            if existing_song:
                # We found the song, serve it
                file_path = os.path.join(settings.MEDIA_ROOT, existing_song.file.name)
                
                if not os.path.exists(file_path):
                    # File is missing, need to download again or return error
                    logger.warning(f"Public download requested for missing file: {file_path}")
                    return Response(
                        {'error': 'File not found'}, 
                        status=status.HTTP_404_NOT_FOUND
                    )
                
                # Check if we need to convert format
                if output_format != 'mp3' and os.path.splitext(file_path)[1][1:] != output_format:
                    # Convert the format
                    logger.info(f"Converting song from {os.path.splitext(file_path)[1][1:]} to {output_format}")
                    final_filename = convert_audio_format(file_path, output_format)
                else:
                    final_filename = file_path
                
                # Serve the file
                filename = f"{existing_song.title} - {existing_song.artist}.{output_format}"
                filename = sanitize_filename(filename)
                response = FileResponse(
                    open(final_filename, 'rb'),
                    as_attachment=True,
                    filename=filename
                )
                response['Content-Type'] = f'audio/{output_format}'
                # Add song metadata headers
                response['x-song-title'] = existing_song.title
                response['x-song-artist'] = existing_song.artist
                if existing_song.album:
                    response['x-album-name'] = existing_song.album
                if existing_song.thumbnail_url:
                    response['x-cover-url'] = existing_song.thumbnail_url
                return response
            
            # Song not in database, check cache
            cached_song = SongCache.get_cached_song(url)
            if cached_song:
                logger.info(f"Using cached version for URL: {url}")
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
                
                # Check if file exists
                if not os.path.exists(cached_file_path):
                    # File missing from cache, cannot serve
                    logger.warning(f"Public download cached file not found: {cached_file_path}")
                    return Response(
                        {'error': 'File not found'}, 
                        status=status.HTTP_404_NOT_FOUND
                    )
                
                # Check if we need format conversion
                if output_format != 'mp3' and os.path.splitext(cached_file_path)[1][1:] != output_format:
                    # Convert the format
                    logger.info(f"Converting cached song from {os.path.splitext(cached_file_path)[1][1:]} to {output_format}")
                    final_filename = convert_audio_format(cached_file_path, output_format)
                else:
                    final_filename = cached_file_path
                
                # Serve the file
                formatted_filename = f"{title} - {artist}.{output_format}"
                formatted_filename = sanitize_filename(formatted_filename)
                
                response = FileResponse(
                    open(final_filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                response['Content-Type'] = f'audio/{output_format}'
                # Add song metadata headers
                response['x-song-title'] = title
                response['x-song-artist'] = artist
                if 'album' in metadata:
                    response['x-album-name'] = metadata['album']
                if metadata.get('thumbnail_url'):
                    response['x-cover-url'] = metadata['thumbnail_url']
                return response
            
            # Neither song in database nor cache, need to download
            # For public users, we'll limit this to avoid abuse
            if 'spotify.com' in url:
                # Handle Spotify URLs
                result = self._download_spotify_track(url, output_format)
                
                # Since _download_spotify_track returns a Response object, we can just return it
                return result
            elif 'youtube.com' in url or 'youtu.be' in url:
                # Handle YouTube URLs
                result = self._download_youtube(url, output_format)
                
                # Since _download_youtube returns a Response object, we can just return it
                return result
            else:
                return Response(
                    {'error': 'Unsupported URL. Only YouTube and Spotify URLs are supported.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
        except Exception as e:
            logger.error(f"Error in public_download_by_url: {e}", exc_info=True)
            return Response(
                {'error': 'Download failed'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @custom_ratelimit(group='download', key='ip', rate='30/hour', method='ALL')
    @action(detail=False, methods=['post'], url_path='download')
    def download(self, request):
        """
        Download a song from a URL (YouTube or Spotify)
        """
        url = request.data.get('url')
        format = request.data.get('format', settings.DEFAULT_AUDIO_FORMAT)
        
        if not url:
            return Response(
                {'error': 'URL is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Validate format
        if format not in settings.SUPPORTED_AUDIO_FORMATS:
            return Response(
                {'error': f'Unsupported format. Supported formats: {", ".join(settings.SUPPORTED_AUDIO_FORMATS)}'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
            
        # Check if user can download
        if not request.user.can_download():
            return Response(
                {
                    'error': 'Daily download limit reached',
                    'remaining': 0,
                    'reset_time': request.user.last_download_reset + timedelta(days=1)
                }, 
                status=status.HTTP_429_TOO_MANY_REQUESTS
            )
        
        try:
            # First, detect if this is a Spotify URL and check its type
            if 'spotify.com' in url:
                from .spotify_api import extract_spotify_id
                resource_type, _ = extract_spotify_id(url)
                
                # If it's a playlist, redirect to playlist download endpoint
                if resource_type == 'playlist':
                    logger.info(f"Redirecting Spotify playlist URL to playlist download endpoint: {url}")
                    return self.download_playlist(request)
            
            # Check if this is a YouTube playlist
            elif ('youtube.com' in url or 'youtu.be' in url) and ('playlist' in url or 'list=' in url):
                logger.info(f"Redirecting YouTube playlist URL to playlist download endpoint: {url}")
                return self.download_playlist(request)
            
            # First, check if the song with this URL already exists for this user
            existing_song = Song.objects.filter(user=request.user, song_url=url).first()
            if existing_song:
                logger.info(f"Found existing song with URL {url}, serving directly")
                
                # Check if file exists
                file_path = os.path.join(settings.MEDIA_ROOT, existing_song.file.name)
                if os.path.exists(file_path):
                    # If format matches or no conversion needed
                    if format == 'mp3' or os.path.splitext(file_path)[1][1:] == format:
                        # Serve the existing file directly - let FileResponse manage the file handle
                        filename = f"{existing_song.title} - {existing_song.artist}.{os.path.splitext(file_path)[1][1:]}"
                        filename = sanitize_filename(filename)
                        response = FileResponse(
                            open(file_path, 'rb'),
                            as_attachment=True,
                            filename=filename
                        )
                        response['Content-Type'] = f'audio/{os.path.splitext(file_path)[1][1:]}'
                        return response
                    else:
                        # Need to convert the format
                        logger.info(f"Converting existing song from {os.path.splitext(file_path)[1][1:]} to {format}")
                        converted_path = convert_audio_format(file_path, format)
                        
                        # Update the song's file path if it doesn't already exist
                        new_filename = f"{existing_song.title} - {existing_song.artist}.{format}"
                        new_filename = sanitize_filename(new_filename)
                        new_relative_path = os.path.join('songs', new_filename)
                        new_absolute_path = os.path.join(settings.MEDIA_ROOT, new_relative_path)
                        
                        # Copy the converted file to the media directory if needed
                        if not os.path.exists(new_absolute_path):
                            import shutil
                            os.makedirs(os.path.dirname(new_absolute_path), exist_ok=True)
                            shutil.copy2(converted_path, new_absolute_path)
                        
                        # Serve the converted file
                        response = FileResponse(
                            open(new_absolute_path, 'rb'),
                            as_attachment=True,
                            filename=new_filename
                        )
                        response['Content-Type'] = f'audio/{format}'
                        return response
                        
            # If we get here, the song doesn't exist yet or the file is missing
            # Apply rate limiting for external services
            from django_ratelimit.core import is_ratelimited
            if is_ratelimited(
                request=request,
                group='download',
                key='ip',
                rate='10/hour',
                method='ALL',
                increment=True
            ):
                logger.warning(f"Rate limit exceeded for {request.path} from {request.META.get('REMOTE_ADDR')}")
                return HttpResponse("Rate limit exceeded. Please try again later.", status=429)
                
            # Determine source based on URL and download
            if 'youtube.com' in url or 'youtu.be' in url:
                # Instead of passing the request which causes confusion, we use our own implementation
                # that doesn't rely on the custom_ratelimit decorator
                return self._download_youtube(url, format)
            elif 'spotify.com' in url:
                # Similarly for Spotify
                return self._download_spotify_track(url, format)
            else:
                return Response(
                    {'error': 'Unsupported URL. Only YouTube and Spotify URLs are supported.'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @youtube_api_retry
    def _download_youtube(self, url, output_format=None):
        """Direct YouTube download with streaming response"""
        # Initialize variables for file cleanup
        temp_dir = None
        
        try:
            # Check if this is a playlist URL
            if 'playlist' in url or 'list=' in url:
                # Redirect to the async playlist download
                task = download_youtube_playlist.delay(url, self.request.user.id)
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
                    UserAnalytics.record_download(self.request.user)
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
                if not Song.objects.filter(user=self.request.user, song_url=url).exists():
                    # Create the song record
                    rel_path = os.path.join('songs', final_filename)
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
                        user=self.request.user,
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
                        profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                        profile.update_profile(song)
                    except Exception as profile_error:
                        logger.warning(f"Error updating user profile: {profile_error}")
                    
                    # Increment download count
                    self.request.user.increment_download_count()
                    
                    # Record download in analytics
                    try:
                        UserAnalytics.record_download(self.request.user)
                    except Exception as analytics_error:
                        logger.warning(f"Error recording download in analytics: {analytics_error}")
                
                # Serve the file - We'll use Django's FileResponse which manages closing the file
                formatted_filename = f"{title} - {artist}.{output_format}"
                formatted_filename = sanitize_filename(formatted_filename)
                
                # Important: Let Django's FileResponse manage the file handle
                response = FileResponse(
                    open(final_filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                response['Content-Type'] = f'audio/{output_format or "mp3"}'
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
            
            import shutil
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
                            thumbnail_url = info[key][0].get('url')
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
                user=self.request.user,
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
                profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                profile.update_profile(song)
            except Exception as profile_error:
                logger.warning(f"Error updating user profile: {profile_error}")

            # Increment download count
            self.request.user.increment_download_count()
            
            # Add to cache for future use
            try:
                cache_path = os.path.join('cache', formatted_filename)
                cache_full_path = os.path.join(settings.MEDIA_ROOT, cache_path)
                
                # Make sure the cache directory exists
                os.makedirs(os.path.dirname(cache_full_path), exist_ok=True)
                
                # Copy the file to the cache directory if it's not already there
                if not os.path.exists(cache_full_path):
                    shutil.copy2(final_filename, cache_full_path)
                
                # Create cache entry
                from django.utils import timezone
                from datetime import timedelta
                
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
    def _download_spotify_track(self, url, output_format=None):
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
                    UserAnalytics.record_download(self.request.user)
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
                    if not Song.objects.filter(user=self.request.user, song_url=url).exists():
                        # Create the song record with proper file path
                        rel_path = os.path.relpath(final_filename, settings.MEDIA_ROOT)
                        rel_path = sanitize_filename(rel_path, max_length=95)
                        song = Song.objects.create(
                            user=self.request.user,
                            title=sanitize_for_db(title),
                            artist=sanitize_for_db(artist),
                            album=sanitize_for_db(album),
                            file=rel_path,
                            source='spotify',
                            spotify_id=spotify_id,
                            thumbnail_url=sanitize_for_db(metadata.get('thumbnail_url', ''), max_length=190),
                            song_url=url
                        )
                        
                        # Update user's music profile
                        try:
                            profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                            profile.update_profile(song)
                        except Exception as profile_error:
                            logger.warning(f"Error updating user profile: {profile_error}")
                        
                        # Increment download count
                        self.request.user.increment_download_count()
                    
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
                
                # Get thumbnail from Spotify first, fallback to YouTube if not available
                thumbnail_url = track_info.get('image_url')
                
                # If no Spotify thumbnail, check for local files
                if not thumbnail_url:
                    for ext in ['jpg', 'png', 'webp']:
                        possible_path = f"{base_filename}.{ext}"
                        if os.path.exists(possible_path):
                            thumbnail_url = f"/media/songs/{os.path.basename(possible_path)}"
                            break
                
                # If still no thumbnail, try to get from YouTube info
                if not thumbnail_url:
                    for key in ['thumbnail', 'thumbnails']:
                        if key in info and info[key]:
                            if isinstance(info[key], list) and len(info[key]) > 0:
                                thumbnail_url = info[key][0].get('url')
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
                
                import shutil
                shutil.copy2(mp3_filename, media_path)

                # Check if this song already exists for this user before creating a new one
                existing_song = Song.objects.filter(
                    user=self.request.user, 
                    song_url=url
                ).first()
                
                if existing_song:
                    song = existing_song
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
                        user=self.request.user,
                        title=sanitize_for_db(track_info['title']),
                        artist=sanitize_for_db(track_info['artist']),
                        album=sanitize_for_db(track_info.get('album', 'Unknown')),
                        file=rel_path,
                        source='spotify',
                        spotify_id=track_info.get('spotify_id'),
                        thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190),
                        song_url=url
                    )
                
                # Update user's music profile
                try:
                    profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                    profile.update_profile(song)
                except Exception as profile_error:
                    logger.warning(f"Error updating user profile: {profile_error}")
                
                # Increment download count
                self.request.user.increment_download_count()
                
                # Record download in analytics
                try:
                    UserAnalytics.record_download(self.request.user)
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

    @action(detail=False, methods=['post'])
    @custom_ratelimit(key='user', rate='3/d')
    def download_playlist(self, request):
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
            
            if not track_urls:
                return Response({"error": "No tracks found in the playlist"}, 
                                status=status.HTTP_400_BAD_REQUEST)
            
            # Create the playlist
            playlist = Playlist.objects.create(
                user=request.user,
                name=playlist_title,
                source='spotify' if 'spotify.com' in url else 'youtube',
                source_url=url
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
                    if existing_song:
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
                                
                                # Get thumbnail from Spotify first, fallback to YouTube if not available
                                thumbnail_url = track_info.get('image_url')
                                
                                # If no Spotify thumbnail, check for local files
                                if not thumbnail_url:
                                    for ext in ['jpg', 'png', 'webp']:
                                        possible_path = f"{base_filename}.{ext}"
                                        if os.path.exists(possible_path):
                                            thumbnail_url = f"/media/songs/{os.path.basename(possible_path)}"
                                            break
                                
                                # If still no thumbnail, try to get from YouTube info
                                if not thumbnail_url:
                                    for key in ['thumbnail', 'thumbnails']:
                                        if key in info and info[key]:
                                            if isinstance(info[key], list) and len(info[key]) > 0:
                                                thumbnail_url = info[key][0].get('url')
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
                                else:
                                    song = Song.objects.create(
                                        user=request.user,
                                        title=sanitize_for_db(track_info['title']),
                                        artist=sanitize_for_db(track_info['artist']),
                                        album=sanitize_for_db(track_info.get('album', 'Unknown')),
                                        file=os.path.relpath(mp3_filename, settings.MEDIA_ROOT),
                                        source='spotify',
                                        spotify_id=track_info.get('spotify_id'),
                                        thumbnail_url=sanitize_for_db(thumbnail_url, max_length=190),
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

    @action(detail=False, methods=['get'])
    def check_status(self, request):
        """
        Check the status of a download task with detailed progress information
        """
        task_id = request.query_params.get('task_id')
        if not task_id:
            return Response({'error': 'task_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            task_result = AsyncResult(task_id)
            
            # Try to get progress information
            progress = DownloadProgress.objects.filter(task_id=task_id).first()
            
            if task_result.ready():
                if task_result.successful():
                    result = task_result.get()
                    
                    if isinstance(result, int):  # Single song download
                        try:
                            song = Song.objects.get(id=result)
                            return Response({
                                'status': 'completed',
                                'song_id': song.id,
                                'title': song.title,
                                'artist': song.artist,
                                'file_size': os.path.getsize(os.path.join(settings.MEDIA_ROOT, song.file.name)) if os.path.exists(os.path.join(settings.MEDIA_ROOT, song.file.name)) else 0,
                                'download_url': request.build_absolute_uri(f'/api/songs/{song.id}/download_file/'),
                                'thumbnail_url': song.thumbnail_url,
                                'image_url': request.build_absolute_uri(song.thumbnail_url) if song.thumbnail_url and not song.thumbnail_url.startswith('http') else song.thumbnail_url,
                            })
                        except Song.DoesNotExist:
                            return Response({
                                'status': 'error',
                                'error': 'Song not found in database'
                            }, status=status.HTTP_404_NOT_FOUND)
                        
                    else:  # Playlist download
                        try:
                            playlist = Playlist.objects.get(id=result)
                            total_size = 0
                            for song in playlist.songs.all():
                                try:
                                    file_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
                                    if os.path.exists(file_path):
                                        total_size += os.path.getsize(file_path)
                                except:
                                    pass
                                    
                            return Response({
                                'status': 'completed',
                                'playlist_id': playlist.id,
                                'name': playlist.name,
                                'song_count': playlist.songs.count(),
                                'total_size': total_size,
                                'download_url': request.build_absolute_uri(f'/api/playlists/{playlist.id}/download_all/'),
                                'task_download_url': request.build_absolute_uri(f'/api/songs/download_by_task/?task_id={task_id}'),
                                'songs': [{
                                    'id': song.id,
                                    'title': song.title,
                                    'artist': song.artist,
                                    'thumbnail_url': song.thumbnail_url,
                                    'image_url': request.build_absolute_uri(song.thumbnail_url) if song.thumbnail_url and not song.thumbnail_url.startswith('http') else song.thumbnail_url,
                                } for song in playlist.songs.all()]
                            })
                        except Playlist.DoesNotExist:
                            return Response({
                                'status': 'error',
                                'error': 'Playlist not found in database'
                            }, status=status.HTTP_404_NOT_FOUND)
                else:
                    error = str(task_result.result)
                    return Response({
                        'status': 'failed',
                        'error': error
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                # Task is still running
                progress_data = {}
                progress = DownloadProgress.objects.filter(task_id=task_id).first()
                
                if progress:
                    progress_data = {
                        'current': progress.current_progress,
                        'total': progress.total_items,
                        'current_file': progress.current_file,
                        'started_at': progress.started_at.isoformat() if progress.started_at else None,
                        'last_update': progress.last_update.isoformat() if progress.last_update else None,
                        'estimated_completion': progress.estimated_completion_time.isoformat() if progress.estimated_completion_time else None
                    }
                
                return Response({
                    'status': 'processing',
                    'task_id': task_id,
                    'state': task_result.state,
                    'progress': progress_data,
                    'check_again_url': request.build_absolute_uri(f'/api/songs/check_status/?task_id={task_id}'),
                    'download_url': request.build_absolute_uri(f'/api/songs/download_by_task/?task_id={task_id}')
                })

        except Exception as e:
            logger.error(f"Error checking task status: {e}", exc_info=True)
            return Response(
                {'error': f'Status check failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


    @action(detail=True, methods=['get'])
    def download_file(self, request, pk=None):
        """
        Download a specific song file
        """
        song = self.get_object()
        file_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
        
        if not os.path.exists(file_path):
            return Response(
                {'error': 'File not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            response = FileResponse(
                open(file_path, 'rb'),
                as_attachment=True,
                filename=f"{song.title} - {song.artist}.mp3"
            )
            response['Content-Type'] = 'audio/mpeg'
            # Add song metadata headers
            response['x-song-title'] = song.title
            response['x-song-artist'] = song.artist
            if song.album:
                response['x-album-name'] = song.album
            if song.thumbnail_url:
                response['x-cover-url'] = song.thumbnail_url
            return response
        except Exception as e:
            logger.error(f"Error serving file: {e}", exc_info=True)
            return Response(
                {'error': f'File download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['get'])
    def download_by_task(self, request):
        """
        Download a playlist by task_id after it has been processed asynchronously
        """
        task_id = request.query_params.get('task_id')
        if not task_id:
            return Response({'error': 'Task ID is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Check if task is complete
            result = AsyncResult(task_id)
            if not result.ready():
                # Get progress information
                progress = DownloadProgress.objects.filter(task_id=task_id).first()
                progress_data = {}
                if progress:
                    progress_data = {
                        'current': progress.current_progress,
                        'total': progress.total_items,
                        'current_file': progress.current_file,
                        'started_at': progress.started_at,
                        'last_update': progress.last_update,
                        'estimated_completion': progress.estimated_completion_time
                    }
                
                return Response({
                    'status': 'processing',
                    'message': 'Playlist download is still in progress',
                    'task_id': task_id,
                    'progress': progress_data
                }, status=status.HTTP_202_ACCEPTED)
            
            # Get the playlist ID from the task result
            playlist_id = result.get()
            if not playlist_id:
                return Response({'error': 'No playlist found for this task'}, status=status.HTTP_404_NOT_FOUND)
            
            # Get the playlist
            try:
                playlist = Playlist.objects.get(id=playlist_id, user=request.user)
            except Playlist.DoesNotExist:
                return Response({'error': 'Playlist not found'}, status=status.HTTP_404_NOT_FOUND)
            
            # Create a ZIP file with all songs
            if not playlist.songs.exists():
                return Response({'error': 'Playlist is empty'}, status=status.HTTP_400_BAD_REQUEST)
            
            import zipfile
            import tempfile
            
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_file:
                with zipfile.ZipFile(temp_file.name, 'w') as zip_file:
                    for song in playlist.songs.all():
                        file_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
                        if os.path.exists(file_path):
                            # Use a clean filename for the ZIP entry
                            clean_filename = f"{song.title} - {song.artist}.mp3"
                            clean_filename = sanitize_filename(clean_filename)
                            zip_file.write(file_path, clean_filename)
                
                # Return the ZIP file
                response = FileResponse(
                    open(temp_file.name, 'rb'),
                    as_attachment=True,
                    filename=f"{playlist.name}.zip"
                )
                response['Content-Type'] = 'application/zip'
                
                # Schedule the temp file for deletion after response is sent
                import threading
                def delete_file():
                    import time
                    time.sleep(60)  # Wait for the file to be sent
                    try:
                        os.unlink(temp_file.name)
                    except:
                        pass
                
                threading.Thread(target=delete_file).start()
                
                return response
                
        except Exception as e:
            logger.error(f"Error downloading playlist by task: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class PlaylistViewSet(viewsets.ModelViewSet):
    serializer_class = PlaylistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Playlist.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
        
    def get_serializer_context(self):
        context = super().get_serializer_context()
        return context

    @action(detail=True, methods=['post'])
    def add_song(self, request, pk=None):
        playlist = self.get_object()
        song_id = request.data.get('song_id')
        
        if not song_id:
            return Response(
                {'error': 'song_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        song = get_object_or_404(Song, id=song_id, user=request.user)
        playlist.songs.add(song)
        
        return Response({
            'status': 'success',
            'message': 'Song added to playlist'
        })

    @action(detail=True, methods=['post'])
    def remove_song(self, request, pk=None):
        playlist = self.get_object()
        song_id = request.data.get('song_id')
        
        if not song_id:
            return Response(
                {'error': 'song_id is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        song = get_object_or_404(Song, id=song_id, user=request.user)
        playlist.songs.remove(song)
        
        return Response({
            'status': 'success',
            'message': 'Song removed from playlist'
        })

    @action(detail=True, methods=['get'])
    def download_all(self, request, pk=None):
        """
        Download all songs in a playlist as a ZIP file
        """
        playlist = self.get_object()
        if not playlist.songs.exists():
            return Response(
                {'error': 'Playlist is empty'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Create a ZIP file
            import zipfile
            import tempfile
            
            # Create a temporary directory instead of a temporary file
            with tempfile.TemporaryDirectory() as temp_dir:
                # Create zip file with a fixed name inside the temp directory
                zip_path = os.path.join(temp_dir, f"{playlist.name}_{int(time.time())}.zip")
                
                with zipfile.ZipFile(zip_path, 'w') as zip_file:
                    for song in playlist.songs.all():
                        file_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
                        if os.path.exists(file_path):
                            # Use a clean filename for the ZIP entry
                            clean_filename = f"{song.title} - {song.artist}.mp3"
                            clean_filename = sanitize_filename(clean_filename)
                            zip_file.write(file_path, clean_filename)
                
                # Read file content into memory and return
                with open(zip_path, 'rb') as f:
                    content = f.read()
                
                response = HttpResponse(content, content_type='application/zip')
                response['Content-Disposition'] = f'attachment; filename="{playlist.name}.zip"'
                return response

        except Exception as e:
            logger.error(f"Error in download_all: {e}", exc_info=True)
            return Response(
                {'error': f'Playlist download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class UserMusicProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserMusicProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return UserMusicProfile.objects.get_or_create(user=self.request.user)[0]
        
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        
        # Add additional user info to response
        data = serializer.data
        data.update({
            'username': request.user.username,
            'total_songs': Song.objects.filter(user=request.user).count(),
            'downloads_remaining': request.user.get_downloads_remaining(),
            'is_premium': request.user.is_subscription_active()
        })
        
        return Response(data)

class UserTopArtistsView(generics.ListAPIView):
    serializer_class = ArtistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Get top artists data
        top_artists = Song.get_user_top_artists(self.request.user)
        
        # Enhance with data from Global Music Artists CSV
        enhanced_artists = []
        
        for artist_data in top_artists:
            artist_name = artist_data['artist']
            count = artist_data['count']
            
            # Get additional artist info from CSV
            from .utils import get_artist_info
            artist_info = get_artist_info(artist_name)
            
            if artist_info:
                # Add the count from the original query
                artist_info['count'] = count
                enhanced_artists.append(artist_info)
            else:
                # If not found in CSV, keep original data with default values
                enhanced_artists.append({
                    'artist': artist_name,
                    'count': count,
                    'artist_img': "https://media.istockphoto.com/id/1298261537/vector/blank-man-profile-head-icon-placeholder.jpg?s=612x612&w=0&k=20&c=CeT1RVWZzQDay4t54ookMaFsdi7ZHVFg2Y5v7hxigCA=",
                    'country': "Unknown",
                    'artist_genre': "Unknown"
                })
        
        return enhanced_artists

class UserRecommendationsView(generics.ListAPIView):
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Get recommendations for the authenticated user
        """
        try:
            logger.info(f"Getting recommendations for user: {self.request.user.id}")
            
            # Get recommendations using the recommender
            recommendations = get_hybrid_recommendations(self.request.user, limit=10)
            
            if not recommendations:
                logger.warning(f"No recommendations found for user: {self.request.user.id}")
                return Song.objects.none()
            
            # Convert recommendations into Song objects
            songs = []
            for rec in recommendations:
                if 'spotify_id' not in rec:
                    continue
                
                # Check if song already exists in database
                existing = Song.objects.filter(spotify_id=rec['spotify_id']).first()
                if existing:
                    songs.append(existing.id)
                else:
                    # Create new song
                    try:
                        song = Song.objects.create(
                            user=self.request.user,
                            title=sanitize_for_db(rec['title']),
                            artist=sanitize_for_db(rec['artist']),
                            album=sanitize_for_db(rec.get('album', 'Unknown')),
                            source='recommendation',
                            spotify_id=rec['spotify_id'],
                            thumbnail_url=sanitize_for_db(rec.get('image_url', ''), max_length=190),
                            year=rec.get('year'),
                            genre=rec.get('genre', 'Unknown')
                        )
                        songs.append(song.id)
                        
                        # Download the song if it has a spotify_id and save thumbnail to ID3
                        if rec.get('image_url') and rec['spotify_id']:
                            # Start a background task to download and process the thumbnail
                            from threading import Thread
                            
                            def process_thumbnail():
                                try:
                                    # Find the corresponding MP3 file in media directory
                                    mp3_filename = None
                                    if song.file:
                                        mp3_filename = os.path.join(settings.MEDIA_ROOT, song.file.name)
                                    
                                    # If file doesn't exist in media, try to find it in Spotify 
                                    # or download placeholder
                                    if not mp3_filename or not os.path.exists(mp3_filename):
                                        # Create songs directory if it doesn't exist
                                        songs_dir = os.path.join(settings.MEDIA_ROOT, 'songs')
                                        os.makedirs(songs_dir, exist_ok=True)
                                        
                                        # Create an empty file with appropriate title
                                        safe_title = sanitize_filename(f"{song.title} - {song.artist}")
                                        mp3_filename = os.path.join(songs_dir, f"{safe_title}.mp3")
                                        
                                        # Create an empty MP3 file
                                        # We'll only add metadata if a song is actually downloaded later
                                        if not os.path.exists(mp3_filename):
                                            with open(mp3_filename, 'wb') as f:
                                                f.write(b'')  # Empty MP3 file
                                                
                                            # Save file path to song
                                            rel_path = os.path.join('songs', f"{safe_title}.mp3")
                                            song.file = rel_path
                                            song.save(update_fields=['file'])
                                    
                                    if mp3_filename and os.path.exists(mp3_filename):
                                        # Embed the metadata and thumbnail
                                        embed_metadata(
                                            mp3_path=mp3_filename,
                                            title=song.title,
                                            artist=song.artist,
                                            album=song.album,
                                            thumbnail_url=rec.get('image_url', ''),
                                            year=rec.get('year'),
                                            genre=rec.get('genre', 'Unknown'),
                                            album_artist=rec.get('album_artist', song.artist),
                                            spotify_id=song.spotify_id
                                        )
                                        logger.info(f"Embedded metadata and thumbnail for recommendation: {song.title}")
                                except Exception as e:
                                    logger.error(f"Error processing thumbnail for recommendation: {e}", exc_info=True)
                            
                            # Start background thread to process thumbnail without blocking main request
                            Thread(target=process_thumbnail).start()
                        
                    except Exception as e:
                        logger.error(f"Error creating song from recommendation: {e}", exc_info=True)
            
            # Return queryset of Song objects
            return Song.objects.filter(id__in=songs)
            
        except Exception as e:
            logger.error(f"Error in UserRecommendationsView: {e}", exc_info=True)
            return Song.objects.none()
    
    def get_serializer_context(self):
        context = super().get_serializer_context()
        # Ensure request is in context for URL building
        if 'request' not in context:
            context['request'] = self.request
        return context

class RecommendationsAPIView(APIView):
    """
    API View to get song recommendations
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """
        Get recommendations based on user's download history
        """
        try:
            # Get recommendations
            limit = int(request.GET.get('limit', 10))
            limit = min(max(limit, 1), 50)  # Ensure limit is between 1 and 50
            
            # Debug mode - check what songs the user has
            user_songs = Song.objects.filter(user=request.user)
            logger.info(f"User has {user_songs.count()} songs")
            
            spotify_songs = user_songs.filter(spotify_id__isnull=False)
            logger.info(f"User has {spotify_songs.count()} songs with Spotify IDs")
            
            if spotify_songs.exists():
                sample_songs = list(spotify_songs.values('spotify_id', 'title', 'artist')[:5])
                logger.info(f"Sample user songs: {sample_songs}")
            
            logger.info(f"Getting recommendations for user: {request.user.id} with limit: {limit}")
            
            # Get recommendations
            recommendations_data = get_hybrid_recommendations(request.user, limit)
            
            if not recommendations_data:
                logger.warning("No recommendations returned from recommender")
                return Response({
                    'success': True,
                    'message': 'No recommendations available. Try downloading some songs first.',
                    'recommendations': [],
                    'debug_info': {
                        'user_songs_count': user_songs.count(),
                        'spotify_songs_count': spotify_songs.count(),
                        'has_recommended_songs': False
                    }
                })
            
            logger.info(f"Got {len(recommendations_data)} recommendations")
            
            # Do not convert recommendations to Song objects anymore, just use them as-is
            songs = []
            for rec in recommendations_data:
                if 'spotify_id' not in rec:
                    logger.warning(f"Missing spotify_id in recommendation: {rec}")
                    continue
                
                # Add some fields that the frontend might expect
                rec['source'] = 'csv_data'
                rec['created_at'] = timezone.now().isoformat()
                rec['song_url'] = None
                rec['file_url'] = None
                if 'image_url' in rec:
                    rec['thumbnail_url'] = rec['image_url']
                
                songs.append(rec)
            
            return Response({
                'success': True,
                'message': f'Found {len(songs)} recommendations',
                'recommendations': songs,
                'debug_info': {
                    'user_songs_count': user_songs.count(),
                    'spotify_songs_count': spotify_songs.count(),
                    'recommendations_count': len(recommendations_data),
                    'songs_created': 0,  # We don't create songs anymore
                    'recommendation_source': 'recommendation_system'
                }
            })
            
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}", exc_info=True)
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class UserStatsView(APIView):
    """View for retrieving user stats and analytics"""
    permission_classes = [IsAuthenticated]
    
    @custom_ratelimit(group='analytics', key='ip', rate='50/hour', method='GET')
    def get(self, request):
        """Get user statistics for the last 30 days by default"""
        # Get the number of days from query parameter (default 30)
        days = int(request.query_params.get('days', 30))
        days = min(max(1, days), 365)  # Limit to 1-365 days
        
        # Get user stats
        stats = UserAnalytics.get_user_stats(request.user, days)
        
        # Get additional insights
        from django.db.models import Count, Sum
        
        # Get top played songs
        top_songs = SongPlay.objects.filter(user=request.user)\
            .values('song__id', 'song__title', 'song__artist')\
            .annotate(play_count=Count('id'), total_time=Sum('duration'))\
            .order_by('-play_count')[:5]
            
        # Get listening trend by time of day
        from django.db.models.functions import ExtractHour
        time_of_day = SongPlay.objects.filter(user=request.user)\
            .annotate(hour=ExtractHour('timestamp'))\
            .values('hour')\
            .annotate(count=Count('id'))\
            .order_by('hour')
            
        # Format the time of day data for easier consumption
        hours = [{'hour': h, 'count': 0} for h in range(24)]
        for entry in time_of_day:
            hour_idx = entry['hour']
            if 0 <= hour_idx < 24:  # Ensure valid hour
                hours[hour_idx]['count'] = entry['count']
        
        # Get favorite genres safely
        try:
            favorite_genres = [g.name for g in request.user.get_favorite_genres()]
        except (AttributeError, Exception):
            favorite_genres = []
                
        # Combine all results
        response_data = {
            'user': {
                'username': request.user.username,
                'subscription': request.user.is_subscription_active(),
                'downloads_remaining': request.user.get_downloads_remaining(),
                'total_downloaded': request.user.get_downloaded_songs_count(),
            },
            'stats': stats,
            'top_songs': list(top_songs),
            'time_of_day': hours,
            'favorite_genres': favorite_genres
        }
        
        return Response(response_data)

class RecordPlayView(APIView):
    """API endpoint to record a song play"""
    permission_classes = [IsAuthenticated]
    
    @custom_ratelimit(group='song_plays', key='ip', rate='120/hour', method='POST')
    def post(self, request):
        """Record a song play"""
        song_id = request.data.get('song_id')
        duration = request.data.get('duration', 0)
        completed = request.data.get('completed', False)
        device_info = request.data.get('device_info', {})
        
        if not song_id:
            return Response({'error': 'song_id is required'}, status=status.HTTP_400_BAD_REQUEST)
            
        try:
            # Get the song
            song = Song.objects.get(id=song_id, user=request.user)
            
            # Create the play record
            play = SongPlay.objects.create(
                user=request.user,
                song=song,
                duration=max(0, int(duration)),
                completed=completed,
                device_info=device_info
            )
            
            # Record in analytics
            UserAnalytics.record_play(request.user, play.duration)
            
            # Update user's last seen
            request.user.update_last_seen()
            
            return Response({
                'status': 'success',
                'play_id': play.id,
                'duration': play.duration,
                'timestamp': play.timestamp
            })
            
        except Song.DoesNotExist:
            return Response({'error': 'Song not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"Error recording play: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class FavoriteGenresDistributionView(APIView):
    """API view to get genre distribution for the authenticated user's songs"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get genre distribution for the user's songs"""
        try:
            # Get all songs for the user
            songs = Song.objects.filter(user=request.user)
            
            # Extract genres from songs and count them
            from collections import Counter
            from django.db.models import Count
            
            # First check for genre field on songs
            genre_counts = Counter()
            
            # Process all songs
            for song in songs:
                # Get genre from song, split multiple genres if necessary
                if song.genre:
                    # Some genres might be comma-separated or in other formats
                    genres = [g.strip() for g in song.genre.replace('/', ',').split(',')]
                    for genre in genres:
                        if genre:
                            genre_counts[genre] += 1
            
            # Convert to list of dicts for the API response
            genre_data = [{"genre": genre, "count": count} for genre, count in genre_counts.most_common(10)]
            
            # If we have artist genre data from the Global Music Artists CSV, use that to enhance our data
            enhanced_genre_data = []
            from .utils import get_artist_info
            
            # Get unique artists from user's songs
            artists = songs.values_list('artist', flat=True).distinct()
            artist_genre_map = {}
            
            # Look up each artist in the CSV
            for artist_name in artists:
                if not artist_name:
                    continue
                    
                artist_info = get_artist_info(artist_name)
                if artist_info and artist_info.get('artist_genre'):
                    # Split genres (they might be comma-separated in the CSV)
                    artist_genres = [g.strip() for g in artist_info['artist_genre'].replace('/', ',').split(',')]
                    for genre in artist_genres:
                        if genre:
                            genre_counts[genre] += 1
            
            # Get the final genre distribution (top 10)
            final_genre_data = [{"genre": genre, "count": count} for genre, count in genre_counts.most_common(10)]
            
            return Response({
                'success': True,
                'genre_distribution': final_genre_data
            })
        
        except Exception as e:
            logger.error(f"Error getting genre distribution: {e}", exc_info=True)
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class TopCountriesView(APIView):
    """API view to get distribution of countries for the user's downloaded songs"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get country distribution for the user's songs"""
        try:
            # Get all songs for the user
            songs = Song.objects.filter(user=request.user)
            
            # Extract countries from artists in songs
            from collections import Counter
            
            country_counts = Counter()
            
            # Get unique artists from user's songs
            artists = songs.values_list('artist', flat=True).distinct()
            
            # Look up each artist in the CSV to get their country
            from .utils import get_artist_info
            
            for artist_name in artists:
                if not artist_name:
                    continue
                    
                artist_info = get_artist_info(artist_name)
                if artist_info and artist_info.get('country'):
                    country = artist_info.get('country')
                    if country and country.strip() != "":
                        country_counts[country] += 1
            
            # Get the top countries (top 10)
            top_countries = [{"country": country, "count": count} for country, count in country_counts.most_common(10)]
            
            return Response({
                'success': True,
                'country_distribution': top_countries
            })
        
        except Exception as e:
            logger.error(f"Error getting country distribution: {e}", exc_info=True)
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)