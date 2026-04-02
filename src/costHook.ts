import { useEffect } from 'react'
import { hasConsoleBillingAccess } from './utils/billing.js'
import type { FpsMetrics } from './utils/fpsTracker.js'
const formatTotalCost = (): string => '$0.00'
const saveCurrentSessionCosts = (_fps?: FpsMetrics): void => {}

export function useCostSummary(
  getFpsMetrics?: () => FpsMetrics | undefined,
): void {
  useEffect(() => {
    const f = () => {
      if (hasConsoleBillingAccess()) {
        process.stdout.write('\n' + formatTotalCost() + '\n')
      }

      saveCurrentSessionCosts(getFpsMetrics?.())
    }
    process.on('exit', f)
    return () => {
      process.off('exit', f)
    }
  }, [])
}
