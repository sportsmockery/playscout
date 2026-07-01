export const FRAME_COUNT = 16
export const TARGET_WIDTH = 768
export const JPEG_QUALITY = 0.8

export async function extractFrames(file: File, count = FRAME_COUNT): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) { reject(new Error('Canvas 2D not supported')); return }

    const frames: string[] = []
    video.preload = 'auto'
    video.muted = true
    video.playsInline = true

    video.onloadedmetadata = () => {
      canvas.width = TARGET_WIDTH
      canvas.height = Math.round(TARGET_WIDTH * (video.videoHeight / video.videoWidth))

      const duration = video.duration
      if (!isFinite(duration) || duration <= 0) {
        reject(new Error('Could not read video duration')); return
      }

      const interval = duration / (count + 1)
      let currentFrame = 0

      const captureNext = () => {
        if (currentFrame >= count) {
          URL.revokeObjectURL(video.src)
          resolve(frames)
          return
        }
        video.currentTime = interval * (currentFrame + 1)
      }

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        frames.push(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
        currentFrame++
        captureNext()
      }

      captureNext()
    }

    video.onerror = () => reject(new Error('Failed to load video'))
    video.src = URL.createObjectURL(file)
  })
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}
