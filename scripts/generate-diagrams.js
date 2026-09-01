const s = require('simple-icons');
const fs = require('fs');
const path = require('path');

// ========================================
// ICON RESOLUTION SYSTEM
// ========================================
const ICON_REGISTRY = {
  // Databases
  'mysql': 'siMysql',
  'postgresql': 'siPostgresql',
  'redis': 'siRedis',
  'clickhouse': 'siClickhouse',
  'elasticsearch': 'siElasticsearch',
  'neo4j': 'siNeo4j',
  'mongodb': 'siMongodb',
  'duckdb': 'siDuckdb',
  'bigquery': 'siGooglebigquery',
  'sqlite': 'siSqlite',
  'sqlalchemy': 'siSqlalchemy',

  // Orchestration & Processing
  'apache-airflow': 'siApacheairflow',
  'apache-spark': 'siApachespark',
  'apache-flink': 'siApacheflink',
  'apache-nifi': 'siApachenifi',
  'apache-kafka': 'siApachekafka',
  'rabbitmq': 'siRabbitmq',

  // ML/AI
  'mlflow': 'siMlflow',
  'ollama': 'siOllama',
  'pytorch': 'siPytorch',
  'hugging-face': 'siHuggingface',
  'scikit-learn': 'siScikitlearn',
  'pandas': 'siPandas',
  'numpy': null,

  // Web/API
  'fastapi': 'siFastapi',
  'streamlit': 'siStreamlit',
  'express': 'siExpress',
  'nginx': 'siNginx',
  'web3': 'siWeb3dotjs',

  // Languages
  'python': 'siPython',
  'javascript': 'siJavascript',
  'typescript': 'siTypescript',
  'node-js': 'siNodedotjs',

  // DevOps
  'docker': 'siDocker',
  'kubernetes': 'siKubernetes',
  'terraform': 'siTerraform',
  'jenkins': 'siJenkins',
  'github': 'siGithub',
  'github-actions': 'siGithubactions',
  'git': 'siGit',

  // Monitoring
  'prometheus': 'siPrometheus',
  'grafana': 'siGrafana',
  'kibana': 'siKibana',
  'plotly': 'siPlotly',

  // Cloud & Storage
  'google-cloud': 'siGoogle',
  'minio': 'siMinio',

  // Special cases (use available approximations)
  'app-store': 'siAppstore',
  'play-store': 'siGoogleplay',
  'reddit': 'siReddit',
  'slack': 'siSlackware',
  'email': 'siMinutemailer',
  'json': 'siJson',

  // Missing icons - will use placeholder
  'microsoft-sql-server': null,
  'microsoft': null,
  'xgboost': null,
  'lightgbm': null,
  'catboost': null,
  'faiss': null,
  'playwright': null,
  'beautifulsoup': null,
  'aws': null,
};

function resolveIcon(toolName) {
  const key = toolName.toLowerCase().replace(/\s+/g, '-').replace(/\./g, '-');
  const slug = ICON_REGISTRY[key] || ICON_REGISTRY[toolName.toLowerCase()];
  if (!slug) {
    return { available: false, placeholder: true };
  }
  if (s[slug]) {
    return { slug, ...s[slug], available: true };
  }
  return { available: false, placeholder: true };
}

// ========================================
// COLOR PALETTE
// ========================================
const LAYERS = {
  source: {
    fill: '#E3F2FD',
    stroke: '#1976D2',
    text: '#0D47A1',
    label: 'DATA SOURCES'
  },
  ingestion: {
    fill: '#E8F5E9',
    stroke: '#388E3C',
    text: '#1B5E20',
    label: 'INGESTION'
  },
  orchestration: {
    fill: '#FFF3E0',
    stroke: '#F57C00',
    text: '#E65100',
    label: 'ORCHESTRATION'
  },
  processing: {
    fill: '#E0F2F1',
    stroke: '#00838F',
    text: '#004D40',
    label: 'PROCESSING'
  },
  storage: {
    fill: '#F3E5F5',
    stroke: '#7B1FA2',
    text: '#4A148C',
    label: 'STORAGE'
  },
  ml: {
    fill: '#FCE4EC',
    stroke: '#C2185B',
    text: '#880E4F',
    label: 'ML / AI'
  },
  serving: {
    fill: '#E8EAF6',
    stroke: '#303F9F',
    text: '#1A237E',
    label: 'SERVING'
  },
  monitoring: {
    fill: '#F1F8E9',
    stroke: '#558B2F',
    text: '#33691E',
    label: 'MONITORING'
  },
  consumer: {
    fill: '#FFF8E1',
    stroke: '#FF8F00',
    text: '#E65100',
    label: 'CONSUMER'
  },
};

// ========================================
// SVG GENERATION FUNCTIONS
// ========================================
function createDefs() {
  return `
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#6B7280"/>
    </marker>
    <marker id="arrow-dashed" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="#9CA3AF"/>
    </marker>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#F9FAFB"/>
      <stop offset="100%" style="stop-color:#FFFFFF"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.1"/>
    </filter>
  </defs>`;
}

