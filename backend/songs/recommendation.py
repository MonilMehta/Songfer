import logging
import numpy as np
import pandas as pd
import os
from django.conf import settings
from datetime import datetime
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.cluster import KMeans
from django.utils import timezone
from django.db.models import Count
from django.db.models.functions import TruncDate

logger = logging.getLogger(__name__)

def get_hardcoded_recommendations(limit=10):
    """Return hardcoded popular songs as recommendations when all else fails"""
    popular_songs = [
        {
            'title': 'Stay',
            'artist': 'The Kid LAROI, Justin Bieber',
            'album': 'Stay',
            'spotify_id': '5HCyWlXZPP0y6Gqq8TgA20',
            'image_url': 'https://i.scdn.co/image/ab67616d00001e0241e31d6ea1d493dd77933ee5',
            'popularity': 95
        },
        {
            'title': 'Blinding Lights',
            'artist': 'The Weeknd',
            'album': 'After Hours',
            'spotify_id': '0VjIjW4GlUZAMYd2vXMi3b',
            'image_url': 'https://i.scdn.co/image/ab67616d00001e028863bc11d2aa12b54f5aeb36',
            'popularity': 93
        },
        {
            'title': 'Despacito',
            'artist': 'Luis Fonsi',
            'album': 'VIDA',
            'spotify_id': '6habFhsOp2NvshLv26DqMb',
            'image_url': 'https://i.scdn.co/image/ab67616d00001e02ef0d4234e1a645740f77d59c',
            'popularity': 91
        },
        {
            'title': 'Shape of You',
            'artist': 'Ed Sheeran',
            'album': '÷ (Divide)',
            'spotify_id': '7qiZfU4dY1lWllzX7mPBI3',
            'image_url': 'https://i.scdn.co/image/ab67616d00001e02ba5db46f4b838ef6027e6f96',
            'popularity': 90
        },
        {
            'title': 'One Dance',
            'artist': 'Drake',
            'album': 'Views',
            'spotify_id': '5ZKG94fnjiuMH5yrC5S9lS',
            'image_url': 'https://i.scdn.co/image/ab67616d00001e0272d0af2341359a90710c1fdc',
            'popularity': 89
        }
    ]
    
    return popular_songs[:limit]

