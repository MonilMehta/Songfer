from django.urls import path
from .views import (
    SongViewSet, 
    PlaylistViewSet, 
    UserMusicProfileView, 
    UserTopArtistsView, 
    UserRecommendationsView
)

urlpatterns = [
    # Song URLs
    path('songs/', SongViewSet.as_view({'get': 'list', 'post': 'create'}), name='song-list'),
    path('songs/<int:pk>/', SongViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'}), name='song-detail'),
    path('songs/download/', SongViewSet.as_view({'post': 'download'}), name='song-download'),

    # Playlist URLs
    path('playlists/', PlaylistViewSet.as_view({'get': 'list', 'post': 'create'}), name='playlist-list'),
    path('playlists/<int:pk>/', PlaylistViewSet.as_view({'get': 'retrieve', 'put': 'update', 'delete': 'destroy'}), name='playlist-detail'),
    path('playlists/<int:pk>/add_song/', PlaylistViewSet.as_view({'post': 'add_song'}), name='playlist-add-song'),
    path('playlists/<int:pk>/remove_song/', PlaylistViewSet.as_view({'post': 'remove_song'}), name='playlist-remove-song'),

    # User Music Profile URLs
    path('profile/', UserMusicProfileView.as_view(), name='user-music-profile'),
    path('top-artists/', UserTopArtistsView.as_view(), name='user-top-artists'),
    path('recommendations/', UserRecommendationsView.as_view(), name='user-recommendations'),
]