function drawNode(x, y, w, h, label, iconKey, layerKey, nodeId) {
  const layer = LAYERS[layerKey] || LAYERS.source;
  const icon = resolveIcon(iconKey);
  const centerX = x + w / 2;
  const centerY = y + h / 2;

  // Node background
  let svg = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" ry="10"
    fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="1.5" filter="url(#shadow)" id="${nodeId}"/>`;

  // Icon circle
  const iconSize = 28;
  const iconRadius = iconSize / 2;
  const iconCx = centerX;
  const iconCy = y + 24;

  if (icon.available) {
    // Colored icon background circle
    svg += `<circle cx="${iconCx}" cy="${iconCy}" r="${iconRadius + 2}" fill="${icon.hex}" opacity="0.15"/>`;
    svg += `<circle cx="${iconCx}" cy="${iconCy}" r="${iconRadius}" fill="${icon.hex}"/>`;
    // First letter of icon name as text
    const shortLabel = icon.title || iconKey;
    const initial = shortLabel.charAt(0).toUpperCase();
    svg += `<text x="${iconCx}" y="${iconCy + 4}" text-anchor="middle" font-size="12" font-weight="bold" fill="white" font-family="Inter, sans-serif">${initial}</text>`;
  } else {
    // Placeholder circle
    svg += `<circle cx="${iconCx}" cy="${iconCy}" r="${iconRadius}" fill="#9CA3AF" opacity="0.3"/>`;
    svg += `<text x="${iconCx}" y="${iconCy + 4}" text-anchor="middle" font-size="10" fill="#6B7280" font-family="Inter, sans-serif">?</text>`;
  }

  // Label
  svg += `<text x="${centerX}" y="${y + h - 14}" text-anchor="middle" font-size="11" font-weight="500" fill="${layer.text}" font-family="Inter, sans-serif">${label}</text>`;

  return svg;
}

function drawContainer(x, y, w, h, title, layerKey) {
  const layer = LAYERS[layerKey] || LAYERS.source;
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" ry="12"
      fill="${layer.fill}" fill-opacity="0.25" stroke="${layer.stroke}" stroke-width="1.5" stroke-dasharray="6,3"/>
    <text x="${x + 12}" y="${y + 20}" font-size="10" font-weight="600" fill="${layer.stroke}"
      font-family="Inter, sans-serif" text-transform="uppercase" letter-spacing="0.08em">${title}</text>`;
}

function drawEdge(x1, y1, x2, y2, label, type = 'data') {
  const isControl = type === 'control';
  const dashArray = isControl ? 'stroke-dasharray="5,3"' : '';
  const arrowId = isControl ? 'arrow-dashed' : 'arrow';
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;

  let svg = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
    stroke="${isControl ? '#9CA3AF' : '#6B7280'}" stroke-width="1.5"
    ${dashArray} marker-end="url(#${arrowId})" opacity="0.7"/>`;

  if (label) {
    svg += `<text x="${midX}" y="${midY - 6}" text-anchor="middle" font-size="9" fill="#6B7280" font-family="Inter, sans-serif">${label}</text>`;
  }

  return svg;
}

function drawLegend(x, y) {
  const items = Object.entries(LAYERS).slice(0, 6);
  let svg = `<rect x="${x}" y="${y}" width="160" height="${items.length * 22 + 20}" rx="8" fill="white" stroke="#E5E7EB" opacity="0.9"/>`;
  svg += `<text x="${x + 10}" y="${y + 16}" font-size="10" font-weight="600" fill="#374151" font-family="Inter, sans-serif">LEGEND</text>`;

  items.forEach(([key, layer], i) => {
    const ly = y + 32 + i * 22;
    svg += `<rect x="${x + 10}" y="${ly}" width="14" height="14" rx="3" fill="${layer.fill}" stroke="${layer.stroke}"/>`;
    svg += `<text x="${x + 30}" y="${ly + 11}" font-size="9" fill="#374151" font-family="Inter, sans-serif">${layer.label}</text>`;
  });

  return svg;
}

function generateDiagram(projectName, nodes, edges, width, height) {
  let content = '';

  // Title
  content += `<text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="600" fill="#111827" font-family="Inter, sans-serif">${projectName}</text>`;
  content += `<text x="${width / 2}" y="40" text-anchor="middle" font-size="11" fill="#6B7280" font-family="Inter, sans-serif">Architecture Diagram</text>`;

  // Containers
  nodes.filter(n => n.container).forEach(n => {
    content += drawContainer(n.x, n.y, n.w, n.h, n.title, n.layer);
  });

  // Edges
  edges.forEach(e => {
    const from = nodes.find(n => n.id === e.from && !n.container);
    const to = nodes.find(n => n.id === e.to && !n.container);
    if (from && to) {
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h;
      const x2 = to.x + to.w / 2;
      const y2 = to.y;
      content += drawEdge(x1, y1, x2, y2, e.label, e.type);
    }
  });

  // Nodes
  nodes.filter(n => !n.container).forEach(n => {
    content += drawNode(n.x, n.y, n.w, n.h, n.label, n.icon, n.layer, n.id);
  });

  // Legend
  content += drawLegend(width - 180, height - 140);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${createDefs()}
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  ${content}
</svg>`;
}

