
import React, { useState } from 'react';
import { CanvasNode, NodeType, VizType, VariableRole, Language } from './types';
import { 
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, AreaChart, Area 
} from 'recharts';
import { 
  X, Copy, GitBranch, Activity, Table, Sparkles, MessageSquare, 
  ArrowRight, ShieldAlert, Network, Play, Sliders, Calculator, FileText,
  Circle, Check
} from 'lucide-react';

interface NodeProps {
  node: CanvasNode;
  nodes: CanvasNode[];
  onAction: (action: string, payload?: any) => void;
  language: Language;
}

// Simple translation dictionary
const t = {
    variables: { en: 'Variables', zh: '变量列表' },
    clickToAssign: { en: 'Click badges to assign roles', zh: '点击徽章分配角色' },
    suggestDAG: { en: 'Suggest DAG', zh: '建议因果图' },
    autoEDA: { en: 'Auto EDA', zh: '自动探索分析' },
    askAI: { en: 'Ask AI', zh: '问 AI' },
    estimateATE: { en: 'Estimate Causal Effect (ATE)', zh: '估计因果效应 (ATE)' },
    adjustmentSet: { en: 'Adjustment Set (Controls)', zh: '调整集 (控制变量)' },
    estimatedEffect: { en: 'Estimated Effect Size (ATE)', zh: '估计效应大小 (ATE)' },
    suggestedNext: { en: 'Suggested Next Step:', zh: '建议下一步:' },
    code: { en: 'Code', zh: '代码' },
    fork: { en: 'Fork', zh: '分叉' },
    observational: { en: 'Observational', zh: '观察性研究' },
    unassigned: { en: 'Unassigned', zh: '未分配' },
    treatment: { en: 'Treatment', zh: '处理变量' },
    outcome: { en: 'Outcome', zh: '结果变量' },
    confounder: { en: 'Confounder', zh: '混杂因素' },
    mediator: { en: 'Mediator', zh: '中介变量' },
    instrument: { en: 'Instrument', zh: '工具变量' },
    collider: { en: 'Collider', zh: '对撞变量' },
    treatmentDesc: { en: 'The variable being manipulated or studied', zh: '被操纵或研究的变量 (原因)' },
    outcomeDesc: { en: 'The result or effect variable', zh: '结果或效应变量 (结果)' },
    confounderDesc: { en: 'Influences both Treatment and Outcome (Common Cause)', zh: '同时影响处理和结果的变量 (共同原因)' },
    mediatorDesc: { en: 'Transmits the effect from Treatment to Outcome', zh: '将效应从处理传递到结果的变量 (中间机制)' },
    instrumentDesc: { en: 'Affects Treatment but only affects Outcome through Treatment', zh: '影响处理，但仅通过处理影响结果的变量' },
    colliderDesc: { en: 'Influenced by both variables (Common Effect)', zh: '受两个变量共同影响的变量 (共同结果)' }
};

