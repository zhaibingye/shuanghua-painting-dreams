import { useQuery } from '@tanstack/react-query'

import { fetchProviderMetadata } from '../api/client'

export function useProviderMetadata() {
  return useQuery({
    queryKey: ['providerMetadata'],
    queryFn: fetchProviderMetadata,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}
