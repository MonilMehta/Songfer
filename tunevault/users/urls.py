from django.urls import path
from .views import (
    UserRegistrationView, 
    CustomObtainAuthToken,
    SubscriptionAPIView,
    DownloadLimitAPIView
)

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', CustomObtainAuthToken.as_view(), name='login'),
    path('subscription/', SubscriptionAPIView.as_view(), name='subscription'),
    path('download-limit/', DownloadLimitAPIView.as_view(), name='download-limit'),
]

