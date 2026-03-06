
import React, { useState, useRef } from 'react';
import './styles.css';
import { InfiniteCanvas } from './InfiniteCanvas';
import { CanvasNode, CanvasEdge, NodeType, VizType, VariableRole, Language, SuggestedAction, HistoryState, ChatMessage } from './types';
import { DatasetNode, VisualizationNode, InsightNode, CausalGraphNode } from './NodeViews';
import { generateInitialEDA, explainOutlier, generateCausalGraph, generateIdentificationStrategy, generateNotebook, generateAssumptionsReport, generateNodeCode, performSuggestedAction, analyzeInsight, buildContextWithNotes, normalizeSuggestedActions, askNodeQuestion } from './Ollama';
import { GitCommit, Download, Sparkles, Upload, Undo2, Redo2, FileText, Languages, MousePointer2, GitBranch, X, Copy, Check } from 'lucide-react';

// Translation Dictionary for App.tsx
const t = {
    newAnalysis: { en: 'New Analysis', zh: '新建分析' },
    exportNotebook: { en: 'Notebook', zh: 'Notebook' },
    assumptionsReport: { en: 'Report', zh: '报告' },
    timeTravel: { en: 'Time Travel', zh: '时间旅行' },
    importData: { en: 'Import', zh: '导入' },
    askAssistant: { en: 'AI Assistant', zh: 'AI 助手' },
    addManualNode: { en: 'Manual Node', zh: '手动节点' },
    processing: { en: 'Processing...', zh: '处理中...' },
    generatingNotebook: { en: 'Generating Reproducible Quarto Notebook...', zh: '正在生成可复现的 Quarto Notebook...' },
    synthesizingReport: { en: 'Synthesizing Assumptions Report...', zh: '正在合成假设报告...' },
    generatingCode: { en: 'Generating code for this node...', zh: '正在为该节点生成代码...' },
    inferringDAG: { en: 'Inferring Causal Structure...', zh: '正在推断因果结构...' },
    estimating: { en: 'Identifying & Estimating Effect...', zh: '正在识别并估计效应...' },
    generatingPlan: { en: 'Generating Visualization Plan...', zh: '正在生成可视化计划...' },
    diagnosing: { en: 'Diagnosing Outlier...', zh: '正在诊断异常值...' },
    copy: { en: 'Copy to Clipboard', zh: '复制到剪贴板' },
    copied: { en: 'Copied', zh: '已复制' },
    notebookTitle: { en: 'Reproducible Notebook (.qmd)', zh: '可复现 Notebook (.qmd)' },
    reportTitle: { en: 'Assumptions & Robustness Report', zh: '假设与稳健性报告' },
    nodeCodeTitle: { en: 'Node Code', zh: '节点代码' },
    chatTitle: { en: 'Research Chat', zh: '研究对话' },
    chatPlaceholder: { en: 'Ask about this node, its assumptions, or next steps...', zh: '提问这个节点、它的假设，或下一步分析...' },
    chatSend: { en: 'Send', zh: '发送' },
    chatEmpty: { en: 'No messages yet. Ask a concrete methodological question.', zh: '还没有消息。可以直接问一个方法论问题。' },
    chatPin: { en: 'Pin Latest Reply', zh: '固定最新回复' },
    staleAssociation: { en: 'Connected note changed', zh: '关联笔记已变化' },
    source: { en: 'Quarto / R Markdown Source', zh: 'Quarto / R Markdown 源码' },
    summary: { en: 'Research Assumptions Summary', zh: '研究假设摘要' },
    researchPreview: { en: 'AI-Powered Causal Workbench', zh: 'AI 驱动的因果推断工作台' },
    select: { en: 'Select', zh: '选择' }
};

const INITIAL_NODES: CanvasNode[] = [];
const MENTION_PATTERN = /@node-[a-zA-Z0-9-]+/g;
const EXECUTION_EDGES: Array<CanvasEdge['type']> = ['causal', 'flow', 'fork'];

// Simple histogram binning helper
const calculateHistogram = (data: any[], key: string, bins = 20) => {
    const values = data.map(d => Number(d[key])).filter(n => !isNaN(n));
    if (values.length === 0) return [];
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const binSize = range / bins;
    
    const histogram = new Array(bins).fill(0).map((_, i) => ({
        x: Number((min + (i * binSize)).toFixed(1)),
        y: 0,
        range: `${(min + i*binSize).toFixed(1)} - ${(min + (i+1)*binSize).toFixed(1)}`
    }));
    
    values.forEach(v => {
        const binIndex = Math.min(Math.floor((v - min) / binSize), bins - 1);
        if (binIndex >= 0) histogram[binIndex].y++;
    });
    
    return histogram;
};

// Helper to find column key case-insensitively
const findClosestKey = (requested: string, available: string[]) => {
    if (!requested) return null;
    const normalizedReq = requested.toLowerCase().replace(/[^a-z0-9]/g, '');
    return available.find(k => k.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedReq) || available[0];
};

// Layout Utility: Find best non-overlapping position
const PADDING = 40;
const findBestPosition = (nodes: CanvasNode[], startX: number, startY: number, width: number, height: number) => {
    let currentX = startX;
    let currentY = startY;
    let attempts = 0;
    const maxAttempts = 100;

    const isColliding = (x: number, y: number) => {
        return nodes.some(n => {
            // Check for rectangle intersection with padding
            return (
                x < n.x + n.width + PADDING &&
                x + width + PADDING > n.x &&
                y < n.y + n.height + PADDING &&
                y + height + PADDING > n.y
            );
        });
    };

    // Strategy: Try to place at startX/startY. 
    // If colliding, move DOWN first (to stack in columns), then RIGHT if column is full.
    // But user wants "not always up/down", so maybe prefer RIGHT for single nodes?
    // Let's use a "radial"ish search or simple grid search.
    
    // Simple Grid Search:
    // Try positions (0,0), (0,1), (1,0), (0,2), (1,1), (2,0)... relative to start
    // But simpler: Just scan down, then right.
    
    while (isColliding(currentX, currentY) && attempts < maxAttempts) {
        // Try moving down first
        currentY += 50;
        
        // If we've moved down significantly (e.g. > 200px), try moving right and reset Y
        if (currentY > startY + 200) {
            currentY = startY;
            currentX += 50;
        }
        attempts++;
    }

    return { x: currentX, y: currentY };
};

