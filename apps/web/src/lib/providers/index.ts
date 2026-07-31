import { eraiRawsProvider } from './erai-raws'
import { nyaaProvider } from './nyaa'
import { subspleaseProvider } from './subsplease'
import { testSampleProvider } from './test-sample'
import type { ProviderQuery, ProviderResult, TorrentProvider } from './types'

export const providers: TorrentProvider[] = [
  testSampleProvider,
  subspleaseProvider,
  eraiRawsProvider,
  nyaaProvider
]

export function listProviders(): TorrentProvider[] {
  return providers.filter((p) => p.enabled)
}

export async function searchAllProviders(query: ProviderQuery): Promise<{
  results: ProviderResult[]
  errors: Array<{ providerId: string; message: string }>
}> {
  const errors: Array<{ providerId: string; message: string }> = []
  const settled = await Promise.all(
    listProviders().map(async (p) => {
      try {
        const results = await p.search(query)
        return { providerId: p.id, results }
      } catch (e) {
        errors.push({
          providerId: p.id,
          message: e instanceof Error ? e.message : String(e)
        })
        return { providerId: p.id, results: [] as ProviderResult[] }
      }
    })
  )

  const results = settled.flatMap((s) => s.results)
  return { results, errors }
}

export type { ProviderQuery, ProviderResult, TorrentProvider }
export { testSampleProvider, subspleaseProvider, eraiRawsProvider, nyaaProvider }
