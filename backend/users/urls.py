from django.urls import path
from .views import (
    UserRegistrationView, 
    CustomObtainAuthToken,
    SubscriptionAPIView,
    DownloadLimitAPIView,
    DownloadActivityView,
    google_auth
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', CustomObtainAuthToken.as_view(), name='login'),
    path('subscription/', SubscriptionAPIView.as_view(), name='subscription'),
    path('download-limit/', DownloadLimitAPIView.as_view(), name='download-limit'),
    path('download-activity/', DownloadActivityView.as_view(), name='download-activity'),
    path('google-auth/', google_auth, name='google-auth'),  # Add the new endpoint
]