// ========================================
// PROJECT DEFINITIONS
// ========================================

// 1. Waffarha Assistant
const waffarha = {
  name: 'Waffarha Assistant — RAG Chatbot',
  width: 640,
  height: 780,
  nodes: [
    // Containers
    { id: 'c_source', container: true, x: 40, y: 55, w: 280, h: 90, title: 'Data Sources', layer: 'source' },
    { id: 'c_rag', container: true, x: 40, y: 175, w: 280, h: 170, title: 'RAG Engine', layer: 'processing' },
    { id: 'c_vector', container: true, x: 40, y: 375, w: 280, h: 70, title: 'Vector Store', layer: 'storage' },
    { id: 'c_llm', container: true, x: 40, y: 475, w: 280, h: 70, title: 'LLM Layer', layer: 'ml' },
    { id: 'c_api', container: true, x: 40, y: 575, w: 280, h: 70, title: 'API / Serving', layer: 'serving' },
    { id: 'c_memory', container: true, x: 360, y: 175, w: 200, h: 70, title: 'Session Memory', layer: 'storage' },
    { id: 'c_eval', container: true, x: 360, y: 575, w: 200, h: 70, title: 'Evaluation', layer: 'consumer' },

    // Nodes
    { id: 'faq', label: 'FAQs JSON', icon: 'json', layer: 'source', x: 55, y: 65, w: 125, h: 60 },
    { id: 'offers', label: 'Offers JSON', icon: 'json', layer: 'source', x: 190, y: 65, w: 125, h: 60 },
    { id: 'clickhouse', label: 'ClickHouse', icon: 'clickhouse', layer: 'source', x: 115, y: 135, w: 120, h: 60 },
    { id: 'rag', label: 'RAG Engine', icon: 'python', layer: 'processing', x: 55, y: 195, w: 250, h: 55 },
    { id: 'intent', label: 'Intent Classifier', icon: 'python', layer: 'processing', x: 55, y: 265, w: 120, h: 50 },
    { id: 'factcheck', label: 'Fact Checker', icon: 'python', layer: 'processing', x: 190, y: 265, w: 120, h: 50 },
    { id: 'embed', label: 'Embeddings', icon: 'google-cloud', layer: 'processing', x: 55, y: 325, w: 120, h: 50 },
    { id: 'vector-store', label: 'FAISS Index', icon: 'duckdb', layer: 'storage', x: 190, y: 325, w: 120, h: 50 },
    { id: 'ollama', label: 'Ollama', icon: 'ollama', layer: 'ml', x: 55, y: 495, w: 120, h: 50 },
    { id: 'qwen', label: 'Qwen 2.5', icon: 'python', layer: 'ml', x: 190, y: 495, w: 120, h: 50 },
    { id: 'fastapi', label: 'FastAPI', icon: 'fastapi', layer: 'serving', x: 55, y: 595, w: 120, h: 50 },
    { id: 'identity', label: 'Identity', icon: 'git', layer: 'serving', x: 190, y: 595, w: 120, h: 50 },
    { id: 'redis', label: 'Redis', icon: 'redis', layer: 'storage', x: 375, y: 195, w: 170, h: 50 },
    { id: 'eval', label: 'Eval Suite', icon: 'python', layer: 'consumer', x: 375, y: 595, w: 170, h: 50 },
  ],
  edges: [
    { from: 'faq', to: 'rag', label: 'Load' },
    { from: 'offers', to: 'rag', label: 'Load' },
    { from: 'clickhouse', to: 'rag', label: 'Query' },
    { from: 'rag', to: 'intent', label: 'Route' },
    { from: 'intent', to: 'vector-store', label: 'Search' },
    { from: 'intent', to: 'factcheck', label: 'Verify' },
    { from: 'embed', to: 'vector-store', label: 'Embed' },
    { from: 'factcheck', to: 'ollama', label: 'Fallback' },
    { from: 'ollama', to: 'fastapi', label: 'Response' },
    { from: 'fastapi', to: 'identity', label: 'Auth' },
    { from: 'fastapi', to: 'redis', label: 'Session' },
    { from: 'fastapi', to: 'eval', label: 'Log' },
  ]
};

