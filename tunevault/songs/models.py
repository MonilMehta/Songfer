from django.db import models
from django.conf import settings
from django.db.models import Count, Q

    
class Genre(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name


class Song(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='songs')
    title = models.CharField(max_length=255)
    artist = models.CharField(max_length=255)
    album = models.CharField(max_length=255, blank=True)
    file = models.FileField(upload_to='songs/')
    source = models.CharField(max_length=50)  # e.g., 'youtube', 'spotify', 'apple_music'
    spotify_id = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    genres = models.ManyToManyField(Genre, related_name='songs', blank=True)
    thumbnail_url = models.URLField(blank=True, null=True)
    song_url = models.URLField(blank=True, null=True)

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
        Recommend songs based on user's download history
        """
        from .recommendation import get_hybrid_recommendations, update_user_recommendations
        
        # Check if we need to update recommendations
        user_profile = getattr(user, 'music_profile', None)
        update_needed = True
        
        if user_profile and user_profile.last_recommendation_generated:
            # Only update recommendations if it's been more than a day
            from django.utils import timezone
            from datetime import timedelta
            update_needed = (timezone.now() - user_profile.last_recommendation_generated) > timedelta(days=1)
            
        # Update recommendations if needed
        if update_needed:
            update_user_recommendations(user)
        
        # Get user's recent downloads
        user_songs = cls.objects.filter(user=user).order_by('-created_at')[:5]
        
        # If user has no songs, return empty queryset
        if not user_songs:
            return cls.objects.none()
            
        # Get recommendations based on Spotify IDs
        recommendations = get_hybrid_recommendations(user, limit)
        
        if not recommendations:
            # If no recommendations, just return popular songs
            return cls.objects.exclude(user=user).order_by('?')[:limit]
            
        # Get Spotify IDs from recommendations
        spotify_ids = [rec['spotify_id'] for rec in recommendations]
        
        # Get Song objects for these Spotify IDs
        return cls.objects.filter(spotify_id__in=spotify_ids)[:limit]

class Playlist(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    source = models.CharField(max_length=50)  # 'spotify' or 'apple_music'
    source_url = models.URLField()
    created_at = models.DateTimeField(auto_now_add=True)
    songs = models.ManyToManyField(Song, related_name='playlists', blank=True)

    def __str__(self):
        return self.name
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

class DownloadProgress(models.Model):
    task_id = models.CharField(max_length=255, unique=True)
    current_progress = models.IntegerField(default=0)
    total_items = models.IntegerField(default=0)
    current_file = models.CharField(max_length=255, blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    last_update = models.DateTimeField(auto_now=True)
    estimated_completion_time = models.DateTimeField(null=True, blank=True)

class SongCache(models.Model):
    """
    Cache for downloaded songs to avoid re-downloading
    """
    song_url = models.URLField(unique=True)
    local_path = models.FileField(upload_to='cache/')
    file_size = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    last_accessed = models.DateTimeField(auto_now=True)
    download_count = models.PositiveIntegerField(default=0)
    metadata = models.JSONField(default=dict, blank=True)
    
    def __str__(self):
        return f"Cache for {self.song_url}"
    
    def save(self, *args, **kwargs):
        """Add expiration time if not set"""
        if not self.expires_at:
            from django.utils import timezone
            from datetime import timedelta
            self.expires_at = timezone.now() + timedelta(hours=8)
        super().save(*args, **kwargs)
    
    def update_access(self):
        """Update the access time and counter"""
        self.download_count += 1
        self.save(update_fields=['download_count', 'last_accessed'])
    
    @classmethod
    def cleanup_expired(cls):
        """
        Delete expired cache entries and their files
        """
        import os
        from django.utils import timezone
        from django.conf import settings
        
        expired = cls.objects.filter(expires_at__lt=timezone.now())
        count = 0
        
        for cache_entry in expired:
            try:
                # Get absolute path to file
                full_path = os.path.join(settings.MEDIA_ROOT, cache_entry.local_path.name)
                if os.path.exists(full_path):
                    os.remove(full_path)
                    count += 1
                    
                # Check for thumbnail files with the same base name
                base_path = os.path.splitext(full_path)[0]
                for ext in ['jpg', 'png', 'webp']:
                    thumb_path = f"{base_path}.{ext}"
                    if os.path.exists(thumb_path):
                        os.remove(thumb_path)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Error deleting cached file: {e}")
        
        # Delete the database entries
        expired.delete()
        return count
    
    @classmethod
    def get_cached_song(cls, url):
        """
        Get the cached song file for a given URL if it exists and is not expired
        """
        from django.utils import timezone
        
        try:
            cache = cls.objects.get(song_url=url, expires_at__gt=timezone.now())
            cache.update_access()
            return cache
        except cls.DoesNotExist:
            return None
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Error retrieving cache entry: {e}")
            return None