// ----------------------------------------------------------------------
// Base Node Frame
// ----------------------------------------------------------------------
const NodeFrame: React.FC<{
  node: CanvasNode; 
  children: React.ReactNode; 
  icon?: React.ElementType;
  colorClass?: string;
  onAction: (a: string) => void;
  language: Language;
}> = ({ node, children, icon: Icon, colorClass = "border-slate-200", onAction, language }) => (
  <div className={`
    bg-white rounded-xl border-2 transition-all flex flex-col overflow-hidden animate-in fade-in zoom-in duration-300
    ${node.selected 
      ? 'border-indigo-600 ring-4 ring-indigo-100 shadow-2xl scale-[1.01] z-10' 
      : `${colorClass} shadow-lg hover:shadow-xl`
    }
  `}>
    <div className="bg-slate-50 p-3 border-b border-slate-100 flex items-center justify-between handle cursor-move select-none group">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={16} className="text-slate-500" />}
        <div>
          <h3 className="font-semibold text-slate-800 text-sm leading-tight">{node.data.title}</h3>
          {node.data.subtitle && <p className="text-[10px] text-slate-500">{node.data.subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
         <button 
            onClick={() => onAction('delete')} 
            onMouseDown={(e) => e.stopPropagation()}
            className="text-slate-400 hover:text-red-500 p-1 rounded hover:bg-slate-100"
         >
            <X size={14} />
         </button>
      </div>
    </div>
    
    {/* Fork Metadata Banner */}
    {node.data.forkReason && (
        <div className="bg-indigo-50/50 border-b border-indigo-100 px-3 py-1.5 flex items-center gap-2 text-[10px] text-indigo-600">
            <GitBranch size={10} className="shrink-0" />
            <span className="font-medium truncate">Fork: {node.data.forkReason}</span>
        </div>
    )}

    <div className="flex-1 p-0 relative flex flex-col">
      {children}
    </div>
    {/* Footer for reproducible science */}
    <div className="bg-slate-50 p-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 mt-auto">
      <div className="flex gap-2 font-mono items-center">
         <span className="bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[100px] text-slate-500">{node.data.method || t.observational[language]}</span>
         {node.data.pValue !== undefined && (
             <span className={`px-1 rounded ${node.data.pValue < 0.05 ? 'text-emerald-600 font-bold bg-emerald-50' : 'text-slate-400'}`} title="P-Value">
                 {node.data.pValue < 0.001 ? 'p < 0.001' : `p = ${node.data.pValue.toFixed(3)}`}
             </span>
         )}
      </div>
      <div className="flex gap-2">
         <button onClick={() => onAction('view_code')} className="hover:text-indigo-600 flex items-center gap-1 transition-colors"><Copy size={10} /> {t.code[language]}</button>
         <button onClick={() => onAction('fork')} className="hover:text-indigo-600 flex items-center gap-1 transition-colors"><GitBranch size={10} /> {t.fork[language]}</button>
      </div>
    </div>
  </div>
);

// ----------------------------------------------------------------------
// Dataset Node (Enhanced with Roles)
// ----------------------------------------------------------------------
export const DatasetNode: React.FC<NodeProps> = ({ node, onAction, language }) => {
  const columns = node.data.chartData && node.data.chartData.length > 0 
    ? Object.keys(node.data.chartData[0]).filter(k => k !== 'id' && k !== 'x' && k !== 'y') 
    : [];

  const roles = node.data.variableRoles || {};

  const getRoleBadge = (col: string) => {
    const role = roles[col] || VariableRole.UNASSIGNED;
    switch(role) {
      case VariableRole.TREATMENT: return { label: 'T', color: 'bg-emerald-100 text-emerald-700 border-emerald-300 ring-1 ring-emerald-200', title: t.treatmentDesc[language] };
      case VariableRole.OUTCOME: return { label: 'Y', color: 'bg-indigo-100 text-indigo-700 border-indigo-300 ring-1 ring-indigo-200', title: t.outcomeDesc[language] };
      case VariableRole.CONFOUNDER: return { label: 'C', color: 'bg-amber-100 text-amber-700 border-amber-300 ring-1 ring-amber-200', title: t.confounderDesc[language] };
      case VariableRole.MEDIATOR: return { label: 'M', color: 'bg-purple-100 text-purple-700 border-purple-300 ring-1 ring-purple-200', title: t.mediatorDesc[language] };
      case VariableRole.INSTRUMENT: return { label: 'I', color: 'bg-sky-100 text-sky-700 border-sky-300 ring-1 ring-sky-200', title: t.instrumentDesc[language] };
      case VariableRole.COLLIDER: return { label: 'K', color: 'bg-rose-100 text-rose-700 border-rose-300 ring-1 ring-rose-200', title: t.colliderDesc[language] };
      default: return { label: '○', color: 'bg-slate-50 text-slate-300 border-slate-200 hover:border-slate-300', title: t.unassigned[language] };
    }
  };

  return (
    <NodeFrame node={node} icon={Table} colorClass="border-emerald-200" onAction={onAction} language={language}>
      <div className="p-4 flex flex-col h-full">
        <div className="flex items-center justify-between mb-2">
             <div className="text-xs font-semibold text-slate-500">{t.variables[language]}</div>
             <div className="text-[10px] text-slate-400">{t.clickToAssign[language]}</div>
        </div>
        
        <div className="flex-1 overflow-y-auto mb-3 space-y-1 pr-1 custom-scrollbar">
            {columns.map(col => {
                const badge = getRoleBadge(col);
                return (
                  <div key={col} className="flex items-center justify-between text-xs p-1.5 bg-slate-50 rounded border border-slate-100 hover:bg-slate-100 transition-colors group">
                      <span className="font-mono text-slate-600 truncate max-w-[120px]" title={col}>{col}</span>
                      <div className="flex items-center gap-2">
                        {/* Role Toggle Button */}
                        <button 
                          onClick={() => onAction('toggle_role', col)}
                          className={`w-5 h-5 flex items-center justify-center rounded-full border text-[10px] font-bold transition-all ${badge.color}`}
                          title={badge.title}
                        >
                          {badge.label}
                        </button>
                      </div>
                  </div>
                );
            })}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-auto">
             <button 
              onClick={() => onAction('suggest_model')}
              className="col-span-1 bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 text-[10px] font-medium py-2 rounded-md flex items-center justify-center gap-1 transition-colors"
            >
              <Network size={12} /> {t.suggestDAG[language]}
            </button>
            <button 
              onClick={() => onAction('analyze')}
              className="col-span-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium py-2 rounded-md flex items-center justify-center gap-1 transition-colors shadow-sm"
            >
              <Activity size={12} /> {t.autoEDA[language]}
            </button>
        </div>
      </div>
    </NodeFrame>
  );
};

// ----------------------------------------------------------------------
// Causal Graph Node (DAG)
// ----------------------------------------------------------------------
export const CausalGraphNode: React.FC<NodeProps> = ({ node, onAction, language }) => {
  const { causalEdges = [], variableRoles = {} } = node.data;
  
  // Simple layout logic: 
  // Treatment (Left), Outcome (Right), Confounders (Top Center)
  const width = node.width;
  const height = 200; // Fixed visual height for the graph part
  
  const getPosition = (role: VariableRole, index: number, total: number) => {
     switch(role) {
         case VariableRole.TREATMENT: return { x: width * 0.15, y: height * 0.6 };
         case VariableRole.OUTCOME: return { x: width * 0.85, y: height * 0.6 };
         case VariableRole.MEDIATOR: return { x: width * 0.5, y: height * 0.6 };
         case VariableRole.CONFOUNDER: 
            return { x: width * 0.5 + (index - (total-1)/2) * 50, y: height * 0.2 };
         case VariableRole.INSTRUMENT: return { x: width * 0.1, y: height * 0.2 }; // Top Leftish
         case VariableRole.COLLIDER: return { x: width * 0.5, y: height * 0.9 }; // Bottom Center
         default: return { x: width * 0.5, y: height * 0.9 };
     }
  };

  const variables = Array.from(new Set([
      ...causalEdges.map(e => e.from),
      ...causalEdges.map(e => e.to)
  ]));
  
  const getRoleIndices = () => {
      const counts: Record<string, number> = {};
      const indices: Record<string, number> = {};
      variables.forEach(v => {
          const r = variableRoles[v] || VariableRole.UNASSIGNED;
          if (!counts[r]) counts[r] = 0;
          indices[v] = counts[r];
          counts[r]++;
      });
      return { counts, indices };
  };
  
  const { counts, indices } = getRoleIndices();

  const getNodePos = (v: string) => {
      const role = variableRoles[v] || VariableRole.UNASSIGNED;
      return getPosition(role, indices[v], counts[role] || 1);
  };

  return (
    <NodeFrame node={node} icon={Network} colorClass="border-slate-300" onAction={onAction} language={language}>
       <div className="relative h-[200px] w-full bg-slate-50/50">
          <svg className="w-full h-full pointer-events-none">
             <defs>
                <marker id={`arrow-${node.id}`} markerWidth="10" markerHeight="7" refX="24" refY="3.5" orient="auto">
                  <polygon points="0 0, 10 3.5, 0 7" fill="#94a3b8" />
                </marker>
             </defs>
             {causalEdges.map((edge, i) => {
                 const start = getNodePos(edge.from);
                 const end = getNodePos(edge.to);
                 return (
                     <line 
                        key={i}
                        x1={start.x} y1={start.y}
                        x2={end.x} y2={end.y}
                        stroke="#94a3b8"
                        strokeWidth="1.5"
                        markerEnd={`url(#arrow-${node.id})`}
                     />
                 );
             })}
          </svg>
          
          {variables.map(v => {
              const pos = getNodePos(v);
              const role = variableRoles[v];
              let bg = "bg-white";
              if (role === VariableRole.TREATMENT) bg = "bg-emerald-100 border-emerald-300 text-emerald-800";
              if (role === VariableRole.OUTCOME) bg = "bg-indigo-100 border-indigo-300 text-indigo-800";
              if (role === VariableRole.CONFOUNDER) bg = "bg-amber-100 border-amber-300 text-amber-800";
              if (role === VariableRole.MEDIATOR) bg = "bg-purple-100 border-purple-300 text-purple-800";
              if (role === VariableRole.INSTRUMENT) bg = "bg-sky-100 border-sky-300 text-sky-800";
              if (role === VariableRole.COLLIDER) bg = "bg-rose-100 border-rose-300 text-rose-800";

              return (
                  <div 
                    key={v}
                    className={`absolute transform -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-full border text-xs font-medium shadow-sm ${bg} transition-all`}
                    style={{ left: pos.x, top: pos.y }}
                  >
                      {v}
                  </div>
              )
          })}
       </div>
       
       <div className="p-3 bg-white border-t border-slate-100">
           {node.data.insight && (
                <div className="text-xs text-slate-600 flex gap-2 items-start mb-2">
                    <ShieldAlert size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <span className="leading-snug">{node.data.insight}</span>
                </div>
           )}
           <button 
                className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-medium py-1.5 rounded border border-indigo-200 transition-colors flex items-center justify-center gap-1"
                onClick={() => onAction('estimate_effect')}
           >
               <Calculator size={12} /> {t.estimateATE[language]}
           </button>
       </div>
    </NodeFrame>
  );
};

// ----------------------------------------------------------------------
// Visualization Node (Enhanced)
// ----------------------------------------------------------------------
export const VisualizationNode: React.FC<NodeProps> = ({ node, onAction, language }) => {
  const { vizType, chartData, xAxisKey, yAxisKey, xAxisLabel, yAxisLabel, insight, assumptions } = node.data;
  
  // Calculate fixed dimensions based on node width (passed from prop)
  // Card padding is not explicitly defined in parent, but NodeFrame has children in flex-1 p-0.
  // We added p-2 wrapper below.
  const chartWidth = node.width - 20; // 380 - padding
  const chartHeight = 190;

  const handlePointClick = (data: any) => {
    onAction('point_click', data);
  };
  
  const hasData = chartData && chartData.length > 0;

  return (
    <NodeFrame node={node} icon={Activity} colorClass="border-indigo-100" onAction={onAction} language={language}>
      {/* Chart Area */}
      <div className="h-48 w-full bg-white relative group shrink-0 flex items-center justify-center overflow-hidden">
        {hasData ? (
          <div style={{ width: chartWidth, height: chartHeight, position: 'relative' }}>
             {vizType === VizType.SCATTER ? (
            <ScatterChart width={chartWidth} height={chartHeight} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis type="number" dataKey="x" name={xAxisLabel} unit="" fontSize={10} stroke="#94a3b8" tickFormatter={(v) => v.toFixed(1)} />
              <YAxis type="number" dataKey="y" name={yAxisLabel} unit="" fontSize={10} stroke="#94a3b8" />
              <Tooltip 
                cursor={{ strokeDasharray: '3 3' }}
                contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Scatter 
                name={node.data.title} 
                data={chartData} 
                fill="#6366f1" 
                onClick={(props: any) => {
                  if (props && props.cx !== undefined && props.cy !== undefined) {
                    onAction('point_click', { cx: props.cx, cy: props.cy, data: props.payload });
                  } else {
                    onAction('point_click', { cx: chartWidth/2, cy: chartHeight/2, data: props.payload || props });
                  }
                }}
                cursor="pointer"
              />
            </ScatterChart>
          ) : (
             <AreaChart width={chartWidth} height={chartHeight} data={chartData} margin={{ top: 10, right: 10, bottom: 20, left: 0 }}>
                <defs>
                  <linearGradient id={`grad${node.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="x" fontSize={10} stroke="#94a3b8" />
                <YAxis fontSize={10} stroke="#94a3b8" />
                <Tooltip />
                <Area type="monotone" dataKey="y" stroke="#6366f1" fillOpacity={1} fill={`url(#grad${node.id})`} />
             </AreaChart>
          )}
          
          {/* Outlier Popover */}
          {node.data.activePopover && (
            <div 
              className="absolute z-50 bg-white border border-slate-200 shadow-xl rounded-lg p-3 w-64 text-left animate-in fade-in zoom-in duration-200"
              style={{ 
                left: Math.min(node.data.activePopover.x + 10, chartWidth - 260), 
                top: Math.min(node.data.activePopover.y + 10, chartHeight - 120) 
              }}
            >
              <div className="flex justify-between items-start mb-2">
                <h4 className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                  <Sparkles size={12} className="text-indigo-600" /> 
                  {language === 'zh' ? '异常点分析' : 'Outlier Analysis'}
                </h4>
                <button onClick={(e) => { e.stopPropagation(); onAction('close_popover'); }} className="text-slate-400 hover:text-slate-600">
                  <X size={12} />
                </button>
              </div>
              
              {node.data.activePopover.loading ? (
                <div className="flex items-center gap-2 text-xs text-slate-500 py-2">
                  <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                  {language === 'zh' ? '正在诊断...' : 'Diagnosing...'}
                </div>
              ) : (
                <div className="text-[10px] text-slate-600">
                  <p className="mb-2 leading-relaxed">{node.data.activePopover.explanation?.insight}</p>
                  <div className="flex gap-2 mt-3">
                    <button 
                      onClick={(e) => { e.stopPropagation(); onAction('pin_popover'); }}
                      className="flex-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 py-1 rounded border border-indigo-100 transition-colors font-medium"
                    >
                      {language === 'zh' ? '转为独立节点' : 'Pin to Canvas'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        ) : (
             <div className="text-center p-4">
                 <div className="text-slate-300 mb-2"><Activity size={24} className="mx-auto" /></div>
                 <div className="text-xs text-slate-400">No data available for visualization</div>
                 <div className="text-[10px] text-slate-300 font-mono mt-1">{xAxisKey} vs {yAxisKey}</div>
             </div>
        )}
        
        {/* Floating "Ask AI" button that appears on hover */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
           <button 
             onClick={(e) => { e.stopPropagation(); onAction('ask_ai'); }}
             className="bg-white border border-indigo-200 text-indigo-600 px-2 py-1 rounded shadow-sm text-xs font-medium flex items-center gap-1 hover:bg-indigo-50"
           >
             <MessageSquare size={12} /> {t.askAI[language]}
           </button>
        </div>
      </div>
      
      {/* Assumptions Tags (New) */}
      {assumptions && assumptions.length > 0 && (
          <div className="px-4 py-1.5 bg-slate-50 border-t border-slate-100 flex gap-2 overflow-x-auto">
              {assumptions.map((asm, i) => (
                  <span key={i} className="text-[9px] uppercase tracking-wider text-slate-500 font-semibold bg-white border border-slate-200 px-1.5 rounded">
                      {asm}
                  </span>
              ))}
          </div>
      )}

      {/* AI Insight Section (Research Note Style) */}
      {insight && (
        <div className="px-4 py-3 bg-amber-50/50 border-t border-amber-100 grow">
           <div className="flex items-start gap-2.5">
             <div className="mt-0.5 min-w-[16px]"><FileText size={14} className="text-amber-600/70" /></div>
             <p className="text-xs text-slate-700 leading-relaxed font-medium italic">
               "{insight}"
             </p>
           </div>
        </div>
      )}

      {/* Suggestions chips */}
      {node.data.suggestedActions && (
        <div className="px-3 py-2 flex flex-wrap gap-2 border-t border-slate-50">
          {node.data.suggestedActions.map((action, idx) => (
             <button 
                key={idx} 
                className="text-[10px] bg-white text-slate-600 px-2 py-1 rounded-full border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 transition-colors shadow-sm"
                onClick={() => onAction('suggestion', action)}
             >
               {action}
             </button>
          ))}
        </div>
      )}
    </NodeFrame>
  );
};

// ----------------------------------------------------------------------
// Insight / Analysis Node (Enhanced for Estimates)
// ----------------------------------------------------------------------
export const InsightNode: React.FC<NodeProps> = ({ node, nodes, onAction, language }) => {
    const isEstimation = node.data.ate !== undefined;
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(node.data.insight || '');
    const [showSaved, setShowSaved] = useState(false);

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setIsEditing(true);
        setEditValue(node.data.insight || '');
    };

    const handleSave = () => {
        setIsEditing(false);
        if (editValue !== node.data.insight) {
            onAction('update_insight', editValue);
            setShowSaved(true);
            setTimeout(() => setShowSaved(false), 2000);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            handleSave();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        }
    };

    const renderInsightWithMentions = (text: string) => {
        const normalize = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, '');
        const mentionPattern = /(@\[[^\]]+\]|@node-[a-zA-Z0-9-]+|@[^\s@#.,;:!?()[\]{}]+)/g;
        const parts = text.split(mentionPattern);

        const resolveMention = (token: string) => {
            if (token.startsWith('@node-')) {
                const targetId = token.substring(1);
                return nodes.find(n => n.id === targetId);
            }

            if (token.startsWith('@[') && token.endsWith(']')) {
                const title = token.slice(2, -1).trim();
                const normalizedTitle = normalize(title);
                return nodes.find(n => normalize(n.data.title || '') === normalizedTitle);
            }

            const title = token.slice(1).trim();
            const normalizedTitle = normalize(title);
            return nodes.find(n => normalize(n.data.title || '') === normalizedTitle);
        };

        return parts.map((part, i) => {
            if (!part.startsWith('@')) {
                return <span key={i}>{part}</span>;
            }

            const targetNode = resolveMention(part);
            if (targetNode) {
                return (
                    <span
                        key={i}
                        className="text-indigo-600 bg-indigo-50 px-1 rounded cursor-pointer hover:bg-indigo-100 font-mono text-[10px] border border-indigo-100 transition-colors"
                        onClick={(e) => {
                            e.stopPropagation();
                            onAction('focus_node', targetNode.id);
                        }}
                        title={`${language === 'zh' ? '点击跳转到' : 'Click to jump to'} ${targetNode.data.title || targetNode.id}`}
                    >
                        {part}
                    </span>
                );
            }

            return (
                <span
                    key={i}
                    className="text-slate-400 bg-slate-50 px-1 rounded font-mono text-[10px] border border-slate-100 line-through"
                    title={language === 'zh' ? "无效引用" : "Invalid reference"}
                >
                    {part}
                </span>
            );
        });
    };

    return (
        <NodeFrame node={node} icon={isEstimation ? Calculator : Activity} colorClass={isEstimation ? "border-sky-200" : "border-amber-200"} onAction={onAction} language={language}>
             <div 
                className="p-4 prose prose-sm max-w-none text-slate-600 text-xs flex-1 flex flex-col relative"
                onDoubleClick={handleDoubleClick}
             >
                {/* Save Toast */}
                {showSaved && (
                    <div className="absolute top-2 right-2 bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 animate-in fade-in slide-in-from-top-2 duration-300 z-10">
                        <Check size={10} /> {language === 'zh' ? '已保存' : 'Saved'}
                    </div>
                )}

                {/* Regular Insight Content */}
                {isEditing ? (
                    <div className="mb-3 flex-1 flex flex-col">
                        <textarea
                            autoFocus
                            className="w-full min-h-[100px] p-2 border border-indigo-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none font-sans text-xs text-slate-700 bg-white overflow-hidden"
                            value={editValue}
                            onChange={(e) => {
                                setEditValue(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                            }}
                            onFocus={(e) => {
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                            }}
                            onBlur={handleSave}
                            onKeyDown={handleKeyDown}
                            placeholder={language === 'zh' ? "输入笔记内容..." : "Enter note content..."}
                        />
                        <div className="text-[9px] text-slate-400 mt-1 flex justify-between">
                            <span>{language === 'zh' ? "按 Esc 或点击外部保存，Shift+Enter 换行" : "Esc or click outside to save, Shift+Enter for new line"}</span>
                        </div>
                    </div>
                ) : (
                    <div className="whitespace-pre-wrap font-sans mb-3 cursor-text hover:bg-slate-50/50 rounded transition-colors -mx-2 p-2 flex-1">
                        {node.data.insight ? (
                            renderInsightWithMentions(node.data.insight)
                        ) : (
                            <span className="text-slate-400 italic">
                                {language === 'zh' ? "双击编辑此笔记..." : "Double click to edit this note."}
                            </span>
                        )}
                    </div>
                )}
                
                {/* Estimation Results Block */}
                {isEstimation && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                        {/* Adjustment Sets */}
                        {node.data.adjustmentSet && node.data.adjustmentSet.length > 0 && (
                            <div className="mb-4">
                                <div className="text-[10px] uppercase text-slate-400 font-bold mb-1.5 flex items-center gap-1">
                                    <Sliders size={10} /> {t.adjustmentSet[language]}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {node.data.adjustmentSet.map((v, i) => (
                                        <span key={i} className="px-2 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-600 font-mono text-[10px]">
                                            {v}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Forest Plot Visual */}
                        <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
                             <div className="text-[10px] uppercase text-slate-400 font-bold mb-2">{t.estimatedEffect[language]}</div>
                             <div className="relative h-8 w-full">
                                 {/* Zero Line */}
                                 <div className="absolute left-1/2 top-0 bottom-0 w-px bg-slate-300 border-r border-dashed"></div>
                                 
                                 {/* CI Bar */}
                                 {/* Simple visual scaling simulation: Assume range -5 to 5 for now or scale relative to values */}
                                 {(() => {
                                     // Quick scale logic for visualization
                                     const val = node.data.ate || 0;
                                     const low = node.data.ciLower || (val - 1);
                                     const high = node.data.ciUpper || (val + 1);
                                     const maxRange = Math.max(Math.abs(low), Math.abs(high), 5) * 1.5;
                                     
                                     const toPct = (n: number) => ((n / maxRange) * 50) + 50;
                                     
                                     return (
                                        <div className="relative h-full w-full">
                                            {/* CI Line */}
                                            <div 
                                                className="absolute top-1/2 -translate-y-1/2 h-0.5 bg-indigo-300"
                                                style={{ left: `${toPct(low)}%`, right: `${100 - toPct(high)}%` }}
                                            ></div>
                                            {/* CI Caps */}
                                            <div className="absolute top-1/2 -translate-y-1/2 h-2 w-px bg-indigo-400" style={{ left: `${toPct(low)}%` }}></div>
                                            <div className="absolute top-1/2 -translate-y-1/2 h-2 w-px bg-indigo-400" style={{ left: `${toPct(high)}%` }}></div>
                                            
                                            {/* Point Estimate */}
                                            <div 
                                                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-indigo-600 rounded-full border-2 border-white shadow-sm transform -translate-x-1/2"
                                                style={{ left: `${toPct(val)}%` }}
                                            ></div>
                                        </div>
                                     );
                                 })()}
                             </div>
                             <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                                 <span>{node.data.ciLower?.toFixed(2)}</span>
                                 <span className="text-indigo-700 font-bold">{node.data.ate?.toFixed(2)}</span>
                                 <span>{node.data.ciUpper?.toFixed(2)}</span>
                             </div>
                        </div>
                        
                        {/* Formula */}
                         {node.data.formula && (
                            <div className="mt-3 p-2 bg-white border border-slate-100 rounded font-mono text-[10px] text-slate-500 overflow-x-auto whitespace-nowrap">
                                {node.data.formula}
                            </div>
                        )}
                        
                        {/* Heterogeneity Suggestion */}
                        {node.data.heterogeneity && (
                             <div className="mt-3 text-[10px] text-slate-500 italic border-l-2 border-purple-200 pl-2">
                                 {t.suggestedNext[language]} {node.data.heterogeneity}
                             </div>
                        )}
                    </div>
                )}

                {/* Suggested Actions Block */}
                {node.data.suggestedActions && node.data.suggestedActions.length > 0 && (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                        <div className="text-[10px] uppercase text-indigo-400 font-bold mb-2 flex items-center gap-1">
                            <Sparkles size={10} /> {language === 'zh' ? '建议行动' : 'Suggested Actions'}
                        </div>
                        <div className="flex flex-col gap-1.5">
                            {node.data.suggestedActions.map((action, i) => (
                                <button 
                                    key={i}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAction('perform_suggested_action', action);
                                    }}
                                    className="text-left text-[10px] text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 p-1.5 rounded transition-colors flex items-center gap-1.5 group"
                                >
                                    <ArrowRight size={10} className="text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                                    <span className="flex-1 leading-tight">{action}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
             </div>
        </NodeFrame>
    );
};
