import os
from flask import Flask, request, jsonify
from flask_cors import CORS
from ollama_service import (
    configure_genai,
    analyze_insight,
    generate_initial_eda,
    generate_causal_graph,
    generate_identification_strategy,
    explain_outlier,
    perform_suggested_action,
    generate_notebook,
    generate_assumptions_report,
    generate_node_code
)

app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {"origins": ["http://localhost:4173", "http://127.0.0.1:4173", "http://localhost:5173", "http://localhost:3000"]}},
    methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"]
)

# Initialize model backend (Ollama local service)
try:
    configure_genai()
except Exception as e:
    print(f"Warning: {e}")

@app.route('/api/eda', methods=['POST'])
def eda():
    data = request.json
    result = generate_initial_eda(
        data.get('context'), 
        data.get('columns'), 
        data.get('lang', 'en')
    )
    return jsonify(result)

@app.route('/api/causal-graph', methods=['POST'])
def causal_graph():
    data = request.json
    result = generate_causal_graph(
        data.get('context'), 
        data.get('columns'), 
        data.get('roles'), 
        data.get('lang', 'en')
    )
    return jsonify(result)

@app.route('/api/identification', methods=['POST'])
def identification():
    data = request.json
    result = generate_identification_strategy(
        data.get('context'), 
        data.get('roles'), 
        data.get('edges'), 
        data.get('lang', 'en')
    )
    return jsonify(result)

@app.route('/api/outlier', methods=['POST'])
def outlier():
    data = request.json
    result = explain_outlier(
        data.get('pointData'), 
        data.get('context'), 
        data.get('lang', 'en')
    )
    return jsonify(result)

@app.route('/api/action', methods=['POST'])
def action():
    data = request.json
    result = perform_suggested_action(
        data.get('context'), 
        data.get('action'), 
        data.get('lang', 'en')
    )
    return jsonify(result)

@app.route('/api/analyze-insight', methods=['POST'])
def analyze_insight_api():
    data = request.json
    result = analyze_insight(
        data.get('insightText', ''),
        data.get('lang', 'en'),
        data.get('context')
    )
    return jsonify({"actions": result})

@app.route('/api/notebook', methods=['POST'])
def notebook():
    data = request.json
    result = generate_notebook(
        data.get('nodes'), 
        data.get('lang', 'en')
    )
    return jsonify({"content": result})

@app.route('/api/report', methods=['POST'])
def report():
    data = request.json
    result = generate_assumptions_report(
        data.get('nodes'), 
        data.get('lang', 'en')
    )
    return jsonify({"content": result})

@app.route('/api/node-code', methods=['POST'])
def node_code():
    data = request.json
    result = generate_node_code(
        data.get('node')
    )
    return jsonify({"content": result})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
