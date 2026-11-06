/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [],
  },
  images: {
    domains: ['localhost', 'api.smartstaytv.com', 'images.unsplash.com'],
  },
}

module.exports = nextConfig
