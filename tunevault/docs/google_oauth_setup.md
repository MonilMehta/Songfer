# Google OAuth Setup Guide for TuneVault

This guide will walk you through setting up Google OAuth for TuneVault.

## 1. Create OAuth Credentials in Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. In the sidebar, go to "APIs & Services" > "Credentials"
4. Click "Create Credentials" and select "OAuth client ID"
5. Select "Web application" as the application type
6. Give your app a name (e.g., "TuneVault")
7. Add authorized JavaScript origins:
   - For development: `http://localhost:8000` and `http://127.0.0.1:8000`
   - For production: Add your production domain
8. Add authorized redirect URIs:
   - For development: `http://localhost:8000/accounts/google/login/callback/` and `http://127.0.0.1:8000/accounts/google/login/callback/`
   - For production: Add your production callback URL
9. Click "Create"
10. Note your Client ID and Client Secret

## 2. Add Credentials to Environment Variables

Add these credentials to your `.env` file:

```
OAUTH_CLIENT_ID=your-client-id
OAUTH_CLIENT_SECRET=your-client-secret
```

## 3. Configure Your Site in Django Admin

1. Go to Django admin at `http://localhost:8000/admin/`
2. Navigate to "Sites" 
3. Edit the existing site (example.com) or create a new one:
   - Domain name: `localhost:8000` (for development) or your production domain
   - Display name: "TuneVault" or your site name
4. Save

## 4. Create Social Application in Django Admin

1. In Django admin, go to "Social Accounts" > "Social applications" 
2. Click "Add Social Application"
3. Fill in:
   - Provider: Select "Google"
   - Name: "Google"  
   - Client id: Your Google Client ID
   - Secret key: Your Google Client Secret
   - Sites: Select your site from step 3
4. Save

## 5. Testing Your Integration

### Using Django-AllAuth Google Authentication

To test the Google authentication:

1. Visit `http://localhost:8000/accounts/google/login/`
2. You'll be redirected to Google's sign-in page
3. After signing in, you'll be redirected back to your site
4. You should now be logged in with your Google account

By default, successful logins will redirect to the URL specified in `LOGIN_REDIRECT_URL` in your settings.py file.

## 6. Frontend Integration

For frontend integration, you can use one of these approaches:

1. **Redirect Flow**: Redirect users to `/accounts/google/login/` and let django-allauth handle everything
   
2. **REST API Integration**: After successful authentication, users will be redirected to your frontend, which can then make regular API calls with session authentication

## 7. Troubleshooting

- **Error: "The redirect URI in the request did not match a registered redirect URI"**
  - Make sure the redirect URI in your Django site exactly matches what you registered in Google Console
  
- **Django Admin shows no social applications**
  - Make sure the correct provider app is installed: `'allauth.socialaccount.providers.google'`

- **Authentication succeeds but user not logged in**
  - Check your SESSION_COOKIE_SECURE and CSRF settings if using HTTPS
  
- **"No social app found" error**
  - Ensure you've created a social application in the Django admin and associated it with your site 