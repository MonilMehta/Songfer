import os
import logging
from django.core.management.base import BaseCommand
from songs.models import SongCache
from django.utils import timezone
from django.conf import settings

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Clean up expired song cache entries and unused media files'

    def add_arguments(self, parser):
        parser.add_argument(
            '--days',
            type=int,
            default=2,
            help='Remove cache entries older than this many days',
        )
        parser.add_argument(
            '--force',
            action='store_true',
            help='Force cleanup of all expired entries regardless of expiration date',
        )
        parser.add_argument(
            '--unused',
            action='store_true',
            help='Clean up cached entries not accessed in the last week',
        )
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='Only show what would be deleted without actually deleting',
        )

    def handle(self, *args, **options):
        days = options['days']
        force = options['force']
        unused = options['unused']
        dry_run = options['dry_run']

        now = timezone.now()
        cutoff_date = now - timezone.timedelta(days=days)
        
        self.stdout.write(self.style.SUCCESS(f"Starting cache cleanup..."))
        
        # Get expired cache entries
        if force:
            expired_entries = SongCache.objects.filter(expires_at__lte=now)
            self.stdout.write(f"Found {expired_entries.count()} expired cache entries")
        else:
            expired_entries = SongCache.objects.filter(created_at__lte=cutoff_date)
            self.stdout.write(f"Found {expired_entries.count()} cache entries older than {days} days")
        
        # Get unused cache entries (not accessed in the last week)
        if unused:
            unused_cutoff = now - timezone.timedelta(days=7)
            unused_entries = SongCache.objects.filter(last_accessed__lte=unused_cutoff)
            self.stdout.write(f"Found {unused_entries.count()} unused cache entries (not accessed in 7 days)")
            
            # Combine with expired entries, removing duplicates
            entries_to_delete = expired_entries.union(unused_entries)
        else:
            entries_to_delete = expired_entries
        
        # Prepare stats
        total_size = 0
        deleted_count = 0
        error_count = 0
        
        # Process each entry
        for entry in entries_to_delete:
            try:
                # Get file size before deletion
                file_path = os.path.join(settings.MEDIA_ROOT, entry.local_path)
                if os.path.exists(file_path):
                    file_size = os.path.getsize(file_path)
                    total_size += file_size
                    
                    if not dry_run:
                        # Delete the file
                        os.remove(file_path)
                        
                        # Also delete thumbnail if it exists
                        thumbnail_path = f"{os.path.splitext(file_path)[0]}.jpg"
                        if os.path.exists(thumbnail_path):
                            os.remove(thumbnail_path)
                        
                        # Delete the database entry
                        entry.delete()
                    
                    deleted_count += 1
                    
                    if deleted_count % 10 == 0:
                        self.stdout.write(f"Processed {deleted_count} entries...")
                    
                else:
                    # File doesn't exist but the DB entry does
                    if not dry_run:
                        entry.delete()
                    self.stdout.write(self.style.WARNING(f"File not found: {file_path}, but DB entry was deleted"))
                    
            except Exception as e:
                error_count += 1
                logger.error(f"Error cleaning up cache entry {entry.id}: {e}")
                self.stdout.write(self.style.ERROR(f"Error with {entry.song_url}: {e}"))
        
        # Convert total size to MB
        total_size_mb = total_size / (1024 * 1024)
        
        if dry_run:
            self.stdout.write(self.style.SUCCESS(
                f"DRY RUN: Would have deleted {deleted_count} cache entries "
                f"({total_size_mb:.2f} MB) with {error_count} errors"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"Successfully deleted {deleted_count} cache entries "
                f"({total_size_mb:.2f} MB) with {error_count} errors"
            ))
        
        # Optional: add cleanup for orphaned files not in database
        if options.get('unused'):
            self.stdout.write("Checking for orphaned files...")
            self.cleanup_orphaned_files(dry_run)
    
    def cleanup_orphaned_files(self, dry_run=False):
        """Clean up files in the songs directory that are not referenced in the database"""
        from songs.models import Song
        
        # Get all files referenced in the songs table
        all_song_files = set(Song.objects.values_list('file', flat=True))
        # Get all files referenced in the cache table
        all_cache_files = set(SongCache.objects.values_list('local_path', flat=True))
        
        # Get all actual files in the songs directory
        songs_dir = os.path.join(settings.MEDIA_ROOT, 'songs')
        if not os.path.exists(songs_dir):
            self.stdout.write(self.style.WARNING(f"Songs directory not found: {songs_dir}"))
            return
        
        actual_files = []
        for root, dirs, files in os.walk(songs_dir):
            for file in files:
                # Only consider mp3 files for cleaning
                if file.lower().endswith('.mp3'):
                    file_path = os.path.join(root, file)
                    rel_path = os.path.relpath(file_path, settings.MEDIA_ROOT)
                    actual_files.append(rel_path)
        
        # Find orphaned files (in directory but not in DB)
        orphaned_files = [f for f in actual_files if f not in all_song_files and f not in all_cache_files]
        
        if not orphaned_files:
            self.stdout.write("No orphaned files found.")
            return
        
        self.stdout.write(f"Found {len(orphaned_files)} orphaned files.")
        
        # Process orphaned files
        total_size = 0
        deleted_count = 0
        
        for rel_path in orphaned_files:
            file_path = os.path.join(settings.MEDIA_ROOT, rel_path)
            try:
                if os.path.exists(file_path):
                    file_size = os.path.getsize(file_path)
                    total_size += file_size
                    
                    # Get file creation time and check if it's older than 1 day
                    # Only delete files that are at least a day old
                    file_ctime = os.path.getctime(file_path)
                    file_age = timezone.now() - timezone.datetime.fromtimestamp(file_ctime, tz=timezone.get_current_timezone())
                    
                    if file_age.days >= 1:
                        self.stdout.write(f"Orphaned file: {rel_path} ({file_size / (1024*1024):.2f} MB)")
                        if not dry_run:
                            os.remove(file_path)
                            # Also check for thumbnail
                            thumbnail_path = f"{os.path.splitext(file_path)[0]}.jpg"
                            if os.path.exists(thumbnail_path):
                                os.remove(thumbnail_path)
                            deleted_count += 1
            except Exception as e:
                logger.error(f"Error cleaning up orphaned file {rel_path}: {e}")
                self.stdout.write(self.style.ERROR(f"Error with {rel_path}: {e}"))
        
        # Convert total size to MB
        total_size_mb = total_size / (1024 * 1024)
        
        if dry_run:
            self.stdout.write(self.style.SUCCESS(
                f"DRY RUN: Would have deleted {deleted_count} orphaned files ({total_size_mb:.2f} MB)"
            ))
        else:
            self.stdout.write(self.style.SUCCESS(
                f"Successfully deleted {deleted_count} orphaned files ({total_size_mb:.2f} MB)"
            )) 