import django_filters
from .models import Song

class SongFilter(django_filters.FilterSet):
    """Filter for Song model"""
    title = django_filters.CharFilter(lookup_expr='icontains')
    artist = django_filters.CharFilter(lookup_expr='icontains')
    album = django_filters.CharFilter(lookup_expr='icontains')
    source = django_filters.CharFilter(lookup_expr='exact')
    is_favorite = django_filters.BooleanFilter()
    created_at_after = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='gte')
    created_at_before = django_filters.DateTimeFilter(field_name='created_at', lookup_expr='lte')
    
    class Meta:
        model = Song
        fields = ['title', 'artist', 'album', 'source', 'is_favorite', 'created_at_after', 'created_at_before'] 