'use client'

import { AdultModeGate } from '@/components/saizen'
import { ModulesManager } from '../../modules/ModulesManager'

export default function AdultModulesPage() {
  return (
    <AdultModeGate>
      <ModulesManager scope="nsfw" />
    </AdultModeGate>
  )
}
