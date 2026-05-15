/**
 * GraphCanvas — interactive CI relation graph
 * Pan/zoom · hover highlighting · temp table toggle · ghost nodes
 */
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'

// ── dark-mode observer ────────────────────────────────────────────────────────
function useDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const obs = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains('dark'))
    )
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return dark
}

// ── theme ─────────────────────────────────────────────────────────────────────
function th(dark) {
  return {
    bg:      dark ? '#0c0c10' : '#f1f5f9',
    grid:    dark ? 'rgba(255,255,255,0.032)' : 'rgba(0,0,0,0.042)',
    card:    dark ? '#1c1c22' : '#ffffff',
    border:  dark ? '#35353f' : '#e2e8f0',
    shadow:  dark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.07)',
    name:    dark ? '#f0f0f4' : '#0f172a',
    sub:     dark ? '#6b7280' : '#94a3b8',
    field:   dark ? '#c4c4d0' : '#374151',
    div:     dark ? '#252530' : '#f1f5f9',
    sep:     dark ? '#2e2e3a' : '#e2e8f0',
    edgeDef: dark ? 'rgba(148,163,184,0.50)' : 'rgba(100,116,139,0.55)',
    edgeHi:  '#6366f1',
    edgeDim: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
    lblBg:   dark ? '#1f1f28' : '#ffffff',
    lblBd:   dark ? '#38383f' : '#e2e8f0',
    lblTx:   dark ? '#9ca3af' : '#4b5563',
    arrow:   dark ? 'rgba(148,163,184,0.65)' : 'rgba(100,116,139,0.75)',
    arrowHi: '#6366f1',
  }
}

// ── type accent colours ───────────────────────────────────────────────────────
const ACCENT = {
  cmdb_ci: '#3b82f6',
  cmdb:    '#14b8a6',
  temp:    '#f59e0b',
  ref:     '#71717a',
}
const HDR_D = {
  cmdb_ci: 'rgba(59,130,246,0.10)',
  cmdb:    'rgba(20,184,166,0.09)',
  temp:    'rgba(245,158,11,0.09)',
  ref:     'rgba(107,114,128,0.06)',
}
const HDR_L = {
  cmdb_ci: 'rgba(239,246,255,0.95)',
  cmdb:    'rgba(240,253,250,0.95)',
  temp:    'rgba(255,251,235,0.95)',
  ref:     'rgba(249,250,251,1)',
}
const TYPE_LABEL = { cmdb_ci: 'CMDB CI', cmdb: 'CMDB', temp: 'TEMP', ref: 'REF' }

// ── geometry ──────────────────────────────────────────────────────────────────
const G = {
  W:   280,   // node width
  HDR: 62,    // header area height
  FH:  20,    // field row height
  FP:  12,    // field-area vertical padding (each side)
  MF:  6,     // max fields shown
  CG:  210,   // column gap  ← main spacing improvement
  RG:  30,    // row gap between nodes in same column
  PAD: 56,    // canvas edge padding
  TG:  72,    // temp section gap
  AW:  5,     // accent bar width
}

function nH(node) {
  if (node.isRef) return G.HDR + G.FP * 2
  const f = Math.min((node.fields || []).length, G.MF)
  const over = (node.fields || []).length > G.MF ? G.FH : 0
  return G.HDR + (f > 0 ? G.FP + f * G.FH + G.FP + over : G.FP * 2)
}

function clip(s, n) { return s && s.length > n ? s.slice(0, n) + '…' : (s || '') }
function strip(s)   { return s.replace(/^cmdb_ci_/, '').replace(/^cmdb_/, '').replace(/^discovery_/, 'disc.') }

// ── extract graph nodes + edges from a pattern ────────────────────────────────
function buildGraphData(pattern) {
  const ndl    = pattern?.ndl || {}
  const mainCi = new Set((pattern?.ciMappings || []).filter(c => c.isMainCi).map(c => c.ciType))

  const nodeMap = {}
  ;(ndl.tablesPopulated || []).forEach(t => {
    nodeMap[t.table] = {
      name:      t.table,
      tableType: t.tableType || 'temp',
      fields:    t.columns || t.explicitFields || [],
      isMain:    mainCi.has(t.table),
      isRef:     false,
    }
  })

  const edges = [], seen = new Set()
  ;(ndl.relations || []).forEach(r => {
    if (!r.table1 || !r.table2 || r.table1 === r.table2) return
    const k = `${r.table1}→${r.table2}`
    if (seen.has(k)) return
    seen.add(k)

    for (const nm of [r.table1, r.table2]) {
      if (!nodeMap[nm]) {
        const tt = nm.startsWith('cmdb_ci_') ? 'cmdb_ci'
                 : nm.startsWith('cmdb_')    ? 'cmdb'  : 'ref'
        nodeMap[nm] = { name: nm, tableType: tt, fields: [], isMain: mainCi.has(nm), isRef: true }
      }
    }

    const isRef = r.type === 'relation_reference' && r.refField
    const label = isRef
      ? 'Reference'
      : clip((r.relationshipType || '').split('::')[0].trim() || 'Relation', 22)
    edges.push({ from: r.table1, to: r.table2, label, key1: r.key1 || '', key2: r.key2 || '' })
  })

  return { nodes: Object.values(nodeMap), edges }
}

