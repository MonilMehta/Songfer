from rest_framework import serializers
from .models import Song, Playlist, UserMusicProfile, Genre

class GenreSerializer(serializers.ModelSerializer):
    class Meta:
        model = Genre
        fields = ['id', 'name']

class SongSerializer(serializers.ModelSerializer):
    genres = GenreSerializer(many=True, read_only=True)

    class Meta:
        model = Song
        fields = ['id', 'title', 'artist', 'album', 'file', 'source', 'spotify_id', 'created_at', 'genres']

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

