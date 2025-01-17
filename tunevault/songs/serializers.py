from rest_framework import serializers
from .models import Song, Playlist, UserMusicProfile, Genre

class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ['id', 'name']

class SongSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()

    class Meta:
        model = Song
        fields = ['id', 'title', 'artist', 'album', 'file_url', 'image_url', 'source', 'created_at']

    def get_file_url(self, obj):
        return obj.file

    def get_image_url(self, obj):
        return obj.image

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