class MusicRecommender:
    """
    A music recommendation system using clustering and content-based filtering based on CSV datasets.
    """
    
    def __init__(self):
        self.logger = logging.getLogger(__name__)
        self.data = None
        self.genre_data = None
        self.year_data = None
        self.features = None
        self.name_to_index = None
        self.id_to_index = None
        self.cluster_model = None
        self.song_cluster_labels = None
        
        try:
            # Load datasets
            datasets_path = os.path.join(settings.BASE_DIR, 'songs', 'datasets')
            
            # Skip Music.csv as it has an invalid format with song titles as column names
            self.logger.info("Skipping Music.csv due to invalid format, using data.csv directly")
            
            # Load data.csv which has the correct format
            self.data = pd.read_csv(os.path.join(datasets_path, 'data.csv'),
                                   on_bad_lines='skip',
                                   engine='python')
            self.logger.info("Loaded data.csv dataset")
            
            # Load genre and year data
            self.genre_data = pd.read_csv(os.path.join(datasets_path, 'data_by_genres.csv'),
                                        on_bad_lines='skip',
                                        engine='python')
            self.year_data = pd.read_csv(os.path.join(datasets_path, 'data_by_year.csv'),
                                      on_bad_lines='skip',
                                      engine='python')
            
            # Prepare data and build clusters
            self._prepare_data()
            self._build_clusters()
            self.logger.info("Music Recommender initialized successfully")
        except Exception as e:
            self.logger.error(f"Error initializing Music Recommender: {e}", exc_info=True)
            raise
    
    def _prepare_data(self):
        """Prepare the data for recommendation"""
        try:
            # First, print available columns to diagnose the issue
            self.logger.info(f"Available columns in dataset: {list(self.data.columns)}")
            
            # Map common column names to standardized versions (for compatibility)
            column_mapping = {
                'name': 'name',
                'title': 'name',        # Music.csv might use 'title' instead of 'name'
                'track_name': 'name',   # Another possible column name
                'artist': 'artists',    # Music.csv uses 'artist', we standardize to 'artists'
                'artists': 'artists',
                'spotify_id': 'id',     # Music.csv uses 'spotify_id', we standardize to 'id'
                'id': 'id',
                'img': 'image_url',     # Music.csv uses 'img', we map to 'image_url'
                'release_date': 'year'
            }
            
            # Create missing columns with default values if needed
            for std_col, mapping_col in column_mapping.items():
                if std_col in self.data.columns and mapping_col not in self.data.columns:
                    self.data[mapping_col] = self.data[std_col]
                    self.logger.info(f"Mapped column {std_col} to {mapping_col}")
            
            # Create required columns if missing
            if 'name' not in self.data.columns:
                # Try to find any column that might contain song names
                possible_name_columns = ['track_name', 'title', 'track', 'song_name']
                for col in possible_name_columns:
                    if col in self.data.columns:
                        self.data['name'] = self.data[col]
                        self.logger.info(f"Using {col} as name")
                        break
                else:
                    # If no name column found, create one from the filename or index
                    self.data['name'] = [f"Unknown Song {i}" for i in range(len(self.data))]
                    self.logger.warning("No name column found, using placeholder names")
            
            if 'id' not in self.data.columns:
                if 'spotify_id' in self.data.columns:
                    self.data['id'] = self.data['spotify_id']
                    self.logger.info("Using spotify_id as id")
                else:
                    self.data['id'] = [f"song_{i}" for i in range(len(self.data))]
                    self.logger.info("Created synthetic ids")
            
            if 'artists' not in self.data.columns:
                if 'artist' in self.data.columns:
                    self.data['artists'] = self.data['artist']
                    self.logger.info("Using artist as artists")
                else:
                    self.data['artists'] = 'Unknown Artist'
                    self.logger.warning("No artist column found, using default")
            
            if 'popularity' not in self.data.columns:
                # Calculate synthetic popularity (can use energy or other features)
                if 'energy' in self.data.columns:
                    self.logger.info("Creating synthetic popularity based on energy")
                    self.data['popularity'] = (self.data['energy'] * 100).round().astype(int)
                else:
                    self.logger.warning("No popularity data, assigning random values")
                    self.data['popularity'] = np.random.randint(30, 90, size=len(self.data))
            
            if 'album_name' not in self.data.columns:
                self.data['album_name'] = 'Unknown'
            
            # Create a song name to index mapping
            self.name_to_index = {name: i for i, name in enumerate(self.data['name'].values)}
            
            # Create a song ID to index mapping
            self.id_to_index = {id: i for i, id in enumerate(self.data['id'].values)}
            
            # Define features for content-based filtering based on available columns
            # Prioritize specific features if available
            all_possible_features = [
                'acousticness', 'danceability', 'energy', 'instrumentalness',
                'liveness', 'loudness', 'speechiness', 'tempo', 'valence',
                'acousticness_artist', 'danceability_artist', 'energy_artist', 
                'instrumentalness_artist', 'liveness_artist', 'speechiness_artist', 'valence_artist'
            ]
            
            # Use features that exist in the dataset
            self.features = [f for f in all_possible_features if f in self.data.columns]
            
            if not self.features:
                self.logger.error("No valid features found in dataset")
                raise ValueError("No valid features found in dataset")
            
            self.logger.info(f"Using features: {self.features}")
            
            # Normalize features to 0-1 range
            scaler = StandardScaler()
            self.data[self.features] = scaler.fit_transform(self.data[self.features])
            
            self.logger.info(f"Prepared data with {len(self.data)} songs and {len(self.features)} features")
        except Exception as e:
            self.logger.error(f"Error preparing data: {e}", exc_info=True)
            raise
    
    def _build_clusters(self):
        """Build KMeans clusters of songs for recommendation"""
        try:
            # Define the pipeline
            cluster_pipeline = Pipeline([
                ('scaler', StandardScaler()),
                ('kmeans', KMeans(n_clusters=20, verbose=False, random_state=42))
            ])
            
            # Select only numeric features for clustering
            numeric_cols = self.data.select_dtypes(include=[np.number]).columns.tolist()
            
            # Ensure we have the features we need
            if not set(self.features).issubset(set(numeric_cols)):
                self.logger.warning("Some features are not numeric, using all available numeric columns instead")
            
            # Use features that exist in the dataset
            X = self.data[numeric_cols]
            
            # Fit the pipeline
            cluster_pipeline.fit(X)
            
            # Store the model
            self.cluster_model = cluster_pipeline
            
            # Add cluster labels to the data
            self.song_cluster_labels = cluster_pipeline.predict(X)
            self.data['cluster_label'] = self.song_cluster_labels
            
            self.logger.info("Built song clusters successfully")
        except Exception as e:
            self.logger.error(f"Error building clusters: {e}", exc_info=True)
            self.cluster_model = None
    
    def find_similar_songs(self, song_name, n=10):
        """Find songs similar to the given song name"""
        try:
            # Check if song exists in dataset by name
            song_idx = None
            if (song_name in self.name_to_index):
                song_idx = self.name_to_index[song_name]
            # If not found by name, try as spotify_id
            elif self.id_to_index and song_name in self.id_to_index:
                song_idx = self.id_to_index[song_name]
            
            # If song not found or clusters unavailable, try by partial name match before falling back
            if song_idx is None:
                # Try partial matching with song names
                matched_songs = [idx for name, idx in self.name_to_index.items() 
                               if song_name.lower() in name.lower()]
                
                if matched_songs:
                    # Use the first match
                    song_idx = matched_songs[0]
                    self.logger.info(f"Found song by partial name match: {song_name} -> {self.data.iloc[song_idx]['name']}")
                else:
                    # Try partial matching with artist names
                    artist_col = 'artists' if 'artists' in self.data.columns else 'artist'
                    matched_by_artist = self.data[self.data[artist_col].str.contains(song_name, case=False, na=False)]
                    
                    if not matched_by_artist.empty:
                        song_idx = matched_by_artist.iloc[0].name
                        self.logger.info(f"Found song by artist match: {song_name} -> {self.data.iloc[song_idx]['name']}")
            
            # If still no match or clusters unavailable, fall back to popularity
            if song_idx is None or self.cluster_model is None:
                self.logger.warning(f"Song '{song_name}' not found or clustering unavailable, using popular songs")
                return self.get_popular_songs(n)
            
            song_data = self.data.iloc[song_idx]
            
            # Make sure we have features for similarity calculation
            if not self.features:
                self.logger.warning("No features available for similarity calculation")
                return self.get_popular_songs(n)
                
            song_features = song_data[self.features].values.reshape(1, -1)
            
            # Approach 1: Get songs from the same cluster
            if 'cluster_label' in self.data.columns:
                cluster = song_data['cluster_label']
                cluster_songs = self.data[self.data['cluster_label'] == cluster]
                
                # If cluster too small, increase the sample from similar clusters
                if len(cluster_songs) < n * 2:
                    # Get song vector and cluster centers
                    song_vector = song_data[self.features].values.reshape(1, -1)
                    
                    # Get other clusters sorted by distance to this song
                    other_clusters = self.data[self.data['cluster_label'] != cluster]
                    other_clusters_feat = other_clusters[self.features].values
                    
                    # Calculate distances to all other songs
                    distances = cosine_similarity(song_vector, other_clusters_feat)[0]
                    other_clusters = other_clusters.copy()
                    other_clusters['distance'] = distances
                    
                    # Get top songs from other clusters
                    top_other_clusters = other_clusters.sort_values('distance', ascending=False).head(n)
                    
                    # Combine with original cluster
                    combined = pd.concat([cluster_songs, top_other_clusters])
                    combined = combined.drop_duplicates(subset=['id'])
                    
                    # Sort combined by distance or popularity if distance not available
                    if 'distance' in combined.columns:
                        cluster_songs = combined.sort_values('distance', ascending=False)
                    else:
                        cluster_songs = combined.sort_values('popularity', ascending=False)
            
            # Approach 2: If no clusters or too few songs, use cosine similarity directly
            if 'cluster_label' not in self.data.columns or len(cluster_songs) < n:
                # Use the most direct similarity approach
                similarity = cosine_similarity(song_features, self.data[self.features].values)[0]
                indices = np.argsort(similarity)[::-1]
                
                # Remove the song itself
                indices = indices[indices != song_idx]
                similar_song_indices = indices[:n]
                
                # Convert to DataFrame
                similar_songs = self.data.iloc[similar_song_indices]
            else:
                # If we have enough songs in cluster, sample them
                exclude_idx = cluster_songs.index.get_loc(song_idx) if song_idx in cluster_songs.index else -1
                similar_songs = cluster_songs.drop(song_idx, errors='ignore').sample(min(n, len(cluster_songs)-1))
                
                # If still not enough, add popular songs
                if len(similar_songs) < n:
                    remaining = n - len(similar_songs)
                    popular_indices = self.data.sort_values('popularity', ascending=False).index
                    # Remove songs already selected and the input song
                    popular_indices = [i for i in popular_indices if i not in similar_songs.index and i != song_idx]
                    # Take only what we need
                    popular_indices = popular_indices[:remaining]
                    additional_songs = self.data.loc[popular_indices]
                    similar_songs = pd.concat([similar_songs, additional_songs])
            
            # Convert to standard format
            recommendations = []
            for _, song in similar_songs.iterrows():
                image_url = None
                # Check for image URL in various possible columns
                for img_col in ['img', 'image_url', 'thumbnail_url']:
                    if img_col in song and song[img_col]:
                        image_url = song[img_col]
                        break
                
                # Ensure we have all required fields with defaults
                rec = {
                    'title': song['name'],
                    'artist': song['artists'] if 'artists' in song else 'Unknown Artist',
                    'album': song.get('album_name', 'Unknown'),
                    'spotify_id': song['id'],
                    'image_url': image_url,
                    'popularity': int(song.get('popularity', 50))
                }
                recommendations.append(rec)
            
            return recommendations
        except Exception as e:
            self.logger.error(f"Error finding similar songs: {e}", exc_info=True)
            return self.get_popular_songs(n)
    
    def get_recommendations_by_genre(self, genre, n=10):
        """Get recommendations based on genre"""
        try:
            # Check if we have genre data
            if self.genre_data is None or 'genres' not in self.genre_data.columns:
                self.logger.warning("No genre data available, using popular songs")
                return self.get_popular_songs(n)
                
            # Filter genre data
            genre_matches = self.genre_data[self.genre_data['genres'].str.contains(genre, case=False, na=False)]
            
            if not genre_matches.empty:
                # Get songs from the top matching genres
                top_genres = genre_matches.head(5)['genres'].values
                
                # Find songs matching these genres
                recommendations = []
                
                # Check which genre column we have in the main data
                genre_column = None
                for possible_col in ['genres', 'genre', 'artist_genres']:
                    if possible_col in self.data.columns:
                        genre_column = possible_col
                        break
                
                # If no genre column, try using artist column as a proxy
                if not genre_column and 'artists' in self.data.columns:
                    self.logger.info("No genre column found, using artist column as proxy")
                    genre_column = 'artists'
                
                # If we have a column to match against
                if genre_column:
                    for g in top_genres:
                        # Try to match by genre/artist
                        matches = self.data[self.data[genre_column].str.contains(g, case=False, na=False)]
                        
                        if not matches.empty:
                            # Take a sample of songs from this genre
                            sample_size = min(n // 5 + 1, len(matches))
                            sample = matches.sample(sample_size)
                            
                            for _, song in sample.iterrows():
                                # Get image URL from the appropriate column
                                image_url = None
                                for img_col in ['img', 'image_url', 'thumbnail_url']:
                                    if img_col in song and song[img_col]:
                                        image_url = song[img_col]
                                        break
                                
                                recommendations.append({
                                    'title': song['name'],
                                    'artist': song['artists'] if 'artists' in song else 'Unknown Artist',
                                    'album': song.get('album_name', 'Unknown'),
                                    'spotify_id': song['id'],
                                    'image_url': image_url,
                                    'popularity': int(song.get('popularity', 50))
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
            # Make sure we have at least one song
            if len(self.data) == 0:
                return get_hardcoded_recommendations(n)
                
            # Sort by popularity and return top n
            if 'popularity' in self.data.columns:
                popular = self.data.sort_values('popularity', ascending=False).head(100)
            else:
                # No popularity column, use random sampling
                self.logger.warning("No popularity column found, using random sampling")
                popular = self.data.sample(min(100, len(self.data)))
            
            # Take a random sample from top 100
            sample = popular.sample(min(n, len(popular)))
            
            # Convert to song objects
            recommendations = []
            for _, song in sample.iterrows():
                image_url = None
                # Check for image URL in various possible columns
                for img_col in ['img', 'image_url', 'thumbnail_url']:
                    if img_col in song and song[img_col]:
                        image_url = song[img_col]
                        break
                
                # Ensure we have all required fields with defaults
                rec = {
                    'title': song['name'],
                    'artist': song['artists'] if 'artists' in song else 'Unknown Artist',
                    'album': song.get('album_name', 'Unknown'),
                    'spotify_id': song['id'],
                    'image_url': image_url,
                    'popularity': int(song.get('popularity', 50))
                }
                recommendations.append(rec)
            
            return recommendations
        except Exception as e:
            self.logger.error(f"Error getting popular songs: {e}", exc_info=True)
            return get_hardcoded_recommendations(n)
    
    def get_recommendations(self, query, n=10):
        """Get recommendations based on a query"""
        try:
            if not query or not isinstance(query, str):
                self.logger.warning(f"Invalid query: {query}")
                return self.get_popular_songs(n)
            
            # Standardize columns if needed
            name_column = 'name'
            artists_column = 'artists' if 'artists' in self.data.columns else 'artist'
                
            # Try exact match first
            exact_matches = self.data[self.data[name_column].str.lower() == query.lower()]
            
            if not exact_matches.empty:
                # Use the first exact match
                song_name = exact_matches.iloc[0][name_column]
                return self.find_similar_songs(song_name, n)
                
            # Try to find the song in our dataset with partial matching
            partial_matches = self.data[self.data[name_column].str.contains(query, case=False, na=False)]
            
            if not partial_matches.empty:
                # Sort by popularity and string length (prefer shorter, more popular matches)
                partial_matches['name_len'] = partial_matches[name_column].str.len()
                sorted_matches = partial_matches.sort_values(['popularity', 'name_len'], 
                                                           ascending=[False, True])
                
                # Use the best match
                song_name = sorted_matches.iloc[0][name_column]
                return self.find_similar_songs(song_name, n)
                
            # Try matching by artist if no song matches
            artist_matches = self.data[self.data[artists_column].str.contains(query, case=False, na=False)]
            
            if not artist_matches.empty:
                # Get the most popular song by this artist
                popular_by_artist = artist_matches.sort_values('popularity', ascending=False).iloc[0]
                song_name = popular_by_artist[name_column]
                self.logger.info(f"No song match, using artist match: {query} -> {song_name}")
                return self.find_similar_songs(song_name, n)
                
            self.logger.warning(f"No matches found for query: {query}")
            return self.get_popular_songs(n)
        except Exception as e:
            self.logger.error(f"Error getting recommendations: {e}", exc_info=True)
            return self.get_popular_songs(n)

    def get_content_based_recommendations(self, seed_tracks, limit=10):
        """Get content-based recommendations based on seed tracks"""
        if self.data is None:
            return get_hardcoded_recommendations(limit)
            
        try:
            # Remove duplicate seed tracks and ensure we use at most 5 unique tracks
            unique_seed_tracks = list(dict.fromkeys(seed_tracks))[:5]
            
            # Fallback to CSV-based recommendations
            all_recommendations = []
            weights = [0.5, 0.2, 0.15, 0.1, 0.05]  # More weight to recent songs
            
            for i, track_id in enumerate(unique_seed_tracks):
                if i >= len(weights):
                    break
                    
                # Find similar songs in CSV data
                similar_songs = self.find_similar_songs(track_id, n=20)
                if similar_songs:
                    for song in similar_songs:
                        song['weight'] = weights[i]
                    all_recommendations.extend(similar_songs)
            
            if not all_recommendations:
                return get_hardcoded_recommendations(limit)
            
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
            self.logger.error(f"Error getting content-based recommendations: {e}", exc_info=True)
            return get_hardcoded_recommendations(limit)

# Global recommender instance
_recommender = None

def get_recommender():
    """Get or create the global recommender instance"""
    global _recommender
    if (_recommender is None):
        try:
            _recommender = MusicRecommender()
        except Exception as e:
            logger.error(f"Failed to initialize recommender: {e}", exc_info=True)
            # Return a minimal class that just returns hardcoded recommendations
            class FallbackRecommender:
                def get_recommendations(self, query=None, n=10):
                    return get_hardcoded_recommendations(n)
                
                def get_popular_songs(self, n=10):
                    return get_hardcoded_recommendations(n)
                
                def get_content_based_recommendations(self, seed_tracks, limit=10):
                    return get_hardcoded_recommendations(limit)
                
                def find_similar_songs(self, song_name, n=10):
                    return get_hardcoded_recommendations(n)
                
                def get_recommendations_by_genre(self, genre, n=10):
                    return get_hardcoded_recommendations(n)
            
            _recommender = FallbackRecommender()
    
    return _recommender

def get_hybrid_recommendations(user, limit=10, background_refresh=False):
    """
    Get recommendations based on user's downloaded songs using a hybrid approach.
    Uses cached recommendations if they exist, even if they're stale.
    If recommendations are stale and background_refresh=True, refresh them.
    If no cached recommendations, generate new ones.
    
    Args:
        user: User object
        limit: Number of recommendations to return
        background_refresh: If True, update stale recommendations in background for next request
    """
    try:
        # Check if we have cached recommendations
        needs_refresh = False
        if hasattr(user, 'music_profile') and user.music_profile.cached_recommendations:
            last_generated = user.music_profile.last_recommendation_generated
            cached_recommendations = user.music_profile.cached_recommendations
            
            # Check if recommendations are stale (more than a day old)
            if last_generated and (timezone.now() - last_generated).days >= 1:
                logger.info(f"Found stale recommendations for user {user.id} from {last_generated}")
                needs_refresh = True
                
                # If this is a background refresh request, update the recommendations
                if background_refresh:
                    logger.info(f"Background refreshing recommendations for user {user.id}")
                    # The rest of this function will generate new recommendations
                else:
                    # Not a background request, so serve the stale recommendations
                    # and trigger a background refresh
                    from .tasks import update_user_recommendations_async
                    logger.info(f"Serving stale recommendations and triggering refresh for user {user.id}")
                    
                    # Trigger async refresh of recommendations
                    try:
                        update_user_recommendations_async.delay(user.id)
                    except Exception as e:
                        logger.error(f"Failed to schedule background recommendation refresh: {e}")
                    
                    # Return the stale recommendations immediately
                    return cached_recommendations[:limit]
            else:
                # Recommendations are fresh, just return them
                logger.info(f"Using fresh cached recommendations for user {user.id} from {last_generated}")
                return cached_recommendations[:limit]
        
        # If we're here, either:
        # 1. There are no cached recommendations
        # 2. Recommendations are stale and this is a background refresh task
        # 3. background_refresh is always False for the first request
        
        # Check if user has any songs
        if not hasattr(user, 'songs') or not user.songs.exists():
            logger.warning(f"User {user.id} has no songs - using popular songs")
            return get_hardcoded_recommendations(limit)
        
        # Get user's latest songs
        latest_songs = list(user.songs.order_by('-created_at')[:5])
        
        if not latest_songs:
            logger.warning(f"No songs found for user {user.id}")
            return get_hardcoded_recommendations(limit)
        
        # Format songs for API request
        formatted_songs = []
        for song in latest_songs:
            formatted_songs.append({
                "spotify_id": song.spotify_id,
                "title": song.title, 
                "artist": song.artist
            })
            
        # First try to get recommendations from Hugging Face API
        hf_recommendations = get_recommendations_from_hf(formatted_songs, limit)
        
        if hf_recommendations and len(hf_recommendations) >= 3:  # Ensure we have a reasonable number of recommendations
            logger.info(f"Successfully got {len(hf_recommendations)} recommendations from Hugging Face API")
            
            # Cache these recommendations
            if hasattr(user, 'music_profile'):
                user.music_profile.cached_recommendations = hf_recommendations
                user.music_profile.last_recommendation_generated = timezone.now()
                user.music_profile.save(update_fields=['cached_recommendations', 'last_recommendation_generated'])
                logger.info(f"Cached {len(hf_recommendations)} recommendations for user {user.id}")
            
            return hf_recommendations
        else:
            logger.info("Hugging Face recommendations unavailable or insufficient, falling back to local system")
        
        # Fall back to local recommendation logic if API fails
        recommender = get_recommender()
        
        # Get user's top genres
        from .models import Song
        top_genres = Song.objects.filter(user=user)\
            .values('genre')\
            .annotate(count=Count('id'))\
            .order_by('-count')[:3]
        
        # Get recommendations from multiple sources
        all_recommendations = []
        
        # 1. Content-based recommendations from recent songs
        for song in latest_songs:
            if song.spotify_id:
                song_recommendations = recommender.find_similar_songs(song.spotify_id, n=20)
                if song_recommendations:
                    all_recommendations.extend(song_recommendations)
        
        # 2. Genre-based recommendations
        for genre in top_genres:
            if genre['genre'] and genre['genre'] != 'Unknown':
                genre_recommendations = recommender.get_recommendations_by_genre(genre['genre'], n=10)
                if genre_recommendations:
                    all_recommendations.extend(genre_recommendations)
        
        # 3. Popular songs as fallback
        if not all_recommendations:
            return recommender.get_popular_songs(limit)
        
        # Group by song title and count occurrences
        recommendation_dict = {}
        for rec in all_recommendations:
            title = rec['title']
            if title in recommendation_dict:
                recommendation_dict[title]['count'] = recommendation_dict[title].get('count', 1) + 1
            else:
                rec['count'] = 1
                recommendation_dict[title] = rec
        
        # Convert back to list and sort by count and popularity
        final_recommendations = list(recommendation_dict.values())
        final_recommendations.sort(key=lambda x: (x.get('count', 0), x.get('popularity', 0)), reverse=True)
        
        # Remove count field and return top recommendations
        for rec in final_recommendations:
            if 'count' in rec:
                del rec['count']
        
        # Cache these recommendations
        if hasattr(user, 'music_profile'):
            user.music_profile.cached_recommendations = final_recommendations
            user.music_profile.last_recommendation_generated = timezone.now()
            user.music_profile.save(update_fields=['cached_recommendations', 'last_recommendation_generated'])
            logger.info(f"Cached {len(final_recommendations)} recommendations for user {user.id}")
                
        return final_recommendations[:limit]
    except Exception as e:
        logger.error(f"Error in get_hybrid_recommendations: {e}", exc_info=True)
        return get_hardcoded_recommendations(limit)

def update_user_recommendations(user):
    """
    Update user's recommendations and store them
    """
    try:
        # Get recommendations using the hybrid recommender
        recommendations = get_hybrid_recommendations(user)
        
        if not recommendations:
            return False
        
        # We don't create Song objects for recommendations anymore
        # Just update user's last recommendation time
        if hasattr(user, 'music_profile'):
            user.music_profile.last_recommendation_generated = datetime.now()
            user.music_profile.save(update_fields=['last_recommendation_generated'])
        
        logger.info(f"Got {len(recommendations)} recommendations for user {user.id}")
        return recommendations
        
    except Exception as e:
        logger.error(f"Error updating recommendations: {e}")
        return False

def get_recommendations_from_hf(songs, limit=10):
    """
    Get song recommendations from Hugging Face API
    
    Args:
        songs (list): List of songs to use for recommendations. Each song should be a dict with 
                      spotify_id, title, and artist
        limit (int): Number of recommendations to get
    
    Returns:
        list: List of song recommendations
    """
    import requests
    from django.conf import settings
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Prepare input data for the API
        input_songs = []
        for song in songs[:5]:  # Limit to 5 songs
            input_songs.append({
                "spotify_id": song.get("spotify_id", None),
                "title": song.get("title", None),
                "artist": song.get("artist", None)
            })
        
        # Make a request to the Hugging Face Space API
        hf_api_url = "https://monilm-songporter.hf.space/recommendations/"
        response = requests.post(
            hf_api_url,
            json={"songs": input_songs, "limit": limit},
            headers={"Content-Type": "application/json"},
            timeout=10  # 10 seconds timeout
        )
        
        if response.status_code == 200:
            data = response.json()
            recommendations = data.get('recommendations', [])
            logger.info(f"Successfully retrieved {len(recommendations)} recommendations from Hugging Face API")
            return recommendations
        else:
            logger.warning(f"Failed to get recommendations from Hugging Face API: {response.status_code} {response.text}")
            return []
    except Exception as e:
        logger.error(f"Error fetching recommendations from Hugging Face API: {e}")
        return []