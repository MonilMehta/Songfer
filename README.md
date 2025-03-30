Instuctions

# Playlist Download Enhancements & User Subscription System

## 1. Embed Song Metadata Using ID3
### **Objective:**
Enhance downloaded songs by embedding metadata using ID3 tags, including:
- Thumbnail (Album Art)
- Song Artist Name
- Song Name
- Album Name
- Genre and other relevant metadata

### **Steps to Implement:**
1. **Extract metadata from the source:**
   - Retrieve song details such as artist name, song title, album, and cover image.
2. **Use an ID3 tagging library (like mutagen or eyed3) to embed metadata:**
   - Load the downloaded MP3 file.
   - Apply metadata fields.
   - Save the updated MP3 file with the metadata.
3. **Validate the changes:**
   - Verify metadata using a media player or ID3 tag reader.

---

## 2. Add Subscription System
### **Objective:**
Introduce a subscription field in the user model to manage download limits:
- **Subscribed users:** Unlimited downloads
- **Non-subscribed users:** Limited to 10 downloads per day

### **Steps to Implement:**
1. **Modify the user model:**
   - Add a boolean field `subscribed` (default: `False`).
2. **Implement download tracking:**
   - Track the number of downloads per user daily.
   - Reset count at midnight.
3. **Enforce limits:**
   - If `subscribed=True`, allow unlimited downloads.
   - If `subscribed=False` and limit reached, restrict further downloads.
4. **Create subscription management interface:**
   - Provide an endpoint/UI for users to upgrade their subscription.

---

## 3. Implement Recommendation System
### **Objective:**
Generate music recommendations based on a user's last 5 downloaded songs.

### **Steps to Implement:**
1. **Track user downloads:**
   - Maintain a history of the last 5 downloaded songs per user.
2. **Fetch song metadata:**
   - Extract track names, artists, and genres.
3. **Use Spotify API for recommendations:**
   - Authenticate using Spotify API.
   - Retrieve related tracks using Spotipy.
4. **Implement content-based filtering:**
   - Compute similarity using song features like danceability, energy, tempo, etc.
5. **Hybrid recommendation approach:**
   - Combine content-based filtering with popularity scores.
6. **Deliver recommendations:**
   - Return top recommended songs based on user’s download history.

   You may use some type of this code
   # -*- coding: utf-8 -*-
"""Spotify Recommendation system.ipynb

"""

import requests
import base64

# Client ID and Client Secret
CLIENT_ID = 'Use your client ID' #clien_id
CLIENT_SECRET = 'Use your client secret' #client_secret

# Use Base64 to encode the client ID and client secret
credentials = f"{CLIENT_ID}:{CLIENT_SECRET}"
credentials_base64 = base64.b64encode(credentials.encode())

# Make a request for the access token
token_url = 'https://accounts.spotify.com/api/token'
headers = {
    'Authorization': f'Basic {credentials_base64.decode()}'
}
data = {
    'grant_type': 'client_credentials'
}
response = requests.post(token_url, data=data, headers=headers)

if response.status_code == 200:
    access_token = response.json()['access_token']
    print("Access token success.")
else:
    print("Access token not obtained.")
    exit()

!pip install spotipy

"""Define a function responsible for collecting music data from any playlist on Spotify using the Spotipy library:"""

import pandas as pd
import spotipy
from spotipy.oauth2 import SpotifyOAuth

def get_playlist_data(playlist_id, access_token):
    # Set up Spotipy with the access token
    sp = spotipy.Spotify(auth=access_token)

    # Get the tracks from the playlist
    playlist_tracks = sp.playlist_tracks(playlist_id, fields='items(track(id, name, artists, album(id, name)))')

    # Extract relevant information and store in a list of dictionaries
    music_data = []
    for track_info in playlist_tracks['items']:
        track = track_info['track']
        track_name = track['name']
        artists = ', '.join([artist['name'] for artist in track['artists']])
        album_name = track['album']['name']
        album_id = track['album']['id']
        track_id = track['id']

        try:
            # Get audio features for the track
            audio_features = sp.audio_features(track_id)[0] if track_id else None

            # Get release date of the album
            album_info = sp.album(album_id) if album_id else None
            release_date = album_info['release_date'] if album_info else None

            # Get popularity of the track
            track_info = sp.track(track_id) if track_id else None
            popularity = track_info['popularity'] if track_info else None

            # Add additional track information to the track data
            track_data = {
                'Track Name': track_name,
                'Artists': artists,
                'Album Name': album_name,
                'Album ID': album_id,
                'Track ID': track_id,
                'Popularity': popularity,
                'Release Date': release_date,
                'Duration (ms)': audio_features['duration_ms'] if audio_features else None,
                'Explicit': track_info.get('explicit', None),
                'External URLs': track_info.get('external_urls', {}).get('spotify', None),
                'Danceability': audio_features['danceability'] if audio_features else None,
                'Energy': audio_features['energy'] if audio_features else None,
                'Key': audio_features['key'] if audio_features else None,
                'Loudness': audio_features['loudness'] if audio_features else None,
                'Mode': audio_features['mode'] if audio_features else None,
                'Speechiness': audio_features['speechiness'] if audio_features else None,
                'Acousticness': audio_features['acousticness'] if audio_features else None,
                'Instrumentalness': audio_features['instrumentalness'] if audio_features else None,
                'Liveness': audio_features['liveness'] if audio_features else None,
                'Valence': audio_features['valence'] if audio_features else None,
                'Tempo': audio_features['tempo'] if audio_features else None,
                # Add more attributes as needed
            }

            music_data.append(track_data)
        except Exception as e:
            print(f"Error processing track {track_name}: {str(e)}")

    # Create a pandas DataFrame from the list of dictionaries
    df = pd.DataFrame(music_data)

    return df