// 2. Market Intelligence
const market = {
  name: 'Market Intelligence — Sentiment Pipeline',
  width: 540,
  height: 660,
  nodes: [
    { id: 'c_sources', container: true, x: 40, y: 55, w: 460, h: 80, title: 'Data Sources', layer: 'source' },
    { id: 'c_connectors', container: true, x: 40, y: 165, w: 460, h: 70, title: 'Connector Registry', layer: 'ingestion' },
    { id: 'c_pipeline', container: true, x: 40, y: 265, w: 460, h: 150, title: 'Processing Pipeline', layer: 'processing' },
    { id: 'c_dashboard', container: true, x: 40, y: 455, w: 460, h: 70, title: 'Dashboard', layer: 'consumer' },

    { id: 'appstore', label: 'App Store', icon: 'app-store', layer: 'source', x: 50, y: 65, w: 85, h: 55 },
    { id: 'playstore', label: 'Play Store', icon: 'play-store', layer: 'source', x: 145, y: 65, w: 85, h: 55 },
    { id: 'reddit', label: 'Reddit', icon: 'reddit', layer: 'source', x: 240, y: 65, w: 85, h: 55 },
    { id: 'news', label: 'Google News', icon: 'google-cloud', layer: 'source', x: 335, y: 65, w: 85, h: 55 },
    { id: 'web', label: 'Web Search', icon: 'google-cloud', layer: 'source', x: 430, y: 65, w: 60, h: 55 },
    { id: 'connectors', label: 'Connectors', icon: 'python', layer: 'ingestion', x: 50, y: 185, w: 440, h: 50 },
    { id: 'lang', label: 'Lang Detection', icon: 'python', layer: 'processing', x: 50, y: 285, w: 110, h: 50 },
    { id: 'arabert', label: 'AraBERT', icon: 'hugging-face', layer: 'processing', x: 180, y: 285, w: 110, h: 50 },
    { id: 'roberta', label: 'RoBERTa', icon: 'hugging-face', layer: 'processing', x: 310, y: 285, w: 110, h: 50 },
    { id: 'topics', label: 'Topic Tagger', icon: 'python', layer: 'processing', x: 50, y: 365, w: 110, h: 50 },
    { id: 'neg-triage', label: 'Neg. Triage', icon: 'python', layer: 'processing', x: 180, y: 365, w: 110, h: 50 },
    { id: 'trends', label: 'Trend Analysis', icon: 'plotly', layer: 'processing', x: 310, y: 365, w: 110, h: 50 },
    { id: 'streamlit', label: 'Streamlit', icon: 'streamlit', layer: 'consumer', x: 50, y: 475, w: 440, h: 50 },
  ],
  edges: [
    { from: 'appstore', to: 'connectors' },
    { from: 'playstore', to: 'connectors' },
    { from: 'reddit', to: 'connectors' },
    { from: 'news', to: 'connectors' },
    { from: 'web', to: 'connectors' },
    { from: 'connectors', to: 'lang', label: 'Collect' },
    { from: 'lang', to: 'arabert', label: 'Arabic' },
    { from: 'lang', to: 'roberta', label: 'English' },
    { from: 'arabert', to: 'topics' },
    { from: 'roberta', to: 'neg-triage' },
    { from: 'topics', to: 'trends' },
    { from: 'neg-triage', to: 'trends' },
    { from: 'trends', to: 'streamlit' },
  ]
};

// 3. Partner Price Integrity
const partner = {
  name: 'Partner Price Integrity — Scraping Pipeline',
  width: 660,
  height: 680,
  nodes: [
    { id: 'c_daily', container: true, x: 40, y: 55, w: 400, h: 350, title: 'Daily Pipeline', layer: 'orchestration' },
    { id: 'c_weekly', container: true, x: 40, y: 435, w: 200, h: 90, title: 'Weekly Audit', layer: 'orchestration' },
    { id: 'c_output', container: true, x: 270, y: 435, w: 170, h: 90, title: 'Output', layer: 'storage' },
    { id: 'c_reports', container: true, x: 470, y: 435, w: 150, h: 90, title: 'Reports', layer: 'consumer' },

    { id: 'airflow', label: 'Airflow', icon: 'apache-airflow', layer: 'orchestration', x: 55, y: 75, w: 120, h: 50 },
    { id: 'ingest', label: 'Ingest', icon: 'python', layer: 'processing', x: 55, y: 145, w: 100, h: 50 },
    { id: 'normalize', label: 'Normalize', icon: 'python', layer: 'processing', x: 175, y: 145, w: 100, h: 50 },
    { id: 'scrape', label: 'Scrape', icon: 'playwright', layer: 'processing', x: 295, y: 145, w: 120, h: 50 },
    { id: 'match', label: 'Match', icon: 'python', layer: 'processing', x: 55, y: 215, w: 100, h: 50 },
    { id: 'compare', label: 'Compare', icon: 'python', layer: 'processing', x: 175, y: 215, w: 100, h: 50 },
    { id: 'report-gen', label: 'Report Gen', icon: 'python', layer: 'processing', x: 295, y: 215, w: 100, h: 50 },
    { id: 'clickhouse', label: 'ClickHouse', icon: 'clickhouse', layer: 'storage', x: 55, y: 285, w: 120, h: 50 },
    { id: 'raw-html', label: 'Raw HTML', icon: 'json', layer: 'storage', x: 200, y: 285, w: 90, h: 50 },
    { id: 'part-audit', label: 'Partner Audit', icon: 'apache-airflow', layer: 'orchestration', x: 55, y: 455, w: 170, h: 60 },
    { id: 'clickhouse-out', label: 'ClickHouse', icon: 'clickhouse', layer: 'storage', x: 285, y: 455, w: 140, h: 60 },
    { id: 'reports-out', label: 'HTML/Excel', icon: 'python', layer: 'consumer', x: 485, y: 455, w: 130, h: 60 },
  ],
  edges: [
    { from: 'airflow', to: 'ingest', label: 'Schedule' },
    { from: 'ingest', to: 'normalize', label: 'Offers' },
    { from: 'normalize', to: 'scrape', label: 'URLs' },
    { from: 'scrape', to: 'match', label: 'HTML' },
    { from: 'match', to: 'compare', label: 'Matches' },
    { from: 'compare', to: 'report-gen', label: 'Prices' },
    { from: 'report-gen', to: 'clickhouse', label: 'Store' },
    { from: 'report-gen', to: 'raw-html', label: 'Archive' },
    { from: 'part-audit', to: 'ingest', label: 'Classify' },
    { from: 'compare', to: 'clickhouse-out', label: 'Results' },
    { from: 'report-gen', to: 'reports-out', label: 'Generate' },
  ]
};

