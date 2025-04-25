from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from rest_framework import permissions
from drf_yasg.views import get_schema_view
from drf_yasg import openapi
from django.http import HttpResponse


# Create Swagger/OpenAPI schema
api_info = openapi.Info(
    title="Songfer API",
    default_version='v1',
    description="API for Songfer music download and recommendation system",
    terms_of_service="https://www.Songfer.com/terms/",
    contact=openapi.Contact(email="contact@Songfer.com"),
    license=openapi.License(name="MIT License"),
)

schema_view = get_schema_view(
    api_info,
    public=True,
    permission_classes=(permissions.AllowAny,),
)

urlpatterns = [
    path('', lambda request: HttpResponse("OK")),
    path('admin/', admin.site.urls),
    path('api/songs/', include('songs.urls')),
    path('api/users/', include('users.urls')),
    path('accounts/', include('allauth.urls')),
    
    # Swagger documentation
    path('swagger/', schema_view.with_ui('swagger', cache_timeout=0), name='schema-swagger-ui'),
    path('redoc/', schema_view.with_ui('redoc', cache_timeout=0), name='schema-redoc'),
    path('swagger<format>/', schema_view.without_ui(cache_timeout=0), name='schema-json'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

