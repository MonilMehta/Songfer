from django.test import TestCase
from django.urls import reverse
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework.authtoken.models import Token
from rest_framework import status
from unittest.mock import patch, MagicMock
import tempfile
import os
from datetime import timedelta
import json

from .models import Song, Playlist, UserMusicProfile, SongCache, SongPlay, UserAnalytics, Genre
from .utils import YouTubeAPIError, SpotifyAPIError

User = get_user_model()

class ModelTests(TestCase):
    """Test the model functionality"""
    
    def setUp(self):
        """Set up test data"""
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpassword'
        )
        
        # Create a genre
        self.genre = Genre.objects.create(name='Rock')
        
        # Create a music profile
        self.profile = UserMusicProfile.objects.create(user=self.user)
        self.profile.favorite_genres.add(self.genre)
        
        # Create a song
        self.song = Song.objects.create(
            user=self.user,
            title='Test Song',
            artist='Test Artist',
            album='Test Album',
            file='songs/test.mp3',
            source='youtube',
            song_url='https://youtube.com/watch?v=test'
        )
        
        # Create a playlist
        self.playlist = Playlist.objects.create(
            user=self.user,
            name='Test Playlist',
            source='custom',
            source_url=''
        )
        self.playlist.songs.add(self.song)
    
    def test_user_subscription(self):
        """Test user subscription functionality"""
        # User starts with no subscription
        self.assertFalse(self.user.is_subscription_active())
        
        # Subscribe the user
        self.user.subscribe(months=1)
        self.assertTrue(self.user.is_subscription_active())
        
        # Check end date is roughly 30 days from now
        self.assertAlmostEqual(
            (self.user.subscription_end - timezone.now()).days,
            30,
            delta=1  # Allow 1 day difference for timing
        )
        
        # Cancel subscription
        self.user.cancel_subscription()
        self.assertFalse(self.user.is_subscription_active())
    
    def test_download_limits(self):
        """Test download limits for free and premium users"""
        # Free user should have 5 downloads available
        self.assertEqual(self.user.get_downloads_remaining(), 5)
        
        # Use up downloads
        for i in range(3):
            self.user.increment_download_count()
        
        # Should have 2 left
        self.assertEqual(self.user.get_downloads_remaining(), 2)
        
        # Subscribe user
        self.user.subscribe(months=1)
        
        # Premium user should have 30 - used downloads available
        self.assertEqual(self.user.get_downloads_remaining(), 27)
        
        # Reset daily downloads
        self.user.last_download_reset = timezone.now() - timedelta(days=1)
        self.user._reset_daily_downloads_if_needed()
        
        # Should have 30 now
        self.assertEqual(self.user.get_downloads_remaining(), 30)
    
    def test_song_play_tracking(self):
        """Test song play tracking"""
        # Create a play
        play = SongPlay.objects.create(
            user=self.user,
            song=self.song,
            duration=180,  # 3 minutes
            completed=True
        )
        
        # Check user's listen time was updated
        self.assertEqual(self.user.total_listen_time, 180)
        
        # Create another play
        play2 = SongPlay.objects.create(
            user=self.user,
            song=self.song,
            duration=120,  # 2 minutes
            completed=False
        )
        
        # Check user's listen time was updated again
        self.assertEqual(self.user.total_listen_time, 300)  # 5 minutes total
        
        # Check analytics was created for today
        today = timezone.now().date()
        analytics = UserAnalytics.objects.get(user=self.user, date=today)
        self.assertEqual(analytics.songs_played, 2)
        self.assertEqual(analytics.listening_time, 300)
        