// 4. Blockchain Analyzer
const blockchain = {
  name: 'Blockchain Analyzer — Forensics Platform',
  width: 580,
  height: 620,
  nodes: [
    { id: 'c_sources', container: true, x: 40, y: 55, w: 500, h: 70, title: 'Blockchain Sources', layer: 'source' },
    { id: 'c_etl', container: true, x: 40, y: 155, w: 500, h: 100, title: 'ETL Pipeline', layer: 'processing' },
    { id: 'c_graph', container: true, x: 40, y: 285, w: 240, h: 120, title: 'Graph Analytics', layer: 'processing' },
    { id: 'c_search', container: true, x: 320, y: 285, w: 220, h: 120, title: 'Search & Logs', layer: 'storage' },
    { id: 'c_viz', container: true, x: 40, y: 435, w: 500, h: 80, title: 'Visualization', layer: 'consumer' },

    { id: 'infura', label: 'Infura API', icon: 'web3', layer: 'source', x: 55, y: 75, w: 120, h: 50 },
    { id: 'etherscan', label: 'Etherscan', icon: 'web3', layer: 'source', x: 200, y: 75, w: 120, h: 50 },
    { id: 'gen', label: 'Data Generator', icon: 'python', layer: 'source', x: 345, y: 75, w: 120, h: 50 },
    { id: 'spark', label: 'PySpark ETL', icon: 'apache-spark', layer: 'processing', x: 55, y: 175, w: 120, h: 50 },
    { id: 'medallion', label: 'Bronze→Silver→Gold', icon: 'python', layer: 'processing', x: 200, y: 175, w: 140, h: 50 },
    { id: 'neo4j', label: 'Neo4j', icon: 'neo4j', layer: 'processing', x: 55, y: 305, w: 100, h: 50 },
    { id: 'graphframes', label: 'GraphFrames', icon: 'apache-spark', layer: 'processing', x: 180, y: 305, w: 100, h: 50 },
    { id: 'es', label: 'Elasticsearch', icon: 'elasticsearch', layer: 'storage', x: 335, y: 305, w: 100, h: 50 },
    { id: 'kibana', label: 'Kibana', icon: 'kibana', layer: 'storage', x: 335, y: 375, w: 100, h: 50 },
    { id: 'kibana-dash', label: 'Kibana Dashboards', icon: 'kibana', layer: 'consumer', x: 55, y: 455, w: 150, h: 50 },
    { id: 'plotly', label: 'Plotly Visualizations', icon: 'plotly', layer: 'consumer', x: 230, y: 455, w: 150, h: 50 },
    { id: 'benchmark', label: 'Benchmark Module', icon: 'python', layer: 'consumer', x: 405, y: 455, w: 120, h: 50 },
  ],
  edges: [
    { from: 'infura', to: 'spark' },
    { from: 'etherscan', to: 'spark' },
    { from: 'gen', to: 'spark' },
    { from: 'spark', to: 'medallion', label: 'Ingest' },
    { from: 'medallion', to: 'neo4j', label: 'Load' },
    { from: 'medallion', to: 'es', label: 'Index' },
    { from: 'neo4j', to: 'kibana-dash' },
    { from: 'es', to: 'kibana' },
    { from: 'kibana', to: 'kibana-dash' },
    { from: 'es', to: 'plotly' },
    { from: 'medallion', to: 'benchmark', label: 'Compare' },
  ]
};

