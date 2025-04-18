from django.db import models
from django.conf import settings
from django.db.models import Count, Q, Sum, Avg
from django.urls import reverse
import os
import logging
from django.utils import timezone
from datetime import timedelta
from django.utils.text import Truncator

logger = logging.getLogger(__name__)

    
class Genre(models.Model):
    name = models.CharField(max_length=100, unique=True)
    
    def __str__(self):
        return self.name


class Song(models.Model):
    """Model for a song uploaded by a user"""
    
    STATUS_CHOICES = (
        ('processing', 'Processing'),
        ('ready', 'Ready'),
        ('error', 'Error'),
    )
    
    SOURCE_CHOICES = (
        ('upload', 'File Upload'),
        ('youtube', 'YouTube'),
        ('spotify', 'Spotify'),
        ('other', 'Other'),
    )
    
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='songs')
    title = models.CharField(max_length=255)  # Increase from 100 if it was 100 before
    artist = models.CharField(max_length=255)  # Increase from 100 if it was 100 before
    album = models.CharField(max_length=255, blank=True, null=True)  # Increase from 100 if it was 100 before
    genre = models.CharField(max_length=100, blank=True, null=True)
    year = models.IntegerField(blank=True, null=True)
    file = models.FileField(upload_to='songs/', blank=True, null=True)
    waveform = models.JSONField(blank=True, null=True)
    duration = models.FloatField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='processing')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    plays = models.PositiveIntegerField(default=0)
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='upload')
    song_url = models.URLField(blank=True, null=True)
    youtube_id = models.CharField(max_length=20, blank=True, null=True)
    spotify_id = models.CharField(max_length=50, blank=True, null=True)
    thumbnail_url = models.URLField(blank=True, null=True)
    is_public = models.BooleanField(default=False)
    
    # Add a field to indicate if this is a favorite
    is_favorite = models.BooleanField(default=False)
    
    # Add lyrics field
    lyrics = models.TextField(blank=True, null=True)
    
    # Add metadata fields
    metadata = models.JSONField(blank=True, null=True)
    
    class Meta:
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.title} - {self.artist}"
    
    def get_absolute_url(self):
        return reverse('song-detail', args=[str(self.id)])
    
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
        Recommend songs based on user's download history.
        Returns a list of recommendation dictionaries, not Song objects.
        """
        from .recommendation import get_hybrid_recommendations, update_user_recommendations
        
        # Check if we need to update recommendations
        user_profile = getattr(user, 'music_profile', None)
        update_needed = True
        
        if user_profile and user_profile.last_recommendation_generated:
            # Only update recommendations if it's been more than a day
            update_needed = (timezone.now() - user_profile.last_recommendation_generated) > timedelta(days=1)
            
        # Get user's recent downloads
        user_songs = cls.objects.filter(user=user).order_by('-created_at')[:5]
        
        # If user has no songs, return empty queryset
        if not user_songs:
            return []
            
        # Get recommendations based on user's songs
        recommendations = get_hybrid_recommendations(user, limit)
        
        if not recommendations:
            # If no recommendations, just return an empty list
            return []
        
        return recommendations

    def save(self, *args, **kwargs):
        """Truncate fields if necessary before saving"""
        # Truncate text fields to their max lengths
        if self.title and len(self.title) > 250:
            self.title = Truncator(self.title).chars(250)
            
        if self.artist and len(self.artist) > 250:
            self.artist = Truncator(self.artist).chars(250)
            
        if self.album and len(self.album) > 250:
            self.album = Truncator(self.album).chars(250)
            
        if self.genre and len(self.genre) > 95:
            self.genre = Truncator(self.genre).chars(95)
            
        if self.source and len(self.source) > 18:
            self.source = Truncator(self.source).chars(18)
            
        if self.youtube_id and len(self.youtube_id) > 18:
            self.youtube_id = Truncator(self.youtube_id).chars(18)
            
        if self.spotify_id and len(self.spotify_id) > 45:
            self.spotify_id = Truncator(self.spotify_id).chars(45)
            
        # Sanitize any Unicode characters in URLs
        if self.thumbnail_url:
            # ASCII-only version
            self.thumbnail_url = self.thumbnail_url.encode('ascii', 'ignore').decode('ascii')
            if len(self.thumbnail_url) > 190:
                self.thumbnail_url = Truncator(self.thumbnail_url).chars(190)
                
        # Call the parent save method
        super(Song, self).save(*args, **kwargs)

class Playlist(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")  # Adding description field
    source = models.CharField(max_length=50)  # 'spotify' or 'apple_music'
    source_url = models.URLField()
    thumbnail_url = models.URLField(blank=True, null=True)  # Adding thumbnail_url field
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
        if hasattr(song, 'genres') and hasattr(song.genres, 'exists') and song.genres.exists():
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
    """Cache for downloaded songs to avoid repeated downloads"""
    song_url = models.URLField(unique=True)
    file_path = models.CharField(max_length=255)
    file_size = models.PositiveIntegerField(default=0)
    title = models.CharField(max_length=255, blank=True, null=True)
    artist = models.CharField(max_length=255, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    accessed_at = models.DateTimeField(auto_now=True)
    expires_at = models.DateTimeField()
    metadata = models.JSONField(default=dict, blank=True, null=True)
    
    def __str__(self):
        return f"Cache: {self.song_url}"
    
    @classmethod
    def get_cached_song(cls, url):
        """Get a song from cache if it exists and is not expired"""
        try:
            cache = cls.objects.get(song_url=url, expires_at__gt=timezone.now())
            # Update accessed time
            cache.accessed_at = timezone.now()
            cache.save(update_fields=['accessed_at'])
            return cache
        except cls.DoesNotExist:
            return None
    
    @classmethod
    def add_to_cache(cls, url, file_path, title=None, artist=None, expires_days=7):
        """Add a song to the cache"""
        try:
            # Get file size
            full_path = os.path.join(settings.MEDIA_ROOT, file_path)
            file_size = os.path.getsize(full_path) if os.path.exists(full_path) else 0
            
            # Create or update cache entry
            cls.objects.update_or_create(
                song_url=url,
                defaults={
                    'file_path': file_path,
                    'file_size': file_size,
                    'title': title,
                    'artist': artist,
                    'expires_at': timezone.now() + timedelta(days=expires_days)
                }
            )
            logger.info(f"Added song to cache: {url}")
            return True
        except Exception as e:
            logger.error(f"Error adding song to cache: {str(e)}", exc_info=True)
            return False
    
    @classmethod
    def clean_expired(cls):
        """Delete expired cache entries"""
        expired = cls.objects.filter(expires_at__lt=timezone.now())
        count = expired.count()
        
        # Get paths to delete
        paths_to_delete = []
        for cache in expired:
            try:
                full_path = os.path.join(settings.MEDIA_ROOT, cache.file_path)
                if os.path.exists(full_path):
                    paths_to_delete.append(full_path)
            except Exception:
                pass
        
        # Delete database records
        expired.delete()
        
        # Delete files
        for path in paths_to_delete:
            try:
                os.unlink(path)
            except Exception:
                pass
        
        return count

class SongPlay(models.Model):
    """
    Track each time a song is played
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='song_plays')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='song_plays')
    timestamp = models.DateTimeField(auto_now_add=True)
    duration = models.PositiveIntegerField(default=0, help_text="Duration of play in seconds")
    completed = models.BooleanField(default=False, help_text="Whether the song was played to completion")
    device_info = models.JSONField(default=dict, blank=True, help_text="Information about the device used to play the song")
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['song', 'timestamp']),
        ]
    
    def __str__(self):
        return f"{self.user.username} played {self.song.title} for {self.duration}s"
    
    def save(self, *args, **kwargs):
        """Update user's total listen time when saving a song play"""
        is_new = self.pk is None
        super().save(*args, **kwargs)
        
        if is_new:
            # Update user's total listen time
            self.user.record_listen_time(self.duration)
            
