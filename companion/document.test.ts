import { describe, expect, it } from 'vitest'
import { applyGraphOperations, DocumentValidationError, layoutDocument, validateDocument } from '../src/companion/document.js'
import type { GraphOperation } from '../src/companion/protocol.js'
import type { GraphDocument } from '../src/types.js'

const fixture = (): GraphDocument => ({
  version: 1,
  name: 'Fixture',
  nodes: [
    { id: 'a', type: 'workflow', position: { x: 0, y: 0 }, data: { kind: 'workflow', title: 'A', description: 'A', modelOverride: null, reasoningOverride: null } },
    { id: 'b', type: 'workflow', position: { x: 300, y: 0 }, data: { kind: 'workflow', title: 'B', description: 'B', modelOverride: null, reasoningOverride: null } },
    { id: 'c', type: 'annotation', position: { x: 0, y: 200 }, data: { kind: 'annotation', text: 'Context' } },
  ],
  edges: [{ id: 'ab', source: 'a', target: 'b', type: 'workflow', data: { direction: 'directed', label: '' } }],
  models: [
    { id: 'gpt-5.6-terra', enabled: true, description: 'Terra' },
    { id: 'gpt-5.6-luna', enabled: true, description: 'Luna' },
    { id: 'gpt-5.6-sol', enabled: true, description: 'Sol' },
  ],
  defaults: { model: 'gpt-5.6-terra', reasoning: 'medium' },
  viewport: { x: 0, y: 0, zoom: 1 },
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('companion document reducer', () => {
  it('applies a batch atomically and cascades removed edges', () => {
    const document = fixture()
    const id = document.nodes[0].id
    const operations: GraphOperation[] = [{ type: 'set_name', name: 'Edited locally' }, { type: 'remove_node', id }]
    const next = applyGraphOperations(document, operations)
    expect(next.name).toBe('Edited locally')
    expect(next.nodes.some((node) => node.id === id)).toBe(false)
    expect(next.edges.some((edge) => edge.source === id || edge.target === id)).toBe(false)
  })

  it('rejects malformed batches without mutating the source', () => {
    const document = fixture()
    const before = JSON.stringify(document)
    expect(() => applyGraphOperations(document, [{ type: 'set_name', name: 'ok' }, { type: 'remove_node', id: 'missing' }])).toThrow(DocumentValidationError)
    expect(JSON.stringify(document)).toBe(before)
    expect(validateDocument(document)).toEqual([])
  })

  it('uses conversational node and edge patches without exposing renderer internals', () => {
    const next = applyGraphOperations(fixture(), [
      { type: 'update_node', id: 'a', patch: { title: 'Voice input', modelOverride: 'gpt-5.6-luna', reasoningOverride: 'high' } },
      { type: 'update_node', id: 'c', patch: { text: 'Spoken note', position: { x: 20, y: 240 } } },
      { type: 'update_edge', id: 'ab', patch: { direction: 'bidirectional', label: 'clarify' } },
    ])
    expect(next.nodes[0].data).toMatchObject({ title: 'Voice input', modelOverride: 'gpt-5.6-luna', reasoningOverride: 'high' })
    expect(next.nodes[2]).toMatchObject({ position: { x: 20, y: 240 }, data: { text: 'Spoken note' } })
    expect(next.edges[0].data).toEqual({ direction: 'bidirectional', label: 'clarify' })
  })

  it('rejects node fields that do not match the selected node kind', () => {
    expect(() => applyGraphOperations(fixture(), [{ type: 'update_node', id: 'c', patch: { title: 'Not valid for a note' } }])).toThrow('annotation nodes only accept')
    expect(() => applyGraphOperations(fixture(), [{ type: 'update_node', id: 'a', patch: { text: 'Not valid for a workflow node' } }])).toThrow('workflow nodes do not have')
  })

  it('rejects duplicate and dangling graph entities before normalization', () => {
    const document = fixture()
    const bad = { ...document, edges: [{ ...document.edges[0], id: document.edges[0].id, target: 'missing' }, { ...document.edges[0], id: 'ab' }] }
    expect(validateDocument(bad).join(' ')).toMatch(/duplicated|dangling/)
  })

  it('lays out deterministically in both directions', () => {
    const document = fixture()
    const right = layoutDocument(document, { baseRevision: 0, direction: 'right', columns: 2 })
    const down = layoutDocument(document, { baseRevision: 0, direction: 'down', columns: 2 })
    expect(right.nodes[0].position).toEqual({ x: 48, y: 48 })
    expect(right.nodes[2].position).toEqual({ x: 48, y: 228 })
    expect(down.nodes[1].position).toEqual({ x: 48, y: 228 })
  })

  it('bounds operation batches', () => {
    const document = fixture()
    expect(() => applyGraphOperations(document, [])).toThrow('between 1 and 100')
  })
})
