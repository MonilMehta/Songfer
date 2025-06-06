import os
import json
import logging
import time
import tempfile
import shutil
import yt_dlp
import requests  # Add requests for API calls
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
from rest_framework.permissions import AllowAny
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
import re
from .download_helper import download_youtube, download_spotify_track, download_playlist, download_by_task
from django.db import models


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
    
    # Replace multiple spaces with a single space
    sanitized = re.sub(r'\s+', ' ', sanitized)
    
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

    @action(detail=True, methods=['get'], permission_classes=[AllowAny])
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
            
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    @custom_ratelimit(key='ip', rate='5/10m', block=True)
    def public_download_by_url(self, request):
        """
        Public endpoint to download a song by URL without authentication.
        Rate limited to prevent abuse.
        """
        # Override permission check explicitly for this method
        self.permission_classes = []
        self.check_permissions(request)
        from django.contrib.auth import get_user_model
        User = get_user_model()
        test_user = User.objects.get(username="testuser")
        request.user=test_user
        
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
                # Record download in analytics for a test user instead of anonymous user
                try:
                    
                    UserAnalytics.record_download(test_user)
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
                result = download_spotify_track(request, url, output_format)
                
                # Since download_spotify_track returns a Response object, we can just return it
                return result
            elif 'youtube.com' in url or 'youtu.be' in url:
                # Handle YouTube URLs
                result = download_youtube(request, url, output_format)
                
                # Since download_youtube returns a Response object, we can just return it
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
                return download_youtube(request, url, format)
            elif 'spotify.com' in url:
                return download_spotify_track(request, url, format)
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

    @action(detail=False, methods=['post'])
    @custom_ratelimit(key='user', rate='3/d')
    def download_playlist(self, request):
        """Download a playlist from YouTube or Spotify"""
        return download_playlist(request)

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
        return download_by_task(request)

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
                
                # Log some info about the playlist and zip
                logger.info(f"Creating ZIP file for playlist '{playlist.name}' with {playlist.songs.count()} songs at {zip_path}")
                
                # Track files added to the ZIP
                files_added = 0
                missing_files = 0
                
                with zipfile.ZipFile(zip_path, 'w') as zip_file:
                    for song in playlist.songs.all():
                        if not song.file:
                            logger.warning(f"Song {song.id} '{song.title}' has no file attribute")
                            missing_files += 1
                            continue
                            
                        # Flag to track if we found the file
                        file_found = False
                        
                        # Generate a list of potential file paths to try
                        potential_paths = []
                        
                        # 1. First try standard path from the database
                        if isinstance(song.file.name, str):
                            standard_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, song.file.name))
                            potential_paths.append(standard_path)
                        elif hasattr(song.file, 'path'):
                            standard_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, song.file.path))
                            potential_paths.append(standard_path)
                        
                        # 2. Try direct path in songs directory (most common location)
                        clean_filename = f"{song.title} - {song.artist}.mp3"
                        clean_filename = sanitize_filename(clean_filename)
                        songs_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, 'songs', clean_filename))
                        potential_paths.append(songs_path)
                        
                        # 3. Try reconstructing the path if it contains 'songs' but might be malformed
                        if isinstance(song.file.name, str) and 'songs' in song.file.name:
                            parts = song.file.name.split('songs')
                            if len(parts) > 1:
                                reconstructed_path = os.path.join(settings.MEDIA_ROOT, 'songs', parts[1].lstrip('\\/'))
                                reconstructed_path = os.path.normpath(reconstructed_path)
                                potential_paths.append(reconstructed_path)
                        
                        # 4. Try the cache directory
                        cache_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, 'cache', clean_filename))
                        potential_paths.append(cache_path)
                        
                        # 5. Try with 'Official Music Video' suffix in filename (common in YouTube downloads)
                        video_filename = f"{song.title} - {song.artist} Official Music Video.mp3"
                        video_filename = sanitize_filename(video_filename)
                        video_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, 'cache', video_filename))
                        potential_paths.append(video_path)
                        
                        # 6. Try with 'Official Lyric Video' suffix in filename
                        lyric_filename = f"{song.title} - {song.artist} Official Lyric Video.mp3"
                        lyric_filename = sanitize_filename(lyric_filename)
                        lyric_path = os.path.normpath(os.path.join(settings.MEDIA_ROOT, 'cache', lyric_filename))
                        potential_paths.append(lyric_path)
                        
                        # Deduplicate paths (in case there are duplicates)
                        potential_paths = list(dict.fromkeys(potential_paths))
                        
                        # Log the potential paths we'll try
                        logger.debug(f"Looking for song {song.id} '{song.title}' in {len(potential_paths)} potential locations")
                        
                        # Try each potential path
                        for path in potential_paths:
                            if os.path.exists(path):
                                # Log the file being added
                                logger.info(f"Found and adding file to ZIP: {path} as {clean_filename}")
                                zip_file.write(path, clean_filename)
                                files_added += 1
                                file_found = True
                                break
                        
                        # If all paths failed, try fallback search by title and artist across all media directories
                        if not file_found:
                            import glob
                            # Search in all media subdirectories for files matching song title and artist
                            search_pattern = os.path.join(settings.MEDIA_ROOT, '**', f"*{song.title}*{song.artist}*.mp3")
                            search_pattern = search_pattern.replace(" ", "*")  # Make the search more flexible
                            try:
                                potential_matches = glob.glob(search_pattern, recursive=True)
                                if potential_matches:
                                    # Use the first match found
                                    match_path = potential_matches[0]
                                    logger.info(f"Found file via fuzzy search: {match_path} as {clean_filename}")
                                    zip_file.write(match_path, clean_filename)
                                    files_added += 1
                                    file_found = True
                            except Exception as glob_error:
                                logger.warning(f"Error during glob search: {glob_error}")
                        
                        # Still couldn't find the file
                        if not file_found:
                            logger.warning(f"File not found for song {song.id} '{song.title}' after trying {len(potential_paths)} paths")
                            missing_files += 1
                
                # Check if any files were added
                if files_added == 0:
                    logger.error(f"No files were added to the ZIP for playlist {playlist.id} '{playlist.name}'. Missing files: {missing_files}")
                    return Response(
                        {'error': 'No valid files found in playlist. Please ensure the songs have been downloaded.'}, 
                        status=status.HTTP_404_NOT_FOUND
                    )
                
                # Log the size of the ZIP file before sending
                zip_size = os.path.getsize(zip_path)
                logger.info(f"ZIP file created successfully. Size: {zip_size} bytes, Files added: {files_added}, Missing files: {missing_files}")
                
                # Read file content into memory and return
                with open(zip_path, 'rb') as f:
                    content = f.read()
                
                # Create the response with appropriate headers
                response = HttpResponse(content, content_type='application/zip')
                response['Content-Disposition'] = f'attachment; filename="{sanitize_filename(playlist.name)}.zip"'
                response['Content-Length'] = str(zip_size)
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
        # Get or create the profile
        profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
        
        # Sync total_songs_downloaded with actual count if it's out of sync
        actual_song_count = Song.objects.filter(user=self.request.user).count()
        if profile.total_songs_downloaded != actual_song_count:
            profile.total_songs_downloaded = actual_song_count
            profile.save(update_fields=['total_songs_downloaded'])
            
        # Sync with analytics data
        analytics_data = UserAnalytics.objects.filter(user=self.request.user).aggregate(
            total_downloads=models.Sum('songs_downloaded')
        )
        
        if analytics_data['total_downloads'] and profile.total_songs_downloaded == 0:
            profile.total_songs_downloaded = analytics_data['total_downloads']
            profile.save(update_fields=['total_songs_downloaded'])
            
        return profile
        
    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance)
        user = request.user
        
        # Get user's listening stats
        listening_stats = user.get_listening_stats()
        
        # Get user's top artists with enhanced info
        top_artists = Song.get_user_top_artists(user, limit=5)
        
        # If user has songs but no plays, add placeholder data based on song count
        if listening_stats['total_plays'] == 0 and Song.objects.filter(user=user).exists():
            song_count = Song.objects.filter(user=user).count()
            # Add estimated stats based on song count
            listening_stats.update({
                'estimated_plays': song_count * 2,  # Estimate that each song is played twice
                'estimated_listen_time': song_count * 180,  # Estimate 3 minutes per song
            })
        
        # Get recent songs
        recent_songs = Song.objects.filter(user=user).order_by('-created_at')[:5]
        recent_songs_data = SongSerializer(recent_songs, many=True, context={'request': request}).data
        
        # Get recent plays
        recent_plays = SongPlay.objects.filter(user=user).order_by('-timestamp')[:10]
        
        # Format recent plays data
        recent_plays_data = []
        for play in recent_plays:
            recent_plays_data.append({
                'id': play.id,
                'song_title': play.song.title,
                'song_artist': play.song.artist,
                'song_id': play.song.id,
                'timestamp': play.timestamp,
                'duration': play.duration,
                'completed': play.completed
            })
            
        # If no play data but songs exist, create placeholder recent plays based on songs
        if not recent_plays_data and recent_songs:
            for i, song in enumerate(recent_songs):
                # Create fake timestamps starting from 1 day ago, spaced by 3 hours
                fake_timestamp = timezone.now() - timezone.timedelta(days=1) + timezone.timedelta(hours=i*3)
                recent_plays_data.append({
                    'id': None,
                    'song_title': song.title,
                    'song_artist': song.artist,
                    'song_id': song.id,
                    'timestamp': fake_timestamp,
                    'duration': 180,  # 3 minutes
                    'completed': True,
                    'is_placeholder': True  # Mark as placeholder so frontend knows
                })
                
        # Get user analytics
        user_stats = UserAnalytics.get_user_stats(user, days=30)
        
        # If user is premium, get subscription details
        subscription_details = {}
        if user.is_subscription_active():
            subscription_details = {
                'start_date': user.subscription_start,
                'end_date': user.subscription_end,
                'days_remaining': (user.subscription_end - timezone.now()).days if user.subscription_end else 0
            }
        
        # Extract genres from songs if no favorite genres
        favorite_genres = [genre.name for genre in user.get_favorite_genres()]
        if not favorite_genres:
            # Extract genres from songs
            genre_set = set()
            for song in Song.objects.filter(user=user):
                if song.genre:
                    genres = [g.strip() for g in song.genre.replace('/', ',').split(',')]
                    for genre in genres:
                        if genre:
                            genre_set.add(genre)
            favorite_genres = list(genre_set)[:5]  # Limit to top 5
            
        # Add usage metrics
        usage_metrics = {
            'songs_added_last_week': Song.objects.filter(
                user=user,
                created_at__gte=timezone.now() - timezone.timedelta(days=7)
            ).count(),
            'last_download': Song.objects.filter(user=user).order_by('-created_at').first().created_at if Song.objects.filter(user=user).exists() else None,
            'most_active_day': max(user_stats['daily_data'], key=lambda x: x['downloads'] + x['plays'])['date'] if user_stats['daily_data'] else None,
        }
            
        # Add additional user info to response
        data = serializer.data
        data.update({
            'username': user.username,
            'email': user.email,
            'date_joined': user.date_joined,
            'last_login': user.last_login,
            'last_seen': user.last_seen,
            'total_songs': Song.objects.filter(user=user).count(),
            'downloads_remaining': user.get_downloads_remaining(),
            'total_downloads_today': user.daily_downloads,
            'is_premium': user.is_subscription_active(),
            'subscription_details': subscription_details,
            'total_listen_time': user.total_listen_time,
            'listening_stats': listening_stats,
            'top_artists': list(top_artists),
            'favorite_genres': favorite_genres,
            'recent_songs': recent_songs_data,
            'recent_plays': recent_plays_data,
            'analytics': user_stats,
            'usage_metrics': usage_metrics
        })
        
        return Response(data)

