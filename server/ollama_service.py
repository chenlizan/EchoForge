import os
import json
import re
from typing import List, Dict, Any, Optional

import requests
from ollama import Client as OllamaClient

OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "gemma3:12b")
OLLAMA_TIMEOUT = int(os.environ.get("OLLAMA_TIMEOUT", "120"))
OLLAMA_CLIENT = OllamaClient(host=OLLAMA_BASE_URL)


def configure_genai(api_key: Optional[str] = None):
    """Backward-compatible initializer; now validates local Ollama endpoint."""
    del api_key
    try:
        OLLAMA_CLIENT.list()
    except Exception as e:
        # Fallback check by raw HTTP for clearer diagnostics.
        try:
            resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
            if resp.status_code != 200:
                print(f"Warning: Ollama endpoint unavailable ({resp.status_code}) at {OLLAMA_BASE_URL}")
        except Exception as inner_e:
            print(f"Warning: Ollama is not reachable at {OLLAMA_BASE_URL}. {inner_e}")

SYSTEM_INSTRUCTION = """You are a Senior Causal Inference Methodologist and Econometrician. 
Your goal is to assist researchers on an infinite canvas.
When analyzing data or graphs:
1. explicitly check for and mention SUTVA violations, positivity assumptions, ceiling/floor effects, and unobserved heterogeneity.
2. Use professional, precise language (e.g., "identifiability", "backdoor criterion", "selection bias").
3. Do not just describe the data; explain the *mechanism*.

Return responses in JSON format matching the schema provided."""

EDA_RESPONSE_SCHEMA = {
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "title": {"type": "string"},
            "subtitle": {"type": "string"},
            "vizType": {"type": "string"},
            "insight": {"type": "string", "description": "Methodological note"},
            "xAxisKey": {"type": "string"},
            "yAxisKey": {"type": "string"},
            "xAxisLabel": {"type": "string"},
            "yAxisLabel": {"type": "string"},
            "suggestedActions": {"type": "array", "items": {"type": "string"}},
            "assumptions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["title", "vizType", "xAxisKey", "insight", "suggestedActions"],
    },
}

CAUSAL_GRAPH_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "insight": {"type": "string"},
        "suggestedActions": {"type": "array", "items": {"type": "string"}},
        "assumptions": {"type": "array", "items": {"type": "string"}},
        "edges": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "from": {"type": "string"},
                    "to": {"type": "string"},
                    "type": {"type": "string"}
                },
                "required": ["from", "to", "type"]
            }
        }
    },
    "required": ["title", "insight", "edges"]
}

IDENTIFICATION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "insight": {"type": "string"},
        "formula": {"type": "string"},
        "adjustmentSet": {"type": "array", "items": {"type": "string"}},
        "ate": {"type": "number"},
        "ciLower": {"type": "number"},
        "ciUpper": {"type": "number"},
        "method": {"type": "string"},
        "pValue": {"type": "number"},
        "heterogeneity": {"type": "string"},
        "assumptions": {"type": "array", "items": {"type": "string"}}
    },
    "required": ["insight", "formula", "adjustmentSet", "ate", "ciLower", "ciUpper", "method", "pValue"]
}

OUTLIER_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "insight": {"type": "string"},
        "suggestedActions": {"type": "array", "items": {"type": "string"}},
        "assumptions": {"type": "array", "items": {"type": "string"}}
    },
    "required": ["insight"]
}

ACTION_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "insight": {"type": "string"},
        "result": {"type": "string"},
        "answer": {"type": "string"},
        "suggestedActions": {"type": "array", "items": {"type": "string"}},
        "assumptions": {"type": "array", "items": {"type": "string"}}
    }
}


def _extract_json(text: str) -> Any:
    raw = (text or "").strip()
    if not raw:
        raise ValueError("Empty response text")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try fenced block or first JSON-looking object/array.
    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", raw, re.IGNORECASE)
    if fenced:
        candidate = fenced.group(1).strip()
        return json.loads(candidate)

    match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", raw)
    if match:
        return json.loads(match.group(1))

    raise ValueError("No valid JSON found in model response")


def _ollama_chat(
    prompt: str,
    system_instruction: str,
    expect_json: bool = True,
    response_schema: Optional[Dict[str, Any]] = None,
) -> Any:
    format_value: Any = None
    if expect_json:
        if response_schema is None:
            raise ValueError("response_schema is required when expect_json=True")
        format_value = response_schema

    messages = [
        {"role": "system", "content": system_instruction},
        {"role": "user", "content": prompt},
    ]

    try:
        data = OLLAMA_CLIENT.chat(
            model=OLLAMA_MODEL,
            messages=messages,
            stream=False,
            format=format_value,
            options={"temperature": 0.2},
        )
        content = data.get("message", {}).get("content", "")
    except Exception:
        # Fallback to raw HTTP if client library fails for any reason.
        payload = {
            "model": OLLAMA_MODEL,
            "messages": messages,
            "stream": False,
            "options": {"temperature": 0.2},
        }
        if expect_json:
            payload["format"] = format_value
        response = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json=payload,
            timeout=OLLAMA_TIMEOUT,
        )
        response.raise_for_status()
        data = response.json()
        content = data.get("message", {}).get("content", "")

    if expect_json:
        return _extract_json(content)
    return content

