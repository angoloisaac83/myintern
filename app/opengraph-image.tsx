import { ImageResponse } from 'next/og'

export const alt = 'Pathway — find your IT placement'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8f7ed',
          color: '#183c32',
          fontFamily: 'Arial, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ position: 'absolute', right: -70, top: -190, width: 540, height: 540, borderRadius: 270, background: '#e8edda' }} />
        <div style={{ position: 'absolute', left: -130, bottom: -260, width: 560, height: 560, borderRadius: 280, background: '#e8edda' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ width: 92, height: 92, borderRadius: 26, background: '#245c48', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2.5L14.4 9.6L21.5 12L14.4 14.4L12 21.5L9.6 14.4L2.5 12L9.6 9.6L12 2.5Z" fill="#F8F7ED" />
                <path d="M19 2L19.9 4.6L22.5 5.5L19.9 6.4L19 9L18.1 6.4L15.5 5.5L18.1 4.6L19 2Z" fill="#D6E59B" />
              </svg>
            </div>
            <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: -5 }}>pathway</div>
          </div>
          <div style={{ marginTop: 28, fontSize: 30, color: '#547065', letterSpacing: 1 }}>
            Find your IT placement
          </div>
        </div>
      </div>
    ),
    size,
  )
}
