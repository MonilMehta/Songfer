import os
import requests
import logging
import tempfile
from io import BytesIO
from django.conf import settings
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TCON, TRCK, TDRC
import time
from functools import wraps
from retrying import retry
import sentry_sdk
import yt_dlp
import re
import urllib.parse

logger = logging.getLogger(__name__)

def sanitize_filename(filename, max_length=95):
    """
    Sanitize a filename to make it safe for filesystem and database.
    
    Args:
        filename (str): The filename to sanitize
        max_length (int): Maximum length of the filename (default: 95)
        
    Returns:
        str: Sanitized filename
    """
    if not filename:
        return "unknown_file"
        
    # Convert to plain ASCII characters
    filename = filename.encode('ascii', 'ignore').decode('ascii')
    
    # Keep only alphanumeric, spaces, dashes, dots
    filename = re.sub(r'[^a-zA-Z0-9 \-\._]', '', filename)
    
    # Replace multiple spaces with a single space
    filename = re.sub(r'\s+', ' ', filename)
    
    # Truncate to maximum length
    if len(filename) > max_length:
        base, ext = os.path.splitext(filename)
        max_base_length = max_length - len(ext)
        if max_base_length > 0:
            filename = base[:max_base_length] + ext
        else:
            filename = filename[:max_length]
    
    # Ensure filename isn't empty after sanitization
    if not filename.strip():
        return "unknown_file"
        
    return filename.strip()

# External API error handling
class ExternalAPIError(Exception):
    """Base exception for external API errors"""
    def __init__(self, message, service=None, status_code=None, original_error=None):
        self.message = message
        self.service = service
        self.status_code = status_code
        self.original_error = original_error
        super().__init__(self.message)

class YouTubeAPIError(ExternalAPIError):
    """Exception for YouTube API errors"""
    def __init__(self, message, status_code=None, original_error=None):
        super().__init__(message, service="YouTube", status_code=status_code, original_error=original_error)

class SpotifyAPIError(ExternalAPIError):
    """Exception for Spotify API errors"""
    def __init__(self, message, status_code=None, original_error=None):
        super().__init__(message, service="Spotify", status_code=status_code, original_error=original_error)

# Retry decorator for external API calls
def retry_external_api(
    retry_on_exceptions=(Exception,),
    max_attempts=3,
    wait_exponential_multiplier=1000,
    wait_exponential_max=10000
):
    """
    Decorator for retrying external API calls with exponential backoff
    
    Args:
        retry_on_exceptions: Tuple of exceptions to retry on
        max_attempts: Maximum number of attempts
        wait_exponential_multiplier: Initial wait time multiplier in ms
        wait_exponential_max: Maximum wait time in ms
    """
    def retry_decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            # Initialize attempt counter
            if not hasattr(wrapper, 'attempt_count'):
                wrapper.attempt_count = 0
                
            for attempt in range(max_attempts):
                wrapper.attempt_count += 1
                try:
                    return func(*args, **kwargs)
                except retry_on_exceptions as e:
                    # Log the error
                    logger.warning(
                        f"Retrying {func.__name__} due to {e.__class__.__name__}: {str(e)}. "
                        f"Attempt {wrapper.attempt_count} of {max_attempts}."
                    )
                    
                    # If this is the last attempt, raise the exception
                    if wrapper.attempt_count >= max_attempts:
                        logger.error(f"Maximum retry attempts ({max_attempts}) reached for {func.__name__}")
                        raise
                        
                    # Otherwise, wait before retrying
                    wait_time = min(
                        wait_exponential_multiplier * (2 ** (wrapper.attempt_count - 1)),
                        wait_exponential_max
                    ) / 1000.0  # Convert to seconds
                    
                    logger.info(f"Waiting {wait_time:.2f} seconds before retry...")
                    time.sleep(wait_time)
                except Exception as e:
                    # Capture unexpected errors in Sentry
                    sentry_sdk.capture_exception(e)
                    logger.error(f"Unexpected error in {func.__name__}: {str(e)}", exc_info=True)
                    raise
                    
            # This should not be reached due to the raise in the last attempt
            return None
        return wrapper
    return retry_decorator

# Specific retry decorators for different external APIs
youtube_api_retry = retry_external_api(
    retry_on_exceptions=(
        YouTubeAPIError,
        requests.exceptions.RequestException,
        ConnectionError,
        TimeoutError
    ),
    max_attempts=3
)

