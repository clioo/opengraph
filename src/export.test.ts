import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { toBlob } from 'html-to-image'
import { createWorkflowNode } from './graphUtils'
import { copyBlobToClipboard, downloadBlob, renderGraphToBlob } from './export'

vi.mock('html-to-image', () => ({ toBlob: vi.fn() }))

const mockedToBlob = vi.mocked(toBlob)
const png = () => new Blob(['png'], { type: 'image/png' })

describe('graph export', () => {
  beforeEach(() => {
    mockedToBlob.mockReset()
    document.documentElement.style.removeProperty('--canvas')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it('renders with an independent bounds viewport and always restores the element', async () => {
    const element = document.createElement('div')
    element.className = 'react-flow__viewport exporting'
    element.style.cssText = 'transform: translate(40px, 20px) scale(0.4); width: 900px; height: 700px;'
    const originalStyle = element.style.cssText
    const node = { ...createWorkflowNode({ x: 100, y: 80 }), measured: { width: 200, height: 80 } }
    Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: Promise.resolve() } })
    document.documentElement.style.setProperty('--canvas', '#123456')
    let transformAtCall = ''
    mockedToBlob.mockImplementation(async (target) => {
      transformAtCall = target.style.transform
      return png()
    })

    await expect(renderGraphToBlob(element, [node])).resolves.toEqual(expect.any(Blob))

    expect(mockedToBlob).toHaveBeenCalledWith(element, expect.objectContaining({
      backgroundColor: '#123456',
      width: 320,
      height: 240,
      pixelRatio: 1,
      cacheBust: true,
    }))
    expect(transformAtCall).toContain('translate(-52px, -32px) scale(1)')
    expect(element.style.cssText).toBe(originalStyle)
    expect(element.classList.contains('exporting')).toBe(true)
  })

  it('includes connector routes that extend beyond every node', async () => {
    const element = document.createElement('div')
    const edge = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    edge.classList.add('react-flow__edge-path')
    Object.defineProperty(edge, 'getBBox', { value: () => ({ x: 90, y: 40, width: 460, height: 420 }) })
    element.append(edge)
    const node = { ...createWorkflowNode({ x: 100, y: 80 }), measured: { width: 200, height: 80 } }
    mockedToBlob.mockResolvedValue(png())

    await renderGraphToBlob(element, [node])

    expect(mockedToBlob).toHaveBeenCalledWith(element, expect.objectContaining({
      width: 580,
      height: 540,
    }))
  })

  it('restores styles and removes its temporary class when PNG rendering fails', async () => {
    mockedToBlob.mockRejectedValue(new Error('render failed'))
    const element = document.createElement('div')
    element.style.transform = 'scale(0.25)'
    const originalStyle = element.style.cssText
    await expect(renderGraphToBlob(element, [])).rejects.toThrow('render failed')
    expect(element.style.cssText).toBe(originalStyle)
    expect(element.classList.contains('exporting')).toBe(false)
  })

  it('throws when the image renderer returns no blob', async () => {
    mockedToBlob.mockResolvedValue(null)
    const element = document.createElement('div')
    await expect(renderGraphToBlob(element, [])).rejects.toThrow('PNG generation returned no data')
  })

  it('handles clipboard capability, success, and rejection states', async () => {
    const originalClipboard = navigator.clipboard
    const originalItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem
    Object.assign(navigator, { clipboard: undefined })
    expect(await copyBlobToClipboard(png())).toBe(false)

    Object.assign(navigator, { clipboard: { write: vi.fn() } })
    expect(await copyBlobToClipboard(png())).toBe(false)

    const write = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { write } })
    Object.assign(globalThis, { ClipboardItem: class { constructor(public value: unknown) {} } })
    expect(await copyBlobToClipboard(png())).toBe(true)
    expect(write).toHaveBeenCalledTimes(1)

    write.mockRejectedValueOnce(new Error('permission denied'))
    expect(await copyBlobToClipboard(png())).toBe(false)
    Object.assign(navigator, { clipboard: originalClipboard })
    if (originalItem === undefined) delete (globalThis as { ClipboardItem?: unknown }).ClipboardItem
    else Object.assign(globalThis, { ClipboardItem: originalItem })
  })

  it('downloads a PNG and revokes its object URL', () => {
    vi.useFakeTimers()
    const url = 'blob:http://localhost/test'
    const anchor = document.createElement('a')
    const click = vi.spyOn(anchor, 'click').mockImplementation(() => undefined)
    const remove = vi.spyOn(anchor, 'remove')
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)
    const createObjectURL = vi.fn().mockReturnValue(url)
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })

    downloadBlob(png(), 'workflow.png')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(anchor.download).toBe('workflow.png')
    expect(anchor.href).toBe(url)
    expect(click).toHaveBeenCalledTimes(1)
    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith(url)
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
