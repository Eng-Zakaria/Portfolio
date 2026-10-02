/* ============================================================
 * generate-diagrams-v2.js — premium dark architecture diagrams
 * Design system: dark navy canvas, glowing lane bands, real
 * Simple-Icons brand marks, animated SMIL data-flow edges,
 * metric pills, footer brand + layer legend.
 * Run: node scripts/generate-diagrams-v2.js
 * ============================================================ */
const s = require('simple-icons');
const fs = require('fs');
const path = require('path');

/* ---------- palette ---------- */
const LAYERS = {
  source:        { c: '#60a5fa', label: 'SOURCES' },
  ingestion:     { c: '#34d399', label: 'INGESTION' },
  orchestration: { c: '#fb923c', label: 'ORCHESTRATION' },
  processing:    { c: '#22d3ee', label: 'PROCESSING' },
  storage:       { c: '#a78bfa', label: 'STORAGE' },
  ml:            { c: '#f472b6', label: 'ML / AI' },
  serving:       { c: '#818cf8', label: 'SERVING' },
  monitoring:    { c: '#fbbf24', label: 'MONITORING' },
  consumer:      { c: '#a3e635', label: 'CONSUMER' },
};
const INK = '#eef2ff';
const MUTED = '#8ea0c4';
const CARD = '#141d38';
const FONT = 'Inter, -apple-system, Segoe UI, sans-serif';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const ICON_REGISTRY = {
  mysql: 'siMysql', postgresql: 'siPostgresql', redis: 'siRedis',
  clickhouse: 'siClickhouse', elasticsearch: 'siElasticsearch', neo4j: 'siNeo4j',
  mongodb: 'siMongodb', duckdb: 'siDuckdb', bigquery: 'siGooglebigquery',
  sqlite: 'siSqlite', influxdb: 'siInfluxdb',
  'apache-airflow': 'siApacheairflow', 'apache-spark': 'siApachespark',
  'apache-flink': 'siApacheflink', 'apache-nifi': 'siApachenifi',
  'apache-kafka': 'siApachekafka', rabbitmq: 'siRabbitmq',
  mlflow: 'siMlflow', ollama: 'siOllama', pytorch: 'siPytorch',
  'hugging-face': 'siHuggingface', 'scikit-learn': 'siScikitlearn',
  pandas: 'siPandas', fastapi: 'siFastapi', streamlit: 'siStreamlit',
  django: 'siDjango', react: 'siReact', express: 'siExpress',
  qdrant: 'siQdrant',
  python: 'siPython', javascript: 'siJavascript', typescript: 'siTypescript',
  docker: 'siDocker', kubernetes: 'siKubernetes', terraform: 'siTerraform',
  'github-actions': 'siGithubactions',
  prometheus: 'siPrometheus', grafana: 'siGrafana', kibana: 'siKibana',
  plotly: 'siPlotly', minio: 'siMinio', json: 'siJson',
  reddit: 'siReddit', web3: 'siWeb3dotjs',
  'app-store': 'siAppstore', 'play-store': 'siGoogleplay',
  'google-cloud': 'siGoogle', slack: 'siSlackware', email: 'siGmail',
  databricks: 'siDatabricks', snowflake: 'siSnowflake', telegram: 'siTelegram',
  'apache-hadoop': 'siApachehadoop', celery: 'siCelery',
};

const MONOGRAMS = {
  faiss: { t: 'Fa', c: '#7aa5ff' }, xgboost: { t: 'XG', c: '#22c55e' },
  lightgbm: { t: 'LG', c: '#84cc16' }, catboost: { t: 'CB', c: '#eab308' },
  'microsoft-sql-server': { t: 'MS', c: '#f87171' }, mssql: { t: 'MS', c: '#f87171' },
  microsoft: { t: 'PBI', c: '#facc15' }, powerbi: { t: 'PBI', c: '#facc15' },
  playwright: { t: 'PW', c: '#34d399' }, azure: { t: 'Az', c: '#38bdf8' },
  dbt: { t: 'dbt', c: '#f97316' }, s3: { t: 'S3', c: '#f59e0b' },
  flume: { t: 'Fl', c: '#2dd4bf' }, parquet: { t: 'Pq', c: '#93c5fd' },
  debezium: { t: 'CDC', c: '#34d399' }, bitcoin: { t: '₿', c: '#f7931a' },
  hdfs: { t: 'HDFS', c: '#94a3b8' }, delta: { t: 'Δ', c: '#22d3ee' },
  beautifulsoup: { t: 'BS', c: '#4ade80' },
};

function resolveIcon(key) {
  const k = (key || '').toLowerCase();
  const slug = ICON_REGISTRY[k];
  if (slug && s[slug]) return { kind: 'logo', hex: s[slug].hex, path: s[slug].path };
  if (MONOGRAMS[k]) return { kind: 'mono', t: MONOGRAMS[k].t, c: MONOGRAMS[k].c };
  return { kind: 'none' };
}

/* ---------- layout constants ---------- */
const W = 980, M = 40;
const TITLE_H = 104, LANE_HEAD = 34, NODE_H = 88, LANE_GAP = 20, FOOT_H = 64;

/* ---------- pieces ---------- */
function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function defs(usedLayers) {
  let markers = [...new Set(usedLayers)].map(k => {
    const c = LAYERS[k].c;
    const id = 'arr-' + k;
    return `<marker id="${id}" markerWidth="9" markerHeight="7" refX="7.5" refY="3.5" orient="auto" markerUnits="strokeWidth"><polygon points="0 0, 9 3.5, 0 7" fill="${c}"/></marker>`;
  }).join('\n');
  return `<defs>
    <radialGradient id="glowA" cx="18%" cy="6%" r="55%">
      <stop offset="0%" stop-color="#7aa5ff" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#7aa5ff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="85%" cy="95%" r="60%">
      <stop offset="0%" stop-color="#34d399" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#34d399" stop-opacity="0"/>
    </radialGradient>
    <filter id="nodeGlow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="3" stdDeviation="5" flood-color="#000000" flood-opacity="0.55"/>
    </filter>
    ${markers}
  </defs>`;
}

function header(d) {
  const pills = (d.metrics || []).map(m =>
    `<g><rect x="0" y="0" width="${esc(m).length * 6.4 + 22}" height="24" rx="12" fill="#16264d" stroke="#35446e"/>` +
    `<text x="${(esc(m).length * 6.4 + 22) / 2}" y="16.5" text-anchor="middle" font-size="10.5" font-weight="600" fill="#b3ccff" font-family="${MONO}">${esc(m)}</text></g>`
  );
  // right-align pills
  let px = W - M, out = '';
  const widths = (d.metrics || []).map(m => esc(m).length * 6.4 + 22);
  [...pills].reverse().forEach((p, i) => {
    const wdt = widths[widths.length - 1 - i];
    out += `<g transform="translate(${px - wdt},30)">${p}</g>`;
    px -= wdt + 8;
  });
  return `<text x="${M}" y="44" font-size="23" font-weight="800" fill="${INK}" font-family="${FONT}" letter-spacing="-0.01em">${esc(d.title)}</text>
  <text x="${M}" y="68" font-size="12.5" fill="${MUTED}" font-family="${FONT}">${esc(d.subtitle)}</text>
  ${out}
  <line x1="${M}" y1="86" x2="${W - M}" y2="86" stroke="#263252" stroke-width="1"/>`;
}

