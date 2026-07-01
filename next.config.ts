import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg'],
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
