from django.contrib.auth.models import AbstractUser
from django.db import models

class CustomUser(AbstractUser):
    # If you want to add any additional fields specific to users, you can do so here
    # For example:
    # favorite_genre = models.CharField(max_length=100, blank=True, null=True)
    
    def get_downloaded_songs_count(self):
        """
        Returns the total number of songs downloaded by the user
        """
        return self.songs.count()
    
    def get_top_artists(self, limit=5):
        """
        Returns the user's top artists based on number of downloaded songs
        """
        from django.db.models import Count
        
        return self.songs.values('artist').annotate(
            song_count=Count('artist')
        ).order_by('-song_count')[:limit]
    
    def get_favorite_genres(self, limit=5):
        """
        Returns the user's favorite genres based on downloaded songs
        """
        # This assumes you have a Genre model with a many-to-many relationship
        # If you don't have genres implemented, you might need to adjust this
        from django.db.models import Count
        
        return self.songs.values('genres__name').annotate(
            genre_count=Count('genres')
        ).order_by('-genre_count')[:limit]
    
    def get_recommendations(self, limit=10):
        """
        Get song recommendations based on user's download history
        """
        from songs.models import Song  # Import the Song model
        
        return Song.recommend_songs(self, limit)
    
    def create_playlist(self, name, source='custom', source_url=None):
        """
        Convenience method to create a playlist
        """
        from songs.models import Playlist
        
        return Playlist.objects.create(
            user=self,
            name=name,
            source=source,
            source_url=source_url or ''
        )