def get_lang_prompt(lang: str) -> str:
    return (
        "IMPORTANT: Provide all titles, insights, assumptions, and explanations in Simplified Chinese (简体中文). Keep technical terms (SUTVA, ATE, DAG) in English if standard, otherwise translate."
        if lang == 'zh'
        else "Provide all content in English."
    )


def _normalize_eda_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue

        title = item.get("title", "")
        insight = item.get("insight") or item.get("description") or ""
        viz_type = item.get("vizType")
        if isinstance(viz_type, str):
            vt = viz_type.strip().upper()
            if vt in ("HISTOGRAM", "HIST", "DIST", "DENSITY"):
                viz_type = "DISTRIBUTION"
            elif vt in ("SCATTER", "POINT"):
                viz_type = "SCATTER"
            elif vt in ("BAR", "BARCHART", "BAR_CHART"):
                viz_type = "BAR"
            elif vt in ("LINE", "TREND"):
                viz_type = "LINE"
        if not viz_type and isinstance(title, str):
            lowered = title.lower()
            if lowered.startswith("dist:"):
                viz_type = "DISTRIBUTION"
            elif lowered.startswith("scatter:"):
                viz_type = "SCATTER"
            elif lowered.startswith("bar:"):
                viz_type = "BAR"
            elif lowered.startswith("trend:"):
                viz_type = "LINE"

        normalized.append({
            **item,
            "insight": insight,
            "vizType": viz_type or "SCATTER",
            "suggestedActions": item.get("suggestedActions", []),
            "assumptions": item.get("assumptions", []),
        })

    return normalized

def generate_initial_eda(context: str, columns: List[str], lang: str = 'en') -> List[Dict[str, Any]]:
    prompt = f"""Context: {context}.
      Available Columns: {json.dumps(columns)}.
      
      Task: Suggest 3 specific visualizations to understand the causal structure.
      Focus on detecting:
      - Selection mechanisms (who gets the treatment?)
      - Common support / Positivity issues
      - Outcome distribution anomalies (zero-inflation, ceiling effects)
      
      Formatting:
      - Titles MUST start with "Dist:", "Scatter:", "Bar:", or "Trend:".
      - Example: "Dist: Test Scores", "Scatter: Class Size vs Score".
      
      {get_lang_prompt(lang)}
      
      Return the configuration (xAxisKey, yAxisKey).
      """

    try:
        response = _ollama_chat(
            prompt,
            SYSTEM_INSTRUCTION,
            expect_json=True,
            response_schema=EDA_RESPONSE_SCHEMA,
        )
        if isinstance(response, list):
            return _normalize_eda_items(response)
        if isinstance(response, dict):
            # Some local models wrap arrays as {"plots": [...]} or similar.
            for key in ("plots", "items", "data", "results", "visualizations"):
                value = response.get(key)
                if isinstance(value, list):
                    return _normalize_eda_items(value)
        return []
    except Exception as e:
        print(f"EDA Error: {e}")
        if not columns:
            return []
            
        outcome = next((c for c in columns if 'score' in c.lower() or 'y' in c.lower() or 'outcome' in c.lower()), columns[-1])
        treatment = next((c for c in columns if 'study' in c.lower() or 'x' in c.lower() or 'treat' in c.lower()), columns[0])
        is_zh = lang == 'zh'
        
        return [
            {
                "title": f"分布: {outcome}" if is_zh else f"Dist: {outcome}",
                "subtitle": "检查天花板效应" if is_zh else "Check for Ceiling Effects",
                "vizType": "DISTRIBUTION",
                "xAxisKey": outcome,
                "xAxisLabel": outcome,
                "insight": f"{outcome} 的分布分析。注意可能违反 OLS 假设的天花板效应或零膨胀。" if is_zh else f"Distribution analysis of {outcome}. Watch for ceiling effects or zero-inflation that might violate OLS assumptions.",
                "suggestedActions": ["检查正态性", "对数变换"] if is_zh else ["Check Normality", "Log Transform"]
            },
            {
                "title": f"散点: {treatment} vs {outcome}" if is_zh else f"Scatter: {treatment} vs {outcome}",
                "subtitle": "双变量关联" if is_zh else "Bivariate Association",
                "vizType": "SCATTER",
                "xAxisKey": treatment,
                "yAxisKey": outcome,
                "xAxisLabel": treatment,
                "yAxisLabel": outcome,
                "insight": "关系的初步评估。在应用标准线性控制之前，应验证线性假设。" if is_zh else "Preliminary assessment of the relationship. Linearity assumption should be verified before applying standard linear controls.",
                "assumptions": ["线性", "无遗漏变量偏差"] if is_zh else ["Linearity", "No Omitted Variable Bias"]
            }
        ]

