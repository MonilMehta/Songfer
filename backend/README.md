# 🎵 songfer Backend

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)
[![Stars](https://img.shields.io/github/stars/MonilMehta/songfer?style=social)](https://github.com/MonilMehta/songfer/stargazers)

> **The robust Django REST API powering songfer.**

---

## ✨ Features
- Django 4+ REST API for music downloads and user management
- Handles YouTube & Spotify song/playlist downloads
- Embeds metadata, album art, and zips playlists
- User authentication, subscription, and download throttling
- Celery for async tasks and background processing

---

## 🚀 Getting Started

```sh
# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment variables
cp .env.example .env
# Edit .env as needed (see below)

# 3. Apply migrations & collect static files
python manage.py migrate
python manage.py collectstatic --no-input

# 4. Run the backend server
python manage.py runserver
```

---

## 🔑 Environment Variables (`.env`)
- `SECRET_KEY` – Django secret key
- `DEBUG` – Set to `True` for development
- `SPOTIFY_CLIENT_ID` – Your Spotify API client ID
- `SPOTIFY_CLIENT_SECRET` – Your Spotify API client secret
- `YOUTUBE_API_KEY` – (Optional) YouTube Data API key for enhanced metadata

---

## 📁 Structure
- `songfer/` – Django project config and settings
- `songs/` – Music download, metadata, and recommendation logic
- `users/` – User authentication and profile management
- `media/` – Downloaded files, cache, and temp storage

---

## 🛠️ Tech Stack
- [Django](https://www.djangoproject.com/)
- [Django REST Framework](https://www.django-rest-framework.org/)
- [Celery](https://docs.celeryq.dev/)
- [SQLite/PostgreSQL](https://www.postgresql.org/)

---

## 🤝 Contributing
Pull requests are welcome! Open an issue to discuss improvements.

---

> **This is the backend for songfer. For frontend, see ../frontend.**
