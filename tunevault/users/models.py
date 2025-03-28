from django.contrib.auth.models import AbstractUser
from django.db import models
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