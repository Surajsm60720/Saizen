'use client'

import Link from 'next/link'
import { PageHeader } from '@/components/saizen'
import { APP_VERSION_LABEL, CHANGELOG } from '@/lib/version'
import { ChevronLeft } from 'lucide-react'

export default function ChangelogPage() {
  return (
    <>
      <div className="mb-3">
        <Link
          href="/app/settings/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Settings
        </Link>
      </div>
      <PageHeader
        title="Changelog"
        dense
        description={`${APP_VERSION_LABEL} — what’s new in Saizen.`}
      />

      <div className="space-y-6">
        {CHANGELOG.map((entry) => (
          <article
            key={entry.version}
            className="rounded-2xl border border-border/60 bg-card/30 px-4 py-4"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-section text-[1.25rem]">
                v{entry.version}
                <span className="ml-2 text-base text-muted-foreground">{entry.title}</span>
              </h2>
              <time className="text-xs text-muted-foreground">{entry.date}</time>
            </div>
            <ul className="mt-3 space-y-2">
              {entry.highlights.map((h) => (
                <li
                  key={h}
                  className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                >
                  <span className="mt-2 size-1 shrink-0 rounded-full bg-primary/80" />
                  <span className="text-foreground/85">{h}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </>
  )
}
