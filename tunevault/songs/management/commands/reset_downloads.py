from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

class Command(BaseCommand):
    help = 'Reset daily download counts for users'

    def add_arguments(self, parser):
        parser.add_argument(
            '--user',
            type=str,
            help='Username or email to reset (if not provided, reset all users)',
        )
        parser.add_argument(
            '--set-premium',
            action='store_true',
            help='Set user to premium status',
        )
        parser.add_argument(
            '--remove-premium',
            action='store_true',
            help='Remove premium status from user',
        )
        parser.add_argument(
            '--set-downloads',
            type=int,
            help='Set a specific number of daily downloads',
        )

    def handle(self, *args, **options):
        username = options.get('user')
        set_premium = options.get('set_premium')
        remove_premium = options.get('remove_premium')
        set_downloads = options.get('set_downloads')
        
        if username:
            # Reset a specific user
            try:
                # Try to get user by username first
                user = User.objects.get(username=username)
            except User.DoesNotExist:
                try:
                    # Try by email
                    user = User.objects.get(email=username)
                except User.DoesNotExist:
                    self.stdout.write(self.style.ERROR(f"User not found: {username}"))
                    return
            
            self._reset_user(user, set_premium, remove_premium, set_downloads)
        else:
            # Reset all users
            count = 0
            for user in User.objects.all():
                self._reset_user(user, set_premium, remove_premium, set_downloads)
                count += 1
            
            self.stdout.write(self.style.SUCCESS(f"Reset {count} users' download counts"))
    
    def _reset_user(self, user, set_premium, remove_premium, set_downloads):
        # Handle premium status changes
        if set_premium and remove_premium:
            self.stdout.write(self.style.WARNING("Cannot both set and remove premium status"))
        elif set_premium:
            user.subscription_status = 'active'
            user.subscription_expires_at = timezone.now() + timezone.timedelta(days=30)
            self.stdout.write(f"Set {user.username} to premium status")
        elif remove_premium:
            user.subscription_status = 'inactive'
            user.subscription_expires_at = None
            self.stdout.write(f"Removed premium status from {user.username}")
        
        # Reset download count
        if set_downloads is not None:
            user.daily_downloads = set_downloads
            self.stdout.write(f"Set {user.username}'s daily downloads to {set_downloads}")
        else:
            # Reset to 0
            user.daily_downloads = 0
            self.stdout.write(f"Reset {user.username}'s daily downloads to 0")
        
        # Update last download date to today
        user.last_download_date = timezone.now().date()
        user.save()
        
        # Show user subscription status and downloads remaining
        subscription_status = "Premium" if user.is_subscription_active() else "Free"
        downloads_limit = 30 if user.is_subscription_active() else 5
        downloads_remaining = downloads_limit - user.daily_downloads
        
        self.stdout.write(self.style.SUCCESS(
            f"User: {user.username} | Status: {subscription_status} | "
            f"Downloads: {user.daily_downloads}/{downloads_limit} | "
            f"Remaining: {downloads_remaining}"
        )) 