// 5. Credit Risk Analysis
const credit = {
  name: 'Credit Risk Analysis — MLOps Platform',
  width: 480,
  height: 780,
  nodes: [
    { id: 'c_data', container: true, x: 40, y: 55, w: 400, h: 90, title: 'Data Layer', layer: 'source' },
    { id: 'c_models', container: true, x: 40, y: 175, w: 400, h: 150, title: 'ML Models', layer: 'ml' },
    { id: 'c_track', container: true, x: 40, y: 355, w: 400, h: 80, title: 'Experiment Tracking', layer: 'orchestration' },
    { id: 'c_orch', container: true, x: 40, y: 465, w: 400, h: 80, title: 'Orchestration', layer: 'orchestration' },
    { id: 'c_serve', container: true, x: 40, y: 575, w: 400, h: 90, title: 'Serving', layer: 'serving' },
    { id: 'c_dash', container: true, x: 40, y: 695, w: 400, h: 70, title: 'Dashboard', layer: 'consumer' },

    { id: 'gen', label: 'Data Generator', icon: 'python', layer: 'source', x: 55, y: 75, w: 120, h: 50 },
    { id: 'feat-eng', label: 'Feature Eng', icon: 'pandas', layer: 'source', x: 200, y: 75, w: 120, h: 50 },
    { id: 'xgboost', label: 'XGBoost', icon: 'python', layer: 'ml', x: 55, y: 195, w: 110, h: 50 },
    { id: 'lightgbm', label: 'LightGBM', icon: 'python', layer: 'ml', x: 180, y: 195, w: 110, h: 50 },
    { id: 'catboost', label: 'CatBoost', icon: 'python', layer: 'ml', x: 305, y: 195, w: 110, h: 50 },
    { id: 'ensemble', label: 'Hybrid Ensemble', icon: 'python', layer: 'ml', x: 55, y: 265, w: 140, h: 50 },
    { id: 'tabtransformer', label: 'TabTransformer', icon: 'pytorch', layer: 'ml', x: 210, y: 265, w: 120, h: 50 },
    { id: 'mlflow', label: 'MLflow', icon: 'mlflow', layer: 'orchestration', x: 55, y: 375, w: 120, h: 50 },
    { id: 'airflow-credit', label: 'Airflow', icon: 'apache-airflow', layer: 'orchestration', x: 210, y: 375, w: 120, h: 50 },
    { id: 'fastapi-credit', label: 'FastAPI', icon: 'fastapi', layer: 'serving', x: 55, y: 595, w: 120, h: 50 },
    { id: 'redis-credit', label: 'Redis Cache', icon: 'redis', layer: 'serving', x: 210, y: 595, w: 120, h: 50 },
    { id: 'streamlit-credit', label: 'Streamlit', icon: 'streamlit', layer: 'consumer', x: 55, y: 715, w: 280, h: 50 },
  ],
  edges: [
    { from: 'gen', to: 'mlflow', label: 'Features' },
    { from: 'feat-eng', to: 'mlflow' },
    { from: 'mlflow', to: 'xgboost', label: 'Train' },
    { from: 'mlflow', to: 'lightgbm' },
    { from: 'mlflow', to: 'catboost' },
    { from: 'mlflow', to: 'ensemble' },
    { from: 'mlflow', to: 'tabtransformer' },
    { from: 'airflow-credit', to: 'mlflow', label: 'Orchestrate' },
    { from: 'ensemble', to: 'fastapi-credit', label: 'Deploy' },
    { from: 'fastapi-credit', to: 'redis-credit', label: 'Cache' },
    { from: 'fastapi-credit', to: 'streamlit-credit', label: 'Serve' },
  ]
};

// 6. Fraud Detection
const fraud = {
  name: 'Fraud Detection — Streaming Pipeline',
  width: 460,
  height: 740,
  nodes: [
    { id: 'c_sources', container: true, x: 40, y: 55, w: 380, h: 70, title: 'Transaction Sources', layer: 'source' },
    { id: 'c_stream', container: true, x: 40, y: 155, w: 380, h: 90, title: 'Streaming Layer', layer: 'processing' },
    { id: 'c_model', container: true, x: 40, y: 275, w: 380, h: 100, title: 'Model Serving', layer: 'ml' },
    { id: 'c_alert', container: true, x: 40, y: 405, w: 380, h: 90, title: 'Alerting', layer: 'monitoring' },
    { id: 'c_dash', container: true, x: 40, y: 525, w: 380, h: 90, title: 'Monitoring', layer: 'consumer' },

    { id: 'tx', label: 'Tx Feeds', icon: 'rabbitmq', layer: 'source', x: 55, y: 75, w: 110, h: 50 },
    { id: 'bank', label: 'Bank APIs', icon: 'express', layer: 'source', x: 200, y: 75, w: 110, h: 50 },
    { id: 'kafka', label: 'Kafka', icon: 'apache-kafka', layer: 'processing', x: 55, y: 175, w: 110, h: 50 },
    { id: 'flink', label: 'Flink Streaming', icon: 'apache-flink', layer: 'processing', x: 200, y: 175, w: 140, h: 50 },
    { id: 'rf', label: 'Random Forest', icon: 'python', layer: 'ml', x: 55, y: 295, w: 110, h: 50 },
    { id: 'gbm', label: 'Gradient Boost', icon: 'python', layer: 'ml', x: 200, y: 295, w: 110, h: 50 },
    { id: 'logreg', label: 'Logistic Reg', icon: 'python', layer: 'ml', x: 55, y: 360, w: 110, h: 50 },
    { id: 'fastapi-fraud', label: 'FastAPI', icon: 'fastapi', layer: 'ml', x: 200, y: 360, w: 110, h: 50 },
    { id: 'slack', label: 'Slack', icon: 'slack', layer: 'monitoring', x: 55, y: 425, w: 100, h: 50 },
    { id: 'email', label: 'Email', icon: 'email', layer: 'monitoring', x: 170, y: 425, w: 100, h: 50 },
    { id: 'webhook', label: 'Webhooks', icon: 'express', layer: 'monitoring', x: 280, y: 425, w: 100, h: 50 },
    { id: 'dashboard', label: 'Plotly/Dash', icon: 'plotly', layer: 'consumer', x: 55, y: 545, w: 280, h: 50 },
  ],
  edges: [
    { from: 'tx', to: 'kafka' },
    { from: 'bank', to: 'kafka' },
    { from: 'kafka', to: 'flink', label: 'Stream' },
    { from: 'flink', to: 'rf' },
    { from: 'flink', to: 'gbm' },
    { from: 'rf', to: 'fastapi-fraud', label: 'Score' },
    { from: 'gbm', to: 'fastapi-fraud' },
    { from: 'logreg', to: 'fastapi-fraud' },
    { from: 'fastapi-fraud', to: 'slack', label: 'Alert' },
    { from: 'fastapi-fraud', to: 'email' },
    { from: 'fastapi-fraud', to: 'webhook' },
    { from: 'fastapi-fraud', to: 'dashboard', label: 'Monitor' },
  ]
};

