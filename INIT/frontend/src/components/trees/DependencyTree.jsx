import { useMemo, useCallback } from 'react'
import ReactFlow, { ReactFlowProvider, useReactFlow, MarkerType } from 'reactflow'
import 'reactflow/dist/style.css'
import { getPosColor } from '../../utils/conllu'

const NODE_WIDTH = 80
const NODE_HEIGHT = 40
const NODE_SPACING = 100
const BASE_Y = 350
const ARC_BASE_HEIGHT = 60
const ARC_HEIGHT_PER_DIST = 30

function WordNode({ data }) {
  const hasError = data.hasError
  return (
    <div
      className="flex flex-col items-center"
      style={{ width: NODE_WIDTH }}
    >
      <div
        className={`px-3 py-1.5 rounded-2xl text-white text-sm font-medium shadow-sm border-2 ${
          hasError ? 'border-red-500 ring-2 ring-red-200' : 'border-transparent'
        }`}
        style={{ backgroundColor: getPosColor(data.upos) }}
      >
        {data.form}
      </div>
      <div className="mt-1 text-[10px] text-gray-400 font-mono">{data.upos}</div>
    </div>
  )
}

const nodeTypes = { word: WordNode }

function TreeInner({ tokens, errors }) {
  const errorMap = useMemo(() => {
    const m = {}
    ;(errors || []).forEach(e => { m[e.token_id] = e })
    return m
  }, [errors])

  const nodes = useMemo(() => {
    return tokens.map((t, i) => ({
      id: String(t.id),
      type: 'word',
      position: { x: i * NODE_SPACING, y: BASE_Y },
      data: {
        form: t.form,
        upos: t.upos,
        hasError: !!errorMap[t.id],
      },
      draggable: false,
    }))
  }, [tokens, errorMap])

  const edges = useMemo(() => {
    return tokens
      .filter(t => t.head !== 0)
      .map(t => {
        const sourceIdx = tokens.findIndex(tk => tk.id === t.id)
        const targetIdx = tokens.findIndex(tk => tk.id === t.head)
        const dist = Math.abs(sourceIdx - targetIdx)
        const arcHeight = ARC_BASE_HEIGHT + dist * ARC_HEIGHT_PER_DIST
        const hasError = !!errorMap[t.id]

        const sourceX = sourceIdx * NODE_SPACING + NODE_WIDTH / 2
        const targetX = targetIdx * NODE_SPACING + NODE_WIDTH / 2
        const midX = (sourceX + targetX) / 2

        return {
          id: `e-${t.id}-${t.head}`,
          source: String(t.id),
          target: String(t.head),
          type: 'default',
          animated: false,
          label: t.deprel,
          labelStyle: {
            fontSize: 10,
            fontWeight: 500,
            fill: hasError ? '#ef4444' : '#6b7280',
          },
          labelBgStyle: {
            fill: 'white',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2],
          style: {
            stroke: hasError ? '#ef4444' : '#94a3b8',
            strokeWidth: hasError ? 2.5 : 1.5,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: hasError ? '#ef4444' : '#94a3b8',
            width: 12,
            height: 12,
          },
          sourceHandle: 'top',
          targetHandle: 'top',
        }
      })
  }, [tokens, errorMap])

  const treeWidth = tokens.length * NODE_SPACING + 100

  return (
    <div style={{ height: 450, width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.3}
        maxZoom={2}
      />
    </div>
  )
}

export default function DependencyTree({ tokens, errors }) {
  if (!tokens || tokens.length === 0) {
    return <div className="text-sm text-gray-500 text-center py-8">Aucun token à afficher.</div>
  }

  return (
    <ReactFlowProvider>
      <TreeInner tokens={tokens} errors={errors} />
    </ReactFlowProvider>
  )
}
