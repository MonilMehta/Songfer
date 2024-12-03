from django.db import models
from django.conf import settings
from django.db.models import Count, Q

    
class Genre(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name


class Song(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    album = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to='songs/')
    source = models.CharField(max_length=50)  # e.g., 'youtube', 'spotify', 'apple_music'
    spotify_id = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    genres = models.ManyToManyField(Genre, related_name='songs', blank=True)

    def __str__(self):
        return f"{self.title} - {self.artist}"
    @classmethod
    def get_user_top_artists(cls, user, limit=5):
        """
        Get top artists for a user based on download frequency
        """
        return cls.objects.filter(user=user)\
            .values('artist')\
            .annotate(count=Count('id'))\
            .order_by('-count')[:limit]
    
    @classmethod
    def recommend_songs(cls, user, limit=10):
        """
        Generate song recommendations for a user
        """
        # Get user's top artists
        top_artists = [artist['artist'] for artist in cls.get_user_top_artists(user)]
        
        # Exclude user's own songs
        recommendations = cls.objects.exclude(user=user)
        
        # Prioritize songs by similar artists
        recommendations = recommendations.filter(
            Q(artist__in=top_artists)
        )
        
        # If not enough recommendations, broaden the search
        if recommendations.count() < limit:
            recommendations |= cls.objects.exclude(user=user).order_by('?')
        
        return recommendations[:limit]

class Playlist(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    source = models.CharField(max_length=50)  # 'spotify' or 'apple_music'
    source_url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.source})"
    def add_song(self, song):
        """
        Convenience method to add a song to the playlist
        """
        self.songs.add(song)
        self.save()

class UserMusicProfile(models.Model):
    """
    Additional profile to track user's music preferences
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        related_name='music_profile'
    )
    favorite_genres = models.ManyToManyField(Genre, blank=True)
    total_songs_downloaded = models.PositiveIntegerField(default=0)
    last_recommendation_generated = models.DateTimeField(null=True, blank=True)
    
    def update_profile(self, song):
        """
        Update user's music profile when a new song is downloaded
        """
        self.total_songs_downloaded += 1
        self.save()
        
        # Automatically update favorite genres if song has genres
        if song.genres.exists():
            for genre in song.genres.all():
                self.favorite_genres.add(genre)