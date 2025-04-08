from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

# Create the router and register viewsets
router = DefaultRouter()
router.register(r'songs', views.SongViewSet, basename='song')
router.register(r'playlists', views.PlaylistViewSet, basename='playlist')

# Simple URL patterns that just include the router and custom views
urlpatterns = [
    # Include the router URLs which will automatically register @action methods
    path('', include(router.urls)),
    
    # Custom API endpoints
    path('recommendations/', views.RecommendationsAPIView.as_view(), name='recommendations'),
    path('user/profile/', views.UserMusicProfileView.as_view(), name='user-profile'),
    path('user/stats/', views.UserStatsView.as_view(), name='user-stats'),
    path('user/top-artists/', views.UserTopArtistsView.as_view(), name='user-top-artists'),
    path('record-play/', views.RecordPlayView.as_view(), name='record-play'),
    # Add explicit download_all URL pattern
    path('playlists/<int:pk>/download-all/', views.PlaylistViewSet.as_view({'get': 'download_all'}), name='playlist-download-all'),
    # Public download endpoint for unauthorized users
    path('public-download/', views.SongViewSet.as_view({'post': 'public_download_by_url'}), name='public-download-by-url'),
]