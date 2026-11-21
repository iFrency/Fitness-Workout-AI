import { CATALOG_URL } from './constants'
import { CatalogError, parseCatalog, type Exercise } from './types'

export async function loadCatalog(url: string = CATALOG_URL): Promise<readonly Exercise[]> {
  const response = await fetch(url)
  if (!response.ok) throw new CatalogError(`动作库加载失败: ${response.status}`)
  return parseCatalog(await response.json())
}
