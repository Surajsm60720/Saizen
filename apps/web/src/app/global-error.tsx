'use client'

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#141416',
          color: '#f4f0e8',
          fontFamily: 'system-ui, sans-serif',
          padding: 24
        }}
      >
        <div style={{ maxWidth: 360, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Something went wrong</h1>
          <p style={{ opacity: 0.7, fontSize: 14, margin: '0 0 20px', lineHeight: 1.45 }}>
            {error.message || 'An unexpected error occurred.'}
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              background: '#e8c478',
              color: '#141416',
              border: 0,
              borderRadius: 10,
              padding: '10px 18px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  )
}