// ── topological layer assignment ──────────────────────────────────────────────
function toLayers(nodes, edges) {
  const names = new Set(nodes.map(n => n.name))
  const out = {}, inDeg = {}
  nodes.forEach(n => { out[n.name] = []; inDeg[n.name] = 0 })
  edges.forEach(e => {
    if (names.has(e.from) && names.has(e.to) && e.from !== e.to) {
      out[e.from].push(e.to)
      inDeg[e.to] = (inDeg[e.to] || 0) + 1
    }
  })

  const placed = new Set()
  const layers = []
  let front = [
    ...nodes.filter(n => n.isMain  && !(inDeg[n.name] || 0)).map(n => n.name),
    ...nodes.filter(n => !n.isMain && !(inDeg[n.name] || 0)).map(n => n.name),
  ]
  if (!front.length && nodes.length) front = [nodes[0].name]

  while (front.length) {
    const layer = [...new Set(front)].filter(n => !placed.has(n))
    if (!layer.length) break
    layers.push(layer)
    layer.forEach(n => placed.add(n))
    const next = new Set()
    layer.forEach(n => (out[n] || []).forEach(m => { if (!placed.has(m)) next.add(m) }))
    front = [...next]
  }
  const rest = nodes.filter(n => !placed.has(n.name)).map(n => n.name)
  if (rest.length) layers.push(rest)
  return layers
}

// ── position all nodes ────────────────────────────────────────────────────────
function buildLayout(nodes, edges, showTemp) {
  const cmdb = nodes.filter(n => n.tableType !== 'temp')
  const temp = nodes.filter(n => n.tableType === 'temp')
  const cNames = new Set(cmdb.map(n => n.name))
  const cmdbEdges = edges.filter(e => cNames.has(e.from) && cNames.has(e.to))
  const layers = toLayers(cmdb, cmdbEdges)
  const nodeByName = Object.fromEntries(nodes.map(n => [n.name, n]))

  const colHeights = layers.map(col =>
    col.reduce((s, nm, i) => s + nH(nodeByName[nm] || {}) + (i ? G.RG : 0), 0)
  )
  const maxH = Math.max(...colHeights, 1)

  const pos = {}
  layers.forEach((col, ci) => {
    const x = G.PAD + ci * (G.W + G.CG)
    let y = G.PAD + (maxH - colHeights[ci]) / 2
    col.forEach(nm => {
      const h = nH(nodeByName[nm] || {})
      pos[nm] = { x, y, w: G.W, h }
      y += h + G.RG
    })
  })

  const mainBottom = G.PAD + maxH

  if (showTemp && temp.length) {
    let tx = G.PAD
    const ty = mainBottom + G.TG
    temp.forEach(n => {
      pos[n.name] = { x: tx, y: ty, w: G.W, h: nH(n) }
      tx += G.W + G.RG
    })
  }

  let mx = G.PAD, my = G.PAD
  Object.values(pos).forEach(({ x, w, y, h }) => {
    mx = Math.max(mx, x + w)
    my = Math.max(my, y + h)
  })

  return { pos, layers, W: mx + G.PAD, H: my + G.PAD, mainBottom }
}

// ── bezier path ───────────────────────────────────────────────────────────────
function bezier(sp, tp) {
  const x1 = sp.x + sp.w, y1 = sp.y + sp.h / 2
  const x2 = tp.x,         y2 = tp.y + tp.h / 2
  if (x2 >= x1 + 20) {
    const cx = (x2 - x1) * 0.5
    return `M${x1},${y1} C${x1+cx},${y1} ${x2-cx},${y2} ${x2},${y2}`
  }
  // Back-edge — arc above
  const topY = Math.min(sp.y, tp.y) - 52
  const mx   = (x1 + x2) / 2
  return `M${x1},${y1} C${x1+60},${y1} ${x1+60},${topY} ${mx},${topY} C${x2-60},${topY} ${x2-60},${y2} ${x2},${y2}`
}

