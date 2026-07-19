import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['ffmpeg-static', 'pdf-parse', 'mammoth', 'pptx2json'],
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
