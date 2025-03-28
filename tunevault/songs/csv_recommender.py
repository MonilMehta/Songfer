import pandas as pd
import numpy as np
import os
from django.conf import settings
import logging
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler
import random

logger = logging.getLogger(__name__)

class SpotifyMultiCSVRecommender:
    """
    A recommendation engine that uses pre-loaded Spotify data CSV files 
    to generate music recommendations without requiring API access.
    """
    
    def __init__(self, data_df=None, genre_df=None, year_df=None):
        self.logger = logging.getLogger(__name__)
        
        try:
            # If dataframes are provided, use them
            if data_df is not None and genre_df is not None and year_df is not None:
                self.data = data_df
                self.genre_data = genre_df
                self.year_data = year_df
            else:
                # Otherwise load from files
                datasets_path = os.path.join(settings.BASE_DIR, 'songs', 'datasets')
                self.data = pd.read_csv(os.path.join(datasets_path, 'data.csv'))
                self.genre_data = pd.read_csv(os.path.join(datasets_path, 'data_by_genres.csv'))
                self.year_data = pd.read_csv(os.path.join(datasets_path, 'data_by_year.csv'))
            
            # Prepare data
            self._prepare_data()
            self.logger.info("CSV Recommender initialized successfully")
        except Exception as e:
            self.logger.error(f"Error initializing CSV recommender: {e}", exc_info=True)
            raise
    
    def _prepare_data(self):
        """Prepare the data for recommendation"""
        # Create a song name to index mapping
        self.name_to_index = {name: i for i, name in enumerate(self.data['name'].values)}
        
        # Normalize numerical features for better comparison
        self.features = [
            'acousticness', 'danceability', 'energy', 'instrumentalness',
            'liveness', 'loudness', 'speechiness', 'tempo', 'valence'
        ]
        
        # Normalize features to 0-1 range
        scaler = MinMaxScaler()
        self.data[self.features] = scaler.fit_transform(self.data[self.features])
    
    def find_similar_songs(self, song_name, n=10):
        """Find songs similar to the given song name"""
        try:
            # Check if song exists in dataset
            if song_name not in self.name_to_index:
                self.logger.warning(f"Song '{song_name}' not found in dataset")
                return self.get_popular_songs(n)
            
            # Get the song index
            idx = self.name_to_index[song_name]
            song_data = self.data.iloc[idx]
            
            # Get song features
            song_features = song_data[self.features].values.reshape(1, -1)
            
            # Calculate similarity using cosine similarity
            similarity = cosine_similarity(song_features, self.data[self.features].values)
            
            # Adjust similarity by genre match (bonus for matching genres)
            if 'genres' in self.data.columns and self.data['genres'].notna().any():
                target_genres = set()
                if isinstance(song_data['genres'], str):
                    target_genres = set(eval(song_data['genres']) if song_data['genres'].startswith('[') else [song_data['genres']])
                
                for i, row in enumerate(self.data.iterrows()):
                    row_genres = set()
                    if 'genres' in row[1] and isinstance(row[1]['genres'], str):
                        row_genres = set(eval(row[1]['genres']) if row[1]['genres'].startswith('[') else [row[1]['genres']])
                    
                    # Add genre matching bonus (0.1 for each matching genre)
                    genre_overlap = len(target_genres.intersection(row_genres))
                    if genre_overlap > 0:
                        similarity[0][i] += min(genre_overlap * 0.1, 0.3)  # Cap at 0.3 bonus
            
            # Adjust by artist similarity (bonus for same artist)
            if 'artists' in self.data.columns:
                target_artists = set()
                if isinstance(song_data['artists'], str):
                    target_artists = set(eval(song_data['artists']) if song_data['artists'].startswith('[') else [song_data['artists']])
                
                for i, row in enumerate(self.data.iterrows()):
                    row_artists = set()
                    if 'artists' in row[1] and isinstance(row[1]['artists'], str):
                        row_artists = set(eval(row[1]['artists']) if row[1]['artists'].startswith('[') else [row[1]['artists']])
                    
                    # Significant bonus for same artist (0.2)
                    if target_artists.intersection(row_artists):
                        similarity[0][i] += 0.2
            
            # Get top n similar songs (excluding the input song)
            similar_indices = np.argsort(similarity[0])[::-1][1:n+1]
            
            # Convert to song objects
            recommendations = []
            for i in similar_indices:
                song = self.data.iloc[i]
                recommendations.append({
                    'title': song['name'],
                    'artist': song['artists'],
                    'album': song.get('album_name', 'Unknown'),
                    'spotify_id': song['id'],
                    'image_url': None,  # CSV doesn't have image URLs
                    'popularity': song.get('popularity', 50)
                })
            
            return recommendations
        except Exception as e:
            self.logger.error(f"Error finding similar songs: {e}", exc_info=True)
            return self.get_popular_songs(n)
    
    def get_recommendations(self, query, n=10):
        """Get recommendations based on a query"""
        try:
            if not query or not isinstance(query, str):
                self.logger.warning(f"Invalid query: {query}")
                return self.get_popular_songs(n)
                
            # Try exact match first
            exact_matches = self.data[self.data['name'].str.lower() == query.lower()]
            
            if not exact_matches.empty:
                # Use the first exact match
                song_name = exact_matches.iloc[0]['name']
                return self.find_similar_songs(song_name, n)
                
            # Try to find the song in our dataset with partial matching
            partial_matches = self.data[self.data['name'].str.contains(query, case=False, na=False)]
            
            if not partial_matches.empty:
                # Sort by popularity and string length (prefer shorter, more popular matches)
                partial_matches['name_len'] = partial_matches['name'].str.len()
                sorted_matches = partial_matches.sort_values(['popularity', 'name_len'], 
                                                           ascending=[False, True])
                
                # Use the best match
                song_name = sorted_matches.iloc[0]['name']
                return self.find_similar_songs(song_name, n)
                
            # Try matching by artist if no song matches
            artist_matches = self.data[self.data['artists'].str.contains(query, case=False, na=False)]
            
            if not artist_matches.empty:
                # Get the most popular song by this artist
                popular_by_artist = artist_matches.sort_values('popularity', ascending=False).iloc[0]
                song_name = popular_by_artist['name']
                self.logger.info(f"No song match, using artist match: {query} -> {song_name}")
                return self.find_similar_songs(song_name, n)
                
            self.logger.warning(f"No matches found for query: {query}")
            return self.get_popular_songs(n)
        except Exception as e:
            self.logger.error(f"Error getting recommendations: {e}", exc_info=True)
            return self.get_popular_songs(n)
    
    def get_recommendations_by_genre(self, genre, n=10):
        """Get recommendations based on genre"""
        try:
            # Filter genre data
            genre_matches = self.genre_data[self.genre_data['genres'].str.contains(genre, case=False, na=False)]
            
            if not genre_matches.empty:
                # Get songs from the top matching genres
                top_genres = genre_matches.head(5)['genres'].values
                
                # Find songs matching these genres
                recommendations = []
                for g in top_genres:
                    matches = self.data[self.data['genres'].str.contains(g, case=False, na=False)]
                    
                    if not matches.empty:
                        # Take a sample of songs from this genre
                        sample_size = min(n // 5 + 1, len(matches))
                        for _, song in matches.sample(sample_size).iterrows():
                            recommendations.append({
                                'title': song['name'],
                                'artist': song['artists'],
                                'album': song.get('album_name', 'Unknown'),
                                'spotify_id': song['id'],
                                'image_url': None,
                                'popularity': song.get('popularity', 50)
                            })
                            
                            if len(recommendations) >= n:
                                break
                    
                    if len(recommendations) >= n:
                        break
                
                # If we don't have enough recommendations, add popular songs
                if len(recommendations) < n:
                    recommendations.extend(self.get_popular_songs(n - len(recommendations)))
                
                return recommendations[:n]
            else:
                self.logger.warning(f"No matches found for genre: {genre}")
                return self.get_popular_songs(n)
        except Exception as e:
            self.logger.error(f"Error getting recommendations by genre: {e}", exc_info=True)
            return self.get_popular_songs(n)
    
    def get_popular_songs(self, n=10):
        """Get popular songs as fallback"""
        try:
            # Sort by popularity and return top n
            popular = self.data.sort_values('popularity', ascending=False).head(100)
            
            # Take a random sample from top 100
            sample = popular.sample(min(n, len(popular)))
            
            # Convert to song objects
            recommendations = []
            for _, song in sample.iterrows():
                recommendations.append({
                    'title': song['name'],
                    'artist': song['artists'],
                    'album': song.get('album_name', 'Unknown'),
                    'spotify_id': song['id'],
                    'image_url': None,
                    'popularity': song.get('popularity', 50)
                })
            
            return recommendations
        except Exception as e:
            self.logger.error(f"Error getting popular songs: {e}", exc_info=True)
            # Hardcoded fallback if all else fails
            return get_hardcoded_recommendations(n)

def get_hardcoded_recommendations(limit=10):
    """
    Return hardcoded popular songs as recommendations when all else fails
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
            'spotify_id': '0tgVpDi06FyKpA1z0VMD4v',
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
    return popular_songs[:limit]

# Global recommender instance
_recommender = None

def get_csv_recommender():
    """Get or create the global recommender instance"""
    global _recommender
    if _recommender is None:
        try:
            _recommender = SpotifyMultiCSVRecommender()
        except Exception as e:
            logger.error(f"Failed to initialize CSV recommender: {e}", exc_info=True)
            # Return a minimal class that just returns hardcoded recommendations
            class FallbackRecommender:
                def get_recommendations(self, query=None, n=10):
                    return get_hardcoded_recommendations(n)
                
                def get_popular_songs(self, n=10):
                    return get_hardcoded_recommendations(n)
            
            _recommender = FallbackRecommender()
    
    return _recommender

def get_hybrid_recommendations(user, limit=10):
    """
    Get recommendations based on user's downloaded songs using CSV data
    This replaces the Spotify API-based function with the same name
    """
    try:
        recommender = get_csv_recommender()
        
        # Check if user has any songs
        if not hasattr(user, 'songs') or not user.songs.exists():
            logger.warning(f"User {user.id} has no songs - using popular songs")
            return recommender.get_popular_songs(limit)
        
        # Get user's latest songs
        latest_songs = user.songs.order_by('-created_at')[:5]
        
        if not latest_songs:
            logger.warning(f"No songs found for user {user.id}")
            return recommender.get_popular_songs(limit)
        
        # Use multiple songs for recommendations with weights based on recency
        all_recommendations = []
        weights = [0.5, 0.2, 0.15, 0.1, 0.05]  # More weight to recent songs
        
        # Get weighted recommendations from user's 5 most recent songs
        for i, song in enumerate(latest_songs):
            if i >= len(weights):
                break
                
            # Get recommendations for this song
            song_recommendations = recommender.get_recommendations(song.title, limit=20)
            
            if song_recommendations:
                # Add weight information to recommendations
                for rec in song_recommendations:
                    rec['weight'] = weights[i]
                all_recommendations.extend(song_recommendations)
        
        if not all_recommendations:
            logger.warning(f"No recommendations found for user's songs")
            return recommender.get_popular_songs(limit)
        
        # Group by song title and combine weights
        recommendation_dict = {}
        for rec in all_recommendations:
            title = rec['title']
            if title in recommendation_dict:
                recommendation_dict[title]['weight'] += rec['weight']
            else:
                recommendation_dict[title] = rec
        
        # Convert back to list and sort by weight
        final_recommendations = list(recommendation_dict.values())
        final_recommendations.sort(key=lambda x: x['weight'], reverse=True)
        
        # Remove weight field and return top recommendations
        for rec in final_recommendations:
            if 'weight' in rec:
                del rec['weight']
                
        return final_recommendations[:limit]
    except Exception as e:
        logger.error(f"Error in get_hybrid_recommendations: {e}", exc_info=True)
        return get_hardcoded_recommendations(limit) 
