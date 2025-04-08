from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from .serializers import UserSerializer, UserRegistrationSerializer
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.utils.decorators import method_decorator
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .models import CustomUser

class UserRegistrationView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        token, created = Token.objects.get_or_create(user=user)
        return Response({
            "user": UserSerializer(user, context=self.get_serializer_context()).data,
            "token": token.key
        })

class CustomObtainAuthToken(ObtainAuthToken):
    def post(self, request, *args, **kwargs):
        serializer = self.serializer_class(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.validated_data['user']
        token, created = Token.objects.get_or_create(user=user)
        print(token.key)
        return Response({
            'token': token.key,
            'user_id': user.pk,
            'email': user.email
        })

@method_decorator(login_required, name='dispatch')
class SubscriptionAPIView(APIView):
    """
    API view for managing user subscriptions
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """
        Get subscription details
        """
        user = request.user
        
        return Response({
            'subscribed': user.is_subscription_active(),
            'subscription_start': user.subscription_start,
            'subscription_end': user.subscription_end,
            'daily_downloads': user.daily_downloads,
            'downloads_remaining': user.get_downloads_remaining(),
        })
    
    def post(self, request):
        """
        Subscribe the user
        """
        user = request.user
        months = int(request.data.get('months', 1))
        
        if months < 1:
            return Response({
                'success': False,
                'error': 'Months must be at least 1'
            }, status=status.HTTP_400_BAD_REQUEST)
            
        # In a real application, you would process payment here
        
        # Subscribe the user
        subscription_end = user.subscribe(months)
        
        return Response({
            'success': True,
            'message': f'Successfully subscribed for {months} month(s)',
            'subscription_end': subscription_end,
        })
    
    def delete(self, request):
        """
        Cancel subscription
        """
        user = request.user
        
        # Cancel the subscription
        user.cancel_subscription()
        
        return Response({
            'success': True,
            'message': 'Subscription cancelled successfully'
        })
        
@method_decorator(login_required, name='dispatch')
class DownloadLimitAPIView(APIView):
    """
    API view for checking download limits
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """
        Get download limit details
        """
        user = request.user
        
        return Response({
            'daily_downloads': user.daily_downloads,
            'downloads_remaining': user.get_downloads_remaining(),
            'can_download': user.can_download(),
        })

