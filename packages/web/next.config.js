/** @type {import('next').NextConfig} */
const nextConfig = {
  swcMinify: true,
  poweredByHeader: false,
  compress: true,
  experimental: {
    serverComponentsExternalPackages: [],
    optimizePackageImports: [
      'lucide-react',
      'recharts',
      'date-fns',
      'framer-motion',
      '@tanstack/react-query',
    ],
  },
  images: {
    domains: ['localhost', 'api.smartstaytv.com', 'images.unsplash.com'],
  },
};

module.exports = nextConfig;