/* layout pass: returns {lanes:[{y,nodes:[{x,w}]}], H} */
function layout(d) {
  const inner = W - M * 2;
  let y = TITLE_H;
  const lanes = d.lanes.map(lane => {
    const n = lane.nodes.length;
    const gap = 14;
    const w = Math.min(220, (inner - gap * (n - 1)) / n);
    const total = w * n + gap * (n - 1);
    let x = M + (inner - total) / 2;
    const nodes = lane.nodes.map(nd => {
      const b = { ...nd, x, w, y: y + LANE_HEAD, h: NODE_H };
      x += w + gap;
      return b;
    });
    const box = { ...lane, y, nodes, h: LANE_HEAD + NODE_H + 16 };
    y += box.h + LANE_GAP;
    return box;
  });
  return { lanes, H: y - LANE_GAP + FOOT_H };
}

function laneSvg(lane) {
  const c = LAYERS[lane.layer].c;
  const { y, h } = lane;
  return `<rect x="${M}" y="${y}" width="${W - M * 2}" height="${h}" rx="14" fill="${c}" fill-opacity="0.055" stroke="${c}" stroke-opacity="0.28"/>
  <rect x="${M + 14}" y="${y}" width="54" height="3.5" rx="1.75" fill="${c}"/>
  <g transform="translate(${M + 14},${y + 10})">
    <rect x="0" y="0" width="${lane.title.length * 6.6 + 20}" height="19" rx="9.5" fill="${c}" fill-opacity="0.16" stroke="${c}" stroke-opacity="0.5"/>
    <text x="${(lane.title.length * 6.6 + 20) / 2}" y="13.5" text-anchor="middle" font-size="9.5" font-weight="700" fill="${c}" font-family="${MONO}" letter-spacing="0.12em">${esc(lane.title)}</text>
  </g>`;
}

function nodeSvg(nd, layerKey) {
  const c = LAYERS[layerKey].c;
  const cx = nd.x + nd.w / 2;
  const icon = resolveIcon(nd.icon);
  const fs = nd.w < 150 ? 9.5 : 11;
  const label = nd.label.length > 22 && nd.w < 170
    ? nd.label.replace(' / ', '/')
    : nd.label;
  let mark;
  if (icon.kind === 'logo') {
    const sz = 21, k = sz / 24;
    mark = `<circle cx="${cx}" cy="${nd.y + 24}" r="17" fill="#ffffff" fill-opacity="0.07" stroke="${c}" stroke-opacity="0.35"/>
      <g transform="translate(${cx - sz / 2},${nd.y + 24 - sz / 2}) scale(${k})"><path d="${icon.path}" fill="#${icon.hex}"/></g>`;
  } else if (icon.kind === 'mono') {
    mark = `<rect x="${cx - 17}" y="${nd.y + 7}" width="34" height="34" rx="9" fill="${icon.c}" fill-opacity="0.16" stroke="${icon.c}" stroke-opacity="0.7"/>
      <text x="${cx}" y="${nd.y + 29}" text-anchor="middle" font-size="12" font-weight="800" fill="${icon.c}" font-family="${MONO}">${esc(icon.t)}</text>`;
  } else {
    mark = `<circle cx="${cx}" cy="${nd.y + 24}" r="15" fill="none" stroke="${c}" stroke-opacity="0.6" stroke-dasharray="4 3"/>
      <text x="${cx}" y="${nd.y + 29}" text-anchor="middle" font-size="13" font-weight="700" fill="${c}" font-family="${MONO}">?</text>`;
  }
  const sub = nd.sub
    ? `<text x="${cx}" y="${nd.y + nd.h - 10}" text-anchor="middle" font-size="9" fill="${MUTED}" font-family="${MONO}">${esc(nd.sub)}</text>` : '';
  const ly = nd.sub ? nd.y + nd.h - 25 : nd.y + nd.h - 16;
  return `<g filter="url(#nodeGlow)">
    <rect x="${nd.x}" y="${nd.y}" width="${nd.w}" height="${nd.h}" rx="12" fill="${CARD}" stroke="${c}" stroke-width="1.6"/>
    <rect x="${nd.x + 10}" y="${nd.y + 6}" width="${nd.w - 20}" height="2.5" rx="1.25" fill="${c}" fill-opacity="0.5"/>
  </g>${mark}
  <text x="${cx}" y="${ly}" text-anchor="middle" font-size="${fs}" font-weight="600" fill="${INK}" font-family="${FONT}">${esc(label)}</text>${sub}`;
}

function edgeSvg(e, byId) {
  const a = byId[e.from], b = byId[e.to];
  if (!a || !b) return '';
  const layerKey = a._layer;
  const c = LAYERS[layerKey].c;
  const x1 = a.x + a.w / 2, y1 = a.y + a.h;
  const x2 = b.x + b.w / 2, y2 = b.y;
  // elbow for far horizontal jumps, straight otherwise
  const dx = Math.abs(x2 - x1);
  let dAttr;
  if (dx > 40 && y2 - y1 > 60) {
    const my = (y1 + y2) / 2;
    dAttr = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 2}`;
  } else {
    dAttr = `M ${x1} ${y1} L ${x2} ${y2 - 2}`;
  }
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const lab = e.label
    ? `<g transform="translate(${mx},${my - 9})"><rect x="${-(esc(e.label).length * 5.4 + 16) / 2}" y="0" width="${esc(e.label).length * 5.4 + 16}" height="17" rx="8.5" fill="#0b1020" stroke="${c}" stroke-opacity="0.55"/><text x="0" y="12" text-anchor="middle" font-size="8.5" font-weight="600" fill="${c}" font-family="${MONO}">${esc(e.label)}</text></g>` : '';
  return `<path d="${dAttr}" fill="none" stroke="${c}" stroke-width="1.8" stroke-dasharray="7 5" opacity="0.85" marker-end="url(#arr-${layerKey})">
    <animate attributeName="stroke-dashoffset" from="24" to="0" dur="1.1s" repeatCount="indefinite"/></path>${lab}`;
}

function footer(H, used) {
  const chips = [...new Set(used)].map(k =>
    `<circle cx="0" cy="0" r="4" fill="${LAYERS[k].c}"/><text x="9" y="3.5" font-size="9" font-weight="600" fill="${MUTED}" font-family="${MONO}" letter-spacing="0.08em">${LAYERS[k].label}</text>`
  );
  let fx = W - M, out = '';
  const widths = [...new Set(used)].map(k => LAYERS[k].label.length * 6 + 22);
  [...chips].reverse().forEach((ch, i) => {
    const wdt = widths[widths.length - 1 - i];
    out += `<g transform="translate(${fx - wdt},${H - 30})">${ch}</g>`;
    fx -= wdt + 12;
  });
  return `<line x1="${M}" y1="${H - FOOT_H + 12}" x2="${W - M}" y2="${H - FOOT_H + 12}" stroke="#263252" stroke-width="1"/>
  <text x="${M}" y="${H - 24}" font-size="10.5" font-weight="600" fill="${MUTED}" font-family="${MONO}">◈ Mohammed Zakaria — Data Engineering Portfolio</text>${out}`;
}

function render(d) {
  const { lanes, H } = layout(d);
  const byId = {};
  lanes.forEach(l => l.nodes.forEach(n => { byId[n.id] = { ...n, _layer: l.layer }; }));
  const used = lanes.map(l => l.layer);
  let body = header(d);
  lanes.forEach(l => { body += laneSvg(l); });
  (d.edges || []).forEach(e => { body += edgeSvg(e, byId); });
  lanes.forEach(l => l.nodes.forEach(n => { body += nodeSvg(n, l.layer); }));
  body += footer(H, used);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="${FONT}">\n${defs(used)}\n<rect width="${W}" height="${H}" rx="18" fill="#0b1020"/>\n<rect width="${W}" height="${H}" rx="18" fill="url(#glowA)"/>\n<rect width="${W}" height="${H}" rx="18" fill="url(#glowB)"/>\n${body}\n</svg>\n`;
}

