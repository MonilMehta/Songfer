import os
from celery import shared_task
from django.conf import settings
from django.contrib.auth import get_user_model
import yt_dlp
import logging
import os
import yt_dlp
from django.conf import settings
from django.http import FileResponse
from rest_framework import viewsets, status, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
# from nltk.tokenize import word_tokenize
# from nltk.corpus import stopwords
# from nltk.stem import PorterStemmer
# import nltk
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
from .spotify_api import get_spotify_client, get_playlist_tracks, get_track_info
import logging
from celery import shared_task
from .tasks import download_song, download_spotify_playlist
from .models import Song, Playlist, UserMusicProfile
from .serializers import SongSerializer, PlaylistSerializer, UserMusicProfileSerializer
from mutagen.easyid3 import EasyID3
from mutagen.mp3 import MP3
from mutagen.id3 import APIC, error
import requests

logger = logging.getLogger(__name__)

User = get_user_model()
from mutagen.mp3 import MP3
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, error

def embed_thumbnail_in_mp3(mp3_file_path, thumbnail_url, title=None, artist=None, album=None):
    """
    Embeds thumbnail and metadata in MP3 file using proper ID3 frame objects
    """
    try:
        # Fetch the thumbnail
        response = requests.get(thumbnail_url)
        response.raise_for_status()
        thumbnail_data = response.content

        # Add ID3 tag if it doesn't exist
        try:
            audio = MP3(mp3_file_path, ID3=ID3)
        except error:
            logger.info("Adding ID3 header")
            audio = MP3(mp3_file_path)
            audio.add_tags()

        # Add metadata using proper ID3 frame objects
        if thumbnail_data:
            audio.tags.add(
                APIC(
                    encoding=3,  # UTF-8
                    mime='image/jpeg',
                    type=3,  # Cover (front)
                    desc='Cover',
                    data=thumbnail_data
                )
            )

        # Add song metadata using proper frame objects
        if title:
            audio.tags.add(TIT2(encoding=3, text=title))
        if artist:
            audio.tags.add(TPE1(encoding=3, text=artist))
        if album:
            audio.tags.add(TALB(encoding=3, text=album))

        audio.save()
        logger.info(f"Successfully embedded thumbnail and metadata for: {mp3_file_path}")
        return True

    except Exception as e:
        logger.error(f"Error embedding thumbnail: {str(e)}", exc_info=True)
        return False

@shared_task
def download_song(song_info, user_id, playlist_id=None):
    """
    Celery task to download a song from Spotify or YouTube search
    """
    try:
        user = User.objects.get(id=user_id)
        
        # Get track info
        if isinstance(song_info, str):
            track_info = get_track_info(song_info)
        else:
            track_info = song_info
        
        query = f"{track_info['title']} {track_info['artist']}"
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(settings.MEDIA_ROOT, 'songs', '%(title)s.%(ext)s'),
            'default_search': 'ytsearch',
            'nooverwrites': True,
            'writethumbnail': True,
            'no_color': True
        }

        # Download song
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch:{query}", download=True)['entries'][0]
            filename = ydl.prepare_filename(info)
            filename = os.path.splitext(filename)[0] + '.mp3'

        # Get thumbnail URL
        thumbnail_url = track_info.get('image_url') or info.get('thumbnail')

        # Embed thumbnail and metadata
        if thumbnail_url:
            embed_thumbnail_in_mp3(
                filename,
                thumbnail_url,
                title=track_info['title'],
                artist=track_info['artist'],
                album=track_info.get('album', 'Unknown')
            )

        # Create Song object
        song = Song.objects.create(
            user=user,
            title=track_info['title'],
            artist=track_info['artist'],
            album=track_info.get('album', 'Unknown'),
            file=os.path.relpath(filename, settings.MEDIA_ROOT),
            source='spotify' if 'spotify_id' in track_info else 'youtube',
            spotify_id=track_info.get('spotify_id'),
            thumbnail_url=thumbnail_url
        )

        # Associate with playlist if provided
        if playlist_id:
            playlist = Playlist.objects.get(id=playlist_id)
            playlist.songs.add(song)

        logger.info(f"Successfully downloaded song: {song.title} by {song.artist}")
        return song.id

    except Exception as e:
        logger.error(f"Error downloading song: {str(e)}", exc_info=True)
        return None

