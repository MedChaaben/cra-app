import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  listReportingFromSearchParams,
  listReportingToSearchParams,
  type ListReportingUrlSlice,
} from '@/lib/reportingPeriod'

export function useListReportingUrl() {
  const [sp, setSp] = useSearchParams()

  const slice = useMemo(() => listReportingFromSearchParams(sp), [sp])

  const commit = useCallback(
    (patch: Partial<ListReportingUrlSlice>) => {
      setSp((prev) => {
        const cur = listReportingFromSearchParams(prev)
        return listReportingToSearchParams({ ...cur, ...patch })
      })
    },
    [setSp],
  )

  return { slice, commit }
}
