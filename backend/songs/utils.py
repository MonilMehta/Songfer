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
    from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TCON, TRCK, TDRC, TCOM, TPE2, TYER
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

                # Create a temporary directory for image processing
                temp_dir = tempfile.mkdtemp()
                temp_img_path = os.path.join(temp_dir, "temp_img.jpg")
                
                # Always convert to JPEG for compatibility
                try:
                    # Save the original image data to a temp file
                    temp_orig = os.path.join(temp_dir, f"orig.{img_type or 'bin'}")
                    with open(temp_orig, 'wb') as f:
                        f.write(image_data)
                    
                    # Open with Pillow and convert to RGB JPEG
                    img = Image.open(temp_orig)
                    if img.mode != 'RGB':
                        img = img.convert('RGB')
                    
                    # Resize if too large (max 500x500px) while maintaining aspect ratio
                    if img.width > 500 or img.height > 500:
                        img.thumbnail((500, 500))
                    
                    # Save as high quality JPEG
                    img.save(temp_img_path, format='JPEG', quality=95)
                    
                    # Read the converted image
                    with open(temp_img_path, 'rb') as f:
                        image_data = f.read()
                        
                    logger.info(f"Successfully converted image to JPEG: {len(image_data)} bytes")
                    img_type = 'jpeg'
                except Exception as e:
                    logger.warning(f"Error processing image with Pillow: {e}")
                    
                    # Try ffmpeg as fallback
                    try:
                        call(['ffmpeg', '-i', temp_orig, '-q:v', '1', '-pix_fmt', 'yuvj420p', temp_img_path], 
                             stdout=tempfile.devnull, stderr=tempfile.devnull)
                        
                        if os.path.exists(temp_img_path):
                            with open(temp_img_path, 'rb') as f:
                                image_data = f.read()
                            logger.info(f"Successfully converted image with ffmpeg: {len(image_data)} bytes")
                            img_type = 'jpeg'
                    except Exception as ffmpeg_error:
                        logger.warning(f"FFmpeg conversion failed: {ffmpeg_error}")
                
                # Clean up
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except:
                    pass

                # Use image/jpeg MIME type for Windows compatibility
                mime_type = "image/jpeg"
                
                if image_data:
                    logger.info(f"Adding album art, MIME type: {mime_type}")
                    
                    # Create APIC frame with version 3 encoding for wide compatibility
                    # Use ID3v2.3 compatible settings
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
                    
                    # Create a temporary directory for image processing
                    temp_dir = tempfile.mkdtemp()
                    temp_img_path = os.path.join(temp_dir, "yt_thumb.jpg")
                    
                    # Save and optimize the image for Windows compatibility
                    try:
                        # Save the original image data
                        with open(temp_img_path + '.orig', 'wb') as f:
                            f.write(image_data)
                        
                        # Open with Pillow and convert/optimize
                        img = Image.open(BytesIO(image_data))
                        if img.mode != 'RGB':
                            img = img.convert('RGB')
                        
                        # Save as high quality JPEG
                        img.save(temp_img_path, format='JPEG', quality=95)
                        
                        # Read the processed image
                        with open(temp_img_path, 'rb') as f:
                            image_data = f.read()
                            
                        logger.info(f"Successfully processed YouTube thumbnail: {len(image_data)} bytes")
                    except Exception as e:
                        logger.warning(f"Error processing YouTube thumbnail: {e}")
                        # Fall back to original data
                    
                    # Clean up
                    try:
                        shutil.rmtree(temp_dir, ignore_errors=True)
                    except:
                        pass
                    
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
                        
                        # Process thumbnail for Windows compatibility 
                        temp_dir = tempfile.mkdtemp()
                        temp_img_path = os.path.join(temp_dir, "yt_thumb_alt.jpg")
                        
                        try:
                            # Process with Pillow
                            img = Image.open(BytesIO(image_data))
                            if img.mode != 'RGB':
                                img = img.convert('RGB')
                            img.save(temp_img_path, format='JPEG', quality=95)
                            
                            # Read the processed image
                            with open(temp_img_path, 'rb') as f:
                                image_data = f.read()
                                
                            logger.info(f"Successfully processed alternative YouTube thumbnail: {len(image_data)} bytes")
                        except Exception as e:
                            logger.warning(f"Error processing alternative YouTube thumbnail: {e}")
                            # Fall back to original data
                        
                        # Clean up
                        try:
                            shutil.rmtree(temp_dir, ignore_errors=True)
                        except:
                            pass
                        
                        # Add the thumbnail to the ID3 tags
                        audio['APIC'] = APIC(
                            encoding=3,           # UTF-8
                            mime="image/jpeg",     # JPEG format for Windows compatibility
                            type=3,               # Cover (front)
                            desc='Cover',
                            data=image_data
                        )
                        logger.info("Successfully added alternative YouTube thumbnail to ID3 tags")
            except Exception as e:
                logger.warning(f"Error getting YouTube thumbnail: {e}")
        
        # Save the changes using ID3v2.3 for better compatibility with Windows Explorer
        audio.save(mp3_path, v2_version=3)
        logger.info(f"Successfully saved ID3 tags to {mp3_path} using ID3v2.3")
        
        # Verify tags were written properly
        try:
            verification = ID3(mp3_path)
            tag_count = len(verification)
            has_cover = 'APIC:Cover' in verification or 'APIC:' in verification
            logger.info(f"Verification: {tag_count} tags were written, has_cover={has_cover}")
        except Exception as e:
            logger.warning(f"Could not verify tags: {e}")

        # For extra Windows compatibility, try to set the album art using a direct approach
        if image_data and os.name == 'nt':  # Only on Windows systems
            try:
                import win32com.client
                from win32com.shell import shell, shellcon
                
                logger.info("Attempting to set system thumbnail property directly (Windows only)")
                
                # Save thumbnail to a temporary file
                temp_dir = tempfile.mkdtemp()
                temp_jpg = os.path.join(temp_dir, "cover.jpg")
                
                with open(temp_jpg, 'wb') as f:
                    f.write(image_data)
                
                # Get absolute paths
                abs_mp3_path = os.path.abspath(mp3_path)
                abs_jpg_path = os.path.abspath(temp_jpg)
                
                # Try to associate the image with the file
                try:
                    shell_folder = shell.SHGetDesktopFolder()
                    shell_item = shell_folder.ParseDisplayName(0, None, abs_mp3_path)[0]
                    shell_item.SetInfo(shellcon.SHGFI_ICON, abs_jpg_path)
                    logger.info("Set Windows shell thumbnail successfully")
                except Exception as shell_error:
                    logger.warning(f"Could not set shell thumbnail: {shell_error}")
                
                # Clean up
                try:
                    shutil.rmtree(temp_dir, ignore_errors=True)
                except:
                    pass
                    
            except ImportError:
                logger.info("Win32com not available, skipping direct thumbnail setting")
            except Exception as win_error:
                logger.warning(f"Error setting Windows thumbnail: {win_error}")
        
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
            'cookiesfile': os.path.join(settings.BASE_DIR, 'cookies.txt'),  # Use cookies to avoid bot detection
            'nocheckcertificate': True,  # Sometimes helps with HTTPS issues
            'ignoreerrors': False,
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
                        'playlistend': 50,  # Limit to first 100 videos to avoid timeout
                        'cookiesfile': os.path.join(settings.BASE_DIR, 'cookies.txt'),  # Use cookies to avoid bot detection
                        'nocheckcertificate': True,  # Sometimes helps with HTTPS issues
                        'ignoreerrors': False,
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
                    'noplaylist': True,
                    'cookiesfile': os.path.join(settings.BASE_DIR, 'cookies.txt'),  # Use cookies to avoid bot detection
            'nocheckcertificate': True,  # Sometimes helps with HTTPS issues
            'ignoreerrors': False,
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
    
    Args:
        artist_name (str): The name of the artist to search for
    
    Returns:
        dict or None: Dictionary with artist data or None if not found
    """
    if not artist_name:
        return None

    try:
        csv_path = os.path.join(settings.BASE_DIR, 'songs', 'datasets', 'Global Music Artists.csv')
        if not os.path.exists(csv_path):
            logger.warning(f"Artist CSV file not found at: {csv_path}")
            return None
            
        with open(csv_path, 'r', encoding='utf-8') as file:
            reader = csv.DictReader(file)
            
            # Convert artist name to lowercase for case-insensitive matching
            artist_name_lower = artist_name.lower().strip()
            
            # First try to find exact match
            exact_matches = []
            partial_matches = []
            words_in_artist_name = set(artist_name_lower.split())
            
            for row in reader:
                csv_artist_name = row.get('artist_name', '').lower().strip()
                
                # Exact match check
                if csv_artist_name == artist_name_lower:
                    exact_matches.append(row)
                # Partial match - either artist name contains the other or they share significant words
                elif (artist_name_lower in csv_artist_name or 
                      csv_artist_name in artist_name_lower or
                      len(words_in_artist_name.intersection(csv_artist_name.split())) >= min(1, len(words_in_artist_name)//2)):
                    partial_matches.append(row)
            
            # If we have exact matches, use the first one
            if exact_matches:
                best_match = exact_matches[0]
                logger.info(f"Found exact match for artist '{artist_name}': {best_match.get('artist_name')}")
                return {
                    'artist': best_match.get('artist_name'),
                    'artist_genre': best_match.get('artist_genre'),
                    'artist_img': best_match.get('artist_img'),
                    'artist_id': best_match.get('artist_id'),
                    'country': best_match.get('country')
                }
            
            # Otherwise use the first partial match if any
            elif partial_matches:
                best_match = partial_matches[0]
                logger.info(f"Found partial match for artist '{artist_name}': {best_match.get('artist_name')}")
                return {
                    'artist': best_match.get('artist_name'),
                    'artist_genre': best_match.get('artist_genre'),
                    'artist_img': best_match.get('artist_img'),
                    'artist_id': best_match.get('artist_id'),
                    'country': best_match.get('country')
                }
                
        # If we reach here, artist was not found
        logger.info(f"No match found for artist '{artist_name}' in CSV data")
        return None
    except Exception as e:
        logger.error(f"Error reading artist CSV: {e}")
        return None

def get_artist_info_from_hf(artist_name):
    """
    Get artist information from Hugging Face Space API
    
    Args:
        artist_name (str): The name of the artist to search for
    
    Returns:
        dict: Dictionary with artist data or None if not found
    """
    if not artist_name:
        return None
    
    import requests
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Make a request to the Hugging Face Space API
        hf_api_url = "https://monilm-songporter.hf.space/artist-info/"
        response = requests.post(
            hf_api_url,
            json={"artist_name": artist_name},
            headers={"Content-Type": "application/json"},
            timeout=5  # 5 seconds timeout
        )
        
        if response.status_code == 200:
            data = response.json()
            # The API returns values in nested objects, extract the actual values
            result = {
                'artist': data.get('artist', {}).get('name', 'Unknown'),
                'artist_img': data.get('artist_img', {}).get('url', 'https://media.istockphoto.com/id/1298261537/vector/blank-man-profile-head-icon-placeholder.jpg?s=612x612&w=0&k=20&c=CeT1RVWZzQDay4t54ookMaFsdi7ZHVFg2Y5v7hxigCA='),
                'country': data.get('country', {}).get('name', 'Unknown'),
                'artist_genre': data.get('artist_genre', {}).get('name', 'Unknown')
            }
            logger.info(f"Successfully retrieved artist info from Hugging Face for {artist_name}")
            return result
        else:
            logger.warning(f"Failed to get artist info from Hugging Face API: {response.status_code} {response.text}")
            return None
    except Exception as e:
        logger.error(f"Error fetching artist info from Hugging Face API: {e}")
        return None


def get_bulk_artist_info_from_hf(artist_names):
    """
    Get information for multiple artists from Hugging Face Space API
    
    Args:
        artist_names (list): List of artist names to look up
    
    Returns:
        dict: Dictionary with artist names as keys and their info as values
    """
    if not artist_names:
        return {}
    
    import requests
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Make a request to the Hugging Face Space API for multiple artists
        hf_api_url = "https://monilm-songporter.hf.space/artists/"
        response = requests.post(
            hf_api_url,
            json=artist_names,
            headers={"Content-Type": "application/json"},
            timeout=10  # 10 seconds timeout for multiple artists
        )
        
        if response.status_code == 200:
            data = response.json()
            
            # Process the response - extract values from nested objects
            result = {}
            for artist_name, artist_data in data.items():
                result[artist_name] = {
                    'artist': artist_data.get('artist', {}).get('name', 'Unknown'),
                    'artist_img': artist_data.get('artist_img', {}).get('url', 'https://media.istockphoto.com/id/1298261537/vector/blank-man-profile-head-icon-placeholder.jpg?s=612x612&w=0&k=20&c=CeT1RVWZzQDay4t54ookMaFsdi7ZHVFg2Y5v7hxigCA='),
                    'country': artist_data.get('country', {}).get('name', 'Unknown'),
                    'artist_genre': artist_data.get('artist_genre', {}).get('name', 'Unknown')
                }
            
            logger.info(f"Successfully retrieved info for {len(result)} artists from Hugging Face")
            return result
        else:
            logger.warning(f"Failed to get bulk artist info from Hugging Face API: {response.status_code} {response.text}")
            return {}
    except Exception as e:
        logger.error(f"Error fetching bulk artist info from Hugging Face API: {e}")
        return {}