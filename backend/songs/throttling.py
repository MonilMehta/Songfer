from rest_framework.throttling import UserRateThrottle
from django.utils import timezone
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)

class UserDownloadRateThrottle(UserRateThrottle):
    """
    Throttle class that limits downloads based on user subscription status
    - Free users: 5 downloads per day
    - Premium users: 30 downloads per day
    
    This class also provides helpful information about the time remaining until
    the throttle limit resets.
    """
    scope = 'user_downloads'
    
    def get_cache_key(self, request, view):
        """
        Override to include the date in the cache key
        This ensures the throttle resets at midnight
        """
        if request.user.is_authenticated:
            ident = request.user.pk
        else:
            ident = self.get_ident(request)
            
        # Include current date in cache key to reset at midnight
        today = timezone.now().date()
        return f'throttle_{self.scope}_{ident}_{today}'
    
    def get_rate(self):
        """
        Override to return different rates based on user subscription status
        """
        # The request should be stored as self.request in allow_request
        if not hasattr(self, 'request') or not self.request.user.is_authenticated:
            # Unauthenticated users get a very low rate
            return '1/day'
            
        # Check if user is subscribed
        if self.request.user.is_subscription_active():
            # Premium users get 30 downloads per day
            return '50/day'
        else:
            # Free users get 5 downloads per day
            return '15/day'
    
    def allow_request(self, request, view):
        """
        Override to check user download limits from the user model
        """
        # Store the request for use in get_rate()
        self.request = request
        
        if not request.user.is_authenticated:
            # Handle anonymous users with the parent implementation
            return super().allow_request(request, view)
        
        # Use the user model's download tracking
        return request.user.can_download()
    
    def wait(self):
        """
        Returns the number of seconds to wait until the rate limit resets
        """
        if not hasattr(self, 'request'):
            return None
            
        now = timezone.now()
        
        # Calculate time until midnight
        tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        seconds_until_reset = (tomorrow - now).total_seconds()
        
        # Format time remaining in hours, minutes, seconds
        hours = int(seconds_until_reset // 3600)
        minutes = int((seconds_until_reset % 3600) // 60)
        seconds = int(seconds_until_reset % 60)
        
        # Store the formatted time for access in the exception handler
        self.reset_time_formatted = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
        
        return seconds_until_reset 