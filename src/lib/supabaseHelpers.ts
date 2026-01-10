import { supabase } from './supabase'

async function fetchInChunks(
  table: string,
  select: string,
  column: string,
  values: any[],
  applyFilters?: (query: any) => any,
  chunkSize = 100
) {
  if (!values || values.length === 0) return []
  const out: any[] = []
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize)
    let query: any = supabase.from(table).select(select).in(column, chunk)
    if (applyFilters && typeof applyFilters === 'function') {
      query = applyFilters(query)
    }
    const { data, error } = await query
    if (error) throw error
    if (data && data.length) out.push(...data)
  }
  return out
}

export { fetchInChunks }