class UserAnalytics(models.Model):
    """
    Daily aggregated analytics for user activity
    """
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='daily_analytics')
    date = models.DateField()
    songs_played = models.PositiveIntegerField(default=0)
    listening_time = models.PositiveIntegerField(default=0, help_text="Total listening time in seconds")
    songs_downloaded = models.PositiveIntegerField(default=0)
    downloads_available = models.PositiveIntegerField(default=0, help_text="Downloads available for the day")
    
    class Meta:
        unique_together = ['user', 'date']
        ordering = ['-date']
    
    def __str__(self):
        return f"Analytics for {self.user.username} on {self.date}"
    
    @classmethod
    def record_play(cls, user, duration):
        """Record a song play in today's analytics"""
        today = timezone.now().date()
        analytics, created = cls.objects.get_or_create(
            user=user, 
            date=today,
            defaults={
                'downloads_available': 30 if user.is_subscription_active() else 5,
            }
        )
        
        analytics.songs_played += 1
        analytics.listening_time += duration
        analytics.save(update_fields=['songs_played', 'listening_time'])
        
        return analytics
    
    @classmethod
    def record_download(cls, user):
        """Record a song download in today's analytics"""
        today = timezone.now().date()
        import logging
        logger = logging.getLogger(__name__)
        logger.info(f"[DEBUG] record_download called for user={user.username} id={user.id} date={today}")
        analytics, created = cls.objects.get_or_create(
            user=user, 
            date=today,
            defaults={
                'downloads_available': 50 if user.is_subscription_active() else 15,
            }
        )
        
        analytics.songs_downloaded += 1
        analytics.save(update_fields=['songs_downloaded'])
        logger.info(f"[DEBUG] record_download updated analytics: user={user.username} id={user.id} date={today} songs_downloaded={analytics.songs_downloaded}")
        return analytics
        
    @classmethod
    def get_user_stats(cls, user, days=30):
        """Get user statistics for the last N days"""
        end_date = timezone.now().date()
        start_date = end_date - timezone.timedelta(days=days)
        
        # Get analytics for the specified period
        analytics = cls.objects.filter(
            user=user,
            date__gte=start_date,
            date__lte=end_date
        )
        
        # Initialize default stats with zeros instead of null values
        default_stats = {
            'total_plays': 0,
            'total_time': 0,
            'total_downloads': 0,
            'avg_daily_plays': 0,
            'avg_daily_time': 0,
            'avg_daily_downloads': 0
        }
        
        # Calculate aggregated stats
        if analytics.exists():
            stats = analytics.aggregate(
                total_plays=Sum('songs_played'),
                total_time=Sum('listening_time'),
                total_downloads=Sum('songs_downloaded'),
                avg_daily_plays=Avg('songs_played'),
                avg_daily_time=Avg('listening_time'),
                avg_daily_downloads=Avg('songs_downloaded')
            )
            
            # Replace any None values with zeros
            for key in default_stats:
                if stats[key] is None:
                    stats[key] = 0
        else:
            # No analytics data, use zeros
            stats = default_stats
        
        # Add day-by-day data for charts
        day_data = []
        current = start_date
        while current <= end_date:
            day_stats = analytics.filter(date=current).first()
            
            if day_stats:
                day_data.append({
                    'date': current.strftime('%Y-%m-%d'),
                    'plays': day_stats.songs_played,
                    'time': day_stats.listening_time,
                    'downloads': day_stats.songs_downloaded
                })
            else:
                day_data.append({
                    'date': current.strftime('%Y-%m-%d'),
                    'plays': 0,
                    'time': 0,
                    'downloads': 0
                })
            
            current += timezone.timedelta(days=1)
        
        # Combine the results
        result = {
            'summary': stats,
            'daily_data': day_data,
            'period': {
                'start': start_date.strftime('%Y-%m-%d'),
                'end': end_date.strftime('%Y-%m-%d'),
                'days': days
            }
        }
        
        return result