import os
from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from celery.result import AsyncResult
import logging
from .models import Song, Playlist, UserMusicProfile
from .serializers import SongSerializer, PlaylistSerializer, UserMusicProfileSerializer
from .tasks import download_song, download_spotify_playlist, download_youtube_playlist
from spotipy.oauth2 import SpotifyClientCredentials
from .spotify_api import get_spotify_client, get_playlist_tracks, get_track_info
import yt_dlp
logger = logging.getLogger(__name__)

class SongViewSet(viewsets.ModelViewSet):
    queryset = Song.objects.all()
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Song.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def download(self, request):
        """
        Endpoint to handle song/playlist downloads from YouTube or Spotify
        """
        url = request.data.get('url')
        async_download = request.data.get('async', False)  # Optional async parameter
        
        if not url:
            return Response({'error': 'URL is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            if 'youtube.com' in url or 'youtu.be' in url:
                if 'playlist' in url:
                    if async_download:
                        task = download_spotify_playlist.delay(url, request.user.id)
                        return Response({
                            'message': 'Playlist download initiated',
                            'task_id': task.id,
                            'status': 'processing'
                        }, status=status.HTTP_202_ACCEPTED)
                    else:
                        return self.download_youtube(url)
                else:
                    if async_download:
                        task = download_song.delay(url, request.user.id)
                        return Response({
                            'message': 'Download initiated',
                            'task_id': task.id,
                            'status': 'processing'
                        }, status=status.HTTP_202_ACCEPTED)
                    else:
                        return self.download_youtube(url)
            elif 'spotify.com' in url:
                if '/playlist/' in url:
                    task = download_spotify_playlist.delay(url, request.user.id)
                    return Response({
                        'message': 'Playlist download initiated',
                        'task_id': task.id,
                        'status': 'processing'
                    }, status=status.HTTP_202_ACCEPTED)
                else:
                    if async_download:
                        task = download_song.delay(url, request.user.id)
                        return Response({
                            'message': 'Download initiated',
                            'task_id': task.id,
                            'status': 'processing'
                        }, status=status.HTTP_202_ACCEPTED)
                    else:
                        return self.download_spotify_track(url)
            else:
                return Response({'error': 'Unsupported URL'}, status=status.HTTP_400_BAD_REQUEST)

        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def download_youtube(self, url):
        """Direct YouTube download with streaming response"""
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
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                filename = os.path.splitext(filename)[0] + '.mp3'
                
                formatted_filename = f"{info['title']} - {info.get('uploader', 'Unknown Artist')}.mp3"
                formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))

                song = Song.objects.create(
                    user=self.request.user,
                    title=info['title'],
                    artist=info.get('uploader', 'Unknown Artist'),
                    album=info.get('album', 'Unknown'),
                    file=os.path.relpath(filename, settings.MEDIA_ROOT),
                    source='youtube',
                    thumbnail_url=info.get('thumbnail'),
                    song_url=url
                )

                response = FileResponse(
                    open(filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                response['Content-Type'] = 'audio/mpeg'
                return response

        except Exception as e:
            logger.error(f"YouTube download error: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def download_spotify_track(self, url):
        """Direct Spotify track download with streaming response"""
        try:
            track_info = get_track_info(url)
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
                filename = os.path.splitext(filename)[0] + '.mp3'
                
                formatted_filename = f"{track_info['title']} - {track_info['artist']}.mp3"
                formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))

                song = Song.objects.create(
                    user=self.request.user,
                    title=track_info['title'],
                    artist=track_info['artist'],
                    album=track_info.get('album', 'Unknown'),
                    file=os.path.relpath(filename, settings.MEDIA_ROOT),
                    source='spotify',
                    spotify_id=track_info.get('spotify_id'),
                    thumbnail_url=track_info.get('image_url'),
                    song_url=url
                )

                response = FileResponse(
                    open(filename, 'rb'),
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


    @action(detail=False, methods=['get'])
    def check_status(self, request):
        """
        Check the status of a download task
        """
        task_id = request.query_params.get('task_id')
        if not task_id:
            return Response({'error': 'task_id is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            task_result = AsyncResult(task_id)
            
            if task_result.ready():
                if task_result.successful():
                    result = task_result.get()
                    if isinstance(result, int):  # Single song download
                        song = Song.objects.get(id=result)
                        return Response({
                            'status': 'completed',
                            'song_id': song.id,
                            'title': song.title,
                            'artist': song.artist,
                            'download_url': request.build_absolute_uri(f'/api/songs/{song.id}/download/')
                        })
                    else:  # Playlist download
                        playlist = Playlist.objects.get(id=result)
                        return Response({
                            'status': 'completed',
                            'playlist_id': playlist.id,
                            'name': playlist.name,
                            'song_count': playlist.songs.count(),
                            'download_url': request.build_absolute_uri(f'/api/playlists/{playlist.id}/download/')
                        })
                else:
                    return Response({
                        'status': 'failed',
                        'error': str(task_result.result)
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            else:
                return Response({
                    'status': 'processing',
                    'progress': 'in_progress'
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