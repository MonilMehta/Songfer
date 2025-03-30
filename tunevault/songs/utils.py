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

logger = logging.getLogger(__name__)

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
        @retry(
            retry_on_exception=lambda exc: isinstance(exc, retry_on_exceptions),
            stop_max_attempt_number=max_attempts,
            wait_exponential_multiplier=wait_exponential_multiplier,
            wait_exponential_max=wait_exponential_max
        )
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except retry_on_exceptions as e:
                # Log the error
                logger.warning(
                    f"Retrying {func.__name__} due to {e.__class__.__name__}: {str(e)}. "
                    f"Attempt {wrapper.retry.statistics['attempt_number']} of {max_attempts}."
                )
                # Re-raise the exception for the retry mechanism
                raise
            except Exception as e:
                # Capture unexpected errors in Sentry
                sentry_sdk.capture_exception(e)
                logger.error(f"Unexpected error in {func.__name__}: {str(e)}", exc_info=True)
                raise
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
    import yt_dlp
    
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

def embed_metadata(mp3_path, title, artist, album='Unknown', genre='Unknown', thumbnail_url=None, year=None):
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
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Ensure the file actually exists
        if not os.path.exists(mp3_path):
            logger.error(f"File not found: {mp3_path}")
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
        
        # Add release year if provided
        if year:
            audio['TDRC'] = TDRC(encoding=3, text=str(year))
        
        # Add album art if thumbnail URL is provided
        if thumbnail_url:
            # Download thumbnail
            image_data = None
            
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
                    response = requests.get(thumbnail_url, timeout=10)
                    response.raise_for_status()
                    image_data = response.content
                    logger.info(f"Downloaded thumbnail: {len(image_data)} bytes")
                except requests.exceptions.RequestException as e:
                    logger.warning(f"Failed to download thumbnail from {thumbnail_url}: {e}")
            
            # Add album art if we have image data
            if image_data:
                # Determine MIME type
                import imghdr
                img_type = imghdr.what(None, h=image_data[:32])
                mime_type = f"image/{img_type}" if img_type else "image/jpeg"
                
                logger.info(f"Adding album art, MIME type: {mime_type}")
                audio['APIC'] = APIC(
                    encoding=3,
                    mime=mime_type,
                    type=3,  # Cover (front)
                    desc='Cover',
                    data=image_data
                )
        
        # Save the changes - important to write to the file
        audio.save(mp3_path, v2_version=3)
        logger.info(f"Successfully saved ID3 tags to {mp3_path}")
        
        # Verify tags were written properly
        try:
            verification = ID3(mp3_path)
            tag_count = len(verification)
            logger.info(f"Verification: {tag_count} tags were written")
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
    Extract information from a YouTube playlist URL including title, description and track URLs.
    """
    import yt_dlp
    
    logger.info(f"Getting YouTube playlist info for URL: {playlist_url}")
    
    try:
        # Configure yt-dlp to extract playlist info without downloading
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,  # Do not download videos
            'skip_download': True,  # Do not download videos
            'no_warnings': False,
            'ignoreerrors': True,  # Skip unavailable videos
        }
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist_url, download=False)
            
            if not info:
                logger.error(f"Failed to extract playlist info from URL: {playlist_url}")
                raise ValueError("Could not extract playlist information")
                
            if not info.get('entries'):
                logger.error(f"No videos found in playlist: {playlist_url}")
                raise ValueError("No videos found in playlist")
                
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
                    track_url = entry.get('url') or entry.get('webpage_url')
                    if track_url:
                        playlist_info['track_urls'].append(track_url)
            
            logger.info(f"Successfully extracted info for playlist: {playlist_info['title']} "
                       f"with {playlist_info['track_count']} tracks")
            
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
    
    try:
        # Basic options for downloading audio
        ydl_opts = {
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': os.path.join(songs_dir, '%(title)s.%(ext)s'),
            'writethumbnail': True,
            'noplaylist': True  # Only download the single video, not the playlist
        }
        
        # Download the file
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            base_filename = os.path.splitext(filename)[0]
            mp3_filename = base_filename + '.mp3'
            
            # Check if the MP3 file exists
            if not os.path.exists(mp3_filename):
                raise ValueError(f"MP3 file not created: {mp3_filename}")
            
            # Try to find the thumbnail
            thumbnail_url = info.get('thumbnail')
            thumbnail_path = None
            
            # Check for local thumbnail files
            for ext in ['jpg', 'png', 'webp']:
                possible_path = f"{base_filename}.{ext}"
                if os.path.exists(possible_path):
                    thumbnail_path = possible_path
                    # Make it a web-accessible URL if it's within the media directory
                    if settings.MEDIA_ROOT in os.path.abspath(possible_path):
                        rel_path = os.path.relpath(possible_path, settings.MEDIA_ROOT)
                        thumbnail_url = f"/media/{rel_path}"
                    break
            
            # Return information about the downloaded file
            return {
                'title': info.get('title', 'Unknown Title'),
                'artist': info.get('uploader', 'Unknown Artist'),
                'album': info.get('album', 'Unknown'),
                'filepath': mp3_filename,
                'thumbnail': thumbnail_url,
                'duration': info.get('duration'),
                'url': url
            }
            
    except yt_dlp.utils.DownloadError as e:
        logger.error(f"YouTube download error: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"YouTube download error: {str(e)}", original_error=e)
    except Exception as e:
        logger.error(f"Unexpected error downloading from YouTube: {str(e)}", exc_info=True)
        raise YouTubeAPIError(f"Unexpected YouTube error: {str(e)}", original_error=e) 