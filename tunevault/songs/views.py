import os
import yt_dlp
from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from celery.result import AsyncResult
import logging
from .models import Song, Playlist, UserMusicProfile,DownloadProgress, SongCache
from .serializers import SongSerializer, PlaylistSerializer, UserMusicProfileSerializer
from .tasks import download_song, download_spotify_playlist, download_youtube_playlist
from .spotify_api import get_playlist_tracks,get_spotify_client,get_track_info
from rest_framework.views import APIView
from .recommendation import get_hybrid_recommendations, update_user_recommendations
from .csv_recommender import get_hybrid_recommendations, get_csv_recommender
from django.utils import timezone
from datetime import timedelta
from rest_framework.views import APIView
from .recommendation import get_hybrid_recommendations, update_user_recommendations
from .csv_recommender import get_hybrid_recommendations, get_csv_recommender


logger = logging.getLogger(__name__)

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

    def download_youtube(self, url):
        """Direct YouTube download with streaming response"""
        # Check if this is a playlist URL
        if 'playlist' in url or 'list=' in url:
            # Redirect to the async playlist download
            task = download_youtube_playlist.delay(url, self.request.user.id)
            return Response({
                'message': 'Playlist download initiated',
                'task_id': task.id,
                'status': 'processing'
            }, status=status.HTTP_202_ACCEPTED)
            
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
            'writethumbnail': True,
            'noplaylist': True,  # Only download the single video, not the playlist
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                base_filename = os.path.splitext(filename)[0]
                mp3_filename = base_filename + '.mp3'
                
                # Get thumbnail path - first check for local files
                thumbnail_path = None
                for ext in ['jpg', 'png', 'webp']:
                    possible_path = f"{base_filename}.{ext}"
                    if os.path.exists(possible_path):
                        thumbnail_path = f"/media/songs/{os.path.basename(possible_path)}"
                        break
                
                # If no local thumbnail, try to get from info
                if not thumbnail_path:
                    for key in ['thumbnail', 'thumbnails']:
                        if key in info and info[key]:
                            if isinstance(info[key], list) and len(info[key]) > 0:
                                thumbnail_path = info[key][0].get('url')
                            else:
                                thumbnail_path = info[key]
                            break
                
                formatted_filename = f"{info['title']} - {info.get('uploader', 'Unknown Artist')}.mp3"
                formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))

                song = Song.objects.create(
                    user=self.request.user,
                    title=info['title'],
                    artist=info.get('uploader', 'Unknown Artist'),
                    album=info.get('album', 'Unknown'),
                    file=os.path.relpath(mp3_filename, settings.MEDIA_ROOT),
                    source='youtube',
                    thumbnail_url=thumbnail_path,
                    song_url=url
                )

                # Update user's music profile
                try:
                    profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                    profile.update_profile(song)
                except Exception as profile_error:
                    logger.warning(f"Error updating user profile: {profile_error}")

                response = FileResponse(
                    open(mp3_filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                response['Content-Type'] = 'audio/mpeg'
                return response

        except Exception as e:
            logger.error(f"YouTube download error: {e}", exc_info=True)
            raise

    def download_spotify_track(self, url):
        """Direct Spotify track download with streaming response"""
        try:
            track_info = get_track_info(url)  # You'll need to implement this method
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
                
                formatted_filename = f"{track_info['title']} - {track_info['artist']}.mp3"
                formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))

                song = Song.objects.create(
                    user=self.request.user,
                    title=track_info['title'],
                    artist=track_info['artist'],
                    album=track_info.get('album', 'Unknown'),
                    file=os.path.relpath(mp3_filename, settings.MEDIA_ROOT),
                    source='spotify',
                    spotify_id=track_info.get('spotify_id'),
                    thumbnail_url=thumbnail_url,
                    song_url=url
                )
                
                # Update user's music profile
                try:
                    profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                    profile.update_profile(song)
                except Exception as profile_error:
                    logger.warning(f"Error updating user profile: {profile_error}")

                response = FileResponse(
                    open(mp3_filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                response['Content-Type'] = 'audio/mpeg'
                return response

        except Exception as e:
            logger.error(f"Spotify track download error: {e}", exc_info=True)
            raise

    @action(detail=False, methods=['post'])
    def download(self, request):
        """
        Endpoint to handle song/playlist downloads from YouTube or Spotify
        """
        url = request.data.get('url')
        async_download = request.data.get('async', False)
        
        if not url:
            return Response({'error': 'URL is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if the user can download more songs
        user = request.user
        downloads_remaining = user.get_downloads_remaining()
        
        if downloads_remaining <= 0:
            # User has reached their download limit
            tomorrow = (timezone.now() + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
            seconds_until_reset = (tomorrow - timezone.now()).total_seconds()
            
            # Format time remaining
            hours = int(seconds_until_reset // 3600)
            minutes = int((seconds_until_reset % 3600) // 60)
            seconds = int(seconds_until_reset % 60)
            time_str = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
            
            # Return error with time until reset
            return Response({
                'error': 'Daily download limit reached',
                'message': 'You have reached your daily download limit',
                'is_subscribed': user.is_subscription_active(),
                'limit': 30 if user.is_subscription_active() else 5,
                'reset_time': time_str,
                'upgrade_message': 'Upgrade to premium for 30 downloads per day' if not user.is_subscription_active() else None
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Check cache first for single song downloads (not playlists)
        if not ('playlist' in url or 'list=' in url or '/playlist/' in url):
            cached_song = SongCache.get_cached_song(url)
            
            if cached_song:
                logger.info(f"Using cached version for URL: {url}")
                
                # Check if this user already has this song
                existing_song = Song.objects.filter(user=user, song_url=url).first()
                if existing_song:
                    # User already has this song - just return it
                    return Response({
                        'status': 'completed',
                        'from_cache': True,
                        'already_owned': True,
                        'song_id': existing_song.id,
                        'title': existing_song.title,
                        'artist': existing_song.artist,
                        'file_size': os.path.getsize(os.path.join(settings.MEDIA_ROOT, existing_song.file.name)) if os.path.exists(os.path.join(settings.MEDIA_ROOT, existing_song.file.name)) else 0,
                        'download_url': request.build_absolute_uri(f'/api/songs/{existing_song.id}/download_file/'),
                        'thumbnail_url': existing_song.thumbnail_url,
                        'image_url': request.build_absolute_uri(existing_song.thumbnail_url) if existing_song.thumbnail_url and not existing_song.thumbnail_url.startswith('http') else existing_song.thumbnail_url,
                    })
                
                # Create a new song entry for this user from the cached data
                try:
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
                    
                    # Return the song info
                    return Response({
                        'status': 'completed',
                        'from_cache': True,
                        'song_id': song.id,
                        'title': song.title,
                        'artist': song.artist,
                        'file_size': cached_song.file_size,
                        'download_url': request.build_absolute_uri(f'/api/songs/{song.id}/download_file/'),
                        'thumbnail_url': song.thumbnail_url,
                        'image_url': request.build_absolute_uri(song.thumbnail_url) if song.thumbnail_url and not song.thumbnail_url.startswith('http') else song.thumbnail_url,
                        'downloads_remaining': user.get_downloads_remaining()
                    })
                except Exception as e:
                    logger.error(f"Error creating song from cache: {e}", exc_info=True)
                    # Fall through to regular download if cache creation fails
        
        try:
            logger.info(f"Download request received for URL: {url}")
            
            if 'youtube.com' in url or 'youtu.be' in url:
                # Check if it's a playlist
                if 'playlist' in url or 'list=' in url:
                    logger.info(f"Detected YouTube playlist: {url}")
                    
                    # For playlists, we need to check if the user has enough downloads remaining
                    try:
                        # Get approximate playlist size
                        with yt_dlp.YoutubeDL({'quiet': True, 'extract_flat': True, 'skip_download': True}) as ydl:
                            info = ydl.extract_info(url, download=False)
                            tracks_count = len(info.get('entries', []))
                            
                            if tracks_count > downloads_remaining:
                                return Response({
                                    'error': 'Not enough downloads remaining',
                                    'message': f'This playlist has {tracks_count} songs but you only have {downloads_remaining} downloads remaining today',
                                    'is_subscribed': user.is_subscription_active(),
                                    'downloads_remaining': downloads_remaining,
                                    'tracks_in_playlist': tracks_count,
                                    'upgrade_message': 'Upgrade to premium for 30 downloads per day' if not user.is_subscription_active() else None
                                }, status=status.HTTP_429_TOO_MANY_REQUESTS)
                    except Exception as e:
                        logger.warning(f"Error checking playlist size: {e}")
                        # Continue anyway if we can't check the size
                    
                    # Start downloading the playlist
                    try:
                        from .tasks import download_youtube_playlist_direct
                        # Get the user id
                        user_id = request.user.id
                        logger.info(f"Starting direct YouTube playlist download for user {user_id}")
                        
                        # Start the task directly using the direct function
                        playlist_id = download_youtube_playlist_direct(url, user_id)
                        
                        logger.info(f"YouTube playlist download completed with playlist ID: {playlist_id}")
                        
                        # Return the playlist details
                        try:
                            playlist = Playlist.objects.get(id=playlist_id)
                            return Response({
                                'status': 'completed',
                                'message': 'Playlist download complete',
                                'playlist_id': playlist.id,
                                'name': playlist.name,
                                'song_count': playlist.songs.count(),
                                'download_url': request.build_absolute_uri(f'/api/playlists/{playlist.id}/download_all/'),
                            }, status=status.HTTP_200_OK)
                        except Playlist.DoesNotExist:
                            return Response({
                                'status': 'error',
                                'error': 'Playlist not found after download'
                            }, status=status.HTTP_404_NOT_FOUND)
                        
                    except Exception as e:
                        logger.error(f"Error directly downloading playlist: {str(e)}", exc_info=True)
                        error_message = str(e)
                        if "No videos found" in error_message:
                            return Response({
                                'error': 'No videos found in the playlist. Please check the URL and try again.'
                            }, status=status.HTTP_400_BAD_REQUEST)
                        elif "Could not extract playlist info" in error_message:
                            return Response({
                                'error': 'Could not extract playlist information. Please check the URL and try again.'
                            }, status=status.HTTP_400_BAD_REQUEST)
                        elif "Failed to download any songs" in error_message:
                            return Response({
                                'error': 'Could not download any songs from the playlist. Please try again later.'
                            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                        else:
                            return Response({
                                'error': f'Playlist download failed: {error_message}'
                            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                else:
                    logger.info(f"Detected YouTube single video: {url}")
                    if async_download:
                        task = download_song.delay(url, request.user.id)
                        logger.info(f"Started async YouTube download task: {task.id}")
                        return Response({
                            'message': 'Download initiated',
                            'task_id': task.id,
                            'status': 'processing',
                            'check_status_url': request.build_absolute_uri(f'/api/songs/check_status/?task_id={task.id}')
                        }, status=status.HTTP_202_ACCEPTED)
                    else:
                        logger.info(f"Starting direct YouTube download")
                        return self.download_youtube(url)
            
            elif 'spotify.com' in url:
                if '/playlist/' in url:
                    logger.info(f"Detected Spotify playlist: {url}")
                    
                    # For debugging, let's start the task directly here without using celery
                    try:
                        from .tasks import download_spotify_playlist_direct
                        # Get the user id
                        user_id = request.user.id
                        logger.info(f"Starting direct Spotify playlist download for user {user_id}")
                        
                        # Start the task directly using the direct function
                        playlist_id = download_spotify_playlist_direct(url, user_id)
                        
                        logger.info(f"Spotify playlist download completed with playlist ID: {playlist_id}")
                        
                        # Return the playlist details
                        try:
                            playlist = Playlist.objects.get(id=playlist_id)
                            return Response({
                                'status': 'completed',
                                'message': 'Playlist download complete',
                                'playlist_id': playlist.id,
                                'name': playlist.name,
                                'song_count': playlist.songs.count(),
                                'download_url': request.build_absolute_uri(f'/api/playlists/{playlist.id}/download_all/'),
                            }, status=status.HTTP_200_OK)
                        except Playlist.DoesNotExist:
                            return Response({
                                'status': 'error',
                                'error': 'Playlist not found after download'
                            }, status=status.HTTP_404_NOT_FOUND)
                        
                    except Exception as e:
                        logger.error(f"Error directly downloading Spotify playlist: {str(e)}", exc_info=True)
                        error_message = str(e)
                        if "No tracks found" in error_message:
                            return Response({
                                'error': 'No tracks found in the Spotify playlist. Please check the URL and try again.'
                            }, status=status.HTTP_400_BAD_REQUEST)
                        elif "Could not extract playlist info" in error_message:
                            return Response({
                                'error': 'Could not extract Spotify playlist information. Please check the URL and try again.'
                            }, status=status.HTTP_400_BAD_REQUEST)
                        elif "Failed to download any songs" in error_message:
                            return Response({
                                'error': 'Could not download any songs from the Spotify playlist. Please try again later.'
                            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                        else:
                            return Response({
                                'error': f'Spotify playlist download failed: {error_message}'
                            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                else:
                    logger.info(f"Detected Spotify track: {url}")
                    if async_download:
                        task = download_song.delay(url, request.user.id)
                        logger.info(f"Started async Spotify download task: {task.id}")
                        return Response({
                            'message': 'Download initiated',
                            'task_id': task.id,
                            'status': 'processing',
                            'check_status_url': request.build_absolute_uri(f'/api/songs/check_status/?task_id={task.id}')
                        }, status=status.HTTP_202_ACCEPTED)
                    else:
                        logger.info(f"Starting direct Spotify download")
                        return self.download_spotify_track(url)
            else:
                logger.warning(f"Unsupported URL: {url}")
                return Response({'error': 'Unsupported URL'}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def download_playlist(self, request):
        """
        Endpoint to initiate playlist downloads from YouTube or Spotify
        """
        urls = request.data.get('urls')
        if not urls or not isinstance(urls, list):
            return Response({'error': 'URLs are required and should be a list'}, status=status.HTTP_400_BAD_REQUEST)
        
        task_ids = []
        try:
            for url in urls:
                if 'youtube.com' in url or 'youtu.be' in url:
                    task = download_youtube_playlist.delay(url, request.user.id)
                    task_type = 'youtube_playlist'
                elif 'spotify.com' in url and '/playlist/' in url:
                    task = download_spotify_playlist.delay(url, request.user.id)
                    task_type = 'spotify_playlist'
                else:
                    continue
                task_ids.append({'task_id': task.id, 'type': task_type})

            return Response({
                'message': 'Playlist download initiated',
                'tasks': task_ids,
                'status': 'processing'
            }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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
                            clean_filename = "".join(c for c in clean_filename if c.isalnum() or c in (' ', '-', '.'))
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
            
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_file:
                with zipfile.ZipFile(temp_file.name, 'w') as zip_file:
                    for song in playlist.songs.all():
                        file_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
                        if os.path.exists(file_path):
                            zip_file.write(
                                file_path, 
                                f"{song.title} - {song.artist}.mp3"
                            )

                response = FileResponse(
                    open(temp_file.name, 'rb'),
                    as_attachment=True,
                    filename=f"{playlist.name}.zip"
                )
                response['Content-Type'] = 'application/zip'
                return response

        except Exception as e:
            logger.error(f"Error creating playlist ZIP: {e}", exc_info=True)
            return Response(
                {'error': f'Playlist download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class UserMusicProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserMusicProfileSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return UserMusicProfile.objects.get_or_create(user=self.request.user)[0]

class UserTopArtistsView(generics.ListAPIView):
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Song.get_user_top_artists(self.request.user)

class UserRecommendationsView(generics.ListAPIView):
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        """
        Get recommendations for the authenticated user
        """
        try:
            logger.info(f"Getting recommendations for user: {self.request.user.id}")
            
            # Get recommendations using CSV-based recommender
            from .csv_recommender import get_hybrid_recommendations
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
                            title=rec['title'],
                            artist=rec['artist'],
                            album=rec.get('album', 'Unknown'),
                            source='csv_data',
                            spotify_id=rec['spotify_id'],
                            thumbnail_url=rec.get('image_url')
                        )
                        songs.append(song.id)
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
            
            logger.info(f"Getting CSV recommendations for user: {request.user.id} with limit: {limit}")
            
            # Get recommendations from CSV recommender
            recommendations_data = get_hybrid_recommendations(request.user, limit)
            
            if not recommendations_data:
                logger.warning("No recommendations returned from CSV recommender")
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
            
            logger.info(f"Got {len(recommendations_data)} recommendations from CSV data")
            
            # Convert recommendations to Song objects if they don't exist yet
            songs = []
            for rec in recommendations_data:
                if 'spotify_id' not in rec:
                    logger.warning(f"Missing spotify_id in recommendation: {rec}")
                    continue
                    
                # Check if song already exists
                existing = Song.objects.filter(spotify_id=rec['spotify_id']).first()
                if existing:
                    songs.append(existing)
                else:
                    # Create new song
                    try:
                        song = Song.objects.create(
                            user=request.user,
                            title=rec['title'],
                            artist=rec['artist'],
                            album=rec.get('album', 'Unknown'),
                            source='csv_data',
                            spotify_id=rec['spotify_id'],
                            thumbnail_url=rec.get('image_url')
                        )
                        songs.append(song)
                    except Exception as e:
                        logger.error(f"Error creating song from recommendation: {e}", exc_info=True)
            
            # Serialize the recommendations
            serializer = SongSerializer(songs, many=True, context={'request': request})
            
            return Response({
                'success': True,
                'message': f'Found {len(songs)} recommendations using CSV data',
                'recommendations': serializer.data,
                'debug_info': {
                    'user_songs_count': user_songs.count(),
                    'spotify_songs_count': spotify_songs.count(),
                    'recommendations_count': len(recommendations_data),
                    'songs_created': len(songs),
                    'recommendation_source': 'csv_dataset'
                }
            })
            
        except Exception as e:
            logger.error(f"Error getting recommendations: {e}", exc_info=True)
            return Response({
                'success': False,
                'error': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)