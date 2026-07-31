#!/usr/bin/env node
/**
 * Capacitor `cap sync` only puts Cordova/npm plugin classes into
 * packageClassList. Local in-app plugins (SaizenTorrent, etc.) must be
 * appended or NSClassFromString never loads them → UNIMPLEMENTED.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = resolve(root, 'apps/mobile/ios/App/App/capacitor.config.json')

const LOCAL_PLUGINS = [
  'SaizenTorrentPlugin',
  'SaizenPlayerPlugin',
  'SaizenAuthPlugin'
]

const config = JSON.parse(readFileSync(configPath, 'utf8'))
const list = Array.isArray(config.packageClassList) ? [...config.packageClassList] : []
let added = 0
for (const name of LOCAL_PLUGINS) {
  if (!list.includes(name)) {
    list.push(name)
    added++
  }
}
config.packageClassList = list
writeFileSync(configPath, JSON.stringify(config, null, '\t') + '\n')
console.log(
  `register-local-ios-plugins: packageClassList = [${list.join(', ')}] (+${added})`
)
