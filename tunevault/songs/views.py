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
from .models import Song, Playlist, UserMusicProfile,DownloadProgress
from .serializers import SongSerializer, PlaylistSerializer, UserMusicProfileSerializer
from .tasks import download_song, download_spotify_playlist, download_youtube_playlist
from .spotify_api import get_playlist_tracks,get_spotify_client,get_track_info


logger = logging.getLogger(__name__)

class SongViewSet(viewsets.ModelViewSet):
    queryset = Song.objects.all()
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Song.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def download_youtube(self, url):
        """Direct YouTube download with streaming response"""
        # Check if this is a playlist URL
        if 'playlist' in url or 'list=' in url:
            # For playlists, we need to bundle the songs into a zip file
            return self.handle_playlist_download(url)
            
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
            
    def handle_playlist_download(self, url):
        """Download playlist songs and return them as a zip file"""
        logger.info(f"Handling playlist download for URL: {url}")
        
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
        
        try:
            # First extract the playlist info without downloading
            with yt_dlp.YoutubeDL({'extract_flat': True}) as ydl:
                playlist_info = ydl.extract_info(url, download=False)
                playlist_title = playlist_info.get('title', 'Playlist')
                
            # Then download all songs
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                playlist_info = ydl.extract_info(url, download=True)
                
            # Create a playlist record
            playlist = Playlist.objects.create(
                user=self.request.user,
                name=playlist_title,
                source="youtube",
                source_url=url
            )
            
            # Create a ZIP file with all the downloaded songs
            import zipfile
            import tempfile
            
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_file:
                with zipfile.ZipFile(temp_file.name, 'w') as zip_file:
                    # Add each song to the ZIP file and create Song objects
                    for entry in playlist_info['entries']:
                        if entry is None:
                            continue
                            
                        title = entry.get('title', 'Unknown')
                        artist = entry.get('uploader', 'Unknown Artist')
                        
                        # Construct the expected output filename based on yt-dlp's naming scheme
                        base_filename = os.path.join(settings.MEDIA_ROOT, 'songs', f"{title}")
                        mp3_filename = base_filename + '.mp3'
                        
                        if os.path.exists(mp3_filename):
                            # Clean filename for ZIP
                            formatted_filename = f"{title} - {artist}.mp3"
                            formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))
                            
                            # Add to ZIP
                            zip_file.write(mp3_filename, formatted_filename)
                            
                            # Get thumbnail path - check for local files
                            thumbnail_path = None
                            for ext in ['jpg', 'png', 'webp']:
                                possible_path = f"{base_filename}.{ext}"
                                if os.path.exists(possible_path):
                                    thumbnail_path = f"/media/songs/{os.path.basename(possible_path)}"
                                    break
                            
                            # Create Song record
                            song = Song.objects.create(
                                user=self.request.user,
                                title=title,
                                artist=artist,
                                album=entry.get('album', 'Unknown'),
                                file=os.path.relpath(mp3_filename, settings.MEDIA_ROOT),
                                source='youtube',
                                thumbnail_url=thumbnail_path or entry.get('thumbnail'),
                                song_url=entry.get('webpage_url')
                            )
                            
                            # Add to playlist
                            playlist.songs.add(song)
                            
                            # Update user's music profile
                            try:
                                profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                                profile.update_profile(song)
                            except Exception as profile_error:
                                logger.warning(f"Error updating user profile: {profile_error}")
                
                # Return the ZIP file
                response = FileResponse(
                    open(temp_file.name, 'rb'),
                    as_attachment=True,
                    filename=f"{playlist_title}.zip"
                )
                response['Content-Type'] = 'application/zip'
                
                # Schedule cleanup of temp file
                import threading
                def cleanup():
                    import time
                    time.sleep(60)  # Wait for file to be sent
                    try:
                        os.unlink(temp_file.name)
                    except:
                        pass
                threading.Thread(target=cleanup).start()
                
                return response
                
        except Exception as e:
            logger.error(f"Error handling playlist download: {e}", exc_info=True)
            raise

    def download_spotify_track(self, url):
        """Direct Spotify track download with streaming response"""
        # Check if this is a playlist URL
        if '/playlist/' in url:
            # For playlists, we need to bundle the songs into a zip file
            return self.handle_spotify_playlist_download(url)
            
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
            
    def handle_spotify_playlist_download(self, url):
        """Download Spotify playlist songs and return them as a zip file"""
        logger.info(f"Handling Spotify playlist download for URL: {url}")
        
        try:
            # Get the Spotify playlist tracks
            playlist_tracks = get_playlist_tracks(url)
            
            # Get the playlist ID for naming
            from urllib.parse import urlparse
            path_segments = urlparse(url).path.split('/')
            playlist_id = path_segments[-1].split('?')[0]
            playlist_title = f"Spotify Playlist {playlist_id}"
            
            # Create a playlist record
            playlist = Playlist.objects.create(
                user=self.request.user,
                name=playlist_title,
                source="spotify",
                source_url=url
            )
            
            # Create a ZIP file for the songs
            import zipfile
            import tempfile
            
            with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as temp_file:
                with zipfile.ZipFile(temp_file.name, 'w') as zip_file:
                    # Process each track
                    for track_info in playlist_tracks:
                        try:
                            title = track_info['title']
                            artist = track_info['artist']
                            query = f"{title} {artist}"
                            
                            # Download from YouTube
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
                                
                                # Skip if download failed
                                if not os.path.exists(mp3_filename):
                                    logger.warning(f"Downloaded file not found: {mp3_filename}")
                                    continue
                                
                                # Get thumbnail URL
                                thumbnail_url = track_info.get('image_url')
                                if not thumbnail_url:
                                    for ext in ['jpg', 'png', 'webp']:
                                        possible_path = f"{base_filename}.{ext}"
                                        if os.path.exists(possible_path):
                                            thumbnail_url = f"/media/songs/{os.path.basename(possible_path)}"
                                            break
                                
                                # Clean filename for ZIP
                                formatted_filename = f"{title} - {artist}.mp3"
                                formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))
                                
                                # Add to ZIP
                                zip_file.write(mp3_filename, formatted_filename)
                                
                                # Create Song record
                                song = Song.objects.create(
                                    user=self.request.user,
                                    title=title,
                                    artist=artist,
                                    album=track_info.get('album', 'Unknown'),
                                    file=os.path.relpath(mp3_filename, settings.MEDIA_ROOT),
                                    source='spotify',
                                    spotify_id=track_info.get('spotify_id'),
                                    thumbnail_url=thumbnail_url,
                                    song_url=None
                                )
                                
                                # Add to playlist
                                playlist.songs.add(song)
                                
                                # Update user's music profile
                                try:
                                    profile, created = UserMusicProfile.objects.get_or_create(user=self.request.user)
                                    profile.update_profile(song)
                                except Exception as profile_error:
                                    logger.warning(f"Error updating user profile: {profile_error}")
                        
                        except Exception as track_error:
                            logger.error(f"Error downloading track {track_info.get('title')}: {track_error}")
                            # Continue with other tracks
                    
                # Check if any songs were downloaded
                if not playlist.songs.exists():
                    # Delete the playlist as it's empty
                    playlist.delete()
                    raise ValueError("No songs could be downloaded from the playlist")
                
                # Return the ZIP file
                response = FileResponse(
                    open(temp_file.name, 'rb'),
                    as_attachment=True,
                    filename=f"{playlist_title}.zip"
                )
                response['Content-Type'] = 'application/zip'
                
                # Schedule cleanup of temp file
                import threading
                def cleanup():
                    import time
                    time.sleep(60)  # Wait for file to be sent
                    try:
                        os.unlink(temp_file.name)
                    except:
                        pass
                threading.Thread(target=cleanup).start()
                
                return response
                
        except Exception as e:
            logger.error(f"Error handling Spotify playlist download: {e}", exc_info=True)
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
        
        try:
            logger.info(f"Download request received for URL: {url}")
            
            if 'youtube.com' in url or 'youtu.be' in url:
                logger.info(f"Detected YouTube URL: {url}")
                
                # Check if it's a playlist directly and let download_youtube handle it
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
                logger.info(f"Detected Spotify URL: {url}")
                
                # Check if it's a playlist directly and let download_spotify_track handle it
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
                                'file_size': os.path.getsize(os.path.join(settings.MEDIA_ROOT, song.file.name)),
                                'download_url': request.build_absolute_uri(f'/api/songs/{song.id}/download/'),
                                'thumbnail_url': song.thumbnail_url,
                                'duration': song.duration,
                            })
                        except Song.DoesNotExist:
                            return Response({
                                'status': 'error',
                                'error': 'Song not found in database'
                            }, status=status.HTTP_404_NOT_FOUND)
                        
                    else:  # Playlist download
                        try:
                            playlist = Playlist.objects.get(id=result)
                            return Response({
                                'status': 'completed',
                                'playlist_id': playlist.id,
                                'name': playlist.name,
                                'song_count': playlist.songs.count(),
                                'total_size': sum(os.path.getsize(os.path.join(settings.MEDIA_ROOT, song.file.name)) 
                                                for song in playlist.songs.all()),
                                'download_url': request.build_absolute_uri(f'/api/playlists/{playlist.id}/download/'),
                                'songs': [{
                                    'id': song.id,
                                    'title': song.title,
                                    'artist': song.artist,
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
                response_data = {
                    'status': 'processing',
                    'state': task_result.state,
                }
                
                # Add progress information if available
                if progress:
                    response_data.update({
                        'progress': {
                            'current': progress.current_progress,
                            'total': progress.total_items,
                            'percentage': round((progress.current_progress / progress.total_items * 100)
                                              if progress.total_items > 0 else 0, 2),
                            'current_file': progress.current_file,
                            'started_at': progress.started_at,
                            'last_update': progress.last_update,
                            'estimated_time': progress.estimated_completion_time
                        }
                    })
                
                return Response(response_data)

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

class PlaylistViewSet(viewsets.ModelViewSet):
    serializer_class = PlaylistSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Playlist.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

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
        return Song.recommend_songs(self.request.user)