export function getThemeColor(varName, fallback) {
  if (typeof window === 'undefined' || !window.getComputedStyle) return fallback || ''
  try {
    const val = getComputedStyle(document.documentElement).getPropertyValue(varName)
    if (!val) return fallback || ''
    return val.trim() || (fallback || '')
  } catch (e) {
    return fallback || ''
  }
}

export function rgbaFromCssVar(varName, alpha, fallback) {
  const hex = getThemeColor(varName, '')
  if (!hex) return fallback || ''
  // If var is already rgb/rgba, try to return with alpha
  if (hex.startsWith('rgb')) {
    return hex.replace(/rgba?\(([^)]+)\)/, (m, content) => {
      const parts = content.split(',').map(p => p.trim())
      return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${alpha})`
    })
  }
  // If hex (#rrggbb)
  const h = hex.replace('#', '')
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  if (h.length === 6) {
    const r = parseInt(h.substring(0,2), 16)
    const g = parseInt(h.substring(2,4), 16)
    const b = parseInt(h.substring(4,6), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }
  return fallback || ''
}