// 7. Nexlify DW
const nexlify = {
  name: 'Nexlify DW — Healthcare Data Warehouse',
  width: 540,
  height: 580,
  nodes: [
    { id: 'c_sources', container: true, x: 40, y: 55, w: 460, h: 90, title: 'Source Systems (10+ Clinics)', layer: 'source' },
    { id: 'c_etl', container: true, x: 40, y: 175, w: 460, h: 80, title: 'ETL / Transformation', layer: 'processing' },
    { id: 'c_warehouse', container: true, x: 40, y: 285, w: 460, h: 120, title: 'Data Warehouse (PostgreSQL)', layer: 'storage' },
    { id: 'c_bi', container: true, x: 40, y: 435, w: 460, h: 80, title: 'Business Intelligence', layer: 'consumer' },

    { id: 'clinic-api', label: 'Clinic APIs', icon: 'express', layer: 'source', x: 55, y: 75, w: 100, h: 50 },
    { id: 'excel', label: 'Excel/CSV', icon: 'json', layer: 'source', x: 175, y: 75, w: 100, h: 50 },
    { id: 'mysql-nex', label: 'MySQL', icon: 'mysql', layer: 'source', x: 295, y: 75, w: 100, h: 50 },
    { id: 'postgres-nex', label: 'PostgreSQL', icon: 'postgresql', layer: 'source', x: 55, y: 140, w: 100, h: 50 },
    { id: 'mssql', label: 'SQL Server', icon: 'microsoft-sql-server', layer: 'source', x: 175, y: 140, w: 100, h: 50 },
    { id: 'sqlite-nex', label: 'SQLite', icon: 'sqlite', layer: 'source', x: 295, y: 140, w: 100, h: 50 },
    { id: 'airflow-nex', label: 'Airflow', icon: 'apache-airflow', layer: 'processing', x: 55, y: 195, w: 120, h: 50 },
    { id: 'sql-transform', label: 'SQL Transforms', icon: 'postgresql', layer: 'processing', x: 200, y: 195, w: 140, h: 50 },
    { id: 'pg-dw', label: 'PostgreSQL DW', icon: 'postgresql', layer: 'storage', x: 55, y: 305, w: 120, h: 50 },
    { id: 'star-schema', label: 'Star Schema', icon: 'postgresql', layer: 'storage', x: 200, y: 305, w: 120, h: 50 },
    { id: 'fact', label: 'Fact Tables', icon: 'postgresql', layer: 'storage', x: 55, y: 375, w: 120, h: 50 },
    { id: 'dim', label: 'Dim Tables', icon: 'postgresql', layer: 'storage', x: 200, y: 375, w: 120, h: 50 },
    { id: 'bridge', label: 'Bridge Tables', icon: 'postgresql', layer: 'storage', x: 340, y: 375, w: 120, h: 50 },
    { id: 'powerbi', label: 'Power BI', icon: 'microsoft', layer: 'consumer', x: 55, y: 455, w: 200, h: 50 },
  ],
  edges: [
    { from: 'clinic-api', to: 'airflow-nex' },
    { from: 'excel', to: 'airflow-nex' },
    { from: 'mysql-nex', to: 'airflow-nex' },
    { from: 'postgres-nex', to: 'airflow-nex' },
    { from: 'mssql', to: 'airflow-nex' },
    { from: 'sqlite-nex', to: 'airflow-nex' },
    { from: 'airflow-nex', to: 'sql-transform', label: 'Orchestrate' },
    { from: 'sql-transform', to: 'pg-dw', label: 'Load' },
    { from: 'pg-dw', to: 'star-schema' },
    { from: 'star-schema', to: 'fact' },
    { from: 'star-schema', to: 'dim' },
    { from: 'star-schema', to: 'bridge' },
    { from: 'fact', to: 'powerbi' },
    { from: 'dim', to: 'powerbi' },
    { from: 'bridge', to: 'powerbi' },
  ]
};

// ========================================
// GENERATE ALL DIAGRAMS
// ========================================
const diagrams = [waffarha, market, partner, blockchain, credit, fraud, nexlify];
const outputDir = path.join(__dirname, '..', 'docs', 'diagrams');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

