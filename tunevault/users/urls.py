from django.urls import path
from .views import UserRegistrationView, CustomObtainAuthToken

urlpatterns = [
    path('register/', UserRegistrationView.as_view(), name='register'),
    path('login/', CustomObtainAuthToken.as_view(), name='login'),
]

