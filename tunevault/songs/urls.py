from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SongViewSet, 
    PlaylistViewSet, 
    UserMusicProfileView, 
    UserTopArtistsView, 
    UserRecommendationsView,
    UserStatsView,
    RecordPlayView
)

# Create the router and register viewsets
router = DefaultRouter()
router.register(r'songs', SongViewSet, basename='song')
router.register(r'playlists', PlaylistViewSet, basename='playlist')

# Simple URL patterns that just include the router and custom views
urlpatterns = [
    # Include the router URLs which will automatically register @action methods
    path('', include(router.urls)),
    
    # Custom API endpoints
    path('user/music-profile/', UserMusicProfileView.as_view(), name='user-music-profile'),
    path('user/top-artists/', UserTopArtistsView.as_view(), name='user-top-artists'),
    path('user/recommendations/', UserRecommendationsView.as_view(), name='user-recommendations'),
    path('user/stats/', UserStatsView.as_view(), name='user-stats'),
    path('record-play/', RecordPlayView.as_view(), name='record-play'),
]