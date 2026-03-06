
import React, { useRef, useState, useEffect } from 'react';
import { ViewTransform, CanvasNode, CanvasEdge, NodeType } from './types';
import { Target } from 'lucide-react';

interface InfiniteCanvasProps {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  renderNode: (node: CanvasNode) => React.ReactNode;
  onPaneContextMenu?: (e: React.MouseEvent) => void;
  onConnect?: (sourceId: string, targetId: string) => void;
  onNodeMove?: (id: string, x: number, y: number) => void;
  onNodeSelect?: (id: string | null) => void;
  focusedNodeId?: string | null;
}

export const InfiniteCanvas: React.FC<InfiniteCanvasProps> = ({ 
  nodes, 
  edges, 
  renderNode, 
  onPaneContextMenu,
  onConnect,
  onNodeMove,
  onNodeSelect,
  focusedNodeId
}) => {
  const [transform, setTransform] = useState<ViewTransform>({ x: 0, y: 0, scale: 1 });
  const [dragState, setDragState] = useState<{
      mode: 'IDLE' | 'PAN' | 'DRAG_NODE';
      nodeId?: string;
      startX: number;
      startY: number;
  }>({ mode: 'IDLE', startX: 0, startY: 0 });
  const [connectState, setConnectState] = useState<{
      sourceId: string;
      currentX: number;
      currentY: number;
  } | null>(null);
  
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastFocusedNodeRef = useRef<string | null>(null);

  // Keyboard handling for Spacebar panning
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        if (document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
            setIsSpacePressed(true);
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // MANUAL WHEEL LISTENER (To fix browser zoom conflict)
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        
        const rect = wrapper.getBoundingClientRect();
        const zoomSensitivity = 0.0015; 
        const delta = -e.deltaY * zoomSensitivity;
        
        setTransform(prev => {
            const newScale = Math.min(Math.max(0.1, prev.scale * (1 + delta)), 5);
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const scaleRatio = newScale / prev.scale;
            const newX = mouseX - (mouseX - prev.x) * scaleRatio;
            const newY = mouseY - (mouseY - prev.y) * scaleRatio;
            
            return { x: newX, y: newY, scale: newScale };
        });
      } else {
        setTransform(prev => ({ 
            ...prev, 
            x: prev.x - e.deltaX, 
            y: prev.y - e.deltaY 
        }));
      }
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });
    return () => wrapper.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (dragState.mode === 'DRAG_NODE' || connectState) return;

    // Deselect if clicking on background
    if (e.button === 0 && !e.altKey && !isSpacePressed) {
        const target = e.target as HTMLElement;
        // Check if we clicked the wrapper or the content container directly (not a child node)
        if (target === wrapperRef.current || target.classList.contains('infinite-canvas-content')) {
             onNodeSelect?.(null);
        }
    }

    if (e.button === 1 || (e.button === 0 && (e.altKey || isSpacePressed))) { 
      e.preventDefault();
      setDragState({ mode: 'PAN', startX: e.clientX, startY: e.clientY });
    }
  };

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (e.button !== 0 || isSpacePressed || e.altKey) return; 
    
    const target = e.target as HTMLElement;
    if (target.closest('.handle')) {
        e.stopPropagation();
        onNodeSelect?.(nodeId);
        setDragState({
            mode: 'DRAG_NODE',
            nodeId,
            startX: e.clientX,
            startY: e.clientY
        });
    } else {
        onNodeSelect?.(nodeId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (connectState) {
        setConnectState(prev => prev ? { ...prev, currentX: e.clientX, currentY: e.clientY } : prev);
    } else if (dragState.mode === 'PAN') {
        const dx = e.clientX - dragState.startX;
        const dy = e.clientY - dragState.startY;
        setTransform(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setDragState(prev => ({ ...prev, startX: e.clientX, startY: e.clientY }));
    } else if (dragState.mode === 'DRAG_NODE' && dragState.nodeId && onNodeMove) {
        const dx = (e.clientX - dragState.startX) / transform.scale;
        const dy = (e.clientY - dragState.startY) / transform.scale;
        
        const node = nodes.find(n => n.id === dragState.nodeId);
        if (node) {
            onNodeMove(dragState.nodeId, node.x + dx, node.y + dy);
        }
        
        setDragState(prev => ({ ...prev, startX: e.clientX, startY: e.clientY }));
    }
  };

  const handleMouseUp = (e?: React.MouseEvent) => {
      if (connectState && onConnect && wrapperRef.current && e) {
          const targetEl = (e.target as HTMLElement)?.closest?.('[data-node-id]');
          const targetId = targetEl?.getAttribute('data-node-id');
          if (targetId && targetId !== connectState.sourceId) {
              onConnect(connectState.sourceId, targetId);
          }
      }

      setConnectState(null);
      setDragState({ mode: 'IDLE', startX: 0, startY: 0 });
  };

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };

    return {
      x: (clientX - rect.left - transform.x) / transform.scale,
      y: (clientY - rect.top - transform.y) / transform.scale
    };
  };

  const handleFocusDataSource = () => {
    const dataSourceNode = nodes.find(n => n.type === NodeType.DATASET);
    if (dataSourceNode && wrapperRef.current) {
        const rect = wrapperRef.current.getBoundingClientRect();
        // Center the node in the view
        const targetX = rect.width / 2 - dataSourceNode.x - dataSourceNode.width / 2;
        const targetY = rect.height / 2 - dataSourceNode.y - dataSourceNode.height / 2;
        setTransform({ x: targetX, y: targetY, scale: 1 });
    }
  };

  useEffect(() => {
    if (!focusedNodeId || lastFocusedNodeRef.current === focusedNodeId || !wrapperRef.current) {
      return;
    }

    const targetNode = nodes.find(n => n.id === focusedNodeId);
    if (!targetNode) return;

    const rect = wrapperRef.current.getBoundingClientRect();
    const targetX = rect.width / 2 - (targetNode.x + targetNode.width / 2) * transform.scale;
    const targetY = rect.height / 2 - (targetNode.y + targetNode.height / 2) * transform.scale;
    setTransform(prev => ({ ...prev, x: targetX, y: targetY }));
    lastFocusedNodeRef.current = focusedNodeId;
  }, [focusedNodeId, nodes, transform.scale]);

  useEffect(() => {
    if (!focusedNodeId) {
      lastFocusedNodeRef.current = null;
    }
  }, [focusedNodeId]);

  return (
    <div 
      ref={wrapperRef}
      className={`w-full h-full overflow-hidden bg-[#f8fafc] relative ${isSpacePressed || dragState.mode === 'PAN' ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onContextMenu={onPaneContextMenu}
    >
      {/* Dot Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(#cbd5e1 1.5px, transparent 1.5px)',
          backgroundSize: `${20 * transform.scale}px ${20 * transform.scale}px`,
          backgroundPosition: `${transform.x}px ${transform.y}px`,
          opacity: 0.6
        }}
      />

      {/* Content Container */}
      <div 
        className="absolute top-0 left-0 w-full h-full origin-top-left will-change-transform infinite-canvas-content"
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
        }}
      >
        {/* Edges Layer */}
        <svg className="absolute top-0 left-0 w-[10000px] h-[10000px] pointer-events-none overflow-visible">
          <defs>
            <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <path d="M 0 0 L 10 3.5 L 0 7" fill="#94a3b8" stroke="none" />
            </marker>
          </defs>
          {edges.map(edge => {
            const source = nodes.find(n => n.id === edge.source);
            const target = nodes.find(n => n.id === edge.target);
            if (!source || !target) return null;
            
            const sx = source.x + source.width / 2;
            const sy = source.y + source.height / 2;
            const tx = target.x + target.width / 2;
            const ty = target.y + target.height / 2;
            
            const dist = Math.hypot(tx - sx, ty - sy);
            const controlOffset = Math.min(dist * 0.5, 150);
            
            const d = `M ${sx} ${sy} C ${sx + controlOffset} ${sy}, ${tx - controlOffset} ${ty}, ${tx} ${ty}`;
            
            const isFork = edge.type === 'fork';
            const edgeStyle = edge.type === 'association'
              ? { stroke: '#f59e0b', dash: '4,4', labelClass: 'text-amber-600 border-amber-100 bg-amber-50/90' }
              : edge.type === 'causal'
                ? { stroke: '#0f766e', dash: '0', labelClass: 'text-teal-700 border-teal-100 bg-teal-50/90' }
                : edge.type === 'flow'
                  ? { stroke: '#6366f1', dash: '0', labelClass: 'text-indigo-600 border-indigo-100 bg-indigo-50/90' }
                  : { stroke: '#cbd5e1', dash: '6,4', labelClass: 'text-slate-400 border-slate-100 bg-white/90' };

            return (
              <g key={edge.id} className="group">
                 <path d={d} stroke="transparent" strokeWidth="15" fill="none" className="pointer-events-auto cursor-pointer" />
                 <path 
                    d={d}
                    stroke={edgeStyle.stroke}
                    strokeWidth="2"
                    strokeDasharray={edgeStyle.dash}
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    className={`transition-colors duration-200 group-hover:stroke-indigo-400 group-hover:stroke-[3px] ${isFork ? 'opacity-80' : ''}`}
                  />
                  {edge.label && (
                      <foreignObject x={(sx+tx)/2 - 40} y={(sy+ty)/2 - 12} width="80" height="24">
                        <div className="flex justify-center items-center">
                            <span className={`backdrop-blur px-1.5 py-0.5 rounded text-[10px] border shadow-sm font-medium ${edgeStyle.labelClass} ${isFork ? 'italic' : ''}`}>
                                {edge.label}
                            </span>
                        </div>
                      </foreignObject>
                  )}
              </g>
            );
          })}
          {connectState && (() => {
            const source = nodes.find(n => n.id === connectState.sourceId);
            if (!source) return null;

            const { x: tx, y: ty } = screenToCanvas(connectState.currentX, connectState.currentY);
            const sx = source.x + source.width;
            const sy = source.y + source.height / 2;
            const dist = Math.hypot(tx - sx, ty - sy);
            const controlOffset = Math.min(dist * 0.35, 120);
            const d = `M ${sx} ${sy} C ${sx + controlOffset} ${sy}, ${tx - controlOffset} ${ty}, ${tx} ${ty}`;

            return (
              <path
                d={d}
                stroke="#6366f1"
                strokeWidth="2"
                strokeDasharray="6,4"
                fill="none"
                markerEnd="url(#arrowhead)"
              />
            );
          })()}
        </svg>

        {/* Nodes Layer */}
        {nodes.map(node => (
            <div 
                key={node.id}
                data-node-id={node.id}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                style={{
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    zIndex: dragState.mode === 'DRAG_NODE' && dragState.nodeId === node.id ? 999 : (node.selected ? 10 : 1),
                }}
                className="transition-shadow duration-200"
            >
                {node.type === NodeType.INSIGHT && (
                    <div className="pointer-events-none absolute -right-14 top-3 z-10 rounded-full border border-indigo-100 bg-white/90 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-indigo-400 shadow-sm">
                        Note Link
                    </div>
                )}
                <button
                    type="button"
                    className={`absolute -right-3 top-1/2 z-20 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border bg-white shadow-sm transition-colors ${
                      node.type === NodeType.INSIGHT
                        ? 'border-indigo-300 text-indigo-600 ring-2 ring-indigo-100 hover:border-indigo-500 hover:text-indigo-700'
                        : 'border-indigo-200 text-indigo-500 hover:border-indigo-400 hover:text-indigo-700'
                    }`}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setConnectState({
                            sourceId: node.id,
                            currentX: e.clientX,
                            currentY: e.clientY
                        });
                        onNodeSelect?.(node.id);
                    }}
                    title={node.type === NodeType.INSIGHT ? 'Connect this note as context' : 'Create connection'}
                >
                    <span className="h-2.5 w-2.5 rounded-full bg-current" />
                </button>
                {renderNode(node)}
            </div>
        ))}
      </div>
      
      {/* UI Overlay: Zoom Info & Navigation Buttons */}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 pointer-events-none">
        <div className="bg-white/90 backdrop-blur border border-slate-200 px-3 py-1.5 rounded-full shadow-sm text-xs font-mono text-slate-500 select-none">
          {(transform.scale * 100).toFixed(0)}%
        </div>
        <button 
          onClick={handleFocusDataSource}
          className="bg-white border border-slate-200 w-7 h-7 flex items-center justify-center rounded-full shadow-md text-slate-500 hover:text-emerald-600 hover:border-emerald-200 transition-all pointer-events-auto group"
          title="Focus on Data Source"
        >
          <Target size={16} className="group-active:scale-90 transition-transform" />
        </button>
      </div>
    </div>
  );
};