class SongViewSet(viewsets.ModelViewSet):
    queryset = Song.objects.all()
    serializer_class = SongSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Song.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    def send_file_response(self, filepath, filename):
        """Helper method to create a file response"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")
            
        file_response = FileResponse(
            open(filepath, 'rb'),
            as_attachment=True,
            filename=filename
        )
        file_response['Content-Type'] = 'audio/mpeg'
        return file_response

    @action(detail=False, methods=['post'])
    def download(self, request):
        url = request.data.get('url')
        if not url:
            return Response({'error': 'URL is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            if 'youtube.com' in url or 'youtu.be' in url:
                return self.download_youtube(url)
            elif 'spotify.com' in url:
                if '/track/' in url:
                    return self.download_spotify_track(url)
                elif '/playlist/' in url:
                    return self.download_spotify_playlist(url)
            else:
                return Response({'error': 'Unsupported URL'}, status=status.HTTP_400_BAD_REQUEST)
        except spotipy.SpotifyException as spotify_err:
            logger.error(f"Spotify API Error: {spotify_err}")
            return Response(
                {'error': f'Spotify API Error: {str(spotify_err)}'}, 
                status=status.HTTP_503_SERVICE_UNAVAILABLE
            )
        except Exception as e:
            logger.error(f"Unexpected error: {e}", exc_info=True)
            return Response(
                {'error': f'Unexpected error: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

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
            'writethumbnail': True,
        }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                filename = ydl.prepare_filename(info)
                filename = os.path.splitext(filename)[0] + '.mp3'
                
                formatted_filename = f"{info['title']} - {info.get('uploader', 'Unknown Artist')}.mp3"
                formatted_filename = "".join(c for c in formatted_filename if c.isalnum() or c in (' ', '-', '.'))
                thumbnail_url = info.get('thumbnail')

                # Embed thumbnail and metadata
                if thumbnail_url:
                    embed_thumbnail_in_mp3(
                        filename,
                        thumbnail_url,
                        title=info['title'],
                        artist=info.get('uploader', 'Unknown Artist')
                    )

                song = Song.objects.create(
                    user=self.request.user,
                    title=info['title'],
                    artist=info.get('uploader', 'Unknown Artist'),
                    album=info.get('album', 'Unknown'),
                    file=os.path.relpath(filename, settings.MEDIA_ROOT),
                    source='youtube',
                    spotify_id=None,
                    thumbnail_url=thumbnail_url,
                    song_url=url
                )

                response = FileResponse(
                    open(filename, 'rb'),
                    as_attachment=True,
                    filename=formatted_filename
                )
                response['Content-Type'] = 'audio/mpeg'
                response['X-Thumbnail-URL'] = thumbnail_url
                response['X-Song-Title'] = info['title']
                response['X-Song-Artist'] = info['artist']
                return response

        except Exception as e:
            logger.error(f"YouTube download error: {e}", exc_info=True)
            return Response(
                {'error': f'Download failed: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    def download_spotify_track(self, url):
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
                
                thumbnail_url = track_info.get('image_url', info.get('thumbnail'))

                # Embed thumbnail and metadata
                if thumbnail_url:
                    embed_thumbnail_in_mp3(
                        filename,
                        thumbnail_url,
                        title=track_info['title'],
                        artist=track_info['artist'],
                        album=track_info.get('album', 'Unknown')
                    )

                song = Song.objects.create(
                    user=self.request.user,
                    title=track_info['title'],
                    artist=track_info['artist'],
                    album=track_info.get('album', 'Unknown'),
                    file=os.path.relpath(filename, settings.MEDIA_ROOT),
                    source='spotify',
                    spotify_id=track_info.get('spotify_id'),
                    thumbnail_url=thumbnail_url,
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
    def download_spotify_playlist(self, url):
        try:
            playlist_tracks = get_playlist_tracks(url)
            
            playlist = Playlist.objects.create(
                user=self.request.user,
                name=f"Spotify Playlist {url.split('/')[-1].split('?')[0]}",
                source="spotify",
                source_url=url
            )

            # Start async download for each track
            for track in playlist_tracks:
                download_song.delay(track, user_id=self.request.user.id, playlist_id=playlist.id)

            return Response({
                'message': 'Playlist download initiated',
                'playlist_id': playlist.id,
                'total_tracks': len(playlist_tracks),
                'status': 'processing'
            }, status=status.HTTP_202_ACCEPTED)

        except Exception as e:
            logger.error(f"Spotify playlist download error: {e}", exc_info=True)
            return Response(
                {'error': f'Playlist download failed: {str(e)}'}, 
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
            'message': 'Song added to playlist',
            'playlist_id': playlist.id,
            'song_id': song.id
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
            'message': 'Song removed from playlist',
            'playlist_id': playlist.id,
            'song_id': song.id
        })

    @action(detail=True, methods=['get'])
    def download_all(self, request, pk=None):
        playlist = self.get_object()
        songs = playlist.songs.all()
        
        if not songs.exists():
            return Response(
                {'error': 'Playlist is empty'}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        # Create a ZIP file containing all songs
        zip_filename = f'playlist_{playlist.id}.zip'
        zip_path = os.path.join(settings.MEDIA_ROOT, 'temp', zip_filename)
        
        try:
            with zipfile.ZipFile(zip_path, 'w') as zip_file:
                for song in songs:
                    song_path = os.path.join(settings.MEDIA_ROOT, song.file.name)
                    if os.path.exists(song_path):
                        zip_file.write(song_path, os.path.basename(song_path))

            return FileResponse(
                open(zip_path, 'rb'),
                as_attachment=True,
                filename=zip_filename
            )
        except Exception as e:
            logger.error(f"Playlist download error: {e}", exc_info=True)
            return Response(
                {'error': f'Failed to create playlist download: {str(e)}'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            # Clean up the temporary ZIP file
            if os.path.exists(zip_path):
                os.remove(zip_path)

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