playlist_id = '3ymQqPtFEu1bn0ZEJD5oIu'

# Call the function to get the music data from the playlist and store it in a DataFrame
music_df = get_playlist_data(playlist_id, access_token)

# Display the DataFrame
print(music_df)

print(music_df.isnull().sum())

""" Building a music recommendation system using Python"""

print(music_df['Track Name'])

#import the necessary Python libraries now
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import MinMaxScaler
from datetime import datetime
from sklearn.metrics.pairwise import cosine_similarity

data = music_df

# Function to calculate weighted popularity scores based on release date
def calculate_weighted_popularity(release_date):
    # Convert the release date to datetime object
    release_date = datetime.strptime(release_date, '%Y-%m-%d')

    # Calculate the time span between release date and today's date
    time_span = datetime.now() - release_date

    # Calculate the weighted popularity score based on time span (e.g., more recent releases have higher weight)
    weight = 1 / (time_span.days + 1)
    return weight

# Normalize the music features using Min-Max scaling
scaler = MinMaxScaler()
music_features = music_df[['Danceability', 'Energy', 'Key',
                           'Loudness', 'Mode', 'Speechiness', 'Acousticness',
                           'Instrumentalness', 'Liveness', 'Valence', 'Tempo']].values
music_features_scaled = scaler.fit_transform(music_features)

# a function to get content-based recommendations based on music features
def content_based_recommendations(input_song_name, num_recommendations=5):
    if input_song_name not in music_df['Track Name'].values:
        print(f"'{input_song_name}' not found in the dataset. Please enter a valid song name.")
        return

    # Get the index of the input song in the music DataFrame
    input_song_index = music_df[music_df['Track Name'] == input_song_name].index[0]

    # Calculate the similarity scores based on music features (cosine similarity)
    similarity_scores = cosine_similarity([music_features_scaled[input_song_index]], music_features_scaled)

    # Get the indices of the most similar songs
    similar_song_indices = similarity_scores.argsort()[0][::-1][1:num_recommendations + 1]

    # Get the names of the most similar songs based on content-based filtering
    content_based_recommendations = music_df.iloc[similar_song_indices][['Track Name', 'Artists', 'Album Name', 'Release Date', 'Popularity']]

    return content_based_recommendations

# a function to get hybrid recommendations based on weighted popularity
def hybrid_recommendations(input_song_name, num_recommendations=5, alpha=0.5):
    if input_song_name not in music_df['Track Name'].values:
        print(f"'{input_song_name}' not found in the dataset. Please enter a valid song name.")
        return

    # Get content-based recommendations
    content_based_rec = content_based_recommendations(input_song_name, num_recommendations)

    # Get the popularity score of the input song
    popularity_score = music_df.loc[music_df['Track Name'] == input_song_name, 'Popularity'].values[0]

    # Calculate the weighted popularity score
    weighted_popularity_score = popularity_score * calculate_weighted_popularity(music_df.loc[music_df['Track Name'] == input_song_name, 'Release Date'].values[0])

    # Combine content-based and popularity-based recommendations based on weighted popularity
    hybrid_recommendations = content_based_rec
    hybrid_recommendations = hybrid_recommendations.append({
        'Track Name': input_song_name,
        'Artists': music_df.loc[music_df['Track Name'] == input_song_name, 'Artists'].values[0],
        'Album Name': music_df.loc[music_df['Track Name'] == input_song_name, 'Album Name'].values[0],
        'Release Date': music_df.loc[music_df['Track Name'] == input_song_name, 'Release Date'].values[0],
        'Popularity': weighted_popularity_score
    }, ignore_index=True)

    # Sort the hybrid recommendations based on weighted popularity score
    hybrid_recommendations = hybrid_recommendations.sort_values(by='Popularity', ascending=False)

    # Remove the input song from the recommendations
    hybrid_recommendations = hybrid_recommendations[hybrid_recommendations['Track Name'] != input_song_name]


    return hybrid_recommendations

input_song_name = "Tested, Approved & Trusted"
recommendations = hybrid_recommendations(input_song_name, num_recommendations=5)
print(f"Hybrid recommended songs for '{input_song_name}':")
print(recommendations)

input_song_name = "Rock Your Body"
recommendations = hybrid_recommendations(input_song_name, num_recommendations=5)
print(f"Hybrid recommended songs for '{input_song_name}':")
print(recommendations)


---

## 4. Implement Song Status Check Endpoint (Low Priority)
### **Objective:**
Allow users to check the status of their downloads.

### **Steps to Implement:**
1. **Track ongoing downloads:**
   - Store progress updates for active downloads.
2. **Create an endpoint to fetch status:**
   - Allow users to query download progress.
3. **Return progress response:**
   - Provide information on file size, percentage completed, and estimated time.

---

## 5. Implement Download Song Endpoint
### **Objective:**
Provide users with an endpoint to download MP3 files or ZIP archives.

### **Steps to Implement:**
1. **Validate user limits (if applicable):**
   - Ensure non-subscribed users stay within daily limits.
2. **Retrieve song URL and metadata:**
   - Fetch the required song file.
3. **Serve the file for download:**
   - Allow direct download of an MP3 or provide a ZIP file for multiple downloads.
4. **Monitor and log downloads:**
   - Maintain logs for analytics and debugging.

---

## **Final Notes:**
- Prioritize embedding metadata and implementing subscription restrictions.
- The recommendation system can be improved over time.
- Song status check and ZIP download can be handled later as a low-priority feature.

