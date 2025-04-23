from rest_framework import serializers
from .models import Song, Playlist, UserMusicProfile, Genre, DownloadProgress, SongPlay
from .utils import extract_youtube_video_id
from django.conf import settings
import os

class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ['id', 'name']

class SongSerializer(serializers.ModelSerializer):
    thumbnail_url = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField(method_name='get_thumbnail_url')
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = ['id', 'title', 'artist', 'album', 'song_url', 'thumbnail_url', 'source', 'created_at', 'file_url', 'image_url']

    def get_thumbnail_url(self, obj):
        """
        Gets the thumbnail URL. Derives from YouTube URL if source is YouTube and thumbnail is missing.
        Also handles making relative paths absolute.
        """
        thumbnail_url = obj.thumbnail_url
        request = self.context.get('request')

        # 1. Check if a valid thumbnail URL already exists
        if thumbnail_url and thumbnail_url.strip():
            # If it looks like a relative path (starts with /media/), make it absolute
            if thumbnail_url.startswith('/media/') and request:
                try:
                    return request.build_absolute_uri(thumbnail_url)
                except Exception as e:
                    # Handle cases where build_absolute_uri might fail
                    print(f"Error building absolute URI for {thumbnail_url}: {e}")
                    # Fallback to constructing manually if possible
                    site_url = getattr(settings, 'SITE_URL', None)
                    if site_url:
                        return f"{site_url.rstrip('/')}{thumbnail_url}"
                    else:
                        return thumbnail_url # Return relative path as last resort
            # If it already seems like an absolute URL or we can't make it absolute, return it
            elif thumbnail_url.startswith('http'):
                 return thumbnail_url

        # 2. If source is YouTube and thumbnail is missing, try to derive it
        if obj.source and 'youtube' in obj.source.lower() and obj.song_url:
            video_id = extract_youtube_video_id(obj.song_url)
            if video_id:
                # Use mqdefault for medium quality, or hqdefault for higher quality
                return f"https://i.ytimg.com/vi/{video_id}/mqdefault.jpg"

        # 3. Fallback if no thumbnail found or derived
        return None

    def get_file_url(self, obj):
        """
        Builds the absolute URL for the song file.
        """
        request = self.context.get('request')
        if obj.file and hasattr(obj.file, 'url') and request:
            try:
                return request.build_absolute_uri(obj.file.url)
            except Exception as e:
                 print(f"Error building absolute URI for file {obj.file.url}: {e}")
                 # Fallback for file URL
                 site_url = getattr(settings, 'SITE_URL', None)
                 if site_url:
                     return f"{site_url.rstrip('/')}{obj.file.url}"
                 else:
                     return obj.file.url # Return relative path as last resort
        # Handle cases where file might be missing or stored differently
        elif obj.file and isinstance(obj.file.name, str):
             # Handle simple string path case if needed
             file_path = os.path.join(settings.MEDIA_URL, obj.file.name)
             if request:
                 try:
                     return request.build_absolute_uri(file_path)
                 except Exception as e:
                     print(f"Error building absolute URI for file path {file_path}: {e}")
                     site_url = getattr(settings, 'SITE_URL', None)
                     if site_url:
                         return f"{site_url.rstrip('/')}{file_path}"
                     else:
                         return file_path
             else:
                 # Fallback if request context is missing
                 site_url = getattr(settings, 'SITE_URL', None)
                 if site_url:
                     return f"{site_url.rstrip('/')}{file_path}"
                 else:
                     return file_path # Return relative path
        return None

class ArtistSerializer(serializers.Serializer):
    artist = serializers.CharField()
    count = serializers.IntegerField()
    artist_img = serializers.URLField(required=False, allow_null=True)
    country = serializers.CharField(required=False, allow_null=True)
    artist_genre = serializers.CharField(required=False, allow_null=True)

class PlaylistSerializer(serializers.ModelSerializer):
    songs = SongSerializer(many=True, read_only=True)

    class Meta:
        model = Playlist
        fields = ['id', 'name', 'source', 'source_url', 'created_at', 'songs']

class UserMusicProfileSerializer(serializers.ModelSerializer):
    favorite_genres = GenreSerializer(many=True, read_only=True)

    class Meta:
        model = UserMusicProfile
        fields = ['id', 'favorite_genres', 'total_songs_downloaded', 'last_recommendation_generated']

class DownloadProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = DownloadProgress
        fields = ['task_id', 'total_items', 'current_progress', 'current_file', 
                 'started_at', 'last_update', 'estimated_completion_time']

class SongPlaySerializer(serializers.ModelSerializer):
    song = SongSerializer(read_only=True)
    
    class Meta:
        model = SongPlay
        fields = ['id', 'song', 'timestamp', 'duration', 'completed', 'device_info']

