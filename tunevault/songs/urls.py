from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SongViewSet, 
    PlaylistViewSet, 
    UserMusicProfileView, 
    UserTopArtistsView, 
    UserRecommendationsView
)

router = DefaultRouter()
router.register(r'songs', SongViewSet, basename='song')
router.register(r'playlists', PlaylistViewSet, basename='playlist')

urlpatterns = [
    path('', include(router.urls)),
    path('user/music-profile/', UserMusicProfileView.as_view(), name='user-music-profile'),
    path('user/top-artists/', UserTopArtistsView.as_view(), name='user-top-artists'),
    path('user/recommendations/', UserRecommendationsView.as_view(), name='user-recommendations'),
]