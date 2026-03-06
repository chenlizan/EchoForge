
export type Language = 'en' | 'zh';

export enum NodeType {
  DATASET = 'DATASET',
  VISUALIZATION = 'VISUALIZATION',
  INSIGHT = 'INSIGHT',
  CAUSAL_GRAPH = 'CAUSAL_GRAPH',
  CODE = 'CODE'
}

export enum VizType {
  SCATTER = 'SCATTER',
  DISTRIBUTION = 'DISTRIBUTION', // Density/Histogram
  BAR = 'BAR',
  HEATMAP = 'HEATMAP',
  CAUSAL_DAG = 'CAUSAL_DAG'
}

export enum VariableRole {
  TREATMENT = 'TREATMENT',
  OUTCOME = 'OUTCOME',
  CONFOUNDER = 'CONFOUNDER',
  MEDIATOR = 'MEDIATOR',
  INSTRUMENT = 'INSTRUMENT',
  COLLIDER = 'COLLIDER',
  UNASSIGNED = 'UNASSIGNED'
}

export interface VizDataPoint {
  id: string;
  x: number | string;
  y: number | string;
  [key: string]: any;
}

export interface CausalEdge {
  from: string;
  to: string;
  type: 'directed' | 'bi-directed';
}

export interface NodeData {
  title: string;
  subtitle?: string;
  vizType?: VizType;
  chartData?: VizDataPoint[];
  xAxisKey?: string;
  yAxisKey?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  insight?: string; // Markdown content
  suggestedActions?: string[];
  codeSnippet?: string; // Reproducible code (Python/R)
  
  // New Causal Props
  variableRoles?: Record<string, VariableRole>;
  causalEdges?: CausalEdge[];
  assumptions?: string[]; // e.g. "Unconfoundedness", "Linearity"
  
  // Estimation Props
  adjustmentSet?: string[];
  ate?: number;
  ciLower?: number;
  ciUpper?: number;
  pValue?: number; // Exact p-value
  method?: string;
  formula?: string;
  heterogeneity?: string;

  meta?: {
    model: string;
    prompt: string;
    seed?: number;
    timestamp: string;
    lastEdited?: string; // ISO string for user edits
  };
  
  // Fork Metadata
  forkMeta?: {
    parentId: string; // The original node ID this was forked from
    forkTimestamp: number;
    forkReason?: string;
    branchLabel?: string; // e.g. "Robustness Check 1"
    originalNodeTitle?: string;
  };

  variableNames?: string[]; // For DAGs or datasets
  
  // Interactive Popover State
  activePopover?: {
    x: number;
    y: number;
    data: any;
    explanation?: any;
    loading?: boolean;
  };
}

export interface CanvasNode {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  width: number;
  height: number; // variable height usually
  data: NodeData;
  parentId?: string;
  selected?: boolean;
}

export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: 'association' | 'causal' | 'flow' | 'fork';
}

export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export interface HistoryState {
  past: { nodes: CanvasNode[], edges: CanvasEdge[] }[];
  future: { nodes: CanvasNode[], edges: CanvasEdge[] }[];
}