// -----------------------------------------------------------------------
// Code/Report Viewer Modal
// -----------------------------------------------------------------------
const CodeViewerModal = ({ 
    isOpen, 
    onClose, 
    title, 
    content, 
    type,
    language
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    title: string; 
    content: string; 
    type: 'code' | 'report';
    language: Language;
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col overflow-hidden border border-slate-200">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${type === 'code' ? 'bg-indigo-100 text-indigo-600' : 'bg-amber-100 text-amber-600'}`}>
                            {type === 'code' ? <GitCommit size={20} /> : <FileText size={20} />}
                        </div>
                        <div>
                             <h2 className="font-semibold text-slate-800">{title}</h2>
                             <p className="text-xs text-slate-500">{type === 'code' ? t.source[language] : t.summary[language]}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button 
                            onClick={handleCopy}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 rounded-md hover:bg-slate-50 transition-all"
                         >
                            {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                            {copied ? t.copied[language] : t.copy[language]}
                        </button>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-auto bg-slate-50 p-6 custom-scrollbar">
                    <pre className={`font-mono text-sm p-6 rounded-lg border shadow-inner ${type === 'code' ? 'bg-slate-900 text-indigo-50 border-slate-800' : 'bg-white text-slate-700 border-slate-200'}`}>
                        {content}
                    </pre>
                </div>
            </div>
        </div>
    );
};

// -----------------------------------------------------------------------
// Fork Branch Modal
// -----------------------------------------------------------------------
const ForkModal = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    sourceNodeTitle 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    onConfirm: (reason: string, label: string) => void; 
    sourceNodeTitle: string; 
}) => {
    const [reason, setReason] = useState('');
    const [label, setLabel] = useState('');
    
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-96 p-6 border border-slate-200">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                        <GitBranch size={20} />
                    </div>
                    <div>
                        <h3 className="text-lg font-semibold text-slate-800">Fork Analysis Branch</h3>
                        <p className="text-xs text-slate-500">Create experimental version</p>
                    </div>
                </div>
                
                <p className="text-sm text-slate-600 mb-4 bg-slate-50 p-3 rounded border border-slate-100">
                    You are forking from <span className="font-medium text-slate-800">{sourceNodeTitle}</span>. 
                    This will duplicate the current node and all downstream dependencies.
                </p>
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Branch Label (Optional)</label>
                        <input 
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="e.g. Robustness Check 1"
                            value={label}
                            onChange={e => setLabel(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">Fork Reason / Hypothesis</label>
                        <textarea 
                            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm h-24 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                            placeholder="Why are you forking this? e.g. Removing outliers to check sensitivity..."
                            value={reason}
                            onChange={e => setReason(e.target.value)}
                        />
                    </div>
                </div>
                
                <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-slate-100">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-md font-medium transition-colors">Cancel</button>
                    <button 
                        onClick={() => onConfirm(reason, label)}
                        className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 font-medium shadow-sm transition-all flex items-center gap-2"
                    >
                        <GitBranch size={14} />
                        Fork Branch
                    </button>
                </div>
            </div>
        </div>
    );
};

const ChatModal = ({
    isOpen,
    onClose,
    title,
    messages,
    inputValue,
    onInputChange,
    onSubmit,
    onPinLatest,
    loading,
    language
}: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    messages: ChatMessage[];
    inputValue: string;
    onInputChange: (value: string) => void;
    onSubmit: () => void;
    onPinLatest: () => void;
    loading: boolean;
    language: Language;
}) => {
    if (!isOpen) return null;

    const latestAssistantReply = [...messages].reverse().find(message => message.role === 'assistant');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="flex h-[70vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-4">
                    <div>
                        <h2 className="font-semibold text-slate-800">{title}</h2>
                        <p className="text-xs text-slate-500">{t.chatTitle[language]}</p>
                    </div>
                    <button onClick={onClose} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
                        <X size={18} />
                    </button>
                </div>

                <div className="flex-1 space-y-3 overflow-auto bg-slate-50 px-5 py-4 custom-scrollbar">
                    {messages.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-400">
                            {t.chatEmpty[language]}
                        </div>
                    ) : (
                        messages.map(message => (
                            <div
                                key={message.id}
                                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                                    message.role === 'user'
                                        ? 'ml-auto bg-indigo-600 text-white'
                                        : 'bg-white text-slate-700 border border-slate-200'
                                }`}
                            >
                                {message.content}
                            </div>
                        ))
                    )}
                </div>

                <div className="border-t border-slate-100 bg-white p-4">
                    <div className="mb-3 flex items-center justify-end">
                        <button
                            onClick={onPinLatest}
                            disabled={!latestAssistantReply || loading}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {t.chatPin[language]}
                        </button>
                    </div>
                    <div className="flex items-end gap-3">
                        <textarea
                            value={inputValue}
                            onChange={(e) => onInputChange(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    onSubmit();
                                }
                            }}
                            placeholder={t.chatPlaceholder[language]}
                            className="min-h-[84px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition-all focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
                        />
                        <button
                            onClick={onSubmit}
                            disabled={loading || !inputValue.trim()}
                            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {loading ? t.processing[language] : t.chatSend[language]}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default function App() {
  const [nodes, setNodes] = useState<CanvasNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("Processing...");
  const [language, setLanguage] = useState<Language>('en');
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Modal State
  const [modalState, setModalState] = useState<{isOpen: boolean, title: string, content: string, type: 'code' | 'report'}>({
      isOpen: false, title: '', content: '', type: 'code'
  });

  // History State
  const [history, setHistory] = useState<HistoryState>({ past: [], future: [] });
  
  // Fork Modal State
  const [forkModalState, setForkModalState] = useState<{isOpen: boolean, nodeId: string | null}>({ isOpen: false, nodeId: null });
  const [chatState, setChatState] = useState<{
      isOpen: boolean;
      nodeId: string | null;
      title: string;
      messages: ChatMessage[];
      input: string;
      loading: boolean;
  }>({ isOpen: false, nodeId: null, title: '', messages: [], input: '', loading: false });
  const insightAnalysisRequestRef = useRef<Record<string, number>>({});

  const handleForkConfirm = (reason: string, label: string) => {
      if (!forkModalState.nodeId) return;
      forkBranchFromNode(forkModalState.nodeId, reason, label);
      setForkModalState({ isOpen: false, nodeId: null });
  };

  const forkBranchFromNode = (rootId: string, reason: string, label: string) => {
      const rootNode = nodes.find(n => n.id === rootId);
      if (!rootNode) return;

      // 1. Identify all descendant nodes
      const descendants = new Set<string>();
      const queue = [rootId];
      while (queue.length > 0) {
          const current = queue.shift()!;
          edges.filter(e => e.source === current).forEach(e => {
              if (!descendants.has(e.target)) {
                  descendants.add(e.target);
                  queue.push(e.target);
              }
          });
      }
      
      // Include the root node itself in the set to be cloned
      const nodesToClone = [rootId, ...Array.from(descendants)];
      
      // 2. Calculate Offset
      const branchNodes = nodes.filter(n => nodesToClone.includes(n.id));
      const minX = Math.min(...branchNodes.map(n => n.x));
      const maxX = Math.max(...branchNodes.map(n => n.x + n.width));
      
      const offsetX = (maxX - minX) + 100; // Shift right by width of branch + padding
      const offsetY = 80; // Slight down shift
      
      // 3. Clone Nodes
      const idMap = new Map<string, string>(); // Old ID -> New ID
      const newNodes: CanvasNode[] = [];
      
      nodesToClone.forEach(oldId => {
          const original = nodes.find(n => n.id === oldId)!;
          const newId = `fork-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          idMap.set(oldId, newId);
          
          const isRoot = oldId === rootId;
          
          newNodes.push({
              ...original,
              id: newId,
              x: original.x + offsetX,
              y: original.y + offsetY,
              selected: false, // Don't select by default
              data: {
                  ...original.data,
                  title: isRoot && label ? label : original.data.title, // Update title if label provided for root
                  meta: {
                      ...(original.data.meta || { model: 'manual', prompt: '', timestamp: new Date().toISOString() }),
                      lastEdited: new Date().toISOString()
                  },
                  forkMeta: isRoot ? {
                      parentId: rootId,
                      forkTimestamp: Date.now(),
                      forkReason: reason,
                      branchLabel: label,
                      originalNodeTitle: rootNode.data.title
                  } : undefined
              }
          });
      });
      
      // 4. Clone Edges (Internal to the branch)
      const newEdges: CanvasEdge[] = [];
      edges.forEach(e => {
          if (nodesToClone.includes(e.source) && nodesToClone.includes(e.target)) {
              newEdges.push({
                  ...e,
                  id: `edge-${idMap.get(e.source)}-${idMap.get(e.target)}`,
                  source: idMap.get(e.source)!,
                  target: idMap.get(e.target)!
              });
          }
      });
      
      // 5. Create Link from Original Root to New Root
      const newRootId = idMap.get(rootId)!;
      const forkEdge: CanvasEdge = {
          id: `fork-link-${rootId}-${newRootId}`,
          source: rootId,
          target: newRootId,
          type: 'fork',
          label: label || 'fork'
      };
      newEdges.push(forkEdge);
      
      // 6. Update State
      saveHistory();
      setNodes(prev => [...prev, ...newNodes]);
      setEdges(prev => [...prev, ...newEdges]);
  };
  
  const saveHistory = () => {
      setHistory(prev => ({
          past: [...prev.past.slice(-19), { nodes: [...nodes], edges: [...edges] }],
          future: []
      }));
  };

  const handleUndo = () => {
      if (history.past.length === 0) return;
      const last = history.past[history.past.length - 1];
      setNodes(last.nodes);
      setEdges(last.edges);
      setHistory(prev => ({
          past: prev.past.slice(0, -1),
          future: [{ nodes: [...nodes], edges: [...edges] }, ...prev.future].slice(0, 20)
      }));
  };

  const handleRedo = () => {
      if (history.future.length === 0) return;
      const next = history.future[0];
      setNodes(next.nodes);
      setEdges(next.edges);
      setHistory(prev => ({
          past: [...prev.past, { nodes: [...nodes], edges: [...edges] }].slice(-20),
          future: prev.future.slice(1)
      }));
  };

  const toggleLanguage = () => {
      setLanguage(prev => prev === 'en' ? 'zh' : 'en');
  };

  const handleNodeMove = (id: string, x: number, y: number) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, x, y } : n));
  };

  const handleNodeSelect = (id: string | null) => {
    setNodes(prev => prev.map(n => ({ ...n, selected: n.id === id })));
    if (!id) setFocusedNodeId(null);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleAddManualNode = () => {
    const newNode: CanvasNode = {
      id: `manual-${Date.now()}`,
      type: NodeType.INSIGHT,
      x: window.innerWidth / 2 - 150,
      y: window.innerHeight / 2 - 100,
      width: 300,
      height: 200,
      data: {
        title: "Manual Insight",
        subtitle: "User Note",
        insight: "Double click to edit this note.",
        suggestedActions: [],
        meta: {
          model: 'manual',
          prompt: '',
          timestamp: new Date().toISOString()
        }
      }
    };
    setNodes(prev => [...prev, newNode]);
  };

  const handleAiAssistantClick = () => {
    const selectedNode = nodes.find(node => node.selected);
    openChat(selectedNode?.id || null);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      const data = lines.slice(1).filter(l => l.trim()).map((line, i) => {
        const values = line.split(',');
        const row: any = { id: `row-${i}` };
        headers.forEach((header, index) => {
          const val = values[index]?.trim();
          row[header] = isNaN(Number(val)) ? val : Number(val);
        });
        // Add default x/y for scatter plots if not present
        if (!row.x && row[headers[0]]) row.x = row[headers[0]];
        if (!row.y && row[headers[1]]) row.y = row[headers[1]];
        return row;
      });

      const newNode: CanvasNode = {
        id: `dataset-${Date.now()}`,
        type: NodeType.DATASET,
        x: 100,
        y: 100,
        width: 300,
        height: 380,
        data: {
          title: file.name,
          subtitle: `Imported Data (N=${data.length})`,
          chartData: data,
          insight: "Imported dataset ready for analysis.",
          variableRoles: {}
        }
      };

      setNodes(prev => [...prev, newNode]);
    };
    reader.readAsText(file);
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // -----------------------------------------------------------------
  // Global Actions (Top Bar)
  // -----------------------------------------------------------------
  const handleExportNotebook = async () => {
      try {
        setLoading(true);
        setLoadingText(t.generatingNotebook[language]);
        const notebook = await generateNotebook(nodes, language);
        setModalState({
            isOpen: true,
            title: t.notebookTitle[language],
            content: notebook,
            type: 'code'
        });
      } finally {
        setLoading(false);
      }
  };

  const handleGenerateReport = async () => {
      try {
        setLoading(true);
        setLoadingText(t.synthesizingReport[language]);
        const report = await generateAssumptionsReport(nodes, language);
        setModalState({
            isOpen: true,
            title: t.reportTitle[language],
            content: report,
            type: 'report'
        });
      } finally {
        setLoading(false);
      }
  };

  const getNodeTypeLabel = (nodeType: NodeType) => {
    switch (nodeType) {
      case NodeType.DATASET: return 'Dataset';
      case NodeType.VISUALIZATION: return 'Visualization';
      case NodeType.CAUSAL_GRAPH: return 'CausalGraph';
      case NodeType.CODE: return 'Code';
      case NodeType.INSIGHT:
      default:
        return 'Insight';
    }
  };

  const extractMentionedNodeIds = (text?: string) =>
    Array.from(new Set((text || '').match(MENTION_PATTERN)?.map(token => token.slice(1)) || []));

  const getIncomingInsightNotes = (targetNodeId: string, excludeNodeId?: string) => {
    const noteIds = new Set<string>();

    edges.forEach(edge => {
      if (edge.target !== targetNodeId || edge.source === excludeNodeId) {
        return;
      }

      const sourceNode = nodes.find(n => n.id === edge.source);
      if (
        sourceNode &&
        sourceNode.type === NodeType.INSIGHT &&
        sourceNode.data.insight &&
        sourceNode.data.insight.trim()
      ) {
        noteIds.add(sourceNode.id);
      }
    });

    return nodes.filter(node => noteIds.has(node.id));
  };

  const getOutgoingAssociations = (sourceNodeId: string) =>
    edges.filter(edge => edge.source === sourceNodeId && edge.type === 'association');

  const getExecutionDescendants = (sourceNodeId: string) => {
    const descendants = new Set<string>();
    const queue = [sourceNodeId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      edges
        .filter(edge => edge.source === current && EXECUTION_EDGES.includes(edge.type))
        .forEach(edge => {
          if (!descendants.has(edge.target)) {
            descendants.add(edge.target);
            queue.push(edge.target);
          }
        });
    }

    return Array.from(descendants);
  };

  const markNodesStale = (nodeIds: string[], reason: string, upstreamNodeIds: string[]) => {
    if (nodeIds.length === 0) {
      return;
    }

    const uniqueIds = new Set(nodeIds);
    setNodes(prev => prev.map(node => {
      if (!uniqueIds.has(node.id)) {
        return node;
      }

      return {
        ...node,
        data: {
          ...node.data,
          reactivity: {
            isStale: true,
            staleReason: reason,
            upstreamNodeIds,
            staleSince: new Date().toISOString()
          }
        }
      };
    }));
  };

  const clearNodeStale = (nodeId: string) => {
    setNodes(prev => prev.map(node => node.id === nodeId ? {
      ...node,
      data: {
        ...node.data,
        reactivity: {
          ...(node.data.reactivity || { upstreamNodeIds: [] }),
          isStale: false,
          staleReason: undefined,
          staleSince: undefined
        }
      }
    } : node));
  };

  const buildNodeContext = (
    nodeId: string,
    baseContext: string,
    options?: { includeSelf?: boolean; excludeNodeId?: string }
  ) => {
    const connectedNotes = getIncomingInsightNotes(nodeId, options?.excludeNodeId)
      .map(note => ({
        id: note.id,
        title: note.data.title,
        insight: note.data.insight
      }));

    const selfNode = options?.includeSelf ? nodes.find(n => n.id === nodeId) : undefined;
    if (
      selfNode &&
      selfNode.type === NodeType.INSIGHT &&
      selfNode.id !== options?.excludeNodeId &&
      selfNode.data.insight?.trim()
    ) {
      connectedNotes.unshift({
        id: selfNode.id,
        title: selfNode.data.title,
        insight: selfNode.data.insight
      });
    }

    return buildContextWithNotes(baseContext, connectedNotes);
  };

  const buildInsightAnalysisContext = (nodeId: string, insightText: string) => {
    const currentNode = nodes.find(n => n.id === nodeId);
    if (!currentNode) {
      return insightText;
    }

    const linkedTargets = edges
      .filter(edge => edge.source === nodeId)
      .map(edge => nodes.find(n => n.id === edge.target))
      .filter((node): node is CanvasNode => Boolean(node));

    const mentionedTargets = extractMentionedNodeIds(insightText)
      .map(id => nodes.find(n => n.id === id))
      .filter((node): node is CanvasNode => Boolean(node));

    const relatedTargets = Array.from(
      new Map(
        [...linkedTargets, ...mentionedTargets]
          .filter(target => target.id !== nodeId)
          .map(target => [target.id, target])
      ).values()
    );

    const targetSummary = relatedTargets.length > 0
      ? `\n\nLinked Nodes:\n${relatedTargets
          .map(target => `- [${target.id}] ${target.data.title} (${getNodeTypeLabel(target.type)})`)
          .join('\n')}`
      : '';

    return buildNodeContext(
      nodeId,
      `Current Note [${currentNode.data.title}]: ${insightText}${targetSummary}`,
      { includeSelf: false, excludeNodeId: nodeId }
    );
  };

  const buildCanvasContext = () => {
    const summarizedNodes = nodes
      .slice(0, 12)
      .map(node => `- [${node.type}] ${node.data.title}: ${node.data.insight || node.data.subtitle || 'No summary'}`)
      .join('\n');

    return `Canvas Overview:\n${summarizedNodes || '- Empty canvas'}`;
  };

  const openChat = (nodeId: string | null) => {
    const node = nodeId ? nodes.find(candidate => candidate.id === nodeId) : undefined;
    const title = node
      ? `${node.data.title} · ${t.chatTitle[language]}`
      : `${language === 'zh' ? '全局画布' : 'Canvas'} · ${t.chatTitle[language]}`;

    setChatState({
      isOpen: true,
      nodeId,
      title,
      messages: node?.data.chatThread || [],
      input: '',
      loading: false
    });
  };

  const pinLatestChatReply = () => {
    const latestAssistantReply = [...chatState.messages].reverse().find(message => message.role === 'assistant');
    if (!latestAssistantReply) {
      return;
    }

    const sourceNode = chatState.nodeId ? nodes.find(node => node.id === chatState.nodeId) : undefined;
    const nodeWidth = 340;
    const nodeHeight = 220;
    const originX = sourceNode ? sourceNode.x + sourceNode.width + 60 : window.innerWidth / 2 - nodeWidth / 2;
    const originY = sourceNode ? sourceNode.y : window.innerHeight / 2 - nodeHeight / 2;
    const bestPos = findBestPosition(nodes, originX, originY, nodeWidth, nodeHeight);

    const insightNode: CanvasNode = {
      id: `chat-note-${Date.now()}`,
      type: NodeType.INSIGHT,
      x: bestPos.x,
      y: bestPos.y,
      width: nodeWidth,
      height: nodeHeight,
      data: {
        title: sourceNode
          ? `${sourceNode.data.title} · ${language === 'zh' ? '对话结论' : 'Chat Insight'}`
          : (language === 'zh' ? '画布对话结论' : 'Canvas Chat Insight'),
        subtitle: language === 'zh' ? 'Pinned from Research Chat' : 'Pinned from Research Chat',
        insight: latestAssistantReply.content,
        suggestedActions: [],
        meta: {
          model: 'ollama-local',
          prompt: chatState.messages.map(message => `${message.role}: ${message.content}`).join('\n'),
          timestamp: new Date().toISOString()
        }
      },
      parentId: sourceNode?.id
    };

    const nextEdges = sourceNode ? [{
      id: `edge-${sourceNode.id}-${insightNode.id}-${Date.now()}`,
      source: sourceNode.id,
      target: insightNode.id,
      label: 'chat',
      type: 'flow' as const
    }] : [];

    saveHistory();
    setNodes(prev => [...prev, insightNode]);
    if (nextEdges.length > 0) {
      setEdges(prev => [...prev, ...nextEdges]);
    }
  };

  const refreshVisualizationNode = async (node: CanvasNode) => {
    if (!node.parentId) {
      clearNodeStale(node.id);
      return;
    }

    const parentNode = nodes.find(candidate => candidate.id === node.parentId);
    const sourceData = parentNode?.data.chartData || [];
    const xKey = node.data.xAxisKey || parentNode?.data.xAxisKey || 'x';
    const yKey = node.data.yAxisKey || parentNode?.data.yAxisKey || 'y';

    let chartData = node.data.chartData || [];
    if (node.data.vizType === VizType.SCATTER) {
      chartData = sourceData.map((row: any) => ({ ...row, x: row[xKey], y: row[yKey] }));
    } else if (node.data.vizType === VizType.DISTRIBUTION) {
      chartData = calculateHistogram(sourceData, xKey).map((row, index) => ({
        id: `hist-${node.id}-${index}`,
        ...row
      }));
    }

    const context = buildNodeContext(node.id, `Visualization: ${node.data.title}\nAxes: ${xKey} vs ${yKey}`, { includeSelf: true });
    const refreshedInsight = await askNodeQuestion(
      context,
      language === 'zh'
        ? '根据更新后的连接笔记，重新解释这个可视化的因果方法学含义，并给出一个简短结论。'
        : 'Reinterpret this visualization using the updated connected notes and provide a concise causal-methodological takeaway.',
      language
    );
    const refreshedActions = await analyzeInsight(refreshedInsight, language, context);

    setNodes(prev => prev.map(candidate => candidate.id === node.id ? {
      ...candidate,
      data: {
        ...candidate.data,
        chartData,
        insight: refreshedInsight,
        suggestedActions: normalizeSuggestedActions(refreshedActions),
        meta: {
          ...(candidate.data.meta || { model: 'ollama-local', prompt: context, timestamp: new Date().toISOString() }),
          prompt: context,
          timestamp: new Date().toISOString()
        },
        reactivity: {
          ...(candidate.data.reactivity || { upstreamNodeIds: [node.parentId] }),
          isStale: false,
          staleReason: undefined,
          staleSince: undefined
        }
      }
    } : candidate));
  };

  const refreshCausalGraphNode = async (node: CanvasNode) => {
    if (!node.parentId) {
      clearNodeStale(node.id);
      return;
    }

    const parentNode = nodes.find(candidate => candidate.id === node.parentId);
    const sampleRow = parentNode?.data.chartData?.[0];
    const columns = sampleRow ? Object.keys(sampleRow).filter(k => k !== 'id' && k !== 'x' && k !== 'y') : [];
    const roles = parentNode?.data.variableRoles || node.data.variableRoles || {};
    const context = buildNodeContext(node.id, `Dataset: ${parentNode?.data.title || node.data.title}.`, { includeSelf: true });
    const dagResult = await generateCausalGraph(context, columns, roles, language);

    setNodes(prev => prev.map(candidate => candidate.id === node.id ? {
      ...candidate,
      data: {
        ...candidate.data,
        title: dagResult.title || candidate.data.title,
        variableRoles: roles,
        causalEdges: dagResult.edges || candidate.data.causalEdges,
        insight: dagResult.insight,
        suggestedActions: normalizeSuggestedActions(dagResult.suggestedActions),
        meta: {
          ...(candidate.data.meta || { model: 'ollama-local', prompt: context, timestamp: new Date().toISOString() }),
          prompt: context,
          timestamp: new Date().toISOString(),
          assumptions: dagResult.assumptions || candidate.data.meta?.assumptions
        },
        reactivity: {
          ...(candidate.data.reactivity || { upstreamNodeIds: [node.parentId] }),
          isStale: false,
          staleReason: undefined,
          staleSince: undefined
        }
      }
    } : candidate));
  };

  const refreshEstimateNode = async (node: CanvasNode) => {
    if (!node.parentId) {
      clearNodeStale(node.id);
      return;
    }

    const parentNode = nodes.find(candidate => candidate.id === node.parentId);
    const roles = parentNode?.data.variableRoles || {};
    const edgesList = parentNode?.data.causalEdges || [];
    const datasetNode = parentNode?.parentId ? nodes.find(candidate => candidate.id === parentNode.parentId) : undefined;
    const context = buildNodeContext(node.id, datasetNode ? `Dataset: ${datasetNode.data.title}` : 'Synthetic Data', { includeSelf: true });
    const strategy = await generateIdentificationStrategy(context, roles, edgesList, language);

    setNodes(prev => prev.map(candidate => candidate.id === node.id ? {
      ...candidate,
      data: {
        ...candidate.data,
        insight: strategy.insight,
        adjustmentSet: strategy.adjustmentSet,
        ate: strategy.ate,
        ciLower: strategy.ciLower,
        ciUpper: strategy.ciUpper,
        pValue: strategy.pValue,
        formula: strategy.formula,
        method: strategy.method,
        heterogeneity: strategy.heterogeneity,
        meta: {
          ...(candidate.data.meta || { model: 'ollama-local', prompt: context, timestamp: new Date().toISOString() }),
          prompt: context,
          timestamp: new Date().toISOString(),
          assumptions: strategy.assumptions || candidate.data.meta?.assumptions
        },
        reactivity: {
          ...(candidate.data.reactivity || { upstreamNodeIds: [node.parentId] }),
          isStale: false,
          staleReason: undefined,
          staleSince: undefined
        }
      }
    } : candidate));
  };

  const refreshNodeFromUpstream = async (node: CanvasNode) => {
    if (node.type === NodeType.CAUSAL_GRAPH) {
      await refreshCausalGraphNode(node);
      return;
    }

    if (node.type === NodeType.VISUALIZATION) {
      await refreshVisualizationNode(node);
      return;
    }

    if (node.type === NodeType.INSIGHT && node.data.ate !== undefined) {
      await refreshEstimateNode(node);
      return;
    }

    if (node.type === NodeType.INSIGHT && node.data.insight) {
      await handleNodeAction(node.id, 'analyze_insight', { insightText: node.data.insight, autoRunFirstAction: false });
      return;
    }

    if (node.type === NodeType.DATASET) {
      await handleNodeAction(node.id, 'analyze');
    }
  };

  const routeSuggestedAction = async (node: CanvasNode, suggestedAction: SuggestedAction) => {
    const actionLabel = suggestedAction.label.toLowerCase();

    if (suggestedAction.kind === 'fork') {
      forkBranchFromNode(node.id, suggestedAction.prompt || suggestedAction.label, suggestedAction.label);
      return true;
    }

    if (node.type === NodeType.DATASET && /(dag|graph|confounder|backdoor|mediator|collider)/i.test(actionLabel)) {
      await handleNodeAction(node.id, 'suggest_model');
      return true;
    }

    if (node.type === NodeType.CAUSAL_GRAPH && /(estimate|ate|effect|positivity|counterfactual)/i.test(actionLabel)) {
      await handleNodeAction(node.id, 'estimate_effect');
      return true;
    }

    if (node.type === NodeType.INSIGHT && node.parentId && /(dag|graph|confounder|backdoor)/i.test(actionLabel)) {
      await handleNodeAction(node.parentId, 'suggest_model');
      return true;
    }

    return false;
  };

  const submitChatQuestion = async () => {
    if (!chatState.input.trim()) {
      return;
    }

    const userMessage: ChatMessage = {
      id: `chat-user-${Date.now()}`,
      role: 'user',
      content: chatState.input.trim(),
      timestamp: new Date().toISOString()
    };

    const nextMessages = [...chatState.messages, userMessage];
    setChatState(prev => ({ ...prev, messages: nextMessages, input: '', loading: true }));

    const chatNode = chatState.nodeId ? nodes.find(node => node.id === chatState.nodeId) : undefined;
    const context = chatNode
      ? buildNodeContext(
          chatNode.id,
          `Node: ${chatNode.data.title}\nInsight: ${chatNode.data.insight || ''}\nType: ${chatNode.type}`,
          { includeSelf: true }
        )
      : buildCanvasContext();

    try {
      const answer = await askNodeQuestion(context, userMessage.content, language);
      const assistantMessage: ChatMessage = {
        id: `chat-assistant-${Date.now()}`,
        role: 'assistant',
        content: answer,
        timestamp: new Date().toISOString()
      };

      setChatState(prev => ({
        ...prev,
        messages: [...prev.messages, assistantMessage],
        loading: false
      }));

      if (chatNode) {
        setNodes(prev => prev.map(node => node.id === chatNode.id ? {
          ...node,
          data: {
            ...node.data,
            chatThread: [...(node.data.chatThread || []), userMessage, assistantMessage],
            meta: {
              ...(node.data.meta || { model: 'ollama-local', prompt: context, timestamp: new Date().toISOString() }),
              lastEdited: new Date().toISOString()
            }
          }
        } : node));
      }
    } catch (error) {
      const failureMessage: ChatMessage = {
        id: `chat-assistant-error-${Date.now()}`,
        role: 'assistant',
        content: language === 'zh' ? '当前无法完成回答，请稍后重试。' : 'I could not answer that right now. Please try again.',
        timestamp: new Date().toISOString()
      };
      setChatState(prev => ({ ...prev, messages: [...prev.messages, failureMessage], loading: false }));
    }
  };

  // -----------------------------------------------------------------
  // Node Actions
  // -----------------------------------------------------------------
  const handleNodeAction = async (nodeId: string, action: string, payload?: any) => {
    if (['suggest_model', 'analyze', 'estimate_effect', 'delete', 'perform_suggested_action', 'refresh_from_upstream'].includes(action)) {
        saveHistory();
    }
    
    if (action === 'fork') {
        setForkModalState({ isOpen: true, nodeId: nodeId });
        return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    if (action === 'refresh_from_upstream') {
        await refreshNodeFromUpstream(node);
        clearNodeStale(nodeId);
        return;
    }

    // --- VIEW CODE (Single Node) ---
    if (action === 'view_code') {
        try {
            setLoading(true);
            setLoadingText(t.generatingCode[language]);
            const code = node.data.codeSnippet || await generateNodeCode(node);
            if (!node.data.codeSnippet) {
                setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, data: { ...n.data, codeSnippet: code } } : n));
            }
            setModalState({
                isOpen: true,
                title: `${t.nodeCodeTitle[language]}: ${node.data.title}`,
                content: code,
                type: 'code'
            });
        } finally {
            setLoading(false);
        }
        return;
    }

    // --- UPDATE INSIGHT ---
    if (action === 'update_insight') {
        const updatedInsight = payload as string;
        const requestId = (insightAnalysisRequestRef.current[nodeId] || 0) + 1;
        insightAnalysisRequestRef.current[nodeId] = requestId;
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            data: { 
                ...n.data, 
                insight: updatedInsight,
                suggestedActions: updatedInsight.trim().length > 10 ? n.data.suggestedActions : [],
                analysisState: updatedInsight.trim().length > 10
                    ? { status: 'analyzing', requestId }
                    : { status: 'idle', requestId },
                meta: {
                    ...(n.data.meta || { model: 'manual', prompt: '', timestamp: new Date().toISOString() }),
                    lastEdited: new Date().toISOString()
                }
            }
        } : n));

        const directlyAffected = getOutgoingAssociations(nodeId).map(edge => edge.target);
        const downstreamAffected = directlyAffected.flatMap(targetId => [targetId, ...getExecutionDescendants(targetId)]);
        markNodesStale(Array.from(new Set(downstreamAffected)), t.staleAssociation[language], [nodeId]);
        
        // Trigger analysis if insight is substantial
        if (updatedInsight.trim().length > 10) {
            void handleNodeAction(nodeId, 'analyze_insight', {
                insightText: updatedInsight,
                autoRunFirstAction: false,
                requestId
            });
        }
        return;
    }

    // --- ANALYZE INSIGHT ---
    if (action === 'analyze_insight') {
        const payloadObj = typeof payload === 'string' ? { insightText: payload, autoRunFirstAction: false } : (payload || {});
        const insightText = payloadObj.insightText as string;
        const autoRunFirstAction = Boolean(payloadObj.autoRunFirstAction);
        const requestId = Number(payloadObj.requestId || insightAnalysisRequestRef.current[nodeId] || 0);
        try {
            setNodes(prev => prev.map(n => n.id === nodeId ? {
                ...n,
                data: {
                    ...n.data,
                    analysisState: { status: 'analyzing', requestId }
                }
            } : n));

            const noteContext = buildInsightAnalysisContext(nodeId, insightText);
            const actions = await analyzeInsight(insightText, language, noteContext);

            if (insightAnalysisRequestRef.current[nodeId] !== requestId) {
                return;
            }

            setNodes(prev => prev.map(n => n.id === nodeId ? {
                ...n,
                data: {
                    ...n.data,
                    suggestedActions: normalizeSuggestedActions(actions || []),
                    analysisState: { status: 'ready', requestId },
                    reactivity: {
                      ...(n.data.reactivity || { upstreamNodeIds: [] }),
                      isStale: false,
                      staleReason: undefined,
                      staleSince: undefined
                    }
                }
            } : n));

            if (autoRunFirstAction && actions && actions.length > 0) {
                void handleNodeAction(nodeId, 'perform_suggested_action', actions[0]);
            }
        } catch (e) {
            console.error("Failed to analyze insight", e);
            if (insightAnalysisRequestRef.current[nodeId] !== requestId) {
                return;
            }

            setNodes(prev => prev.map(n => n.id === nodeId ? {
                ...n,
                data: {
                    ...n.data,
                    analysisState: {
                        status: 'error',
                        requestId,
                        error: language === 'zh' ? '无法分析当前笔记' : 'Could not analyze this note'
                    }
                }
            } : n));
        }
        return;
    }

    // --- PERFORM SUGGESTED ACTION ---
    if (action === 'perform_suggested_action') {
        const suggestedAction = payload as SuggestedAction;
        const actionText = suggestedAction.label;

        if (await routeSuggestedAction(node, suggestedAction)) {
            return;
        }

        try {
            setLoading(true);
            setLoadingText(language === 'zh' ? '正在执行建议操作...' : 'Performing suggested action...');
            
            const actionContext = buildNodeContext(nodeId, `Context: ${node.data.title}\nInsight: ${node.data.insight || ''}`, {
                includeSelf: true
            });
            const actionResult = await performSuggestedAction(actionContext, actionText, language);
            
            const nodeWidth = 380;
            const nodeHeight = 200;
            const bestPos = findBestPosition(nodes, node.x, node.y + 250, nodeWidth, nodeHeight);
            
            const newNode: CanvasNode = {
                id: `action-${Date.now()}`,
                type: NodeType.INSIGHT,
                x: bestPos.x,
                y: bestPos.y,
                width: nodeWidth,
                height: nodeHeight,
                data: {
                    title: actionText,
                    subtitle: "AI Suggested Action",
                    insight: actionResult.insight || actionResult.result || (language === 'zh' ? "操作已执行。" : "Action performed."),
                    suggestedActions: normalizeSuggestedActions(actionResult.suggestedActions),
                    meta: {
                        model: "ollama-local",
                        prompt: actionContext,
                        timestamp: new Date().toISOString(),
                        assumptions: node.data.assumptions
                    }
                },
                parentId: node.id
            };
            
            const edge: CanvasEdge = {
                id: `edge-${node.id}-${newNode.id}`,
                source: node.id,
                target: newNode.id,
                label: 'action',
                type: 'flow'
            };
            
            setNodes(prev => [...prev, newNode]);
            setEdges(prev => [...prev, edge]);
            clearNodeStale(nodeId);
            
        } catch (e) {
            console.error("Failed to perform suggested action", e);
        } finally {
            setLoading(false);
        }
        return;
    }

    // --- SELECT NODE ---
    if (action === 'select_node') {
        const targetId = payload as string;
        setNodes(prev => prev.map(n => ({
            ...n,
            selected: n.id === targetId
        })));
        setFocusedNodeId(targetId);
        return;
    }

    // --- FOCUS NODE (Select + Pan to target) ---
    if (action === 'focus_node') {
        const targetId = payload as string;
        setNodes(prev => prev.map(n => ({
            ...n,
            selected: n.id === targetId
        })));
        setFocusedNodeId(targetId);
        return;
    }

    if (action === 'ask_ai') {
        openChat(nodeId);
        return;
    }

    // --- ROLE TOGGLING ---
    if (action === 'toggle_role') {
        const col = payload as string;
        const currentRoles = node.data.variableRoles || {};
        const current = currentRoles[col] || VariableRole.UNASSIGNED;
        
        let next = VariableRole.UNASSIGNED;
        if (current === VariableRole.UNASSIGNED) next = VariableRole.TREATMENT;
        else if (current === VariableRole.TREATMENT) next = VariableRole.OUTCOME;
        else if (current === VariableRole.OUTCOME) next = VariableRole.CONFOUNDER;
        else if (current === VariableRole.CONFOUNDER) next = VariableRole.MEDIATOR;
        else if (current === VariableRole.MEDIATOR) next = VariableRole.INSTRUMENT;
        else if (current === VariableRole.INSTRUMENT) next = VariableRole.COLLIDER;
        else next = VariableRole.UNASSIGNED;

        const updatedNode = {
            ...node,
            data: { ...node.data, variableRoles: { ...currentRoles, [col]: next } }
        };
        setNodes(prev => prev.map(n => n.id === nodeId ? updatedNode : n));
    }

    // --- CAUSAL DAG GENERATION ---
    if (action === 'suggest_model') {
        try {
            setLoading(true);
            setLoadingText(t.inferringDAG[language]);
            const sampleRow = node.data.chartData?.[0];
            const columns = sampleRow ? Object.keys(sampleRow).filter(k => k !== 'id' && k !== 'x' && k !== 'y') : [];
            const roles = node.data.variableRoles || {};
            const context = buildNodeContext(nodeId, `Dataset: ${node.data.title}.`, { includeSelf: true });

            const dagResult = await generateCausalGraph(context, columns, roles, language);

            const nodeWidth = 400;
            const nodeHeight = 300;
            const bestPos = findBestPosition(nodes, node.x + 350, node.y, nodeWidth, nodeHeight);

            const dagNode: CanvasNode = {
                id: `dag-${Date.now()}`,
                type: NodeType.CAUSAL_GRAPH,
                x: bestPos.x,
                y: bestPos.y,
                width: nodeWidth,
                height: nodeHeight,
                data: {
                    title: dagResult.title,
                    subtitle: "DAG (Directed Acyclic Graph)",
                    variableRoles: roles,
                    causalEdges: dagResult.edges,
                    insight: dagResult.insight,
                    suggestedActions: normalizeSuggestedActions(dagResult.suggestedActions),
                    meta: {
                        model: 'ollama-local',
                        prompt: context,
                        timestamp: new Date().toISOString(),
                        assumptions: dagResult.assumptions || []
                    },
                    reactivity: {
                        isStale: false,
                        upstreamNodeIds: [node.id]
                    }
                },
                parentId: node.id
            };

            const edge: CanvasEdge = {
                id: `edge-${node.id}-${dagNode.id}`,
                source: node.id,
                target: dagNode.id,
                label: 'models',
                type: 'causal'
            };

            setNodes(prev => [...prev, dagNode]);
            setEdges(prev => [...prev, edge]);
            clearNodeStale(nodeId);
        } finally {
            setLoading(false);
        }
    }
    
    // --- ESTIMATE EFFECT ---
    if (action === 'estimate_effect') {
        try {
            setLoading(true);
            setLoadingText(t.estimating[language]);
            const roles = node.data.variableRoles || {};
            const edgesList = node.data.causalEdges || [];
            
            const parentNode = nodes.find(n => n.id === node.parentId);
            const context = buildNodeContext(nodeId, parentNode ? `Dataset: ${parentNode.data.title}` : "Synthetic Data", { includeSelf: true });
            const strategy = await generateIdentificationStrategy(context, roles, edgesList, language);
            
            const nodeWidth = 320;
            const nodeHeight = 320;
            const bestPos = findBestPosition(nodes, node.x + 450, node.y, nodeWidth, nodeHeight);

            const resultNode: CanvasNode = {
                id: `est-${Date.now()}`,
                type: NodeType.INSIGHT,
                x: bestPos.x,
                y: bestPos.y,
                width: nodeWidth,
                height: nodeHeight,
                data: {
                    title: language === 'zh' ? "因果识别与估计" : "Causal Identification & Estimate",
                    subtitle: "ATE (Average Treatment Effect)",
                    insight: strategy.insight,
                    adjustmentSet: strategy.adjustmentSet,
                    ate: strategy.ate,
                    ciLower: strategy.ciLower,
                    ciUpper: strategy.ciUpper,
                    pValue: strategy.pValue,
                    formula: strategy.formula,
                    method: strategy.method,
                    heterogeneity: strategy.heterogeneity,
                    suggestedActions: normalizeSuggestedActions(["Refute Estimate", "Check Positivity", "View Counterfactuals"]),
                    meta: {
                        model: 'ollama-local',
                        prompt: context,
                        timestamp: new Date().toISOString(),
                        assumptions: strategy.assumptions || []
                    },
                    reactivity: {
                        isStale: false,
                        upstreamNodeIds: [node.id]
                    }
                },
                parentId: node.id
            };
            
            const edge: CanvasEdge = {
                id: `edge-${node.id}-${resultNode.id}`,
                source: node.id,
                target: resultNode.id,
                label: 'identifies',
                type: 'causal'
            };

            setNodes(prev => [...prev, resultNode]);
            setEdges(prev => [...prev, edge]);
            clearNodeStale(nodeId);
        } finally {
            setLoading(false);
        }
    }

    // --- AUTO EDA ---
    if (action === 'analyze') {
        try {
            setLoading(true);
            setLoadingText(t.generatingPlan[language]);
            const sampleRow = node.data.chartData?.[0];
            const columns = sampleRow ? Object.keys(sampleRow).filter(k => k !== 'id' && k !== 'x' && k !== 'y') : [];
            const context = buildNodeContext(nodeId, `Dataset: ${node.data.title}. Description: ${node.data.insight || ''}`, { includeSelf: true });
            
            const suggestions = await generateInitialEDA(context, columns, language);
            const sourceData = node.data.chartData || [];
            
            let tempNodes = [...nodes];
            const newNodes: CanvasNode[] = [];
            const nodeWidth = 380;
            const nodeHeight = 320;
            const COLUMNS = 2; // Grid layout

            suggestions.forEach((s, idx) => {
                let processedData: any[] = [];
                let resolvedVizType = VizType.DISTRIBUTION;

                const vt = s.vizType.toUpperCase();
                if (vt.includes('SCATTER') || vt.includes('POINT')) resolvedVizType = VizType.SCATTER;
                else if (vt.includes('DIST') || vt.includes('HIST') || vt.includes('BAR')) resolvedVizType = VizType.DISTRIBUTION;

                const xKey = findClosestKey(s.xAxisKey, columns) || columns[0];
                const yKey = findClosestKey(s.yAxisKey, columns) || columns[1] || columns[0];

                if (resolvedVizType === VizType.SCATTER) {
                    processedData = sourceData.map((d: any) => ({ ...d, x: d[xKey], y: d[yKey] }));
                } else if (resolvedVizType === VizType.DISTRIBUTION) {
                    processedData = calculateHistogram(sourceData, xKey);
                }

                // Grid Layout Calculation
                const col = idx % COLUMNS;
                const row = Math.floor(idx / COLUMNS);
                
                // Base position to the right of the parent node
                const baseX = node.x + node.width + 100;
                const baseY = node.y;
                
                const targetX = baseX + col * (nodeWidth + 40);
                const targetY = baseY + row * (nodeHeight + 40);

                const bestPos = findBestPosition(tempNodes, targetX, targetY, nodeWidth, nodeHeight);
                
                const newNode: CanvasNode = {
                    id: `gen-${Date.now()}-${idx}`,
                    type: NodeType.VISUALIZATION,
                    x: bestPos.x,
                    y: bestPos.y,
                    width: nodeWidth,
                    height: nodeHeight,
                data: {
                    ...s,
                    vizType: resolvedVizType,
                    xAxisKey: xKey,
                    yAxisKey: yKey,
                    chartData: processedData,
                    suggestedActions: normalizeSuggestedActions(s.suggestedActions),
                    meta: {
                        model: 'ollama-local',
                        prompt: context,
                        timestamp: new Date().toISOString(),
                        assumptions: s.assumptions || []
                    },
                    reactivity: {
                        isStale: false,
                        upstreamNodeIds: [node.id]
                    }
                },
                parentId: node.id
            };
                newNodes.push(newNode);
                tempNodes.push(newNode);
            });

            const newEdges: CanvasEdge[] = newNodes.map(n => ({
                id: `edge-${node.id}-${n.id}`,
                source: node.id,
                target: n.id,
                label: 'eda',
                type: 'flow'
            }));

            setNodes(prev => [...prev, ...newNodes]);
            setEdges(prev => [...prev, ...newEdges]);
            clearNodeStale(nodeId);
        } finally {
            setLoading(false);
        }
    } 

    if (action === 'point_click') {
        const { cx, cy, data: pointData } = payload;
        
        // 1. Show loading popover on the node
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            data: {
                ...n.data,
                activePopover: { x: cx, y: cy, data: pointData, loading: true }
            }
        } : n));

        try {
            const analysis = await explainOutlier(
                pointData,
                buildNodeContext(nodeId, `Dataset: ${node.data.title}`, { includeSelf: true }),
                language
            );
            
            // 2. Update popover with explanation
            setNodes(prev => prev.map(n => n.id === nodeId ? {
                ...n,
                data: {
                    ...n.data,
                    activePopover: { x: cx, y: cy, data: pointData, explanation: analysis, loading: false }
                }
            } : n));
        } catch (error) {
            console.error("Failed to explain outlier:", error);
            // Close popover on error
            setNodes(prev => prev.map(n => n.id === nodeId ? {
                ...n,
                data: { ...n.data, activePopover: undefined }
            } : n));
        }
    }

    if (action === 'close_popover') {
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            data: { ...n.data, activePopover: undefined }
        } : n));
    }

    if (action === 'pin_popover') {
        const popoverState = node.data.activePopover;
        if (!popoverState || !popoverState.explanation) return;

        // Close popover
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            data: { ...n.data, activePopover: undefined }
        } : n));

        // Create Insight Node
        const nodeWidth = 300;
        const nodeHeight = 200;
        const bestPos = findBestPosition(nodes, node.x + node.width + 50, node.y, nodeWidth, nodeHeight);

        const insightNode: CanvasNode = {
            id: `insight-${Date.now()}`,
            type: NodeType.INSIGHT,
            x: bestPos.x,
            y: bestPos.y,
            width: nodeWidth,
            height: nodeHeight,
            data: {
                title: language === 'zh' ? "异常值诊断" : "Outlier Diagnosis",
                subtitle: `Point (${popoverState.data.x || '?'}, ${popoverState.data.y || '?'})`,
                insight: popoverState.explanation.insight,
                suggestedActions: normalizeSuggestedActions(popoverState.explanation.suggestedActions),
                meta: popoverState.explanation.meta
            },
            parentId: node.id
        };
        const edge: CanvasEdge = {
            id: `edge-${node.id}-${insightNode.id}`,
            source: node.id,
            target: insightNode.id,
            type: 'causal',
            label: 'explains'
        };
        setNodes(prev => [...prev, insightNode]);
        setEdges(prev => [...prev, edge]);
    }

    if (action === 'suggestion') {
        const suggestedAction = payload as SuggestedAction;
        const suggestionLabel = suggestedAction.label;

        if (await routeSuggestedAction(node, suggestedAction)) {
            return;
        }

        try {
            setLoading(true);
            setLoadingText(language === 'zh' ? `正在执行: ${suggestionLabel}...` : `Performing: ${suggestionLabel}...`);
            
            const context = buildNodeContext(nodeId, `Node: ${node.data.title}. Previous Insight: ${node.data.insight || ''}.`, {
                includeSelf: true
            });
            const result = await performSuggestedAction(context, suggestionLabel, language);
            
            const nodeWidth = 300;
            const nodeHeight = 200;
            const bestPos = findBestPosition(nodes, node.x + node.width + 50, node.y, nodeWidth, nodeHeight);

            const newNode: CanvasNode = {
                id: `act-${Date.now()}`,
                type: NodeType.INSIGHT,
                x: bestPos.x,
                y: bestPos.y,
                width: nodeWidth,
                height: nodeHeight,
                data: {
                    title: result.title || suggestionLabel,
                    subtitle: "Follow-up Analysis",
                    insight: result.insight,
                    suggestedActions: normalizeSuggestedActions(result.suggestedActions),
                    meta: {
                        model: "ollama-local",
                        prompt: context,
                        timestamp: new Date().toISOString(),
                        assumptions: node.data.assumptions
                    }
                },
                parentId: node.id
            };
            
            const edge: CanvasEdge = {
                id: `edge-${node.id}-${newNode.id}`,
                source: node.id,
                target: newNode.id,
                label: 'analysis',
                type: 'flow'
            };

            setNodes(prev => [...prev, newNode]);
            setEdges(prev => [...prev, edge]);
            clearNodeStale(nodeId);
        } finally {
            setLoading(false);
        }
    }
    
    if (action === 'delete') {
        const associationTargets = edges
            .filter(e => e.source === nodeId && e.type === 'association')
            .map(e => e.target);

        if (associationTargets.length > 0) {
            markNodesStale(
                associationTargets.flatMap(targetId => [targetId, ...getExecutionDescendants(targetId)]),
                language === 'zh' ? '关联笔记已删除' : 'Connected note was deleted',
                [nodeId]
            );
        }

        // Recursive deletion of downstream nodes, excluding association-only links
        const nodesToDelete = new Set<string>();
        const queue = [nodeId];
        
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (!nodesToDelete.has(current)) {
                nodesToDelete.add(current);
                // Find children connected by edges where current is source
                const children = edges
                    .filter(e => e.source === current && e.type !== 'association')
                    .map(e => e.target);
                queue.push(...children);
            }
        }

        setNodes(prev => prev.filter(n => !nodesToDelete.has(n.id)));
        setEdges(prev => prev.filter(e => !nodesToDelete.has(e.source) && !nodesToDelete.has(e.target)));
    }
  };

  const renderNode = (node: CanvasNode) => {
    const props = {
        node,
        nodes,
        onAction: (action: string, payload?: any) => handleNodeAction(node.id, action, payload),
        language
    };
    
    switch (node.type) {
        case NodeType.DATASET: return <DatasetNode {...props} />;
        case NodeType.VISUALIZATION: return <VisualizationNode {...props} />;
        case NodeType.INSIGHT: return <InsightNode {...props} />;
        case NodeType.CAUSAL_GRAPH: return <CausalGraphNode {...props} />;
        default: return <div className="p-4 bg-red-100 rounded">Unknown Node</div>;
    }
  };

  const handleConnect = (sourceId: string, targetId: string) => {
    if (sourceId === targetId || edges.some(edge => edge.source === sourceId && edge.target === targetId)) {
        return;
    }

    const sourceNode = nodes.find(node => node.id === sourceId);
    saveHistory();
    setEdges(prev => [
        ...prev,
        {
            id: `edge-${sourceId}-${targetId}-${Date.now()}`,
            source: sourceId,
            target: targetId,
            label: sourceNode?.type === NodeType.INSIGHT ? 'note context' : 'association',
            type: 'association'
        }
    ]);

    if (sourceNode?.type === NodeType.INSIGHT) {
        markNodesStale([targetId, ...getExecutionDescendants(targetId)], t.staleAssociation[language], [sourceId]);
    }
  };

  return (
    <div className="echoforge-container">
      <div className="w-full h-full flex flex-col font-sans relative">
        {/* Top Bar */}
      <div className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 z-10 shadow-sm relative">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-indigo-200 shadow-md">E</div>
            <h1 className="font-semibold text-slate-800 tracking-tight">EchoForge <span className="text-xs font-normal text-slate-400 ml-2">{t.researchPreview[language]}</span></h1>
        </div>
        
        {/* Top Actions (Language / Export) */}
        <div className="flex items-center gap-2">
            <button 
                onClick={toggleLanguage}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-all min-w-[60px] justify-center"
            >
                <Languages size={14} />
                {language === 'en' ? 'En' : '中文'}
            </button>
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <button 
                onClick={handleGenerateReport}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-amber-50 hover:text-amber-700 hover:border-amber-200 border border-slate-200 rounded-md transition-all"
            >
                <FileText size={14} /> {t.assumptionsReport[language]}
            </button>
            <button 
                onClick={handleExportNotebook}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 border border-slate-200 rounded-md transition-all"
            >
                <Download size={14} /> {t.exportNotebook[language]}
            </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 relative overflow-hidden bg-slate-50/50">
        <InfiniteCanvas 
            nodes={nodes} 
            edges={edges} 
            renderNode={renderNode}
            onNodeMove={handleNodeMove}
            onNodeSelect={handleNodeSelect}
            onConnect={handleConnect}
            focusedNodeId={focusedNodeId}
        />
        
        {/* Empty State Overlay */}
        {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="bg-white/80 backdrop-blur-sm border border-slate-200 p-8 rounded-2xl shadow-xl text-center max-w-md pointer-events-auto">
                    <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Sparkles size={32} />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-800 mb-2">
                        {language === 'zh' ? '欢迎使用 EchoForge' : 'Welcome to EchoForge'}
                    </h2>
                    <p className="text-slate-500 mb-6 leading-relaxed">
                        {language === 'zh' 
                            ? '您的智能数据分析向导。导入 CSV 数据集，我们将一步步指导您完成数据分析与因果推断。' 
                            : 'Your intelligent guide to data analysis. Import a CSV dataset, and we will guide you step-by-step through data analysis and causal inference.'}
                    </p>
                    <div className="flex gap-3 justify-center">
                        <button 
                            onClick={handleImportClick}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-all shadow-sm hover:shadow-md"
                        >
                            <Upload size={18} />
                            {t.importData[language]}
                        </button>
                        <button 
                            onClick={handleAddManualNode}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium transition-all"
                        >
                            <GitCommit size={18} />
                            {t.addManualNode[language]}
                        </button>
                    </div>
                </div>
            </div>
        )}
        
        {/* Loading Overlay */}
        {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-40 flex items-center justify-center flex-col pointer-events-none">
                <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
                <span className="text-indigo-600 font-medium text-sm animate-pulse">{loadingText}</span>
            </div>
        )}

        {/* Floating Tool Palette (Bottom Center - tldraw style) */}
        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-3 py-2 bg-white rounded-xl shadow-xl border border-slate-200 z-50 animate-in slide-in-from-bottom-6 duration-300">
            <ToolButton icon={MousePointer2} label={t.select[language]} active onClick={() => handleNodeSelect(null)} />
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
            <ToolButton icon={Upload} label={t.importData[language]} onClick={handleImportClick} />
            <ToolButton icon={Sparkles} label={t.askAssistant[language]} onClick={handleAiAssistantClick} />
            <ToolButton icon={GitCommit} label={t.addManualNode[language]} onClick={handleAddManualNode} />
            <div className="w-px h-6 bg-slate-200 mx-1"></div>
             {/* History Controls moved here */}
             <button 
                onClick={handleUndo} 
                disabled={history.past.length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                title="Undo"
             >
                 <Undo2 size={18} />
             </button>
             <button
                onClick={handleRedo}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                disabled={history.future.length === 0}
                title="Redo"
             >
                 <Redo2 size={18} />
             </button>
        </div>
        
        <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept=".csv" 
            className="hidden" 
        />
        
        {/* Modal for Code/Reports */}
        <CodeViewerModal 
            isOpen={modalState.isOpen}
            onClose={() => setModalState(prev => ({ ...prev, isOpen: false }))}
            title={modalState.title}
            content={modalState.content}
            type={modalState.type}
            language={language}
        />
        
        {/* Fork Modal */}
        <ForkModal 
            isOpen={forkModalState.isOpen}
            onClose={() => setForkModalState({ isOpen: false, nodeId: null })}
            onConfirm={handleForkConfirm}
            sourceNodeTitle={nodes.find(n => n.id === forkModalState.nodeId)?.data.title || 'Node'}
        />

        <ChatModal
            isOpen={chatState.isOpen}
            onClose={() => setChatState(prev => ({ ...prev, isOpen: false, loading: false }))}
            title={chatState.title}
            messages={chatState.messages}
            inputValue={chatState.input}
            onInputChange={(value) => setChatState(prev => ({ ...prev, input: value }))}
            onSubmit={submitChatQuestion}
            onPinLatest={pinLatestChatReply}
            loading={chatState.loading}
            language={language}
        />
      </div>
    </div>
    </div>
  );
}

const ToolButton = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick?: () => void }) => (
    <div className="relative group/btn">
        <button onClick={onClick} className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${active ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
            <Icon size={20} />
        </button>
        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover/btn:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-sm">
            {label}
        </div>
    </div>
);
