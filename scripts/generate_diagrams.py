#!/usr/bin/env python3
"""Generate improved architecture diagrams with proper icons for portfolio."""

import os

def generate_waffarha_diagram():
    """Generate RAG chatbot diagram with icons."""
    svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 800" width="960" height="800">
  <defs>
    <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb"/>
    </marker>
    <marker id="arrow-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#059669"/>
    </marker>
    <marker id="arrow-purple" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#7c3aed"/>
    </marker>
    <marker id="arrow-orange" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#ea580c"/>
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
    </filter>
    <linearGradient id="bg-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f8fafc"/>
      <stop offset="100%" style="stop-color:#ffffff"/>
    </linearGradient>
  </defs>

  <style>
    text { font-family: 'Inter', -apple-system, sans-serif; }
    .title { font-size: 20px; font-weight: 700; fill: #0f172a; }
    .subtitle { font-size: 12px; fill: #6b7280; }
    .label { font-size: 11px; fill: #475569; font-weight: 500; }
    .layer-label { font-size: 10px; font-weight: 600; fill: #2563eb; text-transform: uppercase; letter-spacing: 0.08em; }
  </style>

  <!-- Background -->
  <rect width="960" height="800" fill="url(#bg-gradient)"/>

  <!-- Title -->
  <text x="480" y="35" text-anchor="middle" class="title">Waffarha Assistant — RAG Chatbot</text>
  <text x="480" y="55" text-anchor="middle" class="subtitle">Production Architecture with Hybrid Intent Routing</text>

  <!-- Layer 1: User Interface -->
  <rect x="30" y="80" width="900" height="100" rx="12" fill="#eff6ff" fill-opacity="0.4" stroke="#bfdbfe" stroke-width="1.5"/>
  <text x="50" y="100" class="layer-label">User Interface Layer</text>

  <!-- Streamlit Dashboard -->
  <rect x="50" y="115" width="140" height="50" rx="8" fill="#ffffff" stroke="#2563eb" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="120" y="140" text-anchor="middle" font-size="20">📊</text>
  <text x="120" y="158" text-anchor="middle" class="label">Streamlit</text>

  <!-- FastAPI Backend -->
  <rect x="220" y="115" width="140" height="50" rx="8" fill="#ffffff" stroke="#009688" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="290" y="140" text-anchor="middle" font-size="20">🚀</text>
  <text x="290" y="158" text-anchor="middle" class="label">FastAPI</text>

  <!-- User -->
  <circle cx="450" cy="140" r="28" fill="#f0f9ff" stroke="#0ea5e9" stroke-width="2"/>
  <text x="450" y="135" text-anchor="middle" font-size="24">👤</text>
  <text x="450" y="180" text-anchor="middle" class="label">User Query</text>

  <!-- Arrows -->
  <path d="M 450 168 L 360 168" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <text x="405" y="162" text-anchor="middle" font-size="9" fill="#2563eb">Query</text>

  <!-- Layer 2: RAG Engine -->
  <rect x="30" y="200" width="900" height="280" rx="12" fill="#f0fdf4" fill-opacity="0.4" stroke="#86efac" stroke-width="1.5"/>
  <text x="50" y="220" class="layer-label">RAG Engine Layer</text>

  <!-- Intent Classifier -->
  <rect x="60" y="240" width="160" height="60" rx="8" fill="#ffffff" stroke="#059669" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="140" y="265" text-anchor="middle" font-size="22">🎯</text>
  <text x="140" y="285" text-anchor="middle" class="label">Intent Classifier</text>

  <!-- Embedding Model -->
  <rect x="260" y="240" width="160" height="60" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="340" y="265" text-anchor="middle" font-size="22">🧠</text>
  <text x="340" y="285" text-anchor="middle" class="label">Multilingual E5</text>

  <!-- Fact Checker -->
  <rect x="460" y="240" width="160" height="60" rx="8" fill="#ffffff" stroke="#ea580c" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="540" y="265" text-anchor="middle" font-size="22">✓</text>
  <text x="540" y="285" text-anchor="middle" class="label">Fact Checker</text>

  <!-- RAG Orchestrator -->
  <rect x="310" y="330" width="160" height="60" rx="8" fill="#f0fdf4" stroke="#059669" stroke-width="2" filter="url(#shadow)"/>
  <text x="390" y="355" text-anchor="middle" font-size="22">⚙️</text>
  <text x="390" y="375" text-anchor="middle" class="label" font-weight="600">RAG Orchestrator</text>

  <!-- Arrows in RAG Engine -->
  <path d="M 220 270 L 260 270" stroke="#059669" stroke-width="1.5" marker-end="url(#arrow-green)"/>
  <path d="M 340 300 L 390 320" stroke="#059669" stroke-width="1.5" marker-end="url(#arrow-green)"/>
  <path d="M 420 270 L 460 270" stroke="#059669" stroke-width="1.5" marker-end="url(#arrow-green)"/>

  <!-- Layer 3: Vector Store -->
  <rect x="30" y="500" width="900" height="100" rx="12" fill="#faf5ff" fill-opacity="0.4" stroke="#e9d5ff" stroke-width="1.5"/>
  <text x="50" y="520" class="layer-label">Vector Storage Layer</text>

  <!-- FAISS -->
  <rect x="100" y="535" width="120" height="50" rx="8" fill="#ffffff" stroke="#4285f4" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="160" y="560" text-anchor="middle" font-size="22">📚</text>
  <text x="160" y="578" text-anchor="middle" class="label">FAISS</text>

  <!-- ClickHouse -->
  <rect x="280" y="535" width="120" height="50" rx="8" fill="#ffffff" stroke="#1976d2" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="340" y="560" text-anchor="middle" font-size="22">🗄️</text>
  <text x="340" y="578" text-anchor="middle" class="label">ClickHouse</text>

  <!-- Redis -->
  <rect x="460" y="535" width="120" height="50" rx="8" fill="#ffffff" stroke="#dc2626" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="520" y="560" text-anchor="middle" font-size="22">⚡</text>
  <text x="520" y="578" text-anchor="middle" class="label">Redis</text>

  <!-- Layer 4: LLM -->
  <rect x="30" y="620" width="900" height="100" rx="12" fill="#fff7ed" fill-opacity="0.4" stroke="#fdba74" stroke-width="1.5"/>
  <text x="50" y="640" class="layer-label">LLM Layer</text>

  <!-- Ollama -->
  <rect x="200" y="655" width="160" height="50" rx="8" fill="#ffffff" stroke="#ff6b35" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="280" y="680" text-anchor="middle" font-size="22">🦙</text>
  <text x="280" y="698" text-anchor="middle" class="label">Ollama (Llama 3)</text>

  <!-- Airflow -->
  <rect x="500" y="655" width="160" height="50" rx="8" fill="#ffffff" stroke="#017cfa" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="580" y="680" text-anchor="middle" font-size="22">🔄</text>
  <text x="580" y="698" text-anchor="middle" class="label">Airflow (ETL)</text>

  <!-- Connection arrows -->
  <path d="M 390 390 L 340 500" stroke="#7c3aed" stroke-width="2" marker-end="url(#arrow-purple)" stroke-dasharray="5,3"/>
  <path d="M 340 560 L 390 620" stroke="#059669" stroke-width="2" marker-end="url(#arrow-green)"/>
  <path d="M 280 655 L 340 620" stroke="#ea580c" stroke-width="1.5" marker-end="url(#arrow-orange)"/>

  <!-- Metrics Box -->
  <rect x="700" y="620" width="210" height="100" rx="8" fill="#ffffff" stroke="#2563eb" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="805" y="645" text-anchor="middle" font-size="12" font-weight="600" fill="#2563eb">KEY METRICS</text>
  <text x="720" y="670" font-size="11" fill="#475569">• 94.9% Recall</text>
  <text x="720" y="688" font-size="11" fill="#475569">• 0.62ms Latency</text>
  <text x="720" y="706" font-size="11" fill="#475569">• 18k+ Docs Indexed</text>
</svg>'''
    return svg

def generate_blockchain_diagram():
    """Generate blockchain forensics diagram."""
    svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 700" width="960" height="700">
  <defs>
    <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb"/>
    </marker>
    <marker id="arrow-orange" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#ea580c"/>
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
    </filter>
  </defs>

  <style>
    text { font-family: 'Inter', -apple-system, sans-serif; }
    .title { font-size: 20px; font-weight: 700; fill: #0f172a; }
    .subtitle { font-size: 12px; fill: #6b7280; }
    .label { font-size: 11px; fill: #475569; font-weight: 500; }
    .layer-label { font-size: 10px; font-weight: 600; fill: #2563eb; text-transform: uppercase; letter-spacing: 0.08em; }
  </style>

  <rect width="960" height="700" fill="#f8fafc"/>

  <!-- Title -->
  <text x="480" y="35" text-anchor="middle" class="title">Blockchain Analyzer — Ethereum Pipeline</text>
  <text x="480" y="55" text-anchor="middle" class="subtitle">Bronze → Silver → Gold ETL with Threat Detection</text>

  <!-- Data Sources Layer -->
  <rect x="30" y="80" width="900" height="100" rx="12" fill="#fef3c7" fill-opacity="0.5" stroke="#fcd34d" stroke-width="1.5"/>
  <text x="50" y="100" class="layer-label">Data Sources</text>

  <!-- Ethereum Node -->
  <rect x="50" y="115" width="150" height="50" rx="8" fill="#ffffff" stroke="#627eea" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="125" y="145" text-anchor="middle" font-size="24">⟠</text>
  <text x="125" y="163" text-anchor="middle" class="label">Ethereum Node</text>

  <!-- Web3.py -->
  <rect x="250" y="115" width="150" height="50" rx="8" fill="#ffffff" stroke="#3776ab" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="325" y="145" text-anchor="middle" font-size="24">🐍</text>
  <text x="325" y="163" text-anchor="middle" class="label">Web3.py Client</text>

  <!-- Layer 2: ETL Pipeline -->
  <rect x="30" y="200" width="900" height="200" rx="12" fill="#e0f2fe" fill-opacity="0.5" stroke="#7dd3fc" stroke-width="1.5"/>
  <text x="50" y="220" class="layer-label">Medallion ETL Pipeline</text>

  <!-- Bronze Layer -->
  <rect x="60" y="240" width="180" height="70" rx="8" fill="#fef2f2" stroke="#f87171" stroke-width="1.5"/>
  <text x="150" y="265" text-anchor="middle" font-size="22">🔴</text>
  <text x="150" y="285" text-anchor="middle" class="label" font-weight="600">Bronze (Raw)</text>

  <!-- Silver Layer -->
  <rect x="280" y="240" width="180" height="70" rx="8" fill="#fff7ed" stroke="#fb923c" stroke-width="1.5"/>
  <text x="370" y="265" text-anchor="middle" font-size="22">🟠</text>
  <text x="370" y="285" text-anchor="middle" class="label" font-weight="600">Silver (Cleaned)</text>

  <!-- Gold Layer -->
  <rect x="500" y="240" width="180" height="70" rx="8" fill="#f0fdf4" stroke="#4ade80" stroke-width="1.5"/>
  <text x="590" y="265" text-anchor="middle" font-size="22">🟢</text>
  <text x="590" y="285" text-anchor="middle" class="label" font-weight="600">Gold (Enriched)</text>

  <!-- Threat Detection -->
  <rect x="720" y="240" width="180" height="70" rx="8" fill="#faf5ff" stroke="#a855f7" stroke-width="1.5"/>
  <text x="810" y="265" text-anchor="middle" font-size="22">⚠️</text>
  <text x="810" y="285" text-anchor="middle" class="label" font-weight="600">Threat Detection</text>

  <!-- Spark -->
  <rect x="370" y="340" width="220" height="50" rx="8" fill="#ffffff" stroke="#ffdb00" stroke-width="2" filter="url(#shadow)"/>
  <text x="480" y="365" text-anchor="middle" font-size="22">⚡</text>
  <text x="480" y="383" text-anchor="middle" class="label" font-weight="600">Apache Spark (Processing)</text>

  <!-- Arrows -->
  <path d="M 200 165 L 150 240" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 240 275 L 280 275" stroke="#6b7280" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 460 275 L 500 275" stroke="#6b7280" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 680 275 L 720 275" stroke="#6b7280" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 480 390 L 480 450" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>

  <!-- Layer 3: Storage -->
  <rect x="30" y="470" width="900" height="100" rx="12" fill="#f0fdf4" fill-opacity="0.5" stroke="#86efac" stroke-width="1.5"/>
  <text x="50" y="490" class="layer-label">Storage &amp; Analysis</text>

  <!-- Neo4j -->
  <rect x="80" y="505" width="160" height="60" rx="8" fill="#ffffff" stroke="#008cc1" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="160" y="530" text-anchor="middle" font-size="22">🕸️</text>
  <text x="160" y="550" text-anchor="middle" class="label">Neo4j (Graph DB)</text>

  <!-- Elasticsearch -->
  <rect x="300" y="505" width="160" height="60" rx="8" fill="#ffffff" stroke="#005571" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="380" y="530" text-anchor="middle" font-size="22">🔍</text>
  <text x="380" y="550" text-anchor="middle" class="label">Elasticsearch</text>

  <!-- Kibana -->
  <rect x="520" y="505" width="160" height="60" rx="8" fill="#ffffff" stroke="#f9a825" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="600" y="530" text-anchor="middle" font-size="22">📊</text>
  <text x="600" y="550" text-anchor="middle" class="label">Kibana Dashboards</text>

  <!-- Docker -->
  <rect x="740" y="505" width="160" height="60" rx="8" fill="#ffffff" stroke="#2496ed" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="820" y="530" text-anchor="middle" font-size="22">🐳</text>
  <text x="820" y="550" text-anchor="middle" class="label">Docker (Container)</text>

  <!-- Metrics -->
  <rect x="350" y="600" width="260" height="60" rx="8" fill="#ffffff" stroke="#2563eb" stroke-width="2" filter="url(#shadow)"/>
  <text x="480" y="625" text-anchor="middle" font-size="11" font-weight="600" fill="#2563eb">BENCHMARK RESULT</text>
  <text x="480" y="645" text-anchor="middle" font-size="14" font-weight="700">Neo4j 73x faster than PySpark</text>
</svg>'''
    return svg

def generate_fraud_detection_diagram():
    """Generate fraud detection streaming diagram."""
    svg = '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 700" width="960" height="700">
  <defs>
    <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#2563eb"/>
    </marker>
    <marker id="arrow-green" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#059669"/>
    </marker>
    <marker id="arrow-red" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#dc2626"/>
    </marker>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
    </filter>
  </defs>

  <style>
    text { font-family: 'Inter', -apple-system, sans-serif; }
    .title { font-size: 20px; font-weight: 700; fill: #0f172a; }
    .subtitle { font-size: 12px; fill: #6b7280; }
    .label { font-size: 11px; fill: #475569; font-weight: 500; }
    .layer-label { font-size: 10px; font-weight: 600; fill: #2563eb; text-transform: uppercase; letter-spacing: 0.08em; }
  </style>

  <rect width="960" height="700" fill="#f8fafc"/>

  <!-- Title -->
  <text x="480" y="35" text-anchor="middle" class="title">Fraud Detection — Real-time Streaming</text>
  <text x="480" y="55" text-anchor="middle" class="subtitle">Sub-second latency transaction scoring pipeline</text>

  <!-- Data Source -->
  <rect x="30" y="80" width="200" height="80" rx="12" fill="#fef3c7" stroke="#fcd34d" stroke-width="1.5"/>
  <text x="130" y="105" text-anchor="middle" font-size="28">💳</text>
  <text x="130" y="125" text-anchor="middle" class="label" font-weight="600">Transaction Feed</text>
  <text x="130" y="140" text-anchor="middle" font-size="9" fill="#6b7280">Payment APIs / Logs</text>

  <!-- Kafka Layer -->
  <rect x="30" y="190" width="900" height="100" rx="12" fill="#f0f9ff" fill-opacity="0.5" stroke="#7dd3fc" stroke-width="1.5"/>
  <text x="50" y="210" class="layer-label">Streaming Layer</text>

  <!-- Kafka Topic -->
  <rect x="60" y="225" width="140" height="50" rx="8" fill="#ffffff" stroke="#231f20" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="130" y="250" text-anchor="middle" font-size="22">📨</text>
  <text x="130" y="268" text-anchor="middle" class="label">Kafka Topic</text>

  <!-- Stream Processing -->
  <rect x="250" y="225" width="160" height="50" rx="8" fill="#ffffff" stroke="#059669" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="330" y="250" text-anchor="middle" font-size="22">⚡</text>
  <text x="330" y="268" text-anchor="middle" class="label">Stream Processor</text>

  <!-- ML Model -->
  <rect x="470" y="225" width="160" height="50" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="550" y="250" text-anchor="middle" font-size="22">🤖</text>
  <text x="550" y="268" text-anchor="middle" class="label">ML Scoring Model</text>

  <!-- Redis Cache -->
  <rect x="690" y="225" width="160" height="50" rx="8" fill="#ffffff" stroke="#dc2626" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="770" y="250" text-anchor="middle" font-size="22">⚡</text>
  <text x="770" y="268" text-anchor="middle" class="label">Redis Cache</text>

  <!-- Arrows -->
  <path d="M 130 160 L 130 225" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 200 250 L 250 250" stroke="#2563eb" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 410 250 L 470 250" stroke="#059669" stroke-width="2" marker-end="url(#arrow-green)"/>
  <path d="M 630 250 L 690 250" stroke="#7c3aed" stroke-width="2" marker-end="url(#arrow-blue)"/>

  <!-- Alert Layer -->
  <rect x="30" y="330" width="900" height="100" rx="12" fill="#fef2f2" fill-opacity="0.5" stroke="#fca5a5" stroke-width="1.5"/>
  <text x="50" y="350" class="layer-label">Alert &amp; Monitoring</text>

  <!-- Plotly Dashboard -->
  <rect x="60" y="365" width="180" height="50" rx="8" fill="#ffffff" stroke="#2563eb" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="150" y="390" text-anchor="middle" font-size="22">📊</text>
  <text x="150" y="408" text-anchor="middle" class="label">Plotly/Dash</text>

  <!-- Slack Alerts -->
  <rect x="300" y="365" width="180" height="50" rx="8" fill="#ffffff" stroke="#7c3aed" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="390" y="390" text-anchor="middle" font-size="22">💬</text>
  <text x="390" y="408" text-anchor="middle" class="label">Slack Alerts</text>

  <!-- Email -->
  <rect x="540" y="365" width="180" height="50" rx="8" fill="#ffffff" stroke="#ea580c" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="630" y="390" text-anchor="middle" font-size="22">📧</text>
  <text x="630" y="408" text-anchor="middle" class="label">Email Notifications</text>

  <!-- Docker -->
  <rect x="780" y="365" width="120" height="50" rx="8" fill="#ffffff" stroke="#2496ed" stroke-width="1.5" filter="url(#shadow)"/>
  <text x="840" y="390" text-anchor="middle" font-size="22">🐳</text>
  <text x="840" y="408" text-anchor="middle" class="label">Docker</text>

  <!-- Arrows down -->
  <path d="M 150 310 L 150 365" stroke="#dc2626" stroke-width="2" marker-end="url(#arrow-red)"/>
  <path d="M 390 310 L 390 365" stroke="#7c3aed" stroke-width="2" marker-end="url(#arrow-blue)"/>
  <path d="M 630 310 L 630 365" stroke="#ea580c" stroke-width="2" marker-end="url(#arrow-red)"/>
  <path d="M 840 275 L 840 365" stroke="#2563eb" stroke-width="1.5" marker-end="url(#arrow-blue)"/>

  <!-- Metrics -->
  <rect x="300" y="470" width="360" height="120" rx="12" fill="#ffffff" stroke="#2563eb" stroke-width="2" filter="url(#shadow)"/>
  <text x="480" y="500" text-anchor="middle" font-size="14" font-weight="700" fill="#2563eb">PERFORMANCE METRICS</text>
  <text x="350" y="540" font-size="12" fill="#475569">⏱️ Sub-second latency</text>
  <text x="350" y="565" font-size="12" fill="#475569">📈 Real-time scoring</text>
  <text x="350" y="590" font-size="12" fill="#475569">🔔 Multi-channel alerts</text>
  <text x="550" y="540" font-size="12" fill="#475569">🐳 Containerized</text>
  <text x="550" y="565" font-size="12" fill="#475569">🔄 Airflow orchestration</text>
  <text x="550" y="590" font-size="12" fill="#475569">📊 MLflow tracking</text>
</svg>'''
    return svg

# Generate all diagrams
output_dir = "docs/diagrams"
os.makedirs(output_dir, exist_ok=True)

# Save diagrams
diagrams = {
    "waffarha-assistant---rag-chatbot.svg": generate_waffarha_diagram(),
    "blockchain-analyzer---forensics-platform.svg": generate_blockchain_diagram(),
    "fraud-detection---streaming-pipeline.svg": generate_fraud_detection_diagram(),
}

for filename, svg_content in diagrams.items():
    filepath = os.path.join(output_dir, filename)
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print(f"✓ Generated: {filename}")

print(f"\nGenerated {len(diagrams)} diagrams in {output_dir}/")
