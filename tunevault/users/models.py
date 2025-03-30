from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone
from datetime import datetime, timedelta
from django.utils import timezone
from datetime import datetime, timedelta

class CustomUser(AbstractUser):
    # Subscription fields
    subscribed = models.BooleanField(default=False, help_text="Whether the user has a premium subscription")
    subscription_start = models.DateTimeField(null=True, blank=True, help_text="When the subscription started")
    subscription_end = models.DateTimeField(null=True, blank=True, help_text="When the subscription will end")
    
    # Download tracking
    last_download_reset = models.DateTimeField(default=timezone.now, help_text="When the download count was last reset")
    daily_downloads = models.PositiveIntegerField(default=0, help_text="Number of downloads today")
    
    # Analytics fields
    last_seen = models.DateTimeField(null=True, blank=True, help_text="When the user was last active")
    total_listen_time = models.PositiveIntegerField(default=0, help_text="Total time spent listening in seconds")
    
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
            count=Count('artist')
        ).order_by('-count')[:limit]
    
    def get_favorite_genres(self, limit=5):
        """
        Returns the user's favorite genres based on downloaded songs
        """
        try:
            return self.music_profile.favorite_genres.all()[:limit]
        except:
            return []
    
    def get_recommendations(self, limit=10):
        """
        Returns song recommendations for the user
        """
        from songs.models import Song
        return Song.recommend_songs(self, limit)
    
    def create_playlist(self, name, source='custom', source_url=None):
        """
        Creates a new playlist for the user
        """
        from songs.models import Playlist
        return Playlist.objects.create(
            user=self,
            name=name,
            source=source,
            source_url=source_url or ''
        )
        
    def is_subscription_active(self):
        """
        Check if the user has an active subscription
        """
        if not self.subscribed:
            return False
        
        if self.subscription_end and self.subscription_end < timezone.now():
            # Subscription has expired
            self.subscribed = False
            self.save(update_fields=['subscribed'])
            return False
            
        return True
    
    def can_download(self):
        """
        Check if the user can download more songs today
        """
        # Reset daily downloads if it's a new day
        self._reset_daily_downloads_if_needed()
        
        # Subscribed users have a limit of 30 downloads per day
        if self.is_subscription_active():
            return self.daily_downloads < 30
            
        # Non-subscribed users are limited to 5 downloads per day
        return self.daily_downloads < 5
    
    def increment_download_count(self):
        """
        Increment the user's daily download count
        """
        # Reset daily downloads if it's a new day
        self._reset_daily_downloads_if_needed()
        
        # Increment the count
        self.daily_downloads += 1
        self.save(update_fields=['daily_downloads'])
    
    def _reset_daily_downloads_if_needed(self):
        """
        Reset the daily download count if it's a new day
        """
        now = timezone.now()
        last_reset = self.last_download_reset
        
        # Check if it's a new day (last reset was yesterday or earlier)
        if last_reset.date() < now.date():
            self.daily_downloads = 0
            self.last_download_reset = now
            self.save(update_fields=['daily_downloads', 'last_download_reset'])
    
    def subscribe(self, months=1):
        """
        Subscribe the user for the specified number of months
        """
        now = timezone.now()
        
        # If already subscribed, extend the subscription
        if self.is_subscription_active() and self.subscription_end:
            end_date = self.subscription_end
        else:
            # New subscription
            self.subscribed = True
            self.subscription_start = now
            end_date = now
            
        # Add the specified number of months
        self.subscription_end = end_date + timedelta(days=30 * months)
        self.save(update_fields=['subscribed', 'subscription_start', 'subscription_end'])
        
        return self.subscription_end
    
    def cancel_subscription(self):
        """
        Cancel the user's subscription
        """
        self.subscribed = False
        self.save(update_fields=['subscribed'])
        
    def get_downloads_remaining(self):
        """
        Get the number of downloads remaining for today
        """
        self._reset_daily_downloads_if_needed()
        
        if self.is_subscription_active():
            return max(0, 30 - self.daily_downloads)
        
        return max(0, 5 - self.daily_downloads)
        
    def update_last_seen(self):
        """
        Update the last seen timestamp for the user
        """
        self.last_seen = timezone.now()
        self.save(update_fields=['last_seen'])
        
    def record_listen_time(self, seconds):
        """
        Record time spent listening to music
        """
        self.total_listen_time += max(0, seconds)  # Ensure non-negative
        self.save(update_fields=['total_listen_time'])
        
    def get_listening_stats(self):
        """
        Get detailed listening statistics
        """
        from songs.models import Song, SongPlay
        from django.db.models import Count, Sum, Avg
        
        # Get total songs played
        total_plays = SongPlay.objects.filter(user=self).count()
        
        # Get total unique songs played
        unique_songs = SongPlay.objects.filter(user=self).values('song').distinct().count()
        
        # Get average listening time per song
        avg_listen_time = SongPlay.objects.filter(user=self).aggregate(
            avg_time=Avg('duration')
        )['avg_time'] or 0
        
        # Get most played song
        most_played = SongPlay.objects.filter(user=self).values(
            'song__title', 'song__artist'
        ).annotate(
            play_count=Count('id')
        ).order_by('-play_count').first()
        
        # Get favorite time of day (morning, afternoon, evening, night)
        from django.db.models.functions import ExtractHour
        
        hour_counts = SongPlay.objects.filter(user=self).annotate(
            hour=ExtractHour('timestamp')
        ).values('hour').annotate(count=Count('id')).order_by('-count')
        
        # Define time periods
        time_periods = {
            'morning': 0,
            'afternoon': 0,
            'evening': 0,
            'night': 0
        }
        
        for entry in hour_counts:
            hour = entry['hour']
            count = entry['count']
            
            if 5 <= hour < 12:
                time_periods['morning'] += count
            elif 12 <= hour < 17:
                time_periods['afternoon'] += count
            elif 17 <= hour < 21:
                time_periods['evening'] += count
            else:
                time_periods['night'] += count
                
        favorite_time = max(time_periods.items(), key=lambda x: x[1])[0] if time_periods else None
        
        return {
            'total_plays': total_plays,
            'unique_songs': unique_songs,
            'total_listen_time': self.total_listen_time,
            'average_listen_time': round(avg_listen_time, 2),
            'most_played': most_played,
            'favorite_time': favorite_time,
            'time_periods': time_periods,
            'subscription_status': 'active' if self.is_subscription_active() else 'inactive'
        }
    
    def bulk_increment_download_count(self, count=1):
        """
        Increment the user's daily download count by a specified amount
        
        Args:
            count (int): Number of downloads to add
        """
        # Reset daily downloads if it's a new day
        self._reset_daily_downloads_if_needed()
        
        # Increment the count
        self.daily_downloads += count
        self.save(update_fields=['daily_downloads'])
        
        return self.daily_downloads