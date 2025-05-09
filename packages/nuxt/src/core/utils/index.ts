export { getNameFromPath, hasSuffix, resolveComponentNameSegments } from './names'
export { getLoader, isJS, isVue } from './plugins'

export function uniqueBy<T, K extends keyof T> (arr: T[], key: K) {
  if (arr.length < 2) {
    return arr
  }
  const res: T[] = []
  const seen = new Set<T[K]>()
  for (const item of arr) {
    if (seen.has(item[key])) { continue }
    seen.add(item[key])
    res.push(item)
  }
  return res
}

export const QUOTE_RE = /["']/g
export const EXTENSION_RE = /\b\.\w+$/g
export const SX_RE = /\.[tj]sx$/
