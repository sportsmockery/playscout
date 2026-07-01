import { ImageResponse } from 'next/og'
import { readFile } from 'fs/promises'
import path from 'path'

// Node.js runtime (not edge) — fs access for the logo and consistency with
// the rest of the app's server-side rendering. next/og's ImageResponse
// works fine outside the edge runtime.
export const runtime = 'nodejs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  const title = searchParams.get('title') || 'Youth Football Coaching Intelligence'
  const subtitle =
    searchParams.get('subtitle') || 'Film-Driven • Age-Appropriate • Safety First'

  const logoData = await readFile(path.join(process.cwd(), 'public/logo.png'))
  const logoSrc = `data:image/png;base64,${logoData.toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f8f4f4',
          backgroundImage:
            'radial-gradient(circle at 50% 20%, rgba(72,89,149,0.14) 0%, rgba(248,244,244,0) 60%)',
          padding: '60px 80px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            backgroundColor: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(72,89,149,0.16)',
            borderRadius: '28px',
            padding: '64px 90px',
            boxShadow: '0 30px 70px rgba(17,24,39,0.12)',
            maxWidth: '1080px',
            width: '100%',
          }}
        >
          {/* next/og renders via satori — next/image is not supported here */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} width={140} height={153} alt="" style={{ marginBottom: 36 }} />

          <div
            style={{
              display: 'flex',
              fontSize: 60,
              fontWeight: 700,
              color: '#111827',
              textAlign: 'center',
              lineHeight: 1.15,
              marginBottom: 20,
            }}
          >
            {title}
          </div>

          <div
            style={{
              display: 'flex',
              fontSize: 28,
              color: '#6b7280',
              textAlign: 'center',
              marginBottom: 28,
            }}
          >
            {subtitle}
          </div>

          <div
            style={{
              display: 'flex',
              width: 120,
              height: 5,
              background: 'linear-gradient(to right, #485995, #d2c600)',
              borderRadius: 999,
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 40,
            color: '#485995',
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: 0.5,
          }}
        >
          playscout.ai
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
