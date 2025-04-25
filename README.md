# 🎵 songfer: The Ultimate Playlist & Song Downloader

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Stars](https://img.shields.io/github/stars/MonilMehta/songfer?style=social)](https://github.com/MonilMehta/songfer/stargazers)
[![Issues](https://img.shields.io/github/issues/MonilMehta/songfer)](https://github.com/MonilMehta/songfer/issues)
[![Last Commit](https://img.shields.io/github/last-commit/MonilMehta/songfer)](https://github.com/MonilMehta/songfer/commits/main)

> **songfer: Download Your World of Music**  
> Effortlessly grab songs, albums, and playlists from YouTube & Spotify in high-quality audio, with beautiful cover art and perfect metadata.  
> **Open-source, privacy-first, and built for music lovers.**

---

## 🚀 Why songfer?

- **🎧 Download from YouTube & Spotify:**
  - Instantly fetch any song, album, or playlist as MP3/AAC.
- **📦 Playlist ZIP Downloads:**
  - Download entire playlists in a single click.
- **🖼️ Gorgeous Metadata & Album Art:**
  - Every track comes with ID3 tags and high-res covers.
- **🔒 Account System:**
  - Free users: 15 downloads/day. Subscribers: 50. Free Server Limitations :)
- **🤖 Smart Music Discovery:**
  - Get recommendations tailored to your taste.
- **📊 Personal Dashboard:**
  - Visualize your listening stats and favorites.
- **⚡ Optimized Performance:**
  - Redis-powered caching and queue management for fast, reliable downloads.
- **🚄 Parallel Processing:**
  - Albums download multiple tracks simultaneously for maximum speed.
- **🌈 Modern, Responsive UI:**
  - Built with Next.js, Tailwind CSS, and Django REST API.
- **🌍 Cross-Platform:**
  - Works on Windows, Mac, Linux, and mobile browsers.
- **✨ 100% Open Source:**
  - No ads, no tracking, just music.

---

## 🎬 See It In Action

![songfer Demo](https://raw.githubusercontent.com/MonilMehta/songfer/main/demo/demo.gif)

---

## 📚 Table of Contents
- [Why songfer?](#why-songfer)
- [See It In Action](#see-it-in-action)
- [About](#about)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
  - [Backend Setup (Django)](#backend-setup-django)
  - [Frontend Setup (Next.js)](#frontend-setup-nextjs)
- [Environment Variables](#environment-variables)
- [Usage](#usage)
- [Contributing](#contributing)
- [License](#license)
- [Star History](#star-history)

---

## 🧑‍💻 About

**songfer** was born from a simple idea:  
> _"Music should be accessible, beautiful, and yours to keep—without hassle or compromise."_

Created by [Monil Mehta](mailto:monilmehta5@gmail.com) after realizing there was no simple solution to download entire playlists from YouTube, songfer is a celebration of open-source, music, and community.

---

## ⚙️ How It Works

1. **Paste a YouTube or Spotify URL**
   - Supports tracks, albums, and playlists.
2. **Pick Your Format**
   - MP3 or AAC, always high quality.
3. **Download & Enjoy**
   - Tracks are tagged, zipped (if playlist), and delivered with cover art.
4. **Explore Your Dashboard**
   - See your stats, get recommendations, and manage your music.

**Technical Magic:**
- **Redis Caching:** Lightning-fast response times by caching frequent queries and results
- **Task Queue Management:** Background processing of downloads using Redis and Celery
- **Parallel Processing:** Downloads album tracks simultaneously for much faster delivery
- **Smart Resource Management:** Efficient handling of large playlists without overloading the server

---

## 🏗️ Getting Started

### Backend Setup (Django)

```sh
# 1. Clone the repository
   git clone https://github.com/MonilMehta/songfer.git
   cd songfer/backend

# 2. Install dependencies
   pip install -r requirements.txt

# 3. Configure environment variables
   copy .env.example .env
   # Edit .env as needed (see below)

# 4. Apply migrations & collect static files
   python manage.py migrate
   python manage.py collectstatic --no-input

# 5. Run the backend server
   python manage.py runserver
```

### Frontend Setup (Next.js)

```sh
# 1. Go to frontend
   cd ../frontend/tunevaults

# 2. Install dependencies
   npm install --force

# 3. Configure environment variables
   copy .env.example .env.local
   # Edit .env.local as needed (see below)

# 4. Run the frontend
   npm run dev
```

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
- `SECRET_KEY` – Django secret key
- `DEBUG` – Set to `True` for development
- `SPOTIFY_CLIENT_ID` – Your Spotify API client ID
- `SPOTIFY_CLIENT_SECRET` – Your Spotify API client secret
- `YOUTUBE_API_KEY` – (Optional) YouTube Data API key for enhanced metadata
- `REDIS_URL` – Redis connection string for caching and task queuing

### Frontend (`frontend/tunevaults/.env.local`)
- `NEXT_PUBLIC_YOUTUBE` – YouTube Data API key (for playlist/track previews)
- `NEXT_PUBLIC_APP_URL` – Your frontend base URL (e.g., `http://localhost:3000`)

---

## 💡 Usage

- **Download a Song:** Paste a YouTube or Spotify link, pick format, and download.
- **Download a Playlist:** Paste a playlist URL, download all tracks as a ZIP.
- **Get Recommendations:** Visit your dashboard for music suggestions.
- **Upgrade Subscription:** Unlock unlimited downloads in your profile.

---

## 🌟 Star History

[![Star History Chart](https://api.star-history.com/svg?repos=MonilMehta/songfer&type=Date)](https://star-history.com/#MonilMehta/songfer)

---

## 🤝 Contributing

Pull requests are welcome!  
Open an issue to discuss your ideas or improvements.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

## 🔍 SEO Keywords

YouTube downloader, Spotify downloader, playlist downloader, YouTube playlist downloader, Spotify playlist downloader, MP3 downloader, AAC downloader, music downloader, open source, Django, Next.js, high quality, album art, ID3 tags, ZIP download, music recommendations, free music downloader, songfer

---

## 📝 Credits

- Built by [Monil Mehta](mailto:monilmehta5@gmail.com)
- Thanks to all contributors and open-source libraries.

---

> **Experience music freedom. Download, discover, and own your playlists with songfer!**

---

<p align="center">
  <img src="https://raw.githubusercontent.com/MonilMehta/songfer/main/demo/demo.gif" width="600" alt="songfer demo animation"/>
</p>

<p align="center">
  <b>⭐ Star this repo to support open music! ⭐</b>
</p>
