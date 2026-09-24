import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  advanceContinueAfterCompletion,
  dropIdsFromListEntries,
  reconcileContinueWatching,
  type ContinueEntryLike
} from './continueReconcile.ts'

function entry(
  anilistId: number,
  episode: number,
  updatedAt: number,
  title = `Title ${anilistId}`
): ContinueEntryLike {
  return { anilistId, title, episode, updatedAt }
}

describe('dropIdsFromListEntries', () => {
  it('drops COMPLETED and DROPPED titles, plus progress that finished the series', () => {
    const ids = dropIdsFromListEntries([
      { status: 'CURRENT', progress: 3, media: { id: 1, episodes: 12 } },
      { status: 'COMPLETED', progress: 12, media: { id: 2, episodes: 12 } },
      { status: 'DROPPED', progress: 2, media: { id: 3, episodes: 12 } },
      { status: 'CURRENT', progress: 24, media: { id: 4, episodes: 24 } },
      { status: 'PAUSED', progress: 5, media: { id: 5, episodes: 12 } }
    ])
    assert.deepEqual(ids.sort((a, b) => a - b), [2, 3, 4])
  })
})

describe('reconcileContinueWatching', () => {
  it('removes a local continue card when the list marks the title completed', () => {
    const merged = reconcileContinueWatching(
      [entry(99, 4, 9_000)],
      [],
      [99]
    )
    assert.deepEqual(merged, [])
  })

  it('keeps local-only titles that are not on the finished list', () => {
    const local = [entry(7, 2, 50)]
    const merged = reconcileContinueWatching(local, [], [])
    assert.deepEqual(merged, local)
  })

  it('prefers the later episode when AniList progress is ahead of a stale local play', () => {
    const merged = reconcileContinueWatching(
      [entry(10, 3, 8_000)],
      [entry(10, 8, 1_000)],
      []
    )
    assert.equal(merged.length, 1)
    assert.equal(merged[0]?.anilistId, 10)
    assert.equal(merged[0]?.episode, 8)
  })
})

describe('advanceContinueAfterCompletion', () => {
  it('removes the card after the final episode is marked watched', () => {
    const next = advanceContinueAfterCompletion(entry(1, 12, 1), 12, 12, 99)
    assert.equal(next, 'remove')
  })

  it('moves the card to the next episode when more remain', () => {
    const next = advanceContinueAfterCompletion(entry(1, 4, 1), 4, 12, 99)
    assert.deepEqual(next, { anilistId: 1, title: 'Title 1', episode: 5, updatedAt: 99 })
  })
})
