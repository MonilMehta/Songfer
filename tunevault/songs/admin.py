from django.contrib import admin
from .models import Song, Playlist, Genre, UserMusicProfile

admin.site.register(Song)
admin.site.register(Playlist)
admin.site.register(Genre)
admin.site.register(UserMusicProfile)
