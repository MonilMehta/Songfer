import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://songfer.com/',
      lastModified: '2025-04-25',
      changeFrequency: 'weekly',
      priority: 1.0,
    },
    {
      url: 'https://songfer.com/about',
      lastModified: '2025-04-25',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://songfer.com/features',
      lastModified: '2025-04-25',
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: 'https://songfer.com/dashboard',
      lastModified: '2025-04-25',
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: 'https://songfer.com/login',
      lastModified: '2025-04-25',
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: 'https://songfer.com/signup',
      lastModified: '2025-04-25',
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: 'https://songfer.com/pricing',
      lastModified: '2025-04-25',
      changeFrequency: 'monthly',
      priority: 0.6,
    },
    {
      url: 'https://songfer.com/profile',
      lastModified: '2025-04-25',
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]
}
