import { toBlob } from 'html-to-image'
import type { GraphDocument, GraphNode } from './types'
import { getExportBounds, sanitizeDocument } from './graphUtils'

const readEdgeBounds = (element: HTMLElement) => {
  const boxes = [...element.querySelectorAll<SVGGraphicsElement>('.react-flow__edge-path, .react-flow__edge-textwrapper')]
    .flatMap((item) => {
      try {
        const box = item.getBBox()
        return Number.isFinite(box.x + box.y + box.width + box.height) ? [box] : []
      } catch {
        return []
      }
    })
  if (!boxes.length) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  // Keep arrowheads, strokes and antialiasing away from the PNG boundary.
  const markerAllowance = 12
  return {
    x: left - markerAllowance,
    y: top - markerAllowance,
    width: right - left + markerAllowance * 2,
    height: bottom - top + markerAllowance * 2,
  }
}

export const renderGraphToBlob = async (element: HTMLElement, nodes: GraphNode[]) => {
  const bounds = getExportBounds(nodes, 48, 2048, readEdgeBounds(element))
  const exportWidth = Math.ceil(bounds.width * bounds.scale)
  const exportHeight = Math.ceil(bounds.height * bounds.scale)
  const originalStyle = element.style.cssText
  const hadExportingClass = element.classList.contains('exporting')
  element.classList.add('exporting')
  element.style.transformOrigin = '0 0'
  element.style.transform = `translate(${-bounds.x * bounds.scale}px, ${-bounds.y * bounds.scale}px) scale(${bounds.scale})`
  element.style.width = `${exportWidth}px`
  element.style.height = `${exportHeight}px`
  try {
    if (document.fonts?.ready) await document.fonts.ready
    const blob = await toBlob(element, {
      backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#ffffff',
      width: exportWidth,
      height: exportHeight,
      pixelRatio: 1,
      cacheBust: true,
    })
    if (!blob) throw new Error('PNG generation returned no data')
    return blob
  } finally {
    element.style.cssText = originalStyle
    if (!hadExportingClass) element.classList.remove('exporting')
  }
}

export const copyBlobToClipboard = async (blob: Blob) => {
  if (!navigator.clipboard || typeof ClipboardItem === 'undefined') return false
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return true
  } catch {
    return false
  }
}

export const graphJsonFileName = (name: string) => {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${slug || 'opengraph'}.json`
}

export const documentToJsonBlob = (document: GraphDocument) =>
  new Blob([JSON.stringify(document, null, 2)], { type: 'application/json' })

// The mirror of documentToJsonBlob: anything that isn't valid JSON describing
// a graph document comes back null instead of throwing, so callers can show
// one calm error path. Reuses the same integrity boundary as persisted state.
export const parseDocumentJson = (text: string): GraphDocument | null => {
  try {
    return sanitizeDocument(JSON.parse(text))
  } catch {
    return null
  }
}

export const downloadBlob = (blob: Blob, filename = 'opengraph.png') => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
    anchor.remove()
  }, 0)
}
