/** Shared public trackers used when building magnets and by libtorrent extras. */
export const PUBLIC_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.moeking.me:6969/announce',
  'udp://tracker1.bt.moack.co.kr:80/announce',
  'udp://tracker.tiny-vps.com:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://explodie.org:6969/announce',
  'udp://tracker.theoks.net:6969/announce',
  'http://tracker.opentrackr.org:1337/announce',
  'http://open.stealth.si:80/announce',
  'http://tracker.openbittorrent.com:80/announce',
  'http://tracker.bt4g.com:2095/announce',
  'https://tracker.tamersunion.org:443/announce'
] as const

export function magnetFromInfoHash(hash: string, displayName?: string): string {
  const h = hash.replace(/^urn:btih:/i, '').trim()
  if (!h || h === '<redacted>' || h === '?') {
    throw new Error('Invalid infohash')
  }
  let magnet = `magnet:?xt=urn:btih:${h}`
  if (displayName) magnet += `&dn=${encodeURIComponent(displayName)}`
  for (const tr of PUBLIC_TRACKERS) {
    magnet += `&tr=${encodeURIComponent(tr)}`
  }
  return magnet
}
