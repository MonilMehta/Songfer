/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'img.youtube.com',
        },
        {
          protocol: 'https',
          hostname: 'image-cdn-ak.spotifycdn.com',
        },
        {
          protocol: 'https',
          hostname: 'i.ytimg.com',
        },
        {
          protocol: 'https',
          hostname: 'i.scdn.co',
        },
        {
          protocol: 'https',
          hostname: 'is1-ssl.mzstatic.com',
        },
        {
          protocol: 'https',
          hostname: 'media.istockphoto.com',
        },
        {
          protocol: 'http',
          hostname: 'localhost',
          port: '8000',
        },
        {
          protocol: 'https',
          hostname: 'source.unsplash.com',
        },
        {
          protocol: 'https',
          hostname: 'api.dicebear.com',
        },
      ],
    },
  };
  
  export default nextConfig;
  