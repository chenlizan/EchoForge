
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
    if (dragState.mode === 'DRAG_NODE') return;

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
    if (dragState.mode === 'PAN') {
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

  const handleMouseUp = () => {
      setDragState({ mode: 'IDLE', startX: 0, startY: 0 });
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

            return (
              <g key={edge.id} className="group">
                 <path d={d} stroke="transparent" strokeWidth="15" fill="none" className="pointer-events-auto cursor-pointer" />
                 <path 
                    d={d}
                    stroke={isFork ? "#cbd5e1" : "#94a3b8"}
                    strokeWidth="2"
                    strokeDasharray={isFork ? "6,4" : "0"}
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    className={`transition-colors duration-200 group-hover:stroke-indigo-400 group-hover:stroke-[3px] ${isFork ? 'opacity-80' : ''}`}
                  />
                  {edge.label && (
                      <foreignObject x={(sx+tx)/2 - 40} y={(sy+ty)/2 - 12} width="80" height="24">
                        <div className="flex justify-center items-center">
                            <span className={`bg-white/80 backdrop-blur px-1.5 py-0.5 rounded text-[10px] text-slate-500 border border-slate-100 shadow-sm font-medium ${isFork ? 'text-slate-400 italic' : ''}`}>
                                {edge.label}
                            </span>
                        </div>
                      </foreignObject>
                  )}
              </g>
            );
          })}
        </svg>

        {/* Nodes Layer */}
        {nodes.map(node => (
            <div 
                key={node.id}
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
