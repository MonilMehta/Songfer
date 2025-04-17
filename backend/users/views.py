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
from datetime import datetime, timedelta
from django.utils import timezone
from django.db.models import Count
import logging
from songs.models import UserAnalytics
import calendar
from collections import OrderedDict

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

class DownloadActivityView(APIView):
    """API view for tracking weekly or monthly download activity"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get download activity for the specified period"""
        period = request.query_params.get('period', 'week')
        
        # Determine the time range based on the period
        end_date = timezone.now().date()
        
        if (period == 'week'):
            # Get data for the past week
            start_date = end_date - timedelta(days=7)
            data = self._get_daily_activity(request.user, start_date, end_date)
            
        elif (period == 'month'):
            # Get data for the past month
            start_date = end_date - timedelta(days=30)
            data = self._get_daily_activity(request.user, start_date, end_date)
            
        elif (period == 'year'):
            # Get data for the past year by month
            start_date = end_date.replace(year=end_date.year - 1)
            data = self._get_monthly_activity(request.user, start_date, end_date)
            
        else:
            return Response({
                'success': False,
                'error': 'Invalid period. Use "week", "month", or "year".'
            }, status=400)
        
        return Response({
            'success': True,
            'period': period,
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'activity_data': data
        })
    
    def _get_daily_activity(self, user, start_date, end_date):
        """Get download activity by day"""
        # Get analytics records for the specified period
        analytics = UserAnalytics.objects.filter(
            user=user,
            date__gte=start_date,
            date__lte=end_date
        ).order_by('date')
        
        # Create a dictionary with all days in the range
        activity_data = OrderedDict()
        current_date = start_date
        while current_date <= end_date:
            date_str = current_date.isoformat()
            activity_data[date_str] = {
                'date': date_str,
                'downloads': 0,
                'day_name': current_date.strftime('%A')
            }
            current_date += timedelta(days=1)
        
        # Fill in the actual download counts
        for record in analytics:
            date_str = record.date.isoformat()
            if date_str in activity_data:
                activity_data[date_str]['downloads'] = record.songs_downloaded
        
        return list(activity_data.values())
    
    def _get_monthly_activity(self, user, start_date, end_date):
        """Get download activity by month"""
        # Get all analytics for the period
        analytics = UserAnalytics.objects.filter(
            user=user,
            date__gte=start_date,
            date__lte=end_date
        )
        
        # Group by month and sum downloads
        monthly_data = {}
        
        for record in analytics:
            month_key = record.date.strftime('%Y-%m')
            if month_key not in monthly_data:
                monthly_data[month_key] = {
                    'month': month_key,
                    'month_name': record.date.strftime('%B %Y'),
                    'downloads': 0
                }
            monthly_data[month_key]['downloads'] += record.songs_downloaded
        
        # Ensure all months in the range are included
        current_date = start_date.replace(day=1)
        while current_date <= end_date:
            month_key = current_date.strftime('%Y-%m')
            if month_key not in monthly_data:
                monthly_data[month_key] = {
                    'month': month_key,
                    'month_name': current_date.strftime('%B %Y'),
                    'downloads': 0
                }
            # Move to the next month
            if current_date.month == 12:
                current_date = current_date.replace(year=current_date.year + 1, month=1)
            else:
                current_date = current_date.replace(month=current_date.month + 1)
        
        # Sort the data by month
        sorted_data = sorted(monthly_data.values(), key=lambda x: x['month'])
        
        return sorted_data