spotify_api_retry = retry_external_api(
    retry_on_exceptions=(
        SpotifyAPIError,
        requests.exceptions.RequestException,
        ConnectionError,
        TimeoutError
    ),
    max_attempts=3
)

# Example usage for handling YouTube API errors
@youtube_api_retry
def download_from_youtube(url, output_path, **options):
    """
    Download audio from YouTube with error handling and retry
    """
    try:
        with yt_dlp.YoutubeDL(options) as ydl:
            return ydl.extract_info(url, download=True)
    except yt_dlp.utils.DownloadError as e:
        # Convert to our custom error
        raise YouTubeAPIError(f"YouTube download error: {str(e)}", original_error=e)
    except Exception as e:
        logger.error(f"Unexpected error downloading from YouTube: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"Unexpected YouTube error: {str(e)}", original_error=e)

# Format conversion utilities
def get_format_info(file_path):
    """
    Get audio format information using mutagen
    """
    from mutagen import File
    
    try:
        audio = File(file_path)
        if audio is None:
            return None
            
        info = {
            'format': file_path.split('.')[-1].lower(),
            'channels': getattr(audio.info, 'channels', None),
            'sample_rate': getattr(audio.info, 'sample_rate', None),
            'bitrate': getattr(audio.info, 'bitrate', None),
            'length': getattr(audio.info, 'length', None),
        }
        
        # Get tags if available
        if hasattr(audio, 'tags') and audio.tags:
            for key in audio.tags.keys():
                info[key] = audio.tags[key]
                
        return info
    except Exception as e:
        logger.error(f"Error getting format info: {str(e)}", exc_info=True)
        return None

def convert_audio_format(input_path, output_format=None):
    """
    Convert audio to specified format using FFmpeg
    Returns the path to the converted file
    """
    import os
    import subprocess
    
    if output_format is None:
        output_format = settings.DEFAULT_AUDIO_FORMAT
        
    if output_format not in settings.SUPPORTED_AUDIO_FORMATS:
        raise ValueError(f"Unsupported format: {output_format}")
        
    # Get the base name without extension
    base_path = os.path.splitext(input_path)[0]
    output_path = f"{base_path}.{output_format}"
    
    try:
        command = [
            'ffmpeg', 
            '-i', input_path,
            '-y',  # Overwrite output file if it exists
            output_path
        ]
        
        # Run the conversion
        subprocess.run(
            command, 
            check=True, 
            stderr=subprocess.PIPE, 
            stdout=subprocess.PIPE
        )
        
        return output_path
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg error: {e.stderr.decode()}", exc_info=True)
        raise
    except Exception as e:
        logger.error(f"Error converting audio: {str(e)}", exc_info=True)
        raise

def embed_metadata(mp3_path, title, artist, album='Unknown', genre='Unknown', thumbnail_url=None, year=None, composer=None, album_artist=None, spotify_id=None, youtube_id=None):
    """
    Embeds metadata into an MP3 file using ID3 tags.
    
    Args:
        mp3_path (str): Path to the MP3 file
        title (str): Song title
        artist (str): Artist name
        album (str): Album name (default: 'Unknown')
        genre (str): Genre (default: 'Unknown')
        thumbnail_url (str): URL of the thumbnail image (default: None)
        year (str): Release year (default: None)
        composer (str): Song composer (default: None)
        album_artist (str): Album-wide artist (default: None)
        spotify_id (str): Spotify ID for the track (default: None)
        youtube_id (str): YouTube ID for the video (default: None)
    
    Returns:
        bool: True if successful, False otherwise
    """
    # Import necessary modules at the top level of the function
    import os
    import tempfile
    import shutil
    from subprocess import call
    from mutagen.id3 import TCOM, TPE2, TYER
    from PIL import Image
    from io import BytesIO
    import imghdr
    import requests
    
    try:
        # Ensure the file actually exists
        if not os.path.exists(mp3_path):
            logger.error(f"File not found: {mp3_path}")
            return False
            
        # Check if the file is empty or too small to be a valid MP3
        if os.path.getsize(mp3_path) < 128:  # At minimum an MP3 should have an ID3 tag
            logger.warning(f"File is too small to be a valid MP3: {mp3_path}. Size: {os.path.getsize(mp3_path)} bytes")
            
            # Try to create a minimal valid MP3 file
            try:
                # Generate a silent MP3 file using ffmpeg
                temp_dir = tempfile.mkdtemp()
                silent_mp3 = os.path.join(temp_dir, "silent.mp3")
                
                # Generate 1 second of silence
                call(['ffmpeg', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', 
                      '-t', '1', '-q:a', '9', '-acodec', 'libmp3lame', silent_mp3], 
                     stdout=tempfile.devnull, stderr=tempfile.devnull)
                
                # Copy the silent MP3 to the destination
                shutil.copy2(silent_mp3, mp3_path)
                
                # Clean up temp files
                shutil.rmtree(temp_dir, ignore_errors=True)
                
                logger.info(f"Created minimal valid MP3 file at: {mp3_path}")
            except Exception as e:
                logger.error(f"Failed to create minimal valid MP3: {e}")
                return False
            
        logger.info(f"Embedding metadata in {mp3_path}")
        logger.info(f"Title: {title}, Artist: {artist}, Album: {album}, Genre: {genre}")
        
        # Try to load existing ID3 tags, or create a new tag if none exists
        try:
            audio = ID3(mp3_path)
            logger.info("Loaded existing ID3 tags")
        except:
            # If no ID3 tags exist, create them
            logger.info("No existing ID3 tags found, creating new tags")
            audio = ID3()
            
        # Add basic tags - using UTF-8 encoding to support all characters
        audio['TIT2'] = TIT2(encoding=3, text=title)
        audio['TPE1'] = TPE1(encoding=3, text=artist)
        audio['TALB'] = TALB(encoding=3, text=album)
        audio['TCON'] = TCON(encoding=3, text=genre)
        
        # Add release year - using the appropriate tag based on ID3 version
        if year:
            try:
                # Try both v2.3 and v2.4 year tags
                audio['TDRC'] = TDRC(encoding=3, text=str(year))  # v2.4
                audio['TYER'] = TYER(encoding=3, text=str(year))  # v2.3
            except Exception as e:
                logger.warning(f"Error setting year tag: {e}")
        
        # Add composer if provided
        if composer:
            try:
                audio['TCOM'] = TCOM(encoding=3, text=composer)
            except Exception as e:
                logger.warning(f"Error setting composer tag: {e}")
                
        # Add album artist if provided
        if album_artist:
            try:
                audio['TPE2'] = TPE2(encoding=3, text=album_artist)
            except Exception as e:
                logger.warning(f"Error setting album artist tag: {e}")
        
        # Prepare image data
        image_data = None
        
        # Add album art if thumbnail URL is provided
        if thumbnail_url:
            # First check database for the song if possible
            from django.apps import apps
            
            try:
                # Try to find the song in the database first
                Song = apps.get_model('songs', 'Song')
                song = Song.objects.filter(
                    title__icontains=title,
                    artist__icontains=artist,
                    thumbnail_url__isnull=False
                ).first()
                
                if song and song.thumbnail_url:
                    logger.info(f"Found matching song in database: {song.title} by {song.artist}")
                    thumbnail_url = song.thumbnail_url
                    logger.info(f"Using thumbnail URL from database: {thumbnail_url}")
            except Exception as e:
                logger.warning(f"Error checking database: {e}")
                
            # Now check the Music.csv file in datasets directory
            if not thumbnail_url or 'unknown' in thumbnail_url.lower():
                try:
                    import csv
                    
                    # Path to the new Music.csv file
                    music_csv_path = os.path.join(settings.BASE_DIR, 'tunevault', 'songs', 'datasets', 'Music.csv')
                    
                    if os.path.exists(music_csv_path):
                        logger.info(f"Checking Music.csv file for thumbnail: {music_csv_path}")
                        
                        with open(music_csv_path, 'r', encoding='utf-8-sig') as csvfile:
                            reader = csv.DictReader(csvfile)
                            
                            # Clean the search terms
                            clean_title = title.lower().strip()
                            clean_artist = artist.lower().strip()
                            
                            # Check each row for a matching song
                            for row in reader:
                                # Skip empty rows
                                if not row:
                                    continue
                                    
                                # First try to match by spotify_id if available (most reliable method)
                                if spotify_id and row.get('spotify_id') and spotify_id == row.get('spotify_id'):
                                    logger.info(f"Found exact spotify_id match in Music.csv: {spotify_id}")
                                    img_url = row.get('img')
                                    if img_url and len(img_url) > 5:  # Basic validation
                                        thumbnail_url = img_url
                                        logger.info(f"Using thumbnail URL from Music.csv (spotify match): {thumbnail_url}")
                                        break
                                
                                # Get name and artist from the row
                                row_title = row.get('name', '').lower().strip()
                                row_artist = row.get('artist', '').lower().strip()
                                
                                # Check for text matches
                                title_match = (row_title in clean_title or clean_title in row_title)
                                artist_match = (row_artist in clean_artist or clean_artist in row_artist)
                                
                                # If we have a title+artist match, use the img URL
                                if title_match and artist_match:
                                    img_url = row.get('img')
                                    if img_url and len(img_url) > 5:  # Basic validation
                                        logger.info(f"Found matching song in Music.csv: {row_title} by {row_artist}")
                                        thumbnail_url = img_url
                                        logger.info(f"Using thumbnail URL from Music.csv (name/artist match): {thumbnail_url}")
                                        break
                    else:
                        logger.warning(f"Music.csv file not found at: {music_csv_path}")
                except Exception as e:
                    logger.warning(f"Error checking Music.csv file: {e}")
                    
            # Download the thumbnail data
            if thumbnail_url:
                if thumbnail_url.startswith('/media/'):
                    # Local file
                    thumbnail_path = os.path.join(settings.MEDIA_ROOT, thumbnail_url.replace('/media/', ''))
                    logger.info(f"Looking for local thumbnail: {thumbnail_path}")
                    if os.path.exists(thumbnail_path):
                        with open(thumbnail_path, 'rb') as f:
                            image_data = f.read()
                        logger.info(f"Found local thumbnail: {thumbnail_path}")
                    else:
                        logger.warning(f"Thumbnail file not found: {thumbnail_path}")
                else:
                    # Remote URL
                    try:
                        logger.info(f"Downloading thumbnail from URL: {thumbnail_url}")
                        headers = {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                        }
                        
                        # Check if URL is a webp image and try to convert it directly from the source
                        if 'webp' in thumbnail_url.lower():
                            logger.info("Detected webp image in URL, will handle special conversion")
                            
                            # Download the webp image
                            response = requests.get(thumbnail_url, timeout=10, headers=headers)
                            response.raise_for_status()
                            webp_data = response.content
                            
                            # Create a temporary directory for conversion
                            temp_dir = tempfile.mkdtemp()
                            webp_path = os.path.join(temp_dir, "image.webp")
                            jpg_path = os.path.join(temp_dir, "image.jpg")
                            
                            # Save the webp image to disk
                            with open(webp_path, 'wb') as f:
                                f.write(webp_data)
                            
                            # Try conversion with pillow first
                            try:
                                img = Image.open(BytesIO(webp_data))
                                if img.mode != 'RGB':
                                    img = img.convert('RGB')
                                img.save(jpg_path, 'JPEG', quality=90)
                                
                                # Read the converted JPEG
                                with open(jpg_path, 'rb') as f:
                                    image_data = f.read()
                                    
                                logger.info(f"Successfully converted webp to JPEG with Pillow: {len(image_data)} bytes")
                            except Exception as pillow_error:
                                logger.warning(f"Pillow webp conversion failed: {pillow_error}")
                                
                                # Try ffmpeg as fallback
                                try:
                                    call(['ffmpeg', '-i', webp_path, '-qscale:v', '2', jpg_path], 
                                         stdout=tempfile.devnull, stderr=tempfile.devnull)
                                    
                                    if os.path.exists(jpg_path):
                                        with open(jpg_path, 'rb') as f:
                                            image_data = f.read()
                                        logger.info(f"Successfully converted webp to JPEG with ffmpeg: {len(image_data)} bytes")
                                    else:
                                        logger.warning("FFmpeg webp conversion failed")
                                        # Fall back to original webp data
                                        image_data = webp_data
                                except Exception as ffmpeg_error:
                                    logger.warning(f"FFmpeg webp conversion failed: {ffmpeg_error}")
                                    # Fall back to original webp data
                                    image_data = webp_data
                            
                            # Clean up temporary files
                            shutil.rmtree(temp_dir, ignore_errors=True)
                        else:
                            # Regular image download
                            response = requests.get(thumbnail_url, timeout=10, headers=headers)
                            response.raise_for_status()
                            image_data = response.content
                            
                        logger.info(f"Downloaded thumbnail: {len(image_data)} bytes")
                    except requests.exceptions.RequestException as e:
                        logger.warning(f"Failed to download thumbnail from {thumbnail_url}: {e}")
        
        # Add album art if we have image data
        if image_data:
            try:
                # Determine MIME type
                img_type = imghdr.what(None, h=image_data[:32])
                logger.info(f"Detected image type: {img_type}")
                
                # Convert to JPEG if it's not already JPEG to avoid the 'unknown mimetype' issue
                if img_type and img_type.lower() not in ['jpeg', 'jpg']:
                    logger.info(f"Converting image from {img_type} to JPEG")
                    try:
                        # Create a temporary file to save the image
                        temp_dir = tempfile.mkdtemp()
                        temp_img_path = os.path.join(temp_dir, "temp_img.jpg")
                        
                        # Save the image data to a temporary file
                        with open(temp_img_path + ".tmp", 'wb') as f:
                            f.write(image_data)
                        
                        # Open with Pillow and convert to JPEG
                        img = Image.open(BytesIO(image_data))
                        if img.mode != 'RGB':
                            img = img.convert('RGB')
                        img.save(temp_img_path, format='JPEG', quality=90)
                        
                        # Read the converted image
                        with open(temp_img_path, 'rb') as f:
                            image_data = f.read()
                            
                        # Clean up temporary files
                        shutil.rmtree(temp_dir, ignore_errors=True)
                        
                        logger.info(f"Successfully converted image to JPEG: {len(image_data)} bytes")
                        img_type = 'jpeg'
                    except Exception as e:
                        logger.warning(f"Error converting image with Pillow: {e}")
                        
                        # Try alternative conversion with ffmpeg if Pillow fails
                        try:
                            logger.info("Attempting conversion with ffmpeg")
                            temp_dir = tempfile.mkdtemp()
                            temp_in = os.path.join(temp_dir, f"input.{img_type or 'bin'}")
                            temp_out = os.path.join(temp_dir, "output.jpg")
                            
                            # Write the input file
                            with open(temp_in, 'wb') as f:
                                f.write(image_data)
                            
                            # Convert using ffmpeg
                            call(['ffmpeg', '-i', temp_in, '-q:v', '2', temp_out], 
                                 stdout=tempfile.devnull, stderr=tempfile.devnull)
                            
                            # Read the converted file
                            if os.path.exists(temp_out):
                                with open(temp_out, 'rb') as f:
                                    image_data = f.read()
                                logger.info(f"Successfully converted image with ffmpeg: {len(image_data)} bytes")
                                img_type = 'jpeg'
                            else:
                                logger.warning("FFmpeg conversion failed to create output file")
                            
                            # Clean up
                            shutil.rmtree(temp_dir, ignore_errors=True)
                        except Exception as ffmpeg_error:
                            logger.warning(f"FFmpeg conversion also failed: {ffmpeg_error}")
                
                # Force JPEG MIME type for compatibility with all players
                mime_type = "image/jpeg"
                
                if image_data:
                    logger.info(f"Adding album art, MIME type: {mime_type}")
                    # Create APIC frame with version 3 encoding for wide compatibility
                    audio['APIC'] = APIC(
                        encoding=3,           # UTF-8
                        mime=mime_type,       # Always use image/jpeg
                        type=3,               # Cover (front)
                        desc='Cover',
                        data=image_data
                    )
                    logger.info("Successfully added album art to ID3 tags")
                else:
                    logger.warning("No image data available after conversion attempts")
            except Exception as e:
                logger.warning(f"Error processing image: {e}")
        
        # If no image data but we have a YouTube ID, try to get a thumbnail directly from YouTube
        elif youtube_id:
            try:
                # Construct YouTube thumbnail URL
                yt_thumbnail_url = f"https://img.youtube.com/vi/{youtube_id}/maxresdefault.jpg"
                logger.info(f"Trying to get thumbnail directly from YouTube: {yt_thumbnail_url}")
                
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.36'
                }
                
                response = requests.get(yt_thumbnail_url, timeout=10, headers=headers)
                if response.status_code == 200 and len(response.content) > 1000:  # Ensure it's not a placeholder
                    image_data = response.content
                    logger.info(f"Successfully downloaded YouTube thumbnail: {len(image_data)} bytes")
                    
                    # Add the thumbnail to the ID3 tags
                    audio['APIC'] = APIC(
                        encoding=3,           # UTF-8
                        mime="image/jpeg",     # YouTube thumbnails are JPEG
                        type=3,               # Cover (front)
                        desc='Cover',
                        data=image_data
                    )
                    logger.info("Successfully added YouTube thumbnail to ID3 tags")
                else:
                    # Try alternative thumbnail URL
                    yt_thumbnail_url = f"https://img.youtube.com/vi/{youtube_id}/hqdefault.jpg"
                    logger.info(f"Trying alternative YouTube thumbnail: {yt_thumbnail_url}")
                    
                    response = requests.get(yt_thumbnail_url, timeout=10, headers=headers)
                    if response.status_code == 200 and len(response.content) > 1000:
                        image_data = response.content
                        logger.info(f"Successfully downloaded alternative YouTube thumbnail: {len(image_data)} bytes")
                        
                        # Add the thumbnail to the ID3 tags
                        audio['APIC'] = APIC(
                            encoding=3,           # UTF-8
                            mime="image/jpeg",     # YouTube thumbnails are JPEG
                            type=3,               # Cover (front)
                            desc='Cover',
                            data=image_data
                        )
                        logger.info("Successfully added alternative YouTube thumbnail to ID3 tags")
            except Exception as e:
                logger.warning(f"Error getting YouTube thumbnail: {e}")
        
        # Save the changes - important to write to the file - use ID3v2.3 for compatibility
        audio.save(mp3_path, v2_version=3)
        logger.info(f"Successfully saved ID3 tags to {mp3_path}")
        
        # Verify tags were written properly
        try:
            verification = ID3(mp3_path)
            tag_count = len(verification)
            has_cover = 'APIC:Cover' in verification or 'APIC:' in verification
            logger.info(f"Verification: {tag_count} tags were written, has_cover={has_cover}")
        except Exception as e:
            logger.warning(f"Could not verify tags: {e}")
        
        return True
    
    except Exception as e:
        logger.error(f"Error embedding metadata in {mp3_path}: {e}", exc_info=True)
        return False