class UserTopArtistsView(generics.ListAPIView):
    serializer_class = ArtistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        # Get top artists data
        top_artists = Song.get_user_top_artists(self.request.user)
        
        # Extract just artist names for bulk API call
        artist_names = [artist_data['artist'] for artist_data in top_artists]
        
        # Use Hugging Face API to get artist info in bulk
        from .utils import get_bulk_artist_info_from_hf, get_artist_info_from_hf
        
        # First try bulk API call
        enhanced_artists = []
        artist_info_map = get_bulk_artist_info_from_hf(artist_names)
        
        for artist_data in top_artists:
            artist_name = artist_data['artist']
            count = artist_data['count']
            
            # First check if we got data from bulk call
            if artist_name in artist_info_map and artist_info_map[artist_name]:
                artist_info = artist_info_map[artist_name]
                artist_info['count'] = count
                enhanced_artists.append(artist_info)
            else:
                # Try individual API call as fallback
                artist_info = get_artist_info_from_hf(artist_name)
                
                if artist_info:
                    # Add the count from the original query
                    artist_info['count'] = count
                    enhanced_artists.append(artist_info)
                else:
                    # Fallback to local CSV if both API calls fail
                    from .utils import get_artist_info
                    local_artist_info = get_artist_info(artist_name)
                    
                    if local_artist_info:
                        local_artist_info['count'] = count
                        enhanced_artists.append(local_artist_info)
                    else:
                        # If not found anywhere, keep original data with default values
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