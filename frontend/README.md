# 🎵 songfer Frontend

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../LICENSE)
[![Stars](https://img.shields.io/github/stars/MonilMehta/songfer?style=social)](https://github.com/MonilMehta/songfer/stargazers)

> **The modern, beautiful web interface for songfer.**

---

## ✨ Features
- Next.js 14, React, and Tailwind CSS for a blazing-fast, responsive UI
- Download songs, albums, and playlists from YouTube & Spotify
- User authentication, dashboard, and subscription management
- Animated song previews, album art, and real-time download status
- Mobile-first, dark mode, and accessibility support

---

## 🚀 Getting Started

```sh
# 1. Install dependencies
npm install --force

# 2. Configure environment variables
cp .env.example .env.local
# Edit .env.local as needed (see below)

# 3. Run the frontend
npm run dev
```

---

## 🔑 Environment Variables (`.env.local`)
- `NEXT_PUBLIC_YOUTUBE` – YouTube Data API key (for playlist/track previews)
- `NEXT_PUBLIC_APP_URL` – Your frontend base URL (e.g., `http://localhost:3000`)
- `NEXT_PUBLIC_BACKEND_URL` – Backend API URL (e.g., `http://localhost:8000`)

---

## 📁 Structure
- `app/` – Main Next.js app routes and pages
- `components/` – UI and logic components
- `hooks/` – Custom React hooks
- `lib/` – Utility functions
- `public/` – Static assets
- `styles/` – CSS and Tailwind config
- `types/` – TypeScript types
- `utils/` – API and media helpers

---

## 🛠️ Tech Stack
- [Next.js](https://nextjs.org/)
- [React](https://react.dev/)
- [Tailwind CSS](https://tailwindcss.com/)
- [TypeScript](https://www.typescriptlang.org/)

---

## 🤝 Contributing
Pull requests are welcome! Open an issue to discuss improvements.

---

> **This is the frontend for songfer. For backend, see ../backend.**