diagrams.forEach(diagram => {
  let svg = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  svg += `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${diagram.width} ${diagram.height}" width="${diagram.width}" height="${diagram.height}">\n`;
  svg += createDefs();
  svg += `<rect width="${diagram.width}" height="${diagram.height}" fill="url(#bg)"/>\n`;

  // Title
  svg += `<text x="${diagram.width / 2}" y="24" text-anchor="middle" font-size="16" font-weight="600" fill="#111827" font-family="Inter, sans-serif">${diagram.name}</text>\n`;
  svg += `<text x="${diagram.width / 2}" y="40" text-anchor="middle" font-size="11" fill="#6B7280" font-family="Inter, sans-serif">Architecture Diagram</text>\n`;

  // Containers
  diagram.nodes.filter(n => n.container).forEach(n => {
    const layer = LAYERS[n.layer];
    svg += `  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="12" ry="12"\n`;
    svg += `    fill="${layer.fill}" fill-opacity="0.2" stroke="${layer.stroke}" stroke-width="1.5" stroke-dasharray="6,3"/>\n`;
    svg += `  <text x="${n.x + 12}" y="${n.y + 20}" font-size="10" font-weight="600" fill="${layer.stroke}"`;
    svg += ` font-family="Inter, sans-serif" text-transform="uppercase" letter-spacing="0.08em">${n.title}</text>\n`;
  });

  // Edges
  diagram.edges.forEach(e => {
    const from = diagram.nodes.find(n => n.id === e.from && !n.container);
    const to = diagram.nodes.find(n => n.id === e.to && !n.container);
    if (from && to) {
      const x1 = from.x + from.w / 2;
      const y1 = from.y + from.h;
      const x2 = to.x + to.w / 2;
      const y2 = to.y;
      svg += `  <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6B7280" stroke-width="1.5" marker-end="url(#arrow)" opacity="0.7"/>\n`;
      if (e.label) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        svg += `  <text x="${mx}" y="${my - 6}" text-anchor="middle" font-size="9" fill="#6B7280" font-family="Inter, sans-serif">${e.label}</text>\n`;
      }
    }
  });

  // Nodes
  diagram.nodes.filter(n => !n.container).forEach(n => {
    const layer = LAYERS[n.layer];
    const icon = resolveIcon(n.icon);
    const cx = n.x + n.w / 2;
    const cy = n.y + 20;

    // Background rect
    svg += `  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" ry="10"\n`;
    svg += `    fill="${layer.fill}" stroke="${layer.stroke}" stroke-width="1.5"/>\n`;

    // Icon circle
    if (icon && icon.available) {
      svg += `  <circle cx="${cx}" cy="${cy}" r="14" fill="#${icon.hex}"/>\n`;
      svg += `  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="11" font-weight="bold" fill="white" font-family="Inter, sans-serif">${icon.title.charAt(0)}</text>\n`;
    } else {
      svg += `  <circle cx="${cx}" cy="${cy}" r="14" fill="#9CA3AF" opacity="0.3"/>\n`;
      svg += `  <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" fill="#6B7280" font-family="Inter, sans-serif">?</text>\n`;
    }

    // Label
    svg += `  <text x="${cx}" y="${n.y + n.h - 12}" text-anchor="middle" font-size="11" font-weight="500" fill="${layer.text}" font-family="Inter, sans-serif">${n.label}</text>\n`;
  });

  // Legend
  const legendX = diagram.width - 170;
  const legendY = diagram.height - 130;
  svg += `  <rect x="${legendX}" y="${legendY}" width="155" height="110" rx="8" fill="white" stroke="#E5E7EB"/>\n`;
  svg += `  <text x="${legendX + 10}" y="${legendY + 18}" font-size="10" font-weight="600" fill="#374151" font-family="Inter, sans-serif">LAYER LEGEND</text>\n`;

  const legendItems = Object.entries(LAYERS).slice(0, 5);
  legendItems.forEach(([key, layer], i) => {
    const ly = legendY + 32 + i * 14;
    svg += `  <rect x="${legendX + 10}" y="${ly}" width="12" height="12" rx="2" fill="${layer.fill}" stroke="${layer.stroke}"/>\n`;
    svg += `  <text x="${legendX + 28}" y="${ly + 10}" font-size="9" fill="#374151" font-family="Inter, sans-serif">${layer.label}</text>\n`;
  });

  svg += `</svg>\n`;

  const filename = path.join(outputDir, `${diagram.name.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase()}.svg`);
  fs.writeFileSync(filename, svg, 'utf8');
  console.log(`✓ Generated: ${filename}`);
});

console.log('\nAll diagrams generated successfully!');

// Print icon availability summary
console.log('\n=== ICON AVAILABILITY CHECKLIST ===');
const allIcons = new Set();
diagrams.forEach(d => d.nodes.forEach(n => { if (!n.container) allIcons.add(n.icon); }));
allIcons.forEach(icon => {
  const resolved = resolveIcon(icon);
  const status = resolved.available ? '✓' : '⚠ MISSING';
  console.log(`  ${status} ${icon.padEnd(25)} ${resolved.available ? resolved.slug : '(manual sourcing required)'}`);
});