class APITests(APITestCase):
    """Test the API endpoints"""
    
    def setUp(self):
        """Set up test data"""
        # Create users
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpassword'
        )
        self.premium_user = User.objects.create_user(
            username='premiumuser',
            email='premium@example.com',
            password='testpassword'
        )
        self.premium_user.subscribe(months=1)
        
        # Create tokens
        self.token = Token.objects.create(user=self.user)
        self.premium_token = Token.objects.create(user=self.premium_user)
        
        # Set up API client with authentication
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {self.token.key}')
        
        # Create a song for the user
        self.song = Song.objects.create(
            user=self.user,
            title='Test Song',
            artist='Test Artist',
            album='Test Album',
            file='songs/test.mp3',
            source='youtube',
            song_url='https://youtube.com/watch?v=test'
        )
        
        # Create temp file for tests
        self.temp_dir = tempfile.TemporaryDirectory()
        self.temp_file = os.path.join(self.temp_dir.name, 'test.mp3')
        with open(self.temp_file, 'wb') as f:
            f.write(b'test content')
    
    def tearDown(self):
        """Clean up after tests"""
        self.temp_dir.cleanup()
    
    @patch('songs.utils.download_from_youtube')
    def test_download_youtube(self, mock_download):
        """Test downloading from YouTube"""
        # Mock the download function to avoid actual API calls
        mock_download.return_value = {
            'title': 'Mocked Song',
            'uploader': 'Mocked Artist',
            'album': 'Mocked Album',
            'id': 'mockedid'
        }
        
        # Create temporary file to return
        with open(self.temp_file, 'rb') as f:
            mock_download.return_value = {
                'title': 'Mocked Song',
                'uploader': 'Mocked Artist',
                'album': 'Mocked Album',
                'id': 'mockedid'
            }
            
            # Test the endpoint
            url = reverse('song-download')
            response = self.client.post(url, {
                'url': 'https://youtube.com/watch?v=test',
                'format': 'mp3'
            })
            
            # Check response
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            
            # Verify user download count was incremented
            self.user.refresh_from_db()
            self.assertEqual(self.user.daily_downloads, 1)
    
    def test_song_play_recording(self):
        """Test recording a song play"""
        url = reverse('record-play')
        response = self.client.post(url, {
            'song_id': self.song.id,
            'duration': 300,
            'completed': True,
            'device_info': {'device': 'test', 'browser': 'test'}
        })
        
        # Check response
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify play was recorded
        play = SongPlay.objects.get(user=self.user, song=self.song)
        self.assertEqual(play.duration, 300)
        self.assertTrue(play.completed)
        
        # Verify analytics was updated
        analytics = UserAnalytics.objects.get(user=self.user, date=timezone.now().date())
        self.assertEqual(analytics.songs_played, 1)
        self.assertEqual(analytics.listening_time, 300)
    
    def test_user_stats(self):
        """Test retrieving user stats"""
        # Create some song plays
        SongPlay.objects.create(
            user=self.user,
            song=self.song,
            duration=180,
            completed=True
        )
        SongPlay.objects.create(
            user=self.user,
            song=self.song,
            duration=240,
            completed=True
        )
        
        # Get stats
        url = reverse('user-stats')
        response = self.client.get(url)
        
        # Check response
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        # Verify stats contain expected data
        data = response.json()
        self.assertEqual(data['user']['username'], 'testuser')
        self.assertEqual(data['user']['subscription'], False)
        
        # Check top songs
        self.assertEqual(len(data['top_songs']), 1)
        self.assertEqual(data['top_songs'][0]['play_count'], 2)
        self.assertEqual(data['top_songs'][0]['total_time'], 420)
    
    def test_download_limit_exceeded(self):
        """Test API behavior when download limit is exceeded"""
        # Use up all downloads
        self.user.daily_downloads = 5
        self.user.save()
        
        # Try to download
        url = reverse('song-download')
        response = self.client.post(url, {
            'url': 'https://youtube.com/watch?v=test',
            'format': 'mp3'
        })
        
        # Check response indicates limit exceeded
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertIn('error', response.json())
        self.assertEqual(response.json()['error'], 'Daily download limit reached')

class UtilityTests(TestCase):
    """Test utility functions"""
    
    @patch('songs.utils.yt_dlp.YoutubeDL')
    def test_youtube_download_retry(self, mock_ytdl):
        """Test YouTube download retry mechanism"""
        from songs.utils import download_from_youtube
        
        # Configure the mock to fail twice then succeed
        mock_ytdl.return_value.__enter__.return_value.extract_info.side_effect = [
            Exception("API error 1"),
            Exception("API error 2"),
            {'title': 'Success', 'uploader': 'Test Artist'}
        ]
        
        # Call with retry
        result = download_from_youtube('https://youtube.com/watch?v=test', 'output.mp3')
        
        # Should have called extract_info 3 times
        self.assertEqual(mock_ytdl.return_value.__enter__.return_value.extract_info.call_count, 3)
        
        # Should have succeeded on the last attempt
        self.assertEqual(result['title'], 'Success')
        
    @patch('songs.utils.subprocess.run')
    def test_format_conversion(self, mock_run):
        """Test audio format conversion"""
        from songs.utils import convert_audio_format
        
        # Create a temp file
        with tempfile.NamedTemporaryFile(suffix='.mp3') as temp_file:
            # Call the conversion function
            output_path = convert_audio_format(temp_file.name, 'flac')
            
            # Check that subprocess.run was called with correct arguments
            mock_run.assert_called_once()
            args = mock_run.call_args[0][0]
            self.assertEqual(args[0], 'ffmpeg')
            self.assertEqual(args[1], '-i')
            self.assertEqual(args[2], temp_file.name)
            
            # Check output path has correct extension
            self.assertTrue(output_path.endswith('.flac'))
