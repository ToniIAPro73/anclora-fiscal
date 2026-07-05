interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/**
 * The API caps pageSize at 100 (see apps/api/src/pagination.ts). List pages
 * that render "everything matching the current filters" (no pagination UI of
 * their own) must walk every page themselves, or results silently truncate
 * at the default pageSize=20 once a tenant has more rows than that.
 */
export async function fetchAllPages<T>(url: string, init?: RequestInit, errorMessage = 'No se pudieron obtener los datos'): Promise<T[]> {
  const pageSize = 100;
  const separator = url.includes('?') ? '&' : '?';
  const items: T[] = [];
  let page = 1;
  for (;;) {
    const response = await fetch(`${url}${separator}page=${page}&pageSize=${pageSize}`, init);
    if (!response.ok) throw new Error(errorMessage);
    const data = await response.json() as PaginatedResponse<T>;
    items.push(...data.items);
    if (items.length >= data.total || data.items.length === 0) break;
    page += 1;
  }
  return items;
}
