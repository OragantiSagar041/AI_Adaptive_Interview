import { useMemo } from 'react'
import { getComputedStatus } from '../utils/adminFormatters'

export function useCandidateFilters({
  candidates,
  searchTerm,
  startDate,
  endDate,
  statusFilter,
  sortBy,
  currentPage,
  pageSize,
}) {
  const filteredCandidates = useMemo(() => {
    return candidates.filter(c => {
      const name = (c.candidate_name || '').toLowerCase()
      const email = (c.candidate_email || '').toLowerCase()
      const position = (c.interview_title || '').toLowerCase()
      const query = searchTerm.toLowerCase()

      const matchesSearch = name.includes(query) || email.includes(query) || position.includes(query)
      if (!matchesSearch) return false

      const computedStatus = getComputedStatus(c)
      if (statusFilter !== 'all') {
        if (statusFilter === 'pending') {
          if (computedStatus !== 'pending' && computedStatus !== 'started') return false
        } else if (computedStatus !== statusFilter) {
          return false
        }
      }

      const createdDate = new Date(c.created_at)
      if (startDate && createdDate < new Date(startDate)) return false
      if (endDate) {
        const endDateTime = new Date(endDate)
        endDateTime.setHours(23, 59, 59, 999)
        if (createdDate > endDateTime) return false
      }

      return true
    })
  }, [candidates, searchTerm, startDate, endDate, statusFilter])

  const sortedCandidates = useMemo(() => {
    return [...filteredCandidates].sort((a, b) => {
      if (sortBy === 'score') {
        return Number(b.score || 0) - Number(a.score || 0)
      }
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [filteredCandidates, sortBy])

  const totalItems = sortedCandidates.length
  const totalPages = Math.ceil(totalItems / pageSize)
  const startIndex = (currentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalItems)
  const paginatedCandidates = sortedCandidates.slice(startIndex, endIndex)

  return {
    filteredCandidates,
    sortedCandidates,
    totalItems,
    totalPages,
    startIndex,
    endIndex,
    paginatedCandidates,
  }
}
