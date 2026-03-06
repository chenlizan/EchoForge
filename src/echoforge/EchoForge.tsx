
import React, { useState, useCallback, useRef } from 'react';
import './styles.css';
import { InfiniteCanvas } from './InfiniteCanvas';
import { CanvasNode, CanvasEdge, NodeType, VizType, VariableRole, NodeData, Language } from './types';
import { DatasetNode, VisualizationNode, InsightNode, CausalGraphNode } from './NodeViews';
import { generateInitialEDA, explainOutlier, generateCausalGraph, generateIdentificationStrategy, generateNotebook, generateAssumptionsReport, generateNodeCode, performSuggestedAction, analyzeInsight } from './Gemini';
import { Plus, Play, History, GitCommit, Download, Sparkles, Upload, Maximize, Undo2, Redo2, FileText, X, Copy, Check, Languages, MousePointer2, GitBranch } from 'lucide-react';

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
    source: { en: 'Quarto / R Markdown Source', zh: 'Quarto / R Markdown 源码' },
    summary: { en: 'Research Assumptions Summary', zh: '研究假设摘要' },
    researchPreview: { en: 'AI-Powered Causal Workbench', zh: 'AI 驱动的因果推断工作台' },
    select: { en: 'Select', zh: '选择' }
};

const INITIAL_NODES: CanvasNode[] = [];

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
  const [history, setHistory] = useState<{nodes: CanvasNode[], edges: CanvasEdge[]}[]>([]);
  
  // Fork Modal State
  const [forkModalState, setForkModalState] = useState<{isOpen: boolean, nodeId: string | null}>({ isOpen: false, nodeId: null });

  const handleForkConfirm = (reason: string, label: string) => {
      if (!forkModalState.nodeId) return;
      
      const rootId = forkModalState.nodeId;
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
      setForkModalState({ isOpen: false, nodeId: null });
  };
  
  const saveHistory = () => {
      setHistory(prev => [...prev.slice(-9), { nodes: [...nodes], edges: [...edges] }]);
  };

  const handleUndo = () => {
      if (history.length === 0) return;
      const last = history[history.length - 1];
      setNodes(last.nodes);
      setEdges(last.edges);
      setHistory(prev => prev.slice(0, -1));
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
      }
    };
    setNodes(prev => [...prev, newNode]);
  };

  const handleAiAssistantClick = () => {
    alert("AI Assistant feature is under development.");
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

  // -----------------------------------------------------------------
  // Node Actions
  // -----------------------------------------------------------------
  const handleNodeAction = async (nodeId: string, action: string, payload?: any) => {
    if (['suggest_model', 'analyze', 'estimate_effect', 'delete'].includes(action)) {
        saveHistory();
    }
    
    if (action === 'fork') {
        setForkModalState({ isOpen: true, nodeId: nodeId });
        return;
    }

    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

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
        setNodes(prev => prev.map(n => n.id === nodeId ? {
            ...n,
            data: { 
                ...n.data, 
                insight: updatedInsight,
                meta: {
                    ...(n.data.meta || { model: 'manual', prompt: '', timestamp: new Date().toISOString() }),
                    lastEdited: new Date().toISOString()
                }
            }
        } : n));
        
        // Trigger analysis if insight is substantial
        if (updatedInsight.trim().length > 10) {
            handleNodeAction(nodeId, 'analyze_insight', updatedInsight);
        }
        return;
    }

    // --- ANALYZE INSIGHT ---
    if (action === 'analyze_insight') {
        const insightText = payload as string;
        try {
            setLoading(true);
            setLoadingText(language === 'zh' ? '正在分析笔记...' : 'Analyzing note...');
            const actions = await analyzeInsight(insightText, language);
            if (actions && actions.length > 0) {
                setNodes(prev => prev.map(n => n.id === nodeId ? {
                    ...n,
                    data: {
                        ...n.data,
                        suggestedActions: actions
                    }
                } : n));
            }
        } catch (e) {
            console.error("Failed to analyze insight", e);
        } finally {
            setLoading(false);
        }
        return;
    }

    // --- PERFORM SUGGESTED ACTION ---
    if (action === 'perform_suggested_action') {
        const actionText = payload as string;
        try {
            setLoading(true);
            setLoadingText(language === 'zh' ? '正在执行建议操作...' : 'Performing suggested action...');
            
            // We can create a new Insight node or a new Visualization node based on the action
            // For now, let's create a new Insight node that acts as a placeholder for the action result
            const actionResult = await performSuggestedAction(`Context: ${node.data.title}\nInsight: ${node.data.insight}`, actionText, language);
            
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
                    meta: {
                        model: "ollama-local",
                        prompt: actionText,
                        timestamp: new Date().toISOString()
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
            let context = `Dataset: ${node.data.title}.`;

            // Level 4: Include user notes in the prompt context
            const userNotes = nodes
                .filter(n => n.type === NodeType.INSIGHT && n.data.insight && n.data.meta?.lastEdited)
                .map(n => `- ${n.data.insight}`)
                .join("\n");
                
            if (userNotes) {
                context += `\n\nUser Notes & Assumptions:\n${userNotes}`;
            }

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
                    suggestedActions: dagResult.suggestedActions
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
            let context = parentNode ? `Dataset: ${parentNode.data.title}` : "Synthetic Data";
            
            // Level 4: Include user notes in the prompt context
            const userNotes = nodes
                .filter(n => n.type === NodeType.INSIGHT && n.data.insight && n.data.meta?.lastEdited)
                .map(n => `- ${n.data.insight}`)
                .join("\n");
                
            if (userNotes) {
                context += `\n\nUser Notes & Assumptions:\n${userNotes}`;
            }
            
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
                    suggestedActions: ["Refute Estimate", "Check Positivity", "View Counterfactuals"]
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
            const context = `Dataset: ${node.data.title}. Description: ${node.data.insight}`;
            
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
                        chartData: processedData
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
        } finally {
            setLoading(false);
        }
    } 

    if (action === 'ask_ai') {
        setModalState({
            isOpen: true,
            title: language === 'zh' ? 'AI 助手 (开发中)' : 'AI Assistant (WIP)',
            content: language === 'zh' 
                ? '对话接口正在开发中。未来您可以在这里直接向 AI 提问关于此节点的具体问题（例如：“为什么这里异常？”、“如果 treatment +10% 会怎样？”）。' 
                : 'Chat interface is under construction. In the future, you will be able to ask specific questions about this node here.',
            type: 'report'
        });
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
            const analysis = await explainOutlier(pointData, `Dataset: ${node.data.title}`, language);
            
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
                suggestedActions: popoverState.explanation.suggestedActions,
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
        const suggestionLabel = payload as string;
        try {
            setLoading(true);
            setLoadingText(language === 'zh' ? `正在执行: ${suggestionLabel}...` : `Performing: ${suggestionLabel}...`);
            
            const context = `Node: ${node.data.title}. Previous Insight: ${node.data.insight}.`;
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
                    suggestedActions: result.suggestedActions
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
        } finally {
            setLoading(false);
        }
    }
    
    if (action === 'delete') {
        // Recursive deletion of downstream nodes
        const nodesToDelete = new Set<string>();
        const queue = [nodeId];
        
        while (queue.length > 0) {
            const current = queue.shift()!;
            if (!nodesToDelete.has(current)) {
                nodesToDelete.add(current);
                // Find children connected by edges where current is source
                const children = edges
                    .filter(e => e.source === current)
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
                disabled={history.length === 0}
                className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 transition-all"
                title="Undo"
             >
                 <Undo2 size={18} />
             </button>
             <button className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-50 disabled:opacity-30 transition-all" disabled>
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
