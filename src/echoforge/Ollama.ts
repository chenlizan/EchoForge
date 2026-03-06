import { VariableRole, CausalEdge, Language, CanvasNode, SuggestedAction } from "./types";

const IS_DEV = process.env.NODE_ENV === 'development';
const API_BASE_URL = IS_DEV ? '/api' : 'http://127.0.0.1:5000/api';

async function callBackend(endpoint: string, payload: any) {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Backend API Error (${response.status}): ${errorText}`);
  }

  return await response.json();
}

export function buildContextWithNotes(
  baseContext: string,
  notes: Array<{ id: string; title?: string; insight?: string }>
): string {
  const sanitizedNotes = notes
    .filter(note => note.insight && note.insight.trim())
    .map(note => `- [${note.id}] ${note.title || 'Untitled Note'}: ${note.insight?.trim()}`);

  if (sanitizedNotes.length === 0) {
    return baseContext;
  }

  return `${baseContext}\n\nConnected Notes:\n${sanitizedNotes.join('\n')}`;
}

const FORK_HINTS = [
  'fork',
  'branch',
  'variant',
  'counterfactual',
  'sensitivity branch',
  '分叉',
  '分支',
  '派生',
  '敏感性分支'
];

const slugifyAction = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'action';

export function normalizeSuggestedActions(actions?: Array<string | Partial<SuggestedAction>>): SuggestedAction[] {
  if (!actions || actions.length === 0) {
    return [];
  }

  return actions
    .map((action, index) => {
      if (typeof action === 'string') {
        const normalizedLabel = action.trim();
        if (!normalizedLabel) return null;

        const kind = FORK_HINTS.some(hint => normalizedLabel.toLowerCase().includes(hint))
          ? 'fork'
          : 'create_node';

        return {
          id: `${slugifyAction(normalizedLabel)}-${index}`,
          label: normalizedLabel,
          kind,
          prompt: normalizedLabel,
          createdAt: new Date().toISOString()
        } satisfies SuggestedAction;
      }

      if (!action?.label?.trim()) {
        return null;
      }

      return {
        id: action.id?.trim() || `${slugifyAction(action.label)}-${index}`,
        label: action.label.trim(),
        kind: action.kind === 'fork' ? 'fork' : 'create_node',
        prompt: action.prompt?.trim() || action.label.trim(),
        createdAt: action.createdAt || new Date().toISOString()
      } satisfies SuggestedAction;
    })
    .filter((action): action is NonNullable<typeof action> => Boolean(action));
}

export async function analyzeInsight(insightText: string, lang: Language = 'en', context?: string): Promise<SuggestedAction[]> {
  try {
    const result = await callBackend('/analyze-insight', { insightText, lang, context });
    return normalizeSuggestedActions(result.actions || []);
  } catch (e) {
    console.warn('Backend analyzeInsight failed:', e);
    return [];
  }
}

export async function generateInitialEDA(context: string, columns: string[], lang: Language = 'en'): Promise<any[]> {
  try {
    return await callBackend('/eda', { context, columns, lang });
  } catch (e) {
    console.error('Backend EDA Error', e);
  }

  if (columns.length < 1) return [];

  const outcome = columns.find(c => c.toLowerCase().includes('score') || c.toLowerCase().includes('y') || c.toLowerCase().includes('outcome')) || columns[columns.length - 1];
  const treatment = columns.find(c => c.toLowerCase().includes('study') || c.toLowerCase().includes('x') || c.toLowerCase().includes('treat')) || columns[0];
  const isZh = lang === 'zh';

  return [
    {
      title: isZh ? `分布: ${outcome}` : `Dist: ${outcome}`,
      subtitle: isZh ? '检查天花板效应' : 'Check for Ceiling Effects',
      vizType: 'DISTRIBUTION',
      xAxisKey: outcome,
      xAxisLabel: outcome,
      insight: isZh
        ? `${outcome} 的分布分析。注意可能违反 OLS 假设的天花板效应或零膨胀。`
        : `Distribution analysis of ${outcome}. Watch for ceiling effects or zero-inflation that might violate OLS assumptions.`,
      suggestedActions: normalizeSuggestedActions(isZh ? ['检查正态性', '对数变换'] : ['Check Normality', 'Log Transform'])
    },
    {
      title: isZh ? `散点: ${treatment} vs ${outcome}` : `Scatter: ${treatment} vs ${outcome}`,
      subtitle: isZh ? '双变量关联' : 'Bivariate Association',
      vizType: 'SCATTER',
      xAxisKey: treatment,
      yAxisKey: outcome,
      xAxisLabel: treatment,
      yAxisLabel: outcome,
      insight: isZh
        ? '关系的初步评估。在应用标准线性控制之前，应验证线性假设。'
        : 'Preliminary assessment of the relationship. Linearity assumption should be verified before applying standard linear controls.',
      assumptions: isZh ? ['线性', '无遗漏变量偏差'] : ['Linearity', 'No Omitted Variable Bias']
    }
  ];
}

export async function generateCausalGraph(context: string, columns: string[], roles: Record<string, VariableRole>, lang: Language = 'en'): Promise<any> {
  try {
    return await callBackend('/causal-graph', { context, columns, roles, lang });
  } catch (e) {
    console.error('Backend DAG Error', e);
  }

  const fallbackCols = columns.length > 0 ? columns : ['Treatment', 'Outcome'];
  const treatment = fallbackCols.find(c => roles[c] === VariableRole.TREATMENT) || fallbackCols[0];
  const outcome = fallbackCols.find(c => roles[c] === VariableRole.OUTCOME) || fallbackCols[fallbackCols.length - 1];
  const isZh = lang === 'zh';

  return {
    title: isZh ? '建议的因果模型 (Fallback)' : 'Suggested Causal Model (Fallback)',
    edges: [{ from: treatment, to: outcome, type: 'directed' }],
    insight: isZh
      ? '由于 API 不可用，基于角色分配构建了基本 DAG。请手动添加混杂因素。'
      : 'Constructed a basic DAG based on role assignment due to API unavailability. Add confounders manually.',
    suggestedActions: normalizeSuggestedActions(isZh ? ['添加混杂因素', '测试后门路径'] : ['Add Confounders', 'Test Backdoor Paths'])
  };
}

export async function generateIdentificationStrategy(context: string, roles: Record<string, VariableRole>, edges: CausalEdge[], lang: Language = 'en'): Promise<any> {
  try {
    return await callBackend('/identification', { context, roles, edges, lang });
  } catch (e) {
    console.error('Backend Estimation Error', e);
  }

  return {
    insight: 'Could not identify effect from the current graph structure due to service unavailability.',
    formula: 'N/A',
    adjustmentSet: [],
    ate: 0,
    ciLower: 0,
    ciUpper: 0,
    method: 'Error',
    pValue: 1
  };
}

export async function explainOutlier(pointData: any, context: string, lang: Language = 'en'): Promise<any> {
  const promptText = `User clicked an outlier: ${JSON.stringify(pointData)}. Context: ${context}.`;
  try {
    const result = await callBackend('/outlier', { pointData, context, lang });
    return {
      ...result,
      meta: {
        model: 'ollama-local',
        prompt: promptText,
        timestamp: new Date().toISOString()
      }
    };
  } catch (e) {
    return { title: 'Error', insight: 'Could not analyze outlier.' };
  }
}

export async function performSuggestedAction(context: string, action: string, lang: Language = 'en'): Promise<any> {
  try {
    return await callBackend('/action', { context, action, lang });
  } catch (e) {
    return { title: 'Error', insight: 'Could not perform action.' };
  }
}

export async function askNodeQuestion(context: string, question: string, lang: Language = 'en'): Promise<string> {
  const result = await performSuggestedAction(
    context,
    lang === 'zh'
      ? `请基于当前节点与上下文回答这个研究问题：${question}`
      : `Answer this research question using the current node and its connected context: ${question}`,
    lang
  );

  return result.insight || result.result || result.answer || (lang === 'zh' ? '暂时无法回答这个问题。' : 'Could not answer this question.');
}

export async function generateNotebook(nodes: CanvasNode[], lang: Language = 'en'): Promise<string> {
  try {
    const res = await callBackend('/notebook', { nodes, lang });
    return res.content;
  } catch (e) {
    console.error(e);
    return '* Error\n* Could not generate notebook.';
  }
}

export async function generateAssumptionsReport(nodes: CanvasNode[], lang: Language = 'en'): Promise<string> {
  try {
    const res = await callBackend('/report', { nodes, lang });
    return res.content;
  } catch (e) {
    console.error(e);
    return '# Error\nCould not generate report.';
  }
}

export async function generateNodeCode(node: CanvasNode): Promise<string> {
  try {
    const res = await callBackend('/node-code', { node });
    return res.content;
  } catch (e) {
    return '* Error generating code';
  }
}