// ── Node ──────────────────────────────────────────────────────────────────────
function GNode({ node, p, hov, onEnter, onLeave, primary, dark: dk }) {
  const { x, y, w, h } = p
  const T   = th(dk)
  const tt  = node.tableType || 'ref'
  const acc = node.isMain ? primary : (ACCENT[tt] || ACCENT.ref)
  const hdrBg = dk ? (HDR_D[tt] || HDR_D.ref) : (HDR_L[tt] || HDR_L.ref)
  const isHov = hov === node.name
  const fade  = hov && !isHov ? 0.25 : 1

  const fields = (node.fields || []).slice(0, G.MF)
  const more   = (node.fields || []).length - G.MF
  const clipId = `gc-${node.name.replace(/\W/g, '_')}`

  return (
    <g transform={`translate(${x},${y})`} opacity={fade}
       onMouseEnter={() => onEnter(node.name)} onMouseLeave={onLeave}>
      <defs>
        <clipPath id={clipId}><rect width={w} height={h} rx={10} /></clipPath>
      </defs>

      {/* shadow */}
      {!node.isRef && <rect x={2} y={4} width={w} height={h} rx={10} fill={T.shadow} />}

      {/* clipped interior */}
      <g clipPath={`url(#${clipId})`}>
        <rect width={w} height={h} fill={T.card} />
        <rect width={node.isMain ? G.AW + 2 : G.AW} height={h} fill={acc} />
        <rect x={G.AW} width={w - G.AW} height={G.HDR} fill={hdrBg} />
        {node.isMain && (
          <rect x={G.AW} width={w - G.AW} height={G.HDR} fill={acc} fillOpacity={dk ? 0.18 : 0.11} />
        )}
      </g>

      {/* border on top */}
      <rect width={w} height={h} rx={10} fill="none"
        stroke={isHov ? '#6366f1' : (node.isRef ? T.sep : T.border)}
        strokeWidth={isHov ? 2.5 : (node.isRef ? 1 : 1.5)}
        strokeDasharray={node.isRef ? '5,3' : undefined} />

      {/* short display name */}
      <text x={G.AW + 12} y={22} fontSize={12.5} fontWeight={700}
        fill={isHov ? '#6366f1' : (node.isMain ? acc : T.name)}
        fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
        dominantBaseline="middle">
        {clip(strip(node.name), 20)}
      </text>

      {/* type pill */}
      <rect x={w - 56} y={8} width={48} height={17} rx={8.5} fill={acc} opacity={0.15} />
      <text x={w - 32} y={16.5} fontSize={8.5} fontWeight={700} fill={acc}
        textAnchor="middle" dominantBaseline="middle" letterSpacing={0.5}>
        {TYPE_LABEL[tt] || tt.toUpperCase()}
      </text>

      {/* MAIN badge */}
      {node.isMain && !node.isRef && (
        <>
          <rect x={G.AW + 10} y={8} width={32} height={14} rx={7} fill={acc} opacity={0.25} />
          <text x={G.AW + 26} y={15} fontSize={7.5} fontWeight={800} fill={acc}
            textAnchor="middle" dominantBaseline="middle">MAIN</text>
        </>
      )}

      {/* full table name */}
      <text x={G.AW + 12} y={46} fontSize={9.5} fill={T.sub}
        fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace" dominantBaseline="middle">
        {clip(node.name, 34)}
      </text>

      {/* fields */}
      {fields.length > 0 && (
        <>
          <line x1={G.AW + 8} x2={w - 8} y1={G.HDR} y2={G.HDR} stroke={T.div} strokeWidth={1} />
          {fields.map((f, i) => (
            <g key={f} transform={`translate(0,${G.HDR + G.FP + i * G.FH})`}>
              <circle cx={G.AW + 13} cy={G.FH / 2} r={2.5} fill={acc} opacity={0.4} />
              <text x={G.AW + 23} y={G.FH / 2} fontSize={10.5} fill={T.field}
                fontFamily="ui-monospace,SFMono-Regular,Menlo,monospace"
                dominantBaseline="middle">
                {clip(f, 25)}
              </text>
            </g>
          ))}
          {more > 0 && (
            <text x={G.AW + 23} y={G.HDR + G.FP + G.MF * G.FH + G.FH / 2}
              fontSize={9.5} fill={T.sub} fontStyle="italic" dominantBaseline="middle">
              +{more} more
            </text>
          )}
        </>
      )}
    </g>
  )
}

