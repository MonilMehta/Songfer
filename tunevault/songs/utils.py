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