def download_thumbnail(url):
    """
    Downloads a thumbnail from a URL
    
    Args:
        url (str): URL of the thumbnail image
    
    Returns:
        BytesIO: BytesIO object containing the image data
    """
    try:
        if url.startswith('/media/'):
            # Local file
            thumbnail_path = os.path.join(settings.MEDIA_ROOT, url.replace('/media/', ''))
            if os.path.exists(thumbnail_path):
                with open(thumbnail_path, 'rb') as f:
                    return BytesIO(f.read())
            else:
                logger.warning(f"Thumbnail file not found: {thumbnail_path}")
                return None
        else:
            # Remote URL
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            return BytesIO(response.content)
    except Exception as e:
        logger.error(f"Error downloading thumbnail from {url}: {e}")
        return None

@youtube_api_retry
def get_youtube_playlist_info(playlist_url):
    """
    Get information about a YouTube playlist
    
    Args:
        playlist_url (str): URL to YouTube playlist
        
    Returns:
        dict: Playlist information including tracks
    """
    import yt_dlp
    import os
    import re
    
    logger.info(f"Getting YouTube playlist info for URL: {playlist_url}")
    
    # Extract playlist ID if present
    playlist_id = None
    if 'list=' in playlist_url:
        match = re.search(r'list=([a-zA-Z0-9_-]+)', playlist_url)
        if match:
            playlist_id = match.group(1)
            logger.info(f"Extracted YouTube playlist ID: {playlist_id}")
            
            # If we have a playlist ID, ensure we're using the proper URL format
            if not playlist_url.startswith('https://www.youtube.com/playlist'):
                playlist_url = f"https://www.youtube.com/playlist?list={playlist_id}"
                logger.info(f"Using formatted playlist URL: {playlist_url}")
    
    try:
        # Options for extracting playlist info
        ydl_opts = {
            'extract_flat': True,  # Don't download the videos
            'quiet': True,  # Don't print messages to stdout
            'simulate': True,  # Don't download
            'skip_download': True,  # Don't download the videos
            'ignoreerrors': True,  # Skip unavailable videos
            'no_warnings': True,  # Don't show warnings
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            logger.info(f"Extracting playlist info from: {playlist_url}")
            info = ydl.extract_info(playlist_url, download=False)
            
            if not info:
                logger.error(f"Failed to extract playlist info from URL: {playlist_url}")
                raise ValueError("Could not extract playlist information, please check the URL is correct")
                
            # If it's not a playlist but a single video, handle that as well
            if info.get('_type') != 'playlist':
                logger.info(f"URL {playlist_url} is a single video, not a playlist. Creating single-track playlist.")
                # Create a single-track playlist info
                playlist_info = {
                    'title': f"Single Track: {info.get('title', 'YouTube Video')}",
                    'description': info.get('description', ''),
                    'owner': info.get('uploader', 'Unknown'),
                    'image_url': info.get('thumbnail'),
                    'track_count': 1,
                    'track_urls': [info.get('webpage_url') or playlist_url]
                }
                return playlist_info
                
            if not info.get('entries'):
                logger.error(f"No videos found in playlist: {playlist_url}")
                # Try an alternative approach for playlist retrieval
                try:
                    # Modify options to try a different approach
                    alt_ydl_opts = {
                        'extract_flat': 'in_playlist',
                        'quiet': True,
                        'simulate': True,
                        'skip_download': True,
                        'ignoreerrors': True,
                        'no_warnings': True,
                        'playlistrandom': False,  # Don't randomize playlist order
                        'playlistend': 100,  # Limit to first 100 videos to avoid timeout
                    }
                    
                    with yt_dlp.YoutubeDL(alt_ydl_opts) as alt_ydl:
                        logger.info(f"Trying alternative approach for playlist: {playlist_url}")
                        alt_info = alt_ydl.extract_info(playlist_url, download=False)
                        
                        if alt_info and alt_info.get('entries'):
                            logger.info(f"Alternative approach succeeded for playlist: {playlist_url}")
                            info = alt_info
                        else:
                            raise ValueError("No videos found in playlist, please check if the playlist is private or has been deleted")
                except Exception as alt_e:
                    logger.error(f"Alternative approach also failed: {str(alt_e)}")
                    raise ValueError("No videos found in playlist, please check if the playlist is private or has been deleted")
            
            # Create result dictionary
            playlist_info = {
                'title': info.get('title', 'YouTube Playlist'),
                'description': info.get('description', ''),
                'owner': info.get('uploader', 'Unknown'),
                'image_url': info.get('thumbnail'),
                'track_count': len(info.get('entries', [])),
                'track_urls': []
            }
            
            # Extract individual track URLs
            for entry in info.get('entries', []):
                if entry:
                    track_url = entry.get('url') or entry.get('webpage_url') or entry.get('original_url')
                    if track_url:
                        playlist_info['track_urls'].append(track_url)
            
            if not playlist_info['track_urls']:
                logger.warning(f"No valid track URLs extracted from playlist: {playlist_url}")
            else:
                logger.info(f"Successfully extracted info for playlist: {playlist_info['title']} "
                           f"with {len(playlist_info['track_urls'])} tracks")
            
            return playlist_info
            
    except yt_dlp.utils.DownloadError as e:
        logger.error(f"Error extracting YouTube playlist info: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"YouTube playlist extraction error: {str(e)}", original_error=e)
    except Exception as e:
        logger.error(f"Unexpected error getting YouTube playlist info: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"Unexpected YouTube error: {str(e)}", original_error=e)

@youtube_api_retry
def download_youtube_util(url, output_path=None):
    """
    Download a YouTube video to MP3 format
    
    Args:
        url (str): YouTube video URL
        output_path (str, optional): Base directory for outputs. Defaults to settings.MEDIA_ROOT.
    
    Returns:
        dict: Information about the downloaded video including file path
    """
    import yt_dlp
    import os
    from django.conf import settings
    
    if not output_path:
        output_path = settings.MEDIA_ROOT
    
    # Create songs directory if it doesn't exist
    songs_dir = os.path.join(output_path, 'songs')
    os.makedirs(songs_dir, exist_ok=True)
    
    # Format-specific paths - use video ID as filename to avoid Unicode issues
    safe_template = os.path.join(songs_dir, '%(id)s.%(ext)s')
    
    try:
        # First attempt with normal method
        try:
            logger.info(f"Attempting to download from YouTube: {url}")
            with yt_dlp.YoutubeDL({'quiet': True, 'no_warnings': True}) as ydl:
                # First just extract info to get video ID and title
                info = ydl.extract_info(url, download=False)
                video_id = info.get('id', 'unknown')
                title = sanitize_filename(info.get('title', 'Unknown Title'))
                artist = sanitize_filename(info.get('uploader', 'Unknown Artist'))
                
                # Now download with the sanitized info
                ydl_opts = {
                    'format': 'bestaudio/best',
                    'postprocessors': [{
                        'key': 'FFmpegExtractAudio',
                        'preferredcodec': 'mp3',
                        'preferredquality': '192',
                    }],
                    'outtmpl': os.path.join(songs_dir, f"{video_id}"),
                    'writethumbnail': True,
                    'noplaylist': True
                }
                
                with yt_dlp.YoutubeDL(ydl_opts) as ydl2:
                    ydl2.download([url])
                
                # The output file will be based on the video ID
                mp3_filename = os.path.join(songs_dir, f"{video_id}.mp3")
                
                if os.path.exists(mp3_filename):
                    logger.info(f"Successfully downloaded with primary method: {mp3_filename}")
                else:
                    raise ValueError(f"MP3 file not created after download")
                    
                # Create a properly named file for returning to user and for future reference
                proper_filename = f"{title} - {artist}.mp3"
                proper_path = os.path.join(songs_dir, proper_filename)
                
                # Copy the file to the proper name if different
                if mp3_filename != proper_path:
                    import shutil
                    shutil.copy2(mp3_filename, proper_path)
                
                # Look for thumbnail
                thumbnail_url = info.get('thumbnail')
                thumbnail_path = None
                
                # Try to find the thumbnail file
                for ext in ['jpg', 'png', 'webp']:
                    thumbnail_possible = os.path.join(songs_dir, f"{video_id}.{ext}")
                    if os.path.exists(thumbnail_possible):
                        thumbnail_path = thumbnail_possible
                        break
                
                # Return information about the downloaded file
                return {
                    'title': title,
                    'artist': artist,
                    'album': sanitize_filename(info.get('album', 'Unknown')),
                    'filepath': proper_path,
                    'thumbnail': thumbnail_url,
                    'duration': info.get('duration'),
                    'url': url
                }
                
        except Exception as primary_error:
            # If the primary method fails, try alternative method
            logger.warning(f"Primary download method failed: {str(primary_error)}")
            logger.info("Trying alternative download method...")
            
            # Alternative method with simpler output template
            alt_ydl_opts = {
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192',
                }],
                'outtmpl': os.path.join(songs_dir, 'youtube_%(id)s'),
                'writethumbnail': True,
                'noplaylist': True,
                'http_headers': {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
                },
                'nocheckcertificate': True,
                'geo_bypass': True,
            }
            
            with yt_dlp.YoutubeDL(alt_ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                video_id = info.get('id', 'unknown')
                mp3_filename = os.path.join(songs_dir, f"youtube_{video_id}.mp3")
                
                # Return information about the downloaded file, but with sanitized title
                return {
                    'title': sanitize_filename(info.get('title', 'Unknown Title')),
                    'artist': sanitize_filename(info.get('uploader', 'Unknown Artist')),
                    'album': sanitize_filename(info.get('album', 'Unknown')),
                    'filepath': mp3_filename,
                    'thumbnail': info.get('thumbnail'),
                    'duration': info.get('duration'),
                    'url': url
                }
            
    except yt_dlp.utils.DownloadError as e:
        logger.error(f"YouTube download error: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"YouTube download error: {str(e)}", original_error=e)
    except Exception as e:
        logger.error(f"Unexpected error downloading from YouTube: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"Unexpected YouTube error: {str(e)}", original_error=e)

# Additional utility functions

import csv
import os
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def get_artist_info(artist_name):
    """
    Search for artist information in the Global Music Artists CSV file
    Returns a dictionary with artist data or None if not found
    """
    try:
        csv_path = os.path.join(settings.BASE_DIR, 'songs', 'datasets', 'Global Music Artists.csv')
        if not os.path.exists(csv_path):
            logger.warning(f"Artist CSV file not found at: {csv_path}")
            return None
            
        with open(csv_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            
            # Convert artist name to lowercase for case-insensitive matching
            artist_name_lower = artist_name.lower().strip()
            
            for row in reader:
                # Case-insensitive comparison
                if row.get('artist_name', '').lower().strip() == artist_name_lower:
                    return {
                        'artist': row.get('artist_name'),
                        'artist_genre': row.get('artist_genre'),
                        'artist_img': row.get('artist_img'),
                        'artist_id': row.get('artist_id'),
                        'country': row.get('country')
                    }
                    
        # If we reach here, artist was not found
        return None
    except Exception as e:
        logger.error(f"Error reading artist CSV: {e}")
        return None