import spotipy
import logging
import numpy as np
from django.conf import settings
from datetime import datetime
from sklearn.metrics.pairwise import cosine_similarity
from .csv_recommender import get_csv_recommender, get_hybrid_recommendations, get_hardcoded_recommendations

logger = logging.getLogger(__name__)

# Import hybrid recommendations function from csv_recommender
# This replaces the original implementation to use CSV data instead of Spotify API
from .csv_recommender import get_hybrid_recommendations

def get_track_features(sp, track_id):
    """
    Get audio features for a track from Spotify API
    """
    try:
        features = sp.audio_features(track_id)[0]
        return features
    except Exception as e:
        logger.error(f"Error fetching track features: {e}")
        return None

def get_track_audio_features(sp, track_ids):
    """
    Get audio features for multiple tracks
    """
    features = []
    # Process in batches of 50 (Spotify API limit)
    for i in range(0, len(track_ids), 50):
        batch = track_ids[i:i+50]
        batch_features = sp.audio_features(batch)
        features.extend([f for f in batch_features if f])
    return features

def get_content_based_recommendations(sp, seed_tracks, limit=10):
    """
    Get content-based recommendations based on seed tracks
    """
    try:
        # Remove duplicate seed tracks and ensure we use at most 5 unique tracks
        unique_seed_tracks = list(dict.fromkeys(seed_tracks))[:5]  # Spotify allows max 5 seed tracks
        
        logger.info(f"Getting recommendations with seed tracks: {unique_seed_tracks}")
        
        # Get recommendations from Spotify API
        try:
            # Try without market parameter first
            recommendations = sp.recommendations(
                seed_tracks=unique_seed_tracks,
                limit=limit
            )
        except spotipy.exceptions.SpotifyException as e:
            logger.error(f"Spotify API error: {e}")
            # Try with just one seed track as fallback
            if len(unique_seed_tracks) > 1:
                logger.info("Trying with single seed track as fallback")
                try:
                    recommendations = sp.recommendations(
                        seed_tracks=[unique_seed_tracks[0]],
                        limit=limit
                    )
                except:
                    # If that fails too, use hardcoded recommendations
                    logger.warning("All Spotify API calls failed, using hardcoded recommendations")
                    return get_hardcoded_recommendations(limit)
            else:
                # Use hardcoded recommendations
                logger.warning("Spotify API call failed, using hardcoded recommendations")
                return get_hardcoded_recommendations(limit)
        
        return [
            {
                'title': track['name'],
                'artist': track['artists'][0]['name'],
                'album': track['album']['name'],
                'spotify_id': track['id'],
                'image_url': track['album']['images'][0]['url'] if track['album']['images'] else None,
                'popularity': track['popularity']
            }
            for track in recommendations['tracks']
        ]
    except Exception as e:
        logger.error(f"Error getting recommendations: {e}", exc_info=True)
        return get_hardcoded_recommendations(limit)

