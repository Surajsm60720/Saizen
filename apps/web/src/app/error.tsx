'use client'

export default function Error({
  error,
  reset
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-foreground">Something went wrong</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        {error.message || 'An unexpected error occurred. You can try again without restarting the app.'}
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-xl bg-[#e8c478] px-4 py-2 text-sm font-semibold text-[#141416]"
      >
        Try again
      </button>
    </div>
  )
}
