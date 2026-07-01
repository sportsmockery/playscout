import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'fluent-ffmpeg', 'pdf-parse', 'mammoth', 'pptx2json'],
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