/* ============================================================
 * DIAGRAM DEFINITIONS — batch 1 (ported)
 * ============================================================ */
const DIAGRAMS = [
{
  file: 'waffarha-assistant---rag-chatbot.svg',
  title: 'Waffarha Assistant — Agentic RAG',
  subtitle: 'Bilingual customer-service agent over ~13.7M live rows',
  metrics: ['~13.7M live rows', '87.8% retrieval', '225-case eval'],
  lanes: [
    { title: 'LIVE DATA', layer: 'source', nodes: [
      { id: 'ch', label: 'ClickHouse', sub: '~13.7M rows · 19 tbl', icon: 'clickhouse' },
      { id: 'offers', label: 'Offers API', icon: 'express' },
      { id: 'faq', label: 'FAQ Corpus', icon: 'json' },
    ]},
    { title: 'RAG ENGINE', layer: 'processing', nodes: [
      { id: 'router', label: 'Intent Router', sub: 'gated direct', icon: 'python' },
      { id: 'embed', label: 'bge-m3', sub: '1024-dim', icon: 'hugging-face' },
      { id: 'fact', label: 'Fact Checker', sub: 'claim-level', icon: 'python' },
    ]},
    { title: 'RETRIEVAL', layer: 'storage', nodes: [
      { id: 'qdrant', label: 'Qdrant Index', sub: '9,106 docs', icon: 'qdrant' },
      { id: 'redis', label: 'Redis Sessions', icon: 'redis' },
    ]},
    { title: 'GENERATION', layer: 'ml', nodes: [
      { id: 'ollama', label: 'Ollama', icon: 'ollama' },
      { id: 'qwen', label: 'qwen2.5:3b', sub: 'local LLM', icon: 'python' },
    ]},
    { title: 'SERVING', layer: 'serving', nodes: [
      { id: 'api', label: 'FastAPI', icon: 'fastapi' },
      { id: 'voice', label: 'Voice Lab', sub: 'STT/TTS R&D', icon: 'python' },
      { id: 'ui', label: 'Streamlit UI', icon: 'streamlit' },
    ]},
    { title: 'QUALITY', layer: 'monitoring', nodes: [
      { id: 'eval', label: 'Eval Harness', sub: '225 cases', icon: 'python' },
      { id: 'ci', label: 'CI Regression Gate', sub: 'exit-code gate', icon: 'github-actions' },
    ]},
  ],
  edges: [
    { from: 'ch', to: 'router', label: 'lookup' },
    { from: 'offers', to: 'router' },
    { from: 'faq', to: 'embed', label: 'embed' },
    { from: 'embed', to: 'qdrant', label: 'index' },
    { from: 'router', to: 'qdrant', label: 'search' },
    { from: 'router', to: 'fact', label: 'verify' },
    { from: 'fact', to: 'ollama', label: 'grounded' },
    { from: 'ollama', to: 'qwen', label: 'infer' },
    { from: 'qwen', to: 'api', label: 'answer' },
    { from: 'api', to: 'redis', label: 'session' },
    { from: 'api', to: 'voice' },
    { from: 'api', to: 'ui' },
    { from: 'api', to: 'eval', label: 'log' },
    { from: 'eval', to: 'ci' },
  ],
},
{
  file: 'market-intelligence---sentiment-pipeline.svg',
  title: 'Market Intelligence — Sentiment Pipeline',
  subtitle: 'Multilingual public-mention monitoring with triage',
  metrics: ['5 sources', 'AR + EN models', 'live triage'],
  lanes: [
    { title: 'SOURCES', layer: 'source', nodes: [
      { id: 'app', label: 'App Store', icon: 'app-store' },
      { id: 'play', label: 'Play Store', icon: 'play-store' },
      { id: 'rd', label: 'Reddit', icon: 'reddit' },
      { id: 'news', label: 'Google News', icon: 'google-cloud' },
      { id: 'web', label: 'Web Search', icon: 'google-cloud' },
    ]},
    { title: 'INGESTION', layer: 'ingestion', nodes: [
      { id: 'conn', label: 'Connector Registry', sub: '1 file per source', icon: 'python' },
    ]},
    { title: 'NLP', layer: 'processing', nodes: [
      { id: 'lang', label: 'Lang Detect', sub: 'AR/EN/Arabizi', icon: 'python' },
      { id: 'arabert', label: 'AraBERT', icon: 'hugging-face' },
      { id: 'roberta', label: 'RoBERTa', icon: 'hugging-face' },
      { id: 'topics', label: 'Topic Tagger', sub: '6 categories', icon: 'python' },
    ]},
    { title: 'ANALYTICS', layer: 'ml', nodes: [
      { id: 'triage', label: 'Neg. Triage Feed', icon: 'python' },
      { id: 'trends', label: 'Trend Analysis', icon: 'plotly' },
    ]},
    { title: 'DASHBOARD', layer: 'consumer', nodes: [
      { id: 'dash', label: 'Streamlit Dashboard', icon: 'streamlit' },
    ]},
  ],
  edges: [
    { from: 'app', to: 'conn' }, { from: 'play', to: 'conn' },
    { from: 'rd', to: 'conn' }, { from: 'news', to: 'conn' }, { from: 'web', to: 'conn' },
    { from: 'conn', to: 'lang', label: 'collect' },
    { from: 'lang', to: 'arabert', label: 'Arabic' },
    { from: 'lang', to: 'roberta', label: 'English' },
    { from: 'arabert', to: 'topics' }, { from: 'roberta', to: 'topics' },
    { from: 'topics', to: 'triage' }, { from: 'topics', to: 'trends' },
    { from: 'triage', to: 'dash' }, { from: 'trends', to: 'dash' },
  ],
},
{
  file: 'partner-price-integrity---scraping-pipeline.svg',
  title: 'Partner Price Integrity — Scraping Pipeline',
  subtitle: 'Daily 6-stage violation detection · weekly reachability audit',
  metrics: ['2 Airflow DAGs', 'fuzzy matching', 'HTML/Excel/MD'],
  lanes: [
    { title: 'SCHEDULE', layer: 'orchestration', nodes: [
      { id: 'daily', label: 'Daily DAG', sub: '6 stages', icon: 'apache-airflow' },
      { id: 'weekly', label: 'Weekly Audit', sub: 'reachability', icon: 'apache-airflow' },
    ]},
    { title: 'EXTRACT', layer: 'processing', nodes: [
      { id: 'ingest', label: 'Ingest', icon: 'python' },
      { id: 'bs', label: 'BeautifulSoup', sub: 'static pages', icon: 'python' },
      { id: 'pw', label: 'Playwright', sub: 'JS-rendered', icon: 'playwright' },
    ]},
    { title: 'MATCH', layer: 'processing', nodes: [
      { id: 'match', label: 'Tiered Match', sub: 'code→fuzzy', icon: 'python' },
      { id: 'compare', label: 'Compare ±2%', icon: 'python' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'chp', label: 'ClickHouse', icon: 'clickhouse' },
      { id: 'raw', label: 'Raw Snapshots', sub: 'per-partner', icon: 'json' },
    ]},
    { title: 'REPORT', layer: 'consumer', nodes: [
      { id: 'rep', label: 'Violation Reports', sub: 'HTML/Excel/MD', icon: 'python' },
    ]},
  ],
  edges: [
    { from: 'daily', to: 'ingest', label: 'trigger' },
    { from: 'weekly', to: 'ingest', label: 'audit' },
    { from: 'ingest', to: 'bs' }, { from: 'ingest', to: 'pw' },
    { from: 'bs', to: 'match', label: 'HTML' }, { from: 'pw', to: 'match', label: 'HTML' },
    { from: 'match', to: 'compare', label: 'pairs' },
    { from: 'compare', to: 'chp', label: 'store' },
    { from: 'compare', to: 'raw', label: 'archive' },
    { from: 'chp', to: 'rep', label: 'generate' },
  ],
},
{
  file: 'blockchain-analyzer---forensics-platform.svg',
  title: 'Blockchain Analyzer — Forensics Platform',
  subtitle: 'Bronze → Silver → Gold ETL · Neo4j vs PySpark benchmark',
  metrics: ['73x traversal win', 'multi-hop', 'Kibana'],
  lanes: [
    { title: 'CHAIN SOURCES', layer: 'source', nodes: [
      { id: 'node', label: 'Ethereum Node', icon: 'web3' },
      { id: 'scan', label: 'Etherscan', icon: 'web3' },
      { id: 'gen', label: 'Tx Generator', icon: 'python' },
    ]},
    { title: 'MEDALLION ETL', layer: 'processing', nodes: [
      { id: 'spark', label: 'PySpark ETL', icon: 'apache-spark' },
      { id: 'med', label: 'Bronze→Silver→Gold', icon: 'python' },
    ]},
    { title: 'GRAPH ANALYTICS', layer: 'ml', nodes: [
      { id: 'neo', label: 'Neo4j', icon: 'neo4j' },
      { id: 'gf', label: 'GraphFrames', icon: 'apache-spark' },
      { id: 'threat', label: 'Threat Detect', icon: 'python' },
    ]},
    { title: 'SEARCH', layer: 'storage', nodes: [
      { id: 'es', label: 'Elasticsearch', icon: 'elasticsearch' },
      { id: 'kib', label: 'Kibana', icon: 'kibana' },
    ]},
    { title: 'INSIGHT', layer: 'consumer', nodes: [
      { id: 'dash', label: 'Pattern Dashboards', icon: 'kibana' },
      { id: 'bench', label: 'Benchmark Report', sub: 'Neo4j 73x', icon: 'plotly' },
    ]},
  ],
  edges: [
    { from: 'node', to: 'spark' }, { from: 'scan', to: 'spark' }, { from: 'gen', to: 'spark' },
    { from: 'spark', to: 'med', label: 'clean' },
    { from: 'med', to: 'neo', label: 'load' }, { from: 'med', to: 'es', label: 'index' },
    { from: 'neo', to: 'threat' }, { from: 'neo', to: 'gf' },
    { from: 'es', to: 'kib' },
    { from: 'threat', to: 'dash' }, { from: 'kib', to: 'dash' },
    { from: 'gf', to: 'bench', label: 'compare' },
  ],
},
{
  file: 'credit-risk-analysis---mlops-platform.svg',
  title: 'Credit Risk — MLOps Platform',
  subtitle: 'Hybrid ensemble · Airflow orchestration · FastAPI serving',
  metrics: ['0.88 AUC-ROC', '5 model families', 'drift-tracked'],
  lanes: [
    { title: 'DATA', layer: 'source', nodes: [
      { id: 'gen', label: 'Synthetic Gen', icon: 'python' },
      { id: 'feat', label: 'Feature Store', sub: 'BigQuery marts', icon: 'pandas' },
    ]},
    { title: 'MODELS', layer: 'ml', nodes: [
      { id: 'xgb', label: 'XGBoost', icon: 'xgboost' },
      { id: 'lgb', label: 'LightGBM', icon: 'lightgbm' },
      { id: 'cat', label: 'CatBoost', icon: 'catboost' },
      { id: 'tab', label: 'TabTransformer', icon: 'pytorch' },
      { id: 'ens', label: 'Hybrid Ensemble', sub: '0.88 AUC', icon: 'scikit-learn' },
    ]},
    { title: 'LIFECYCLE', layer: 'orchestration', nodes: [
      { id: 'flow', label: 'MLflow Tracking', icon: 'mlflow' },
      { id: 'air', label: 'Airflow DAGs', icon: 'apache-airflow' },
    ]},
    { title: 'SERVING', layer: 'serving', nodes: [
      { id: 'api', label: 'FastAPI Scorer', icon: 'fastapi' },
      { id: 'cache', label: 'Redis Lookups', icon: 'redis' },
    ]},
    { title: 'APP', layer: 'consumer', nodes: [
      { id: 'app', label: 'Streamlit Risk UI', icon: 'streamlit' },
    ]},
  ],
  edges: [
    { from: 'gen', to: 'feat' }, { from: 'feat', to: 'flow', label: 'features' },
    { from: 'flow', to: 'xgb', label: 'train' }, { from: 'flow', to: 'lgb' },
    { from: 'flow', to: 'cat' }, { from: 'flow', to: 'tab' },
    { from: 'xgb', to: 'ens' }, { from: 'lgb', to: 'ens' },
    { from: 'cat', to: 'ens' }, { from: 'tab', to: 'ens' },
    { from: 'air', to: 'flow', label: 'schedule' },
    { from: 'ens', to: 'api', label: 'deploy' },
    { from: 'api', to: 'cache' }, { from: 'api', to: 'app', label: 'serve' },
  ],
},
{
  file: 'fraud-detection---streaming-pipeline.svg',
  title: 'Fraud Detection — Streaming Architecture',
  subtitle: 'Sub-second Kafka scoring with multi-channel alerting',
  metrics: ['sub-second', 'Kafka', 'Slack + Email'],
  lanes: [
    { title: 'TX SOURCES', layer: 'source', nodes: [
      { id: 'feeds', label: 'Tx Feeds', icon: 'rabbitmq' },
      { id: 'bank', label: 'Bank APIs', icon: 'express' },
    ]},
    { title: 'STREAM', layer: 'processing', nodes: [
      { id: 'kafka', label: 'Kafka Topics', icon: 'apache-kafka' },
      { id: 'flink', label: 'Flink Streaming', sub: 'features', icon: 'apache-flink' },
    ]},
    { title: 'SCORING', layer: 'ml', nodes: [
      { id: 'rf', label: 'Random Forest', icon: 'scikit-learn' },
      { id: 'gbm', label: 'Grad Boost', icon: 'xgboost' },
      { id: 'api', label: 'FastAPI Scorer', icon: 'fastapi' },
    ]},
    { title: 'ALERTS', layer: 'monitoring', nodes: [
      { id: 'slack', label: 'Slack', icon: 'slack' },
      { id: 'mail', label: 'Email', icon: 'email' },
      { id: 'dash', label: 'Plotly/Dash', icon: 'plotly' },
    ]},
    { title: 'OPS', layer: 'orchestration', nodes: [
      { id: 'air', label: 'Airflow', icon: 'apache-airflow' },
      { id: 'flow', label: 'MLflow + Drift', icon: 'mlflow' },
      { id: 'dock', label: 'Docker Stack', icon: 'docker' },
    ]},
  ],
  edges: [
    { from: 'feeds', to: 'kafka' }, { from: 'bank', to: 'kafka' },
    { from: 'kafka', to: 'flink', label: 'stream' },
    { from: 'flink', to: 'rf' }, { from: 'flink', to: 'gbm' },
    { from: 'rf', to: 'api', label: 'score' }, { from: 'gbm', to: 'api' },
    { from: 'api', to: 'slack', label: 'alert' },
    { from: 'api', to: 'mail' }, { from: 'api', to: 'dash', label: 'monitor' },
    { from: 'air', to: 'flink', label: 'schedule' },
    { from: 'flow', to: 'api', label: 'promote' },
  ],
},
{
  file: 'nexlify-dw---healthcare-data-warehouse.svg',
  title: 'Healthcare Clinic Data Warehouse',
  subtitle: '10+ clinics → star schema → one Power BI model',
  metrics: ['10+ clinics', '+40% reporting', '0 timeouts'],
  lanes: [
    { title: 'CLINIC SOURCES', layer: 'source', nodes: [
      { id: 'api', label: 'Clinic APIs', icon: 'express' },
      { id: 'excel', label: 'Excel / CSV', icon: 'json' },
      { id: 'my', label: 'MySQL', icon: 'mysql' },
      { id: 'pg', label: 'PostgreSQL', icon: 'postgresql' },
      { id: 'ms', label: 'SQL Server', icon: 'mssql' },
      { id: 'lite', label: 'SQLite', icon: 'sqlite' },
    ]},
    { title: 'ETL', layer: 'processing', nodes: [
      { id: 'air', label: 'Airflow Ingest', icon: 'apache-airflow' },
      { id: 'sql', label: 'SQL Transforms', sub: 'CTEs −30%', icon: 'postgresql' },
      { id: 'clean', label: 'AR/EN Cleanse', sub: 'millions rows', icon: 'python' },
    ]},
    { title: 'WAREHOUSE', layer: 'storage', nodes: [
      { id: 'dw', label: 'PG Warehouse', icon: 'postgresql' },
      { id: 'star', label: 'Star Schema', icon: 'postgresql' },
      { id: 'facts', label: 'Facts + Dims', sub: '+ bridge', icon: 'postgresql' },
    ]},
    { title: 'BI', layer: 'consumer', nodes: [
      { id: 'bi', label: 'Power BI', sub: 'clinic switcher', icon: 'powerbi' },
    ]},
  ],
  edges: [
    { from: 'api', to: 'air' }, { from: 'excel', to: 'air' }, { from: 'my', to: 'air' },
    { from: 'pg', to: 'air' }, { from: 'ms', to: 'air' }, { from: 'lite', to: 'air' },
    { from: 'air', to: 'sql', label: 'stage' }, { from: 'sql', to: 'clean' },
    { from: 'clean', to: 'dw', label: 'load' },
    { from: 'dw', to: 'star' }, { from: 'star', to: 'facts' },
    { from: 'facts', to: 'bi', label: 'serve' },
  ],
},
{
  file: 'aircraft-tracking-pipeline.svg',
  title: 'Aircraft Tracking — Streaming Pipeline',
  subtitle: 'Live ADS-B ingestion · dual Flume agents · Spark → InfluxDB',
  metrics: ['live ADS-B', 'dual Flume', 'InfluxDB + HDFS'],
  lanes: [
    { title: 'SOURCE', layer: 'source', nodes: [
      { id: 'adsb', label: 'adsb.lol API', sub: 'live vectors', icon: 'json' },
    ]},
    { title: 'INGESTION', layer: 'ingestion', nodes: [
      { id: 'flumeA', label: 'Flume Agent A', sub: 'HTTP → Kafka', icon: 'flume' },
      { id: 'flumeB', label: 'Flume Agent B', sub: 'Kafka → HDFS', icon: 'flume' },
    ]},
    { title: 'STREAM', layer: 'processing', nodes: [
      { id: 'kafka', label: 'Kafka', icon: 'apache-kafka' },
      { id: 'spark', label: 'Spark Streaming', sub: 'structured', icon: 'apache-spark' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'influx', label: 'InfluxDB', sub: 'raw + 1-min', icon: 'influxdb' },
      { id: 'hdfs', label: 'HDFS Archive', icon: 'hdfs' },
    ]},
    { title: 'VISUALIZE', layer: 'consumer', nodes: [
      { id: 'graf', label: 'Grafana Geomap', sub: 'live flights', icon: 'grafana' },
      { id: 'agg', label: 'Per-type Stats', icon: 'plotly' },
    ]},
  ],
  edges: [
    { from: 'adsb', to: 'flumeA', label: 'HTTP poll' },
    { from: 'flumeA', to: 'kafka' },
    { from: 'kafka', to: 'flumeB' },
    { from: 'flumeB', to: 'hdfs', label: 'archive' },
    { from: 'kafka', to: 'spark', label: 'subscribe' },
    { from: 'spark', to: 'influx', label: 'write' },
    { from: 'influx', to: 'graf' },
    { from: 'spark', to: 'agg', label: 'windowed' },
  ],
},
{
  file: 'reddit-spark-pipeline.svg',
  title: 'Reddit — Spark Batch ETL',
  subtitle: '7-stage PySpark pipeline · medallion · Parquet gold',
  metrics: ['10 subreddits', '7 stages', 'Parquet gold'],
  lanes: [
    { title: 'SOURCE', layer: 'source', nodes: [
      { id: 'api', label: 'Reddit API', sub: '10 subs', icon: 'reddit' },
    ]},
    { title: 'EXTRACT', layer: 'processing', nodes: [
      { id: 'ingest', label: 'PRAW Ingest', sub: 'bronze raw', icon: 'python' },
      { id: 'quality', label: 'Quality Filter', sub: 'dedup + rules', icon: 'python' },
    ]},
    { title: 'ENRICH', layer: 'processing', nodes: [
      { id: 'udf', label: 'Engagement UDFs', sub: 'score + velocity', icon: 'python' },
      { id: 'topics', label: 'Topic Tags', icon: 'python' },
      { id: 'window', label: 'Window Ranking', icon: 'apache-spark' },
      { id: 'bjoin', label: 'Broadcast Join', sub: 'enrichment', icon: 'apache-spark' },
    ]},
    { title: 'SERVE', layer: 'storage', nodes: [
      { id: 'gold', label: 'Parquet Gold', sub: 'partitioned', icon: 'parquet' },
      { id: 'marts', label: 'Trend Marts', icon: 'parquet' },
    ]},
  ],
  edges: [
    { from: 'api', to: 'ingest', label: 'pull' },
    { from: 'ingest', to: 'quality' },
    { from: 'quality', to: 'udf' }, { from: 'quality', to: 'topics' },
    { from: 'udf', to: 'window' }, { from: 'topics', to: 'window' },
    { from: 'window', to: 'bjoin', label: 'enrich' },
    { from: 'bjoin', to: 'gold', label: 'write' },
    { from: 'gold', to: 'marts' },
  ],
},
{
  file: 'hadith-chat-app-arabic-rag.svg',
  title: 'Hadith Chat — Arabic RAG',
  subtitle: 'Django + Qdrant · retrieval-tuned · 70% accuracy',
  metrics: ['Arabic RAG', 'Qdrant', '70% accuracy'],
  lanes: [
    { title: 'CORPUS', layer: 'source', nodes: [
      { id: 'texts', label: 'Hadith Texts', sub: 'cleaned', icon: 'json' },
      { id: 'meta', label: 'Isnad Metadata', icon: 'json' },
    ]},
    { title: 'PREPARE', layer: 'processing', nodes: [
      { id: 'norm', label: 'Arab Normalizer', icon: 'python' },
      { id: 'chunk', label: 'Chunker', icon: 'python' },
      { id: 'emb', label: 'E5 Embeddings', icon: 'hugging-face' },
    ]},
    { title: 'RETRIEVE', layer: 'storage', nodes: [
      { id: 'qdrant', label: 'Qdrant Vectors', icon: 'qdrant' },
    ]},
    { title: 'APP', layer: 'serving', nodes: [
      { id: 'django', label: 'Django API', icon: 'django' },
      { id: 'ui', label: 'Chat UI', sub: 'Arabic-first', icon: 'javascript' },
    ]},
    { title: 'QUALITY', layer: 'monitoring', nodes: [
      { id: 'tune', label: 'Retrieval Tuning', sub: '70% accuracy', icon: 'python' },
      { id: 'filter', label: 'Hallucination Filter', icon: 'python' },
    ]},
  ],
  edges: [
    { from: 'texts', to: 'norm' }, { from: 'meta', to: 'norm' },
    { from: 'norm', to: 'chunk' }, { from: 'chunk', to: 'emb', label: 'embed' },
    { from: 'emb', to: 'qdrant', label: 'upsert' },
    { from: 'qdrant', to: 'django', label: 'top-k' },
    { from: 'django', to: 'ui', label: 'answer' },
    { from: 'django', to: 'tune', label: 'score' },
    { from: 'tune', to: 'filter' },
  ],
},
{
  file: 'telecom-platform---enterprise-data-platform.svg',
  title: 'Telecom — Enterprise Data Platform',
  subtitle: '8 domains · Delta medallion · Docker-to-Azure parity',
  metrics: ['8 domains', 'Delta Lake', 'drift retrain'],
  lanes: [
    { title: 'DOMAIN FEEDS', layer: 'source', nodes: [
      { id: 'crm', label: 'CRM + Billing', icon: 'python' },
      { id: 'tele', label: 'Network Telemetry', icon: 'apache-kafka' },
      { id: 'iot', label: 'IoT Sensors', icon: 'python' },
    ]},
    { title: 'DELTA LAKE', layer: 'processing', nodes: [
      { id: 'bronze', label: 'Bronze Raw', icon: 'delta' },
      { id: 'silver', label: 'Silver Clean', icon: 'delta' },
      { id: 'gold', label: 'Gold Marts', icon: 'delta' },
    ]},
    { title: 'TRANSFORM', layer: 'processing', nodes: [
      { id: 'spark', label: 'Spark Batch', icon: 'apache-spark' },
      { id: 'dbt', label: 'dbt Models', icon: 'dbt' },
      { id: 'dq', label: 'DQ Checks', icon: 'python' },
    ]},
    { title: 'PLATFORM', layer: 'orchestration', nodes: [
      { id: 'air', label: 'Airflow', icon: 'apache-airflow' },
      { id: 'az', label: 'Azure', sub: 'Blob + Fabric', icon: 'azure' },
      { id: 'tf', label: 'Terraform', sub: 'local parity', icon: 'terraform' },
    ]},
    { title: 'MLOPS', layer: 'ml', nodes: [
      { id: 'flow', label: 'MLflow Tracking', icon: 'mlflow' },
      { id: 'drift', label: 'Drift Retrain', icon: 'python' },
    ]},
    { title: 'CONSUME', layer: 'consumer', nodes: [
      { id: 'bi', label: 'BI Dashboards', icon: 'microsoft' },
      { id: 'api', label: 'DQ + Lineage API', icon: 'fastapi' },
    ]},
  ],
  edges: [
    { from: 'crm', to: 'bronze' }, { from: 'tele', to: 'bronze' }, { from: 'iot', to: 'bronze' },
    { from: 'bronze', to: 'silver' }, { from: 'silver', to: 'gold' },
    { from: 'spark', to: 'silver', label: 'build' },
    { from: 'dbt', to: 'gold', label: 'model' },
    { from: 'dq', to: 'gold', label: 'gate' },
    { from: 'air', to: 'spark', label: 'schedule' },
    { from: 'gold', to: 'az', label: 'sync' },
    { from: 'gold', to: 'flow', label: 'features' },
    { from: 'flow', to: 'drift', label: 'trigger' },
    { from: 'gold', to: 'bi', label: 'serve' },
  ],
},
{
  file: 'petroleum-platform.svg',
  title: 'Petroleum — Well Monitoring + Market Intel',
  subtitle: 'Volve history + live markets · 3-node NiFi · Flink anomalies',
  metrics: ['3-node NiFi', '13 services', 'Volve + EIA'],
  lanes: [
    { title: 'SOURCES', layer: 'source', nodes: [
      { id: 'volve', label: 'Volve Field', sub: 'history', icon: 'json' },
      { id: 'eia', label: 'EIA API', sub: 'WTI/Brent', icon: 'json' },
      { id: 'baker', label: 'Baker Hughes', sub: 'rig counts', icon: 'python' },
      { id: 'scada', label: 'SCADA Replay', sub: 'simulator', icon: 'python' },
    ]},
    { title: 'BUS', layer: 'ingestion', nodes: [
      { id: 'mq', label: 'RabbitMQ', sub: 'broker', icon: 'rabbitmq' },
    ]},
    { title: 'INGEST', layer: 'processing', nodes: [
      { id: 'nifi', label: 'NiFi Cluster ×3', sub: 'route + enrich', icon: 'apache-nifi' },
    ]},
    { title: 'STREAM', layer: 'processing', nodes: [
      { id: 'beam', label: 'Beam on Flink', icon: 'apache-flink' },
      { id: 'anom', label: 'Anomaly Detect', icon: 'python' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'es', label: 'Elasticsearch', sub: 'logs', icon: 'elasticsearch' },
      { id: 'bq', label: 'BigQuery', sub: 'warehouse', icon: 'bigquery' },
      { id: 'minio', label: 'MinIO Lake', sub: 'parquet', icon: 'minio' },
    ]},
    { title: 'BATCH', layer: 'processing', nodes: [
      { id: 'spark', label: 'PySpark Features', icon: 'apache-spark' },
    ]},
    { title: 'OBSERVE', layer: 'monitoring', nodes: [
      { id: 'graf', label: 'Grafana', icon: 'grafana' },
      { id: 'prom', label: 'Prometheus', icon: 'prometheus' },
    ]},
  ],
  edges: [
    { from: 'volve', to: 'mq' }, { from: 'eia', to: 'mq' },
    { from: 'baker', to: 'mq' }, { from: 'scada', to: 'mq' },
    { from: 'mq', to: 'nifi', label: 'route' },
    { from: 'nifi', to: 'beam' }, { from: 'nifi', to: 'es', label: 'index' },
    { from: 'beam', to: 'anom', label: 'score' },
    { from: 'anom', to: 'bq', label: 'load' },
    { from: 'nifi', to: 'minio', label: 'land' },
    { from: 'minio', to: 'spark' }, { from: 'bq', to: 'spark', label: 'train' },
    { from: 'anom', to: 'graf', label: 'alert' },
    { from: 'prom', to: 'graf', label: 'metrics' },
  ],
},
{
  file: 'watchdog-prices.svg',
  title: 'Watchdog — Price Intelligence',
  subtitle: 'Airflow 6-stage ETL · Celery Playwright fleet · lossless re-parse',
  metrics: ['6 stages', 'raw snapshots', 'TG + Email'],
  lanes: [
    { title: 'TARGETS', layer: 'source', nodes: [
      { id: 'targets', label: 'Targets Table', sub: 'domain×region', icon: 'postgresql' },
    ]},
    { title: 'SCHEDULE', layer: 'orchestration', nodes: [
      { id: 'air', label: 'Airflow DAG', sub: '6 stages', icon: 'apache-airflow' },
    ]},
    { title: 'FLEET', layer: 'processing', nodes: [
      { id: 'celery', label: 'Celery Workers', sub: '+ Redis', icon: 'celery' },
      { id: 'pw', label: 'Playwright Scrape', sub: 'anti-bot', icon: 'playwright' },
      { id: 'parse', label: 'Parse/Normalize', sub: 'USD base', icon: 'python' },
    ]},
    { title: 'RAW', layer: 'storage', nodes: [
      { id: 'raw', label: 'HTML Snapshots', sub: 'lossless', icon: 'json' },
    ]},
    { title: 'WAREHOUSE', layer: 'storage', nodes: [
      { id: 'pg', label: 'Postgres Star', icon: 'postgresql' },
      { id: 'fact', label: 'Fact Snapshots', icon: 'postgresql' },
    ]},
    { title: 'ALERTS', layer: 'monitoring', nodes: [
      { id: 'tg', label: 'Telegram', icon: 'telegram' },
      { id: 'mail', label: 'Email SMTP', icon: 'email' },
      { id: 'health', label: 'Scraper Health', icon: 'prometheus' },
    ]},
    { title: 'ANALYTICS', layer: 'consumer', nodes: [
      { id: 'dash', label: 'Streamlit Analytics', sub: 'trends + hi/lo', icon: 'streamlit' },
    ]},
  ],
  edges: [
    { from: 'targets', to: 'air', label: 'due' },
    { from: 'air', to: 'celery', label: 'dispatch' },
    { from: 'celery', to: 'pw', label: 'render' },
    { from: 'pw', to: 'raw', label: 'persist' },
    { from: 'raw', to: 'parse', label: 're-parse' },
    { from: 'parse', to: 'pg', label: 'load' },
    { from: 'pg', to: 'fact' },
    { from: 'fact', to: 'tg', label: 'drop' },
    { from: 'fact', to: 'mail' },
    { from: 'celery', to: 'health', label: 'heartbeat' },
    { from: 'fact', to: 'dash', label: 'serve' },
  ],
},
{
  file: 'airsense-platform.svg',
  title: 'AirSense — Air Quality Intelligence',
  subtitle: '15k+ sensors · 2.8M readings/day · 92% 6-hr AQI forecast',
  metrics: ['15k+ sensors', '2.8M/day', '92% forecast'],
  lanes: [
    { title: 'SOURCES', layer: 'source', nodes: [
      { id: 'owm', label: 'OpenWeatherMap', icon: 'json' },
      { id: 'epa', label: 'EPA AirNow', icon: 'python' },
      { id: 'nasa', label: 'NASA GEOS-5', icon: 'python' },
      { id: 'openaq', label: 'OpenAQ', icon: 'json' },
    ]},
    { title: 'INGEST', layer: 'ingestion', nodes: [
      { id: 'kafka', label: 'Kafka', icon: 'apache-kafka' },
      { id: 'nifi', label: 'NiFi', icon: 'apache-nifi' },
    ]},
    { title: 'PROCESS', layer: 'processing', nodes: [
      { id: 'spark', label: 'Spark Jobs', icon: 'apache-spark' },
      { id: 'air', label: 'Airflow DAGs', icon: 'apache-airflow' },
      { id: 'dbt', label: 'dbt Models', icon: 'dbt' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'ts', label: 'TimescaleDB', icon: 'postgresql' },
      { id: 's3', label: 'S3 Data Lake', icon: 's3' },
    ]},
    { title: 'FORECAST', layer: 'ml', nodes: [
      { id: 'lstm', label: 'LSTM', sub: 'sequence', icon: 'pytorch' },
      { id: 'xgb', label: 'XGBoost', icon: 'xgboost' },
      { id: 'flow', label: 'MLflow', sub: 'retrain', icon: 'mlflow' },
    ]},
    { title: 'SERVE', layer: 'serving', nodes: [
      { id: 'api', label: 'FastAPI', icon: 'fastapi' },
      { id: 'cache', label: 'Redis <200ms', icon: 'redis' },
    ]},
    { title: 'APP', layer: 'consumer', nodes: [
      { id: 'app', label: 'React + Mapbox', sub: 'health tips', icon: 'react' },
    ]},
    { title: 'OPS', layer: 'monitoring', nodes: [
      { id: 'prom', label: 'Prometheus', icon: 'prometheus' },
      { id: 'graf', label: 'Grafana', sub: '99.95% SLA', icon: 'grafana' },
    ]},
  ],
  edges: [
    { from: 'owm', to: 'kafka' }, { from: 'epa', to: 'kafka' },
    { from: 'nasa', to: 'nifi' }, { from: 'openaq', to: 'nifi' },
    { from: 'kafka', to: 'spark' }, { from: 'nifi', to: 'spark' },
    { from: 'spark', to: 'air', label: 'stage' },
    { from: 'air', to: 'dbt', label: 'model' },
    { from: 'dbt', to: 'ts', label: 'load' },
    { from: 'dbt', to: 's3', label: 'archive' },
    { from: 'ts', to: 'lstm', label: 'train' },
    { from: 'ts', to: 'xgb' },
    { from: 'lstm', to: 'flow' }, { from: 'xgb', to: 'flow' },
    { from: 'flow', to: 'api', label: 'promote' },
    { from: 'api', to: 'cache' }, { from: 'api', to: 'app', label: 'serve' },
    { from: 'api', to: 'prom', label: 'metrics' },
    { from: 'prom', to: 'graf' },
  ],
},
{
  file: 'retail-analytics-pipeline.svg',
  title: 'Retail Analytics — Streaming Pipeline',
  subtitle: 'CDC + dual stream engines → Delta Lake → API',
  metrics: ['15 Docker services', 'CDC via Debezium', 'Spark + Flink'],
  lanes: [
    { title: 'SOURCES', layer: 'source', nodes: [
      { id: 'pos', label: 'POS Systems', icon: 'json' },
      { id: 'ecom', label: 'E-commerce Events', icon: 'express' },
      { id: 'inv', label: 'Inventory DB', icon: 'postgresql' },
    ]},
    { title: 'INGEST', layer: 'ingestion', nodes: [
      { id: 'kafka', label: 'Kafka', sub: '7.4.0', icon: 'apache-kafka' },
      { id: 'debez', label: 'Debezium CDC', sub: 'v2.3', icon: 'debezium' },
      { id: 'rest', label: 'REST Ingest', icon: 'python' },
    ]},
    { title: 'STREAM', layer: 'processing', nodes: [
      { id: 'spark', label: 'Spark Streaming', sub: 'v3.4', icon: 'apache-spark' },
      { id: 'flink', label: 'Flink Jobs', sub: 'v1.17', icon: 'apache-flink' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'delta', label: 'Delta on MinIO', icon: 'minio' },
      { id: 'pg', label: 'PostgreSQL 15', icon: 'postgresql' },
      { id: 'redis', label: 'Redis Cache', sub: 'v7', icon: 'redis' },
    ]},
    { title: 'ML', layer: 'ml', nodes: [
      { id: 'forecast', label: 'Demand Forecast', icon: 'scikit-learn' },
      { id: 'reco', label: 'Recommendations', icon: 'python' },
    ]},
    { title: 'SERVE', layer: 'serving', nodes: [
      { id: 'api', label: 'FastAPI :8000', icon: 'fastapi' },
      { id: 'nginx', label: 'Nginx LB', icon: 'python' },
    ]},
    { title: 'OBSERVE', layer: 'monitoring', nodes: [
      { id: 'prom', label: 'Prometheus', icon: 'prometheus' },
      { id: 'graf', label: 'Grafana', icon: 'grafana' },
    ]},
  ],
  edges: [
    { from: 'pos', to: 'kafka' }, { from: 'ecom', to: 'kafka' },
    { from: 'inv', to: 'debez', label: 'CDC' }, { from: 'ecom', to: 'rest' },
    { from: 'kafka', to: 'spark', label: 'stream' },
    { from: 'kafka', to: 'flink', label: 'stream' },
    { from: 'debez', to: 'spark' },
    { from: 'spark', to: 'delta', label: 'write' },
    { from: 'flink', to: 'pg', label: 'upsert' },
    { from: 'delta', to: 'forecast', label: 'train' },
    { from: 'pg', to: 'api', label: 'serve' },
    { from: 'api', to: 'redis', label: 'cache' },
    { from: 'api', to: 'nginx' },
    { from: 'api', to: 'prom', label: 'metrics' },
    { from: 'prom', to: 'graf' },
  ],
},
{
  file: 'aquawatch.svg',
  title: 'AquaWatch — Fish-Farm Monitoring',
  subtitle: 'Simulated sensors → Airflow → TimescaleDB → Grafana alerts',
  metrics: ['3 ponds × 4 params', '5-min sampling', 'email + SMS'],
  lanes: [
    { title: 'SIMULATE', layer: 'source', nodes: [
      { id: 'sim', label: 'Sensor Simulator', sub: '3 ponds · 10% anomaly', icon: 'python' },
    ]},
    { title: 'INGEST', layer: 'ingestion', nodes: [
      { id: 'air', label: 'Airflow DAG', sub: '@every_5_minutes', icon: 'apache-airflow' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'ts', label: 'TimescaleDB', sub: 'hypertable', icon: 'postgresql' },
      { id: 'alerts', label: 'Alerts Table', icon: 'postgresql' },
    ]},
    { title: 'ALERT', layer: 'monitoring', nodes: [
      { id: 'mgr', label: 'Alert Manager', sub: '15-min cooldown', icon: 'python' },
      { id: 'mail', label: 'Email SMTP', icon: 'email' },
      { id: 'sms', label: 'Mock SMS Log', icon: 'python' },
    ]},
    { title: 'SERVE', layer: 'serving', nodes: [
      { id: 'api', label: 'FastAPI', sub: '/readings /alerts', icon: 'fastapi' },
    ]},
    { title: 'DASHBOARD', layer: 'consumer', nodes: [
      { id: 'graf', label: 'Grafana', sub: 'pond dashboards', icon: 'grafana' },
    ]},
  ],
  edges: [
    { from: 'sim', to: 'air', label: 'JSONL' },
    { from: 'air', to: 'ts', label: 'batch×100' },
    { from: 'ts', to: 'mgr', label: 'evaluate' },
    { from: 'mgr', to: 'alerts', label: 'record' },
    { from: 'mgr', to: 'mail', label: 'breach' },
    { from: 'mgr', to: 'sms', label: 'breach' },
    { from: 'ts', to: 'api' },
    { from: 'api', to: 'graf', label: 'serve' },
  ],
},
{
  file: 'blockchain-gdpr-aggregator.svg',
  title: 'Blockchain GDPR Aggregator',
  subtitle: 'Chain + market ingest · masking · audit · retention',
  metrics: ['100 req/min limit', '365-day retention', '2555-day audit'],
  lanes: [
    { title: 'CHAINS', layer: 'source', nodes: [
      { id: 'eth', label: 'Ethereum RPC', icon: 'web3' },
      { id: 'btc', label: 'Bitcoin RPC', icon: 'bitcoin' },
    ]},
    { title: 'MARKETS', layer: 'source', nodes: [
      { id: 'bin', label: 'Binance API', icon: 'python' },
      { id: 'cg', label: 'CoinGecko + AV', icon: 'json' },
    ]},
    { title: 'COMPLY', layer: 'processing', nodes: [
      { id: 'mask', label: 'PII Masker', sub: 'regex + Fernet', icon: 'python' },
      { id: 'audit', label: 'Audit Logger', sub: 'Art. 20 trail', icon: 'python' },
    ]},
    { title: 'ANALYZE', layer: 'ml', nodes: [
      { id: 'flow', label: 'Flow Analysis', icon: 'pandas' },
      { id: 'feat', label: 'ML Features', icon: 'scikit-learn' },
    ]},
    { title: 'STORE', layer: 'storage', nodes: [
      { id: 'pg', label: 'PostgreSQL 15', icon: 'postgresql' },
      { id: 'es', label: 'Elasticsearch 8', icon: 'elasticsearch' },
      { id: 'mongo', label: 'MongoDB 7', icon: 'mongodb' },
      { id: 'redis', label: 'Redis 7', icon: 'redis' },
    ]},
    { title: 'WORKERS', layer: 'orchestration', nodes: [
      { id: 'celery', label: 'Celery ×4', icon: 'celery' },
      { id: 'beat', label: 'Celery Beat', sub: 'retention sweep', icon: 'celery' },
    ]},
    { title: 'SERVE', layer: 'serving', nodes: [
      { id: 'api', label: 'FastAPI :8000', icon: 'fastapi' },
      { id: 'nginx', label: 'Nginx Proxy', icon: 'python' },
    ]},
    { title: 'OBSERVE', layer: 'monitoring', nodes: [
      { id: 'prom', label: 'Prometheus', sub: '200h retention', icon: 'prometheus' },
      { id: 'graf', label: 'Grafana + Sentry', icon: 'grafana' },
    ]},
  ],
  edges: [
    { from: 'eth', to: 'mask' }, { from: 'btc', to: 'mask' },
    { from: 'bin', to: 'mask' }, { from: 'cg', to: 'mask' },
    { from: 'mask', to: 'audit', label: 'trail' },
    { from: 'mask', to: 'flow' },
    { from: 'flow', to: 'feat' },
    { from: 'feat', to: 'pg', label: 'store' },
    { from: 'flow', to: 'es', label: 'index' },
    { from: 'pg', to: 'mongo', label: 'docs' },
    { from: 'celery', to: 'flow', label: 'run' },
    { from: 'beat', to: 'celery', label: 'tick' },
    { from: 'pg', to: 'api', label: 'serve' },
    { from: 'api', to: 'redis', label: 'cache' },
    { from: 'api', to: 'nginx' },
    { from: 'api', to: 'prom', label: 'metrics' },
    { from: 'prom', to: 'graf' },
  ],
},
//__MORE__
];

/* ---------- runner ---------- */
const outDir = path.join(__dirname, '..', 'docs', 'diagrams');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
DIAGRAMS.forEach(d => {
  fs.writeFileSync(path.join(outDir, d.file), render(d), 'utf8');
  console.log('✓ ' + d.file);
});
console.log('\n' + DIAGRAMS.length + ' diagrams → ' + outDir);
const seen = new Set();
DIAGRAMS.forEach(d => d.lanes.forEach(l => l.nodes.forEach(n => seen.add(n.icon))));
console.log('=== ICON CHECK ===');
[...seen].sort().forEach(k => {
  const r = resolveIcon(k);
  const st = r.kind === 'logo' ? '✓ logo' : r.kind === 'mono' ? '◆ monogram' : '⚠ MISSING';
  console.log('  ' + st + ' ' + k);
});