// ── Edge ──────────────────────────────────────────────────────────────────────
function GEdge({ edge, sp, tp, hov, dark: dk }) {
  const T   = th(dk)
  const hi  = hov === edge.from || hov === edge.to
  const dim = hov && !hi
  const stroke = hi ? T.edgeHi : (dim ? T.edgeDim : T.edgeDef)
  const d = bezier(sp, tp)
  const lx = (sp.x + sp.w + tp.x) / 2
  const ly = (sp.y + sp.h / 2 + tp.y + tp.h / 2) / 2
  const lbl  = hi && edge.label ? edge.label : ''
  const lblW = lbl ? lbl.length * 6.2 + 20 : 0

  return (
    <g>
      <path d={d} fill="none" stroke={stroke} strokeWidth={hi ? 2.5 : 2}
        markerEnd={`url(#${hi ? 'a-hi' : 'a-def'})`}
        style={{ transition: 'stroke 0.1s, stroke-width 0.1s' }} />
      {lbl && (
        <g transform={`translate(${lx},${ly})`}>
          <rect x={-lblW/2} y={-11} width={lblW} height={22} rx={11}
            fill={T.lblBg} stroke={T.edgeHi} strokeWidth={1.5} />
          <text fontSize={10} fontWeight={600} fill={T.edgeHi}
            textAnchor="middle" dominantBaseline="middle">{lbl}</text>
        </g>
      )}
    </g>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function GraphCanvas({ pattern }) {
  const dark = useDark()
  const [showTemp, setShowTemp] = useState(false)
  const [vt, setVt]   = useState({ x: 48, y: 32, s: 1 })
  const [hov, setHov] = useState(null)
  const [drag, setDrag] = useState(false)
  const vtRef  = useRef(vt)
  const dragRef = useRef(null)
  const svgRef  = useRef(null)

  useEffect(() => { vtRef.current = vt }, [vt])

  const { nodes, edges } = useMemo(() => buildGraphData(pattern), [pattern])

  const visNodes = useMemo(
    () => showTemp ? nodes : nodes.filter(n => n.tableType !== 'temp'),
    [nodes, showTemp]
  )
  const visEdges = useMemo(() => {
    const ns = new Set(visNodes.map(n => n.name))
    return edges.filter(e => ns.has(e.from) && ns.has(e.to))
  }, [edges, visNodes])

  const layout = useMemo(
    () => buildLayout(visNodes, visEdges, showTemp),
    [visNodes, visEdges, showTemp]
  )

  const cmdbCount = nodes.filter(n => n.tableType !== 'temp' && !n.isRef).length
  const tempCount = nodes.filter(n => n.tableType === 'temp').length

  const reset   = useCallback(() => setVt({ x: 48, y: 32, s: 1 }), [])
  const zoomIn  = useCallback(() => setVt(v => ({ ...v, s: Math.min(v.s * 1.2, 4) })), [])
  const zoomOut = useCallback(() => setVt(v => ({ ...v, s: Math.max(v.s / 1.2, 0.15) })), [])

  const onWheel = useCallback((e) => {
    e.preventDefault()
    const f  = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const rc = svgRef.current?.getBoundingClientRect()
    if (!rc) return
    const cx = e.clientX - rc.left, cy = e.clientY - rc.top
    setVt(p => {
      const ns = Math.max(0.15, Math.min(4, p.s * f))
      const r  = ns / p.s
      return { x: cx - r * (cx - p.x), y: cy - r * (cy - p.y), s: ns }
    })
  }, [])

  const onMouseDown = useCallback((e) => {
    if (e.button !== 0) return
    e.preventDefault()
    const { x, y } = vtRef.current
    dragRef.current = { sx: e.clientX - x, sy: e.clientY - y }
    setDrag(true)
    const onMove = (me) => {
      const drag = dragRef.current
      if (!drag) return
      setVt(p => ({ ...p, x: me.clientX - drag.sx, y: me.clientY - drag.sy }))
    }
    const onUp = () => {
      dragRef.current = null
      setDrag(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  if (!nodes.length) return (
    <div className="flex-1 flex items-center justify-center text-[13px] text-gray-500 dark:text-zinc-400">
      No graph data — this pattern has no NDL tables.
    </div>
  )

  const T       = th(dark)
  const primary = pattern?.color || '#3b82f6'
  const { pos, layers, W, H, mainBottom } = layout

  return (
    <div className="flex-1 flex flex-col overflow-hidden">

      {/* ── toolbar ── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800 text-[11px] select-none">
        <span className="text-gray-500 dark:text-zinc-400">
          <b className="text-gray-800 dark:text-zinc-100 font-semibold">{cmdbCount}</b> CI tables
          &thinsp;·&thinsp;
          <b className="text-gray-800 dark:text-zinc-100 font-semibold">{visEdges.length}</b> relations
          {tempCount > 0 && <>&thinsp;·&thinsp;<b className="text-gray-800 dark:text-zinc-100 font-semibold">{tempCount}</b> temp</>}
        </span>

        <div className="flex items-center gap-1 ml-auto">
          {tempCount > 0 && (
            <label className="flex items-center gap-1.5 mr-3 cursor-pointer text-gray-500 dark:text-zinc-400">
              <input type="checkbox" checked={showTemp} onChange={e => setShowTemp(e.target.checked)}
                className="accent-amber-500 cursor-pointer" />
              show temp tables
            </label>
          )}
          {[['−', zoomOut, 'Zoom out'], ['+', zoomIn, 'Zoom in'], ['⊙', reset, 'Reset view']].map(([lbl, fn, title]) => (
            <button key={lbl} onClick={fn} title={title}
              className="w-7 h-7 flex items-center justify-center rounded border border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-zinc-400 hover:bg-gray-100 dark:hover:bg-zinc-700 cursor-pointer text-sm leading-none transition-colors">
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {/* ── canvas ── */}
      <div className="flex-1 relative overflow-hidden">
        <svg ref={svgRef} width="100%" height="100%"
          style={{ display: 'block', background: T.bg, cursor: drag ? 'grabbing' : 'grab' }}
          onMouseDown={onMouseDown}>

          <defs>
            <pattern id="gdot" x="0" y="0" width="28" height="28" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill={T.grid} />
            </pattern>
            <marker id="a-def" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">
              <path d="M0,0.5 L0,7.5 L8,4 z" fill={T.arrow} />
            </marker>
            <marker id="a-hi" markerWidth="9" markerHeight="9" refX="8" refY="4" orient="auto">
              <path d="M0,0.5 L0,7.5 L8,4 z" fill={T.arrowHi} />
            </marker>
          </defs>

          <rect width="100%" height="100%" fill="url(#gdot)" />

          <g transform={`translate(${vt.x},${vt.y}) scale(${vt.s})`}>

            {/* column guide lines */}
            {layers.length > 1 && layers.map((_, ci) => {
              if (!ci) return null
              const lx = G.PAD + ci * (G.W + G.CG) - G.CG / 2
              return (
                <line key={ci} x1={lx} y1={G.PAD / 2} x2={lx} y2={mainBottom + G.PAD / 2}
                  stroke={T.sep} strokeWidth={1} strokeDasharray="3,10" opacity={0.5} />
              )
            })}

            {/* temp-section divider */}
            {showTemp && tempCount > 0 && (
              <g transform={`translate(0,${mainBottom + G.TG / 2})`}>
                <line x1={G.PAD / 2} x2={W - G.PAD / 2} y1={0} y2={0}
                  stroke={T.sep} strokeWidth={1} strokeDasharray="8,5" opacity={0.8} />
                <rect x={G.PAD / 2} y={-10} width={260} height={20} rx={4} fill={T.bg} />
                <text x={G.PAD} y={0} fontSize={9.5} fontWeight={700} fill={T.sub}
                  dominantBaseline="middle" letterSpacing={1.4}>
                  INTERMEDIATE / PROCESSING TABLES
                </text>
              </g>
            )}

            {/* edges (behind nodes) */}
            {visEdges.map((e, i) => {
              const sp = pos[e.from], tp = pos[e.to]
              if (!sp || !tp) return null
              return <GEdge key={i} edge={e} sp={sp} tp={tp} hov={hov} dark={dark} />
            })}

            {/* nodes */}
            {visNodes.map(n => {
              const p = pos[n.name]
              if (!p) return null
              return (
                <GNode key={n.name} node={n} p={p}
                  hov={hov} onEnter={setHov} onLeave={() => setHov(null)}
                  primary={primary} dark={dark} />
              )
            })}

          </g>
        </svg>

        {/* legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-3 px-3 py-2 rounded-xl border border-gray-200 dark:border-zinc-700/60 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-sm text-[10px] text-gray-500 dark:text-zinc-400 select-none pointer-events-none">
          {[
            { color: primary,   label: 'Main CI' },
            { color: '#3b82f6', label: 'CMDB CI' },
            { color: '#14b8a6', label: 'CMDB table' },
            { color: '#71717a', label: 'Referenced CI' },
            { color: '#f59e0b', label: 'Temp / processing' },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>

        {/* hint */}
        <div className="absolute top-3 left-3 text-[10px] text-gray-400 dark:text-zinc-600 pointer-events-none select-none">
          Scroll to zoom · drag to pan · hover a node to trace its relations
        </div>
      </div>
    </div>
  )
}