def get_hardcoded_recommendations(limit=10):
    """
    Return hardcoded popular songs as recommendations when the Spotify API fails
    """
    # List of popular songs with all required fields
    popular_songs = [
        {
            'title': 'Stay',
            'artist': 'The Kid LAROI, Justin Bieber',
            'album': 'Stay',
            'spotify_id': '2LRoIwlKmHjgvigdNGBHNo',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273171c6ee052142d4301bab492',
            'popularity': 95
        },
        {
            'title': 'Blinding Lights',
            'artist': 'The Weeknd',
            'album': 'After Hours',
            'spotify_id': '0pqnGHJpmpxLKifKRmU6WP',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36',
            'popularity': 93
        },
        {
            'title': 'Despacito',
            'artist': 'Luis Fonsi',
            'album': 'VIDA',
            'spotify_id': '7qiZfU4dY1lWllzX7mPBI3',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273ef0d4234e1a645740f77d59c',
            'popularity': 91
        },
        {
            'title': 'Shape of You',
            'artist': 'Ed Sheeran',
            'album': '÷ (Divide)',
            'spotify_id': '7qiZfU4dY1lWllzX7mPBI3',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96',
            'popularity': 90
        },
        {
            'title': 'Dance Monkey',
            'artist': 'Tones and I',
            'album': 'The Kids Are Coming',
            'spotify_id': '1rgnBhdG2JDFTbYkYRZAku',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273c6af5ffa661a365b77df6ef6',
            'popularity': 89
        },
        {
            'title': 'Someone You Loved',
            'artist': 'Lewis Capaldi',
            'album': 'Divinely Uninspired To A Hellish Extent',
            'spotify_id': '7qEHsqek33rTcFNT9PFqLf',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273fc2101e6889d6ce9025f85f2',
            'popularity': 88
        },
        {
            'title': 'Bad Guy',
            'artist': 'Billie Eilish',
            'album': 'WHEN WE ALL FALL ASLEEP, WHERE DO WE GO?',
            'spotify_id': '2Fxmhks0bxGSBdJ92vM42m',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b27350a3147b4edd7701a876c6ce',
            'popularity': 87
        },
        {
            'title': 'Believer',
            'artist': 'Imagine Dragons',
            'album': 'Evolve',
            'spotify_id': '0pqnGHJpmpxLKifKRmU6WP',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273da6f73a25f4c79d0e6b4a8bd',
            'popularity': 86
        },
        {
            'title': 'Uptown Funk',
            'artist': 'Mark Ronson ft. Bruno Mars',
            'album': 'Uptown Special',
            'spotify_id': '32OlwWuMpZ6b0aN2RZOeMS',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273e419ccba0baa8bd3f3d7abf2',
            'popularity': 85
        },
        {
            'title': 'Counting Stars',
            'artist': 'OneRepublic',
            'album': 'Native',
            'spotify_id': '2tpWsVSb9UEmDRxAl1zhX1',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273726d48d93d02e1271774f023',
            'popularity': 84
        },
        {
            'title': 'Thunder',
            'artist': 'Imagine Dragons',
            'album': 'Evolve',
            'spotify_id': '1zB4vmk8tFRmM9UULNzbLB',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273da6f73a25f4c79d0e6b4a8bd',
            'popularity': 83
        },
        {
            'title': 'Perfect',
            'artist': 'Ed Sheeran',
            'album': '÷ (Divide)',
            'spotify_id': '0tgVpDi06FyKpA1z0VMD4v',
            'image_url': 'https://i.scdn.co/image/ab67616d0000b273ba5db46f4b838ef6027e6f96',
            'popularity': 82
        }
    ]
    
    # Return the requested number of recommendations
    logger.info(f"Returning {min(limit, len(popular_songs))} hardcoded recommendations")
    return popular_songs[:limit]

def update_user_recommendations(user):
    """
    Update user's recommendations and store them
    """
    from .models import Song
    
    try:
        # Get recommendations using the CSV-based recommender
        recommendations = get_hybrid_recommendations(user)
        
        if not recommendations:
            return False
        
        # Create Song objects for recommendations (if they don't exist)
        for rec in recommendations:
            # Check if song already exists
            if not Song.objects.filter(spotify_id=rec['spotify_id']).exists():
                Song.objects.create(
                    user=user,  # Assign to the user
                    title=rec['title'],
                    artist=rec['artist'],
                    album=rec['album'],
                    source='spotify',
                    spotify_id=rec['spotify_id'],
                    thumbnail_url=rec.get('image_url')
                )
        
        # Update user's last recommendation time
        if hasattr(user, 'music_profile'):
            user.music_profile.last_recommendation_generated = datetime.now()
            user.music_profile.save(update_fields=['last_recommendation_generated'])
        
        return True
        
    except Exception as e:
        logger.error(f"Error updating recommendations: {e}")
        return False 