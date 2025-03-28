import os
import requests
import logging
import tempfile
from io import BytesIO
from django.conf import settings
from mutagen.id3 import ID3, APIC, TIT2, TPE1, TALB, TCON, TRCK, TDRC

logger = logging.getLogger(__name__)

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