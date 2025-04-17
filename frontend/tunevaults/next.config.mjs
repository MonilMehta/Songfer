/** @type {import('next').NextConfig} */
const nextConfig = {
    images: {
      remotePatterns: [
        {
          protocol: 'https',
          hostname: 'img.youtube.com',
        },
        {
          protocol: 'https',
          hostname: 'i.ytimg.com',
        },
        {
          protocol: 'https',
          hostname: 'source.unsplash.com',
        },
      ],
    },
  };
  
  export default nextConfig;
  