def generate_causal_graph(context: str, columns: List[str], roles: Dict[str, str], lang: str = 'en') -> Dict[str, Any]:
    prompt = f"""Context: {context}.
        Variables: {json.dumps(columns)}.
        User Assigned Roles: {json.dumps(roles)}.
        
        Task: Construct a Causal DAG.
        1. Enforce user roles (T->Y).
        2. Propose latent or observed confounders.
        3. Identify colliders that should NOT be controlled.
        
        {get_lang_prompt(lang)}
        
        Return the list of edges."""

    try:
        response = _ollama_chat(
            prompt,
            SYSTEM_INSTRUCTION,
            expect_json=True,
            response_schema=CAUSAL_GRAPH_RESPONSE_SCHEMA,
        )
        return response if isinstance(response, dict) else {}
    except Exception as e:
        print(f"DAG Error: {e}")
        fallback_cols = columns if columns else ["Treatment", "Outcome"]
        treatment = next((c for c in fallback_cols if roles.get(c) == 'TREATMENT'), fallback_cols[0])
        outcome = next((c for c in fallback_cols if roles.get(c) == 'OUTCOME'), fallback_cols[-1])
        is_zh = lang == 'zh'
        
        return {
            "title": "建议的因果模型 (Fallback)" if is_zh else "Suggested Causal Model (Fallback)",
            "edges": [{"from": treatment, "to": outcome, "type": "directed"}],
            "insight": "由于 API 不可用，基于角色分配构建了基本 DAG。请手动添加混杂因素。" if is_zh else "Constructed a basic DAG based on role assignment due to API unavailability. Add confounders manually.",
            "suggestedActions": ["添加混杂因素", "测试后门路径"] if is_zh else ["Add Confounders", "Test Backdoor Paths"]
        }

def generate_identification_strategy(context: str, roles: Dict[str, str], edges: List[Dict[str, str]], lang: str = 'en') -> Dict[str, Any]:
    prompt = f"""Context: {context}.
            Roles: {json.dumps(roles)}.
            DAG Edges: {json.dumps(edges)}.
            
            Task:
            1. Apply the Backdoor Criterion. Identify which variables must be in the Adjustment Set.
            2. Choose an estimation method (e.g. OLS, Doubly Robust).
            3. Synthesize a plausible ATE (Average Treatment Effect) and 95% CI based on the context variables.
            4. Provide a P-value consistent with the CI (if CI excludes 0, p < 0.05).
            
            {get_lang_prompt(lang)}
            
            Return structured data for visualization."""

    try:
        response = _ollama_chat(
            prompt,
            SYSTEM_INSTRUCTION,
            expect_json=True,
            response_schema=IDENTIFICATION_RESPONSE_SCHEMA,
        )
        return response if isinstance(response, dict) else {}
    except Exception as e:
        print(f"Estimation Error: {e}")
        return {
            "insight": "Could not identify effect from the current graph structure due to service unavailability.",
            "formula": "N/A",
            "adjustmentSet": [],
            "ate": 0, "ciLower": 0, "ciUpper": 0, "method": "Error", "pValue": 1
        }

def explain_outlier(point_data: Any, context: str, lang: str = 'en') -> Dict[str, Any]:
    prompt = f"""User clicked an outlier: {json.dumps(point_data)}. Context: {context}.
      Analyze this point. Is it a coding error, a specific sub-population, or a genuine anomaly?
      Check for:
      - SUTVA violations
      - Measurement error
      
      {get_lang_prompt(lang)}
      """

    try:
        response = _ollama_chat(
            prompt,
            SYSTEM_INSTRUCTION,
            expect_json=True,
            response_schema=OUTLIER_RESPONSE_SCHEMA,
        )
        return response if isinstance(response, dict) else {}
    except Exception as e:
        return {"title": "Error", "insight": "Could not analyze outlier."}

def perform_suggested_action(context: str, action: str, lang: str = 'en') -> Dict[str, Any]:
    prompt = f"""Context: {context}.
      User selected action: "{action}".
      
      Task: Perform a conceptual analysis or provide the theoretical result of this action. 
      If it's a statistical check (e.g. "Check Normality"), simulate a plausible result based on the context description.
      If it's a transformation (e.g. "Log Transform"), explain why it is needed and what the expected outcome is.
      
      {get_lang_prompt(lang)}
      """

    try:
        response = _ollama_chat(
            prompt,
            SYSTEM_INSTRUCTION,
            expect_json=True,
            response_schema=ACTION_RESPONSE_SCHEMA,
        )
        return response if isinstance(response, dict) else {}
    except Exception as e:
        return {"title": "Error", "insight": "Could not perform action."}

