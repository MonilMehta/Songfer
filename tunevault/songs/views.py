import os
import yt_dlp
from django.conf import settings
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Song, Playlist, UserMusicProfile
from .serializers import SongSerializer, PlaylistSerializer, UserMusicProfileSerializer
from django.shortcuts import get_object_or_404
from nltk.tokenize import word_tokenize
from nltk.corpus import stopwords
from nltk.stem import PorterStemmer
import nltk
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from .spotify_api import get_spotify_client, get_playlist_tracks, get_track_info
import logging
import os
from celery import shared_task
from .tasks import download_song, download_spotify_playlist

from .models import Song, Playlist


logger = logging.getLogger(__name__)

# Views

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
        url = request.data.get('url')
        if not url:
            return Response({'error': 'URL is required'}, status=status.HTTP_400_BAD_REQUEST)
        print(url)
        try:
            if 'youtube.com' in url or 'youtu.be' in url:
                return self.download_youtube(url)
            elif 'spotify.com' in url:
                if '/track/' in url:
                    print('Spotify track call')
                    return self.download_spotify_track(url)
                elif '/playlist/' in url:
                    print('Spotify playlist call')
                    return self.download_spotify_playlist(url)
            else:
                return Response({'error': 'Unsupported URL'}, status=status.HTTP_400_BAD_REQUEST)
        except spotipy.SpotifyException as spotify_err:
            logger.error(f"Spotify API Error: {spotify_err}")
            return Response({'error': f'Spotify API Error: {str(spotify_err)}'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ConnectionError as conn_err:
            logger.error(f"Connection Error: {conn_err}")
            return Response({'error': 'Unable to establish connection to Spotify'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except ValueError as val_err:
            logger.error(f"Validation Error: {val_err}")
            return Response({'error': str(val_err)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return Response({'error': f'Unexpected error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def download_youtube(self, url):
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
            'verbose': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            filename = os.path.splitext(filename)[0] + '.mp3'

        song = Song.objects.create(
            user=self.request.user,
            title=info['title'],
            artist=info.get('uploader', 'Unknown Artist'),
            file=os.path.relpath(filename, settings.MEDIA_ROOT),
            source='youtube'
        )

        serializer = self.get_serializer(song)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    
    def download_spotify_track(self, url):
        try:
            # Step 1: Extract track info
            track_info = get_track_info(url)
            
            # Step 2: Prepare download options
            query = f"{track_info['title']} {track_info['artist']}"
            ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
            }

            # Step 3: Perform the download
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
                filename = ydl.prepare_filename(info)
                filename = os.path.splitext(filename)[0] + '.mp3'

            # Step 4: Create song record
            song = Song.objects.create(
                user=self.request.user,
                title=track_info['title'],
                artist=track_info['artist'],
                album=track_info.get('album', 'Unknown'),
                file=os.path.relpath(filename, settings.MEDIA_ROOT),
                source='youtube',
                spotify_id=track_info.get('spotify_id')
            )

            # Step 5: Generate and return song metadata with file URL
            file_url = self.request.build_absolute_uri(f"/media/{song.file}")
            return Response({
                "id": song.id,
                "title": song.title,
                "artist": song.artist,
                "file": file_url,
                "source": song.source,
                "created_at": song.created_at.isoformat(),
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            logger.error(f"Error during Spotify track download: {e}", exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def download_spotify_playlist(self, url):
        try:
            client = get_spotify_client()
            playlist_id = url.split("/")[-1].split("?")[0]
            print(f"Spotify playlist call with URL: {url}")
            playlist_tracks = get_playlist_tracks(url)  # Pass the full URL here
            print(playlist_tracks)

            playlist = Playlist.objects.create(
                user=self.request.user,
                name=f"Spotify Playlist {playlist_id}",
                source="spotify",
                source_url=url
            )

            for track in playlist_tracks:
                download_song.delay(track, user_id=self.request.user.id, playlist_id=playlist.id)

            serializer = PlaylistSerializer(playlist)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def download_and_save_song(self, song, playlist):
        try:
            download_spotify_playlist.delay(song, self.request.user.id)
            
            return Response({
                'message': 'Playlist download initiated', 
                'detail': 'Songs will be downloaded in the background'
            }, status=status.HTTP_202_ACCEPTED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        

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
            return Response({'error': 'song_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        song = get_object_or_404(Song, id=song_id, user=request.user)
        playlist.add_song(song)
        return Response({'status': 'song added to playlist'})

    @action(detail=True, methods=['post'])
    def remove_song(self, request, pk=None):
        playlist = self.get_object()
        song_id = request.data.get('song_id')
        if not song_id:
            return Response({'error': 'song_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        song = get_object_or_404(Song, id=song_id, user=request.user)
        playlist.songs.remove(song)
        return Response({'status': 'song removed from playlist'})

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
