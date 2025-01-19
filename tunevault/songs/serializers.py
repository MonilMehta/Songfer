from rest_framework import serializers
from .models import Song, Playlist, UserMusicProfile, Genre, DownloadProgress

class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ['id', 'name']

class SongSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = ['id', 'title', 'artist', 'album', 'song_url', 'thumbnail_url', 'source', 'created_at']

    def get_file_url(self, obj):
        return obj.file

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