def analyze_insight(insight_text: str, lang: str = 'en', context: Optional[str] = None) -> List[str]:
    context_section = f"\nAdditional Context:\n{context}\n" if context else ""
    prompt = f"""The user has written a manual research note or insight:
\"{insight_text}\"
{context_section}

Based on this note, suggest 1 to 3 concrete next steps or actions the user should take in their causal analysis workflow.
Examples of actions: \"Check SUTVA assumption\", \"Fork dataset to focus on low SES\", \"Add a mediator variable\", \"Estimate ATE using Propensity Score Matching\".
Return ONLY a JSON array of strings.

{get_lang_prompt(lang)}
"""

    schema = {
        "type": "array",
        "items": {"type": "string"}
    }

    try:
        response = _ollama_chat(
            prompt,
            SYSTEM_INSTRUCTION,
            expect_json=True,
            response_schema=schema,
        )
        if isinstance(response, list):
            return [str(x) for x in response if isinstance(x, str)][:3]
    except Exception as e:
        print(f"analyze_insight Error: {e}")

    return []

def generate_notebook(nodes: List[Dict[str, Any]], lang: str = 'en') -> str:
    context_parts = []
    for n in nodes:
        data = n.get('data', {})
        part = f"""Node Type: {n.get('type')}
         Title: {data.get('title')}
         Roles: {json.dumps(data.get('variableRoles', {}))}
         Insight: {data.get('insight')}
         Method: {data.get('method', 'N/A')}
         Adjustment Set: {json.dumps(data.get('adjustmentSet', []))}
         Formula: {data.get('formula')}
        """
        context_parts.append(part)
    
    context = '\n---\n'.join(context_parts)
    
    prompt = f"""You are creating a Reproducible Research Notebook (Stata .do file) for the following analysis flow.
            
            Analysis Context:
            {context}
            
            Task:
            Generate a complete Stata .do file content.
            1. Header with title "CausalForge Analysis" and date.
            2. Setup chunk (clear all, set obs, gen synthetic data matching variables).
            3. For each Analysis Node:
               - Create a section comment.
               - Write the Stata code to reproduce the visual or estimate (e.g. scatter, histogram, reg, ivregress).
               - Add the insight as a comment.
               
            {"Write the explanatory comments in Chinese." if lang == 'zh' else "Write everything in English."}
            
            Output strictly the raw Stata code content. No "here is the code" preamble."""

    try:
        response = _ollama_chat(
            prompt,
            "You are a Stata expert. Write clean, commented Stata code.",
            expect_json=False,
        )
        return response or "Error generating notebook."
    except Exception as e:
        print(e)
        return "* Error\n* Could not generate notebook."

def generate_assumptions_report(nodes: List[Dict[str, Any]], lang: str = 'en') -> str:
    insights = []
    for n in nodes:
        if n.get('type') in ['INSIGHT', 'CAUSAL_GRAPH']:
            data = n.get('data', {})
            insights.append(
                f"Source: {data.get('title')}\n"
                f"Finding: {data.get('insight')}\n"
                f"Assumptions Checked: {json.dumps(data.get('assumptions', []))}\n"
                f"Estimates: ATE={data.get('ate')}, CI=[{data.get('ciLower')}, {data.get('ciUpper')}]"
            )
    
    insights_text = '\n'.join(insights)
    
    prompt = f"""Generate an "Assumptions & Robustness Report" based on these analysis notes:
            {insights_text}
            
            Format as a professional Markdown report with:
            1. Executive Summary
            2. Causal Assumptions Checklist (SUTVA, Positivity, Unconfoundedness) - Assess status based on notes.
            3. Key Findings & Estimates
            4. Recommended Sensitivity Checks
            
            {get_lang_prompt(lang)}
            """

    try:
        response = _ollama_chat(
            prompt,
            "You are a Research Lead. Synthesize these fragmented notes into a cohesive document.",
            expect_json=False,
        )
        return response or "Error generating report."
    except Exception as e:
        print(e)
        return "# Error\nCould not generate report."

def generate_node_code(node: Dict[str, Any]) -> str:
    prompt = f"""Generate the Stata code to reproduce this specific node:
            {json.dumps(node.get('data', {}))}
            
            Assume data is in memory. Return only code."""
            
    try:
        response = _ollama_chat(prompt, "You are a Stata expert.", expect_json=False)
        return response or "* Code generation failed"
    except Exception as e:
        return "* Error generating code"

if __name__ == "__main__":
    # Example usage
    configure_genai()
    print("Ollama Service Initialized. Run specific functions to test.")
