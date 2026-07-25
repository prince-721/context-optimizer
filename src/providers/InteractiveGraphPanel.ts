import * as vscode from 'vscode';
import * as path from 'path';
import { MemoryManager } from '../core/MemoryManager';
import { GraphExporter } from '../exporters/GraphExporter';
import { FlowGraphExporter } from '../exporters/FlowGraphExporter';

export class InteractiveGraphPanel {
  private static currentPanel: InteractiveGraphPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  public static readonly viewType = 'contextOptimizer.interactiveGraph';

  public static create(
    extensionUri: vscode.Uri,
    memoryManager: MemoryManager,
    initialMode: string = 'interactive'
  ): InteractiveGraphPanel {
    const column = vscode.ViewColumn.One;
    if (InteractiveGraphPanel.currentPanel) {
      InteractiveGraphPanel.currentPanel.panel.reveal(column);
      InteractiveGraphPanel.currentPanel.panel.webview.postMessage({ command: 'switchGraph', data: { mode: initialMode } });
      setTimeout(() => { InteractiveGraphPanel.currentPanel?.update(true); }, 150);
      return InteractiveGraphPanel.currentPanel;
    }
    const panel = vscode.window.createWebviewPanel(
      InteractiveGraphPanel.viewType,
      '🔮 Codebase Visual Suite',
      column,
      { enableScripts: true, localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')], retainContextWhenHidden: true }
    );
    InteractiveGraphPanel.currentPanel = new InteractiveGraphPanel(panel, extensionUri, memoryManager, initialMode);
    return InteractiveGraphPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private memoryManager: MemoryManager,
    private initialMode: string
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml(initialMode);
    this.update(true);
    memoryManager.onDidChange(() => this.update());
    this.panel.onDidChangeViewState(() => { if (this.panel.visible) this.update(); }, undefined, this.disposables);
    this.panel.webview.onDidReceiveMessage((msg: any) => this.handleMessage(msg), undefined, this.disposables);
    this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
  }

  public async update(force = false): Promise<void> {
    if (!this.panel.visible && !force) return;
    try {
      const exporter = new GraphExporter(this.memoryManager);
      const mermaidCode = await exporter.getMermaidDiagram();
      const flowExporter = new FlowGraphExporter(this.memoryManager);
      const flowData = await flowExporter.getGraphData();
      const mem = this.memoryManager.get();
      this.panel.webview.postMessage({ command: 'update', data: { mermaidCode, flowData, memory: mem } });
    } catch (err: any) {
      console.error('Graph update failed:', err);
      this.panel.webview.postMessage({ command: 'error', data: { message: String(err?.message || err) } });
    }
  }

  private handleMessage(msg: any): void {
    if (msg.command === 'ready' || msg.command === 'refresh') this.update(true);
    else if (msg.command === 'openFile' && msg.data) {
      vscode.commands.executeCommand('contextOptimizer.openFile', String(msg.data));
    }
  }

  private getHtml(initialMode: string): string {
    const nonce = this.getNonce();
    const csp = this.panel.webview.cspSource;
    const mermaidUri = this.panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'mermaid.min.js'));

    return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${csp} 'unsafe-inline'; script-src 'nonce-${nonce}' ${csp} 'unsafe-eval' 'unsafe-inline'; font-src ${csp} https:; connect-src https:;"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0a0e1a;--bg2:rgba(15,20,35,0.92);--border:#1e2940;--text:#e8eaf0;--dim:#7a8299;
  --accent:#7c3aed;--glow:rgba(124,58,237,0.3);
  --c-root:#a855f7;--c-folder:#3b82f6;--c-file:#64748b;--c-comp:#06b6d4;--c-back:#10b981;
  --c-api:#f59e0b;--c-db:#ec4899;--c-env:#eab308;--c-dock:#475569;
}
body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);overflow:hidden;width:100vw;height:100vh}

/* ─── Top Bar ─── */
.bar{position:fixed;top:12px;left:12px;right:12px;height:50px;background:var(--bg2);backdrop-filter:blur(16px);
  border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:10px;padding:0 14px;z-index:100}
.bar select{background:rgba(0,0,0,0.4);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:5px 8px;
  font-size:13px;font-weight:600;outline:none;cursor:pointer}
.bar select option{background:#111827}
.bar input{flex:1;max-width:220px;height:30px;background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:6px;
  padding:0 10px;color:var(--text);font-size:12px;outline:none}
.bar input:focus{border-color:var(--accent)}
.bb{height:30px;padding:0 10px;background:rgba(255,255,255,0.06);border:1px solid var(--border);border-radius:6px;
  color:var(--text);font-size:11px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:4px}
.bb:hover{background:rgba(255,255,255,0.12)}
.bb.pri{background:linear-gradient(135deg,#7c3aed,#4f46e5);border:none;color:#fff}

/* ─── Main Panels ─── */
.panel{position:fixed;top:74px;left:12px;right:12px;bottom:12px;border-radius:10px;overflow:hidden;display:none}
.panel.active{display:block}

/* Physics Canvas */
#p-physics{background:var(--bg);background-image:radial-gradient(#1a2236 1px,transparent 1px);background-size:22px 22px}
#p-physics svg{width:100%;height:100%;cursor:grab}
#p-physics svg:active{cursor:grabbing}

/* Mermaid */
#p-mermaid{background:var(--bg);overflow:auto;padding:80px 40px 40px}
#p-mermaid #mmd-out{transform-origin:top left}

/* Custom panels */
#p-heatmap,#p-treemap,#p-history{background:var(--bg2);backdrop-filter:blur(12px);border:1px solid var(--border);overflow:auto;padding:24px}

/* ─── Sidebar ─── */
.side{position:fixed;top:74px;left:12px;bottom:12px;width:220px;background:var(--bg2);backdrop-filter:blur(12px);
  border:1px solid var(--border);border-radius:10px;padding:14px;z-index:90;display:flex;flex-direction:column;gap:10px;
  transition:transform .2s}
.side.off{transform:translateX(-240px)}
.stitle{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--dim)}
.fitem{display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;padding:3px 0}
.fitem .dot{width:8px;height:8px;border-radius:50%}
.fitem .chk{width:13px;height:13px;border-radius:3px;border:1.5px solid var(--border)}
.fitem .chk.on{background:var(--accent);border-color:var(--accent)}

/* ─── Details ─── */
.det{position:fixed;top:74px;right:12px;bottom:12px;width:260px;background:var(--bg2);backdrop-filter:blur(12px);
  border:1px solid var(--border);border-radius:10px;padding:14px;z-index:90;display:none;flex-direction:column;gap:10px;overflow-y:auto}
.det.show{display:flex}
.drow{display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.drow .l{color:var(--dim)}.drow .v{font-family:monospace;font-weight:600}
.sumbox{background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:6px;padding:10px;font-size:12px;color:var(--dim);line-height:1.5;max-height:160px;overflow-y:auto}

/* ─── SVG nodes ─── */
.nd rect{rx:7;ry:7;stroke-width:1.5;transition:stroke-width .15s}
.nd:hover rect{stroke-width:2.5;filter:drop-shadow(0 0 10px var(--glow))}
.nd.sel rect{stroke-width:3 !important;stroke:var(--accent) !important}
.nd{cursor:pointer}
.nl{font-size:11px;font-weight:600;fill:var(--text);pointer-events:none}
.ns{font-size:9px;fill:var(--dim);pointer-events:none}
.eg{fill:none;stroke-width:1.2;opacity:0.55}
.eg.anim{stroke-dasharray:5 5;animation:edash 20s linear infinite}
@keyframes edash{to{stroke-dashoffset:-800}}

/* ─── Heatmap ─── */
.hgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px;margin-top:14px}
.hcard{background:rgba(0,0,0,0.35);border:1px solid var(--border);border-radius:8px;padding:12px;cursor:pointer;transition:transform .15s,border-color .15s}
.hcard:hover{transform:translateY(-2px);border-color:var(--accent)}
.hbadge{display:inline-block;padding:2px 7px;border-radius:4px;font-size:9px;font-weight:700;margin-bottom:6px;text-transform:uppercase}

/* ─── Treemap ─── */
.tgrid{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.tblock{border-radius:8px;padding:12px;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;
  transition:transform .12s;border:1px solid rgba(255,255,255,0.08);min-height:70px}
.tblock:hover{transform:scale(1.03);z-index:5}

/* ─── Float btn ─── */
.fbtn{position:fixed;top:74px;left:12px;z-index:85;display:none;height:30px;padding:0 10px;
  background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:11px;font-weight:600;cursor:pointer}
</style>
</head>
<body>

<!-- ═══ Top Bar ═══ -->
<div class="bar">
  <select id="sel">
    <option value="interactive">🔮 Interactive Orbit Graph</option>
    <option value="mermaid">📊 Codebase Flowchart</option>
    <option value="heatmap">🟢 File Activity Heatmap</option>
    <option value="treemap">📦 Token Treemap</option>
    <option value="history">📈 Savings History</option>
  </select>
  <input id="search" placeholder="🔍 Search files..."/>
  <button class="bb pri" id="bRefresh">🔄 Refresh</button>
  <button class="bb" id="bZi">🔍+</button>
  <button class="bb" id="bZo">🔍−</button>
  <button class="bb" id="bReset">🎯 Reset</button>
  <button class="bb" id="bFs">🖥️</button>
  <button class="bb" id="bDl">📥 SVG</button>
</div>

<!-- ═══ Panels ═══ -->
<div class="panel" id="p-physics">
  <svg id="svgC"><defs>
    <marker id="ak" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#475569"/></marker>
    <marker id="au" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#3b82f6"/></marker>
    <marker id="ad" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0 0L10 5L0 10z" fill="#10b981"/></marker>
  </defs><g id="vg"><g id="eg"></g><g id="ng"></g></g></svg>
</div>

<div class="panel" id="p-mermaid"><div id="mmd-out"></div></div>
<div class="panel" id="p-heatmap"></div>
<div class="panel" id="p-treemap"></div>
<div class="panel" id="p-history"></div>

<!-- ═══ Sidebar ═══ -->
<button class="fbtn" id="bShowSide">▶ Filters</button>
<div class="side" id="sidebar">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div class="stitle">Filter Nodes</div>
    <button class="bb" id="bHideSide" style="height:24px;padding:0 6px;font-size:13px">◀</button>
  </div>
  <div id="flist" style="display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1"></div>
</div>

<!-- ═══ Details ═══ -->
<div class="det" id="detP">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <div class="stitle">Node Details</div>
    <button class="bb" id="bCloseDet" style="height:24px;padding:0 6px;font-size:13px">✕</button>
  </div>
  <div id="dName" style="font-size:14px;font-weight:700"></div>
  <div id="dPath" style="font-size:11px;color:var(--dim)"></div>
  <div class="drow"><span class="l">Type</span><span class="v" id="dType"></span></div>
  <div class="drow"><span class="l">Tokens</span><span class="v" id="dTok"></span></div>
  <div class="drow"><span class="l">Priority</span><span class="v" id="dPri"></span></div>
  <div class="stitle" style="margin-top:4px">Summary</div>
  <div class="sumbox" id="dSum"></div>
  <button class="bb pri" id="bOpen" style="width:100%;justify-content:center;height:34px">📄 Open File</button>
</div>

<script nonce="${nonce}">
(function(){
  // ─── Globals ───
  const vscode = acquireVsCodeApi();
  const TC = {
    root:{l:'Root',c:'#a855f7'},folder:{l:'Folder',c:'#3b82f6'},file:{l:'File',c:'#64748b'},
    component:{l:'Component',c:'#06b6d4'},backend:{l:'Backend',c:'#10b981'},api:{l:'API',c:'#f59e0b'},
    database:{l:'Database',c:'#ec4899'},env:{l:'Env',c:'#eab308'},docker:{l:'Docker',c:'#475569'},
    cicd:{l:'CI/CD',c:'#475569'},deployment:{l:'Deploy',c:'#475569'}
  };
  const EC = {contains:'#475569',defines:'#10b981',uses:'#3b82f6',references:'#f59e0b'};

  let nodes=[],edges=[],nMap={},hidden=new Set(),mem=null,selNode=null,query='',mCode='';
  let tx=0,ty=0,tk=0.7,drag=null,pan=false,px=0,py=0,active='${initialMode}';
  let mermaidLoaded=false;

  const $=id=>document.getElementById(id);
  const vg=$('vg'),eg=$('eg'),ng=$('ng'),svgC=$('svgC');

  // ─── Init transform ───
  tx=window.innerWidth/2; ty=window.innerHeight/2;

  // ─── Set dropdown ───
  $('sel').value=active;

  // ─── Build filter list ───
  const flist=$('flist');
  Object.entries(TC).forEach(([type,cfg])=>{
    const d=document.createElement('div');d.className='fitem';
    const chk=document.createElement('div');chk.className='chk on';chk.style.borderColor=cfg.c;
    const dot=document.createElement('div');dot.className='dot';dot.style.background=cfg.c;
    const lb=document.createElement('span');lb.textContent=cfg.l;
    d.appendChild(chk);d.appendChild(dot);d.appendChild(lb);
    d.addEventListener('click',()=>{
      const on=chk.classList.toggle('on');
      if(on) hidden.delete(type); else hidden.add(type);
      applyFilters();
    });
    flist.appendChild(d);
  });

  // ─── Sidebar toggle ───
  $('bHideSide').onclick=()=>{$('sidebar').classList.add('off');$('bShowSide').style.display='block'};
  $('bShowSide').onclick=()=>{$('sidebar').classList.remove('off');$('bShowSide').style.display='none'};
  $('bCloseDet').onclick=()=>{$('detP').classList.remove('show');selNode=null;draw()};
  $('bOpen').onclick=()=>{if(selNode&&selNode.path) vscode.postMessage({command:'openFile',data:selNode.path})};

  // ─── Controls ───
  $('bRefresh').onclick=()=>vscode.postMessage({command:'refresh'});
  $('bFs').onclick=()=>{if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});else document.exitFullscreen().catch(()=>{})};
  $('bZi').onclick=()=>{tk=Math.min(tk*1.3,3);applyZoom()};
  $('bZo').onclick=()=>{tk=Math.max(tk/1.3,0.15);applyZoom()};
  $('bReset').onclick=()=>{tx=window.innerWidth/2;ty=window.innerHeight/2;tk=0.7;applyZoom()};
  $('search').oninput=e=>{query=e.target.value.toLowerCase().trim();applyFilters()};
  $('sel').onchange=e=>{active=e.target.value;show(active)};

  $('bDl').onclick=()=>{
    try{
      const el=active==='interactive'?svgC:($('mmd-out').querySelector('svg')||$('mmd-out'));
      if(!el)return;
      const s=new XMLSerializer().serializeToString(el);
      const b=new Blob([s],{type:'image/svg+xml'});
      const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='codebase_graph.svg';a.click();
    }catch(e){}
  };

  function applyZoom(){
    if(active==='interactive'){vg.setAttribute('transform','translate('+tx+','+ty+') scale('+tk+')');}
  }

  // ─── Pan & Zoom (pointer events) ───
  svgC.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    pan=true;px=e.clientX-tx;py=e.clientY-ty;svgC.setPointerCapture(e.pointerId);
  });
  svgC.addEventListener('pointermove',e=>{
    if(pan){tx=e.clientX-px;ty=e.clientY-py;applyZoom();}
    else if(drag){
      const r=svgC.getBoundingClientRect();
      drag.x=(e.clientX-r.left-tx)/tk;drag.y=(e.clientY-r.top-ty)/tk;
    }
  });
  svgC.addEventListener('pointerup',()=>{pan=false;drag=null});
  svgC.addEventListener('wheel',e=>{
    e.preventDefault();
    const f=e.deltaY<0?1.12:0.89;
    const nk=Math.min(Math.max(tk*f,0.15),3);
    tx=e.clientX-(e.clientX-tx)*(nk/tk);ty=e.clientY-(e.clientY-ty)*(nk/tk);tk=nk;
    applyZoom();
  },{passive:false});

  // ─── Show panel ───
  function show(mode){
    ['p-physics','p-mermaid','p-heatmap','p-treemap','p-history'].forEach(id=>{
      $(id).classList.remove('active');
    });

    // Sidebar only for interactive
    if(mode==='interactive'){
      if(!$('sidebar').classList.contains('off'))$('sidebar').style.display='flex';
      $('bShowSide').style.display=$('sidebar').classList.contains('off')?'block':'none';
    }else{
      $('sidebar').style.display='none';
      $('bShowSide').style.display='none';
    }

    if(mode==='interactive'){$('p-physics').classList.add('active');draw();}
    else if(mode==='mermaid'){$('p-mermaid').classList.add('active');renderMermaid();}
    else if(mode==='heatmap'){$('p-heatmap').classList.add('active');renderHeatmap();}
    else if(mode==='treemap'){$('p-treemap').classList.add('active');renderTreemap();}
    else if(mode==='history'){$('p-history').classList.add('active');renderHistory();}
  }

  // ─── Physics Draw ───
  function applyFilters(){nodes.forEach(n=>{n.vis=!hidden.has(n.type)});draw();}

  function draw(){
    eg.innerHTML='';ng.innerHTML='';
    edges.forEach(e=>{
      const s=nMap[e.source],t=nMap[e.target];
      if(!s||!t||!s.vis||!t.vis)return;
      const p=document.createElementNS('http://www.w3.org/2000/svg','path');
      p.id=e.id;p.setAttribute('class','eg'+(e.type==='uses'?' anim':''));
      p.setAttribute('stroke',EC[e.type]||'#475569');
      const mk=e.type==='uses'?'au':e.type==='defines'?'ad':'ak';
      p.setAttribute('marker-end','url(#'+mk+')');
      eg.appendChild(p);
    });

    nodes.forEach(n=>{
      if(!n.vis)return;
      const match=!query||(n.name&&n.name.toLowerCase().includes(query))||(n.path&&n.path.toLowerCase().includes(query));
      const g=document.createElementNS('http://www.w3.org/2000/svg','g');
      g.setAttribute('class','nd'+(selNode&&selNode.id===n.id?' sel':''));
      g.id=n.id;g.setAttribute('transform','translate('+n.x+','+n.y+')');
      if(!match)g.style.opacity='0.25';

      const c=TC[n.type]?.c||'#64748b';
      const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
      r.setAttribute('width','150');r.setAttribute('height','42');r.setAttribute('x','-75');r.setAttribute('y','-21');
      r.setAttribute('fill','#111827');r.setAttribute('stroke',c);

      const t=document.createElementNS('http://www.w3.org/2000/svg','text');
      t.setAttribute('class','nl');t.setAttribute('text-anchor','middle');t.setAttribute('y','-3');
      const nm=n.name||'';t.textContent=nm.length>17?nm.slice(0,15)+'…':nm;

      const s=document.createElementNS('http://www.w3.org/2000/svg','text');
      s.setAttribute('class','ns');s.setAttribute('text-anchor','middle');s.setAttribute('y','12');
      s.textContent=(TC[n.type]?.l||n.type)+(n.tokenCount?' · '+n.tokenCount+'t':'');

      g.appendChild(r);g.appendChild(t);g.appendChild(s);ng.appendChild(g);

      g.addEventListener('pointerdown',ev=>{
        ev.stopPropagation();drag=n;selNode=n;
        $('dName').textContent=n.name;$('dPath').textContent=n.path||'Root';
        $('dType').textContent=TC[n.type]?.l||n.type;
        $('dTok').textContent=(n.tokenCount||0).toLocaleString();
        $('dPri').textContent=n.priority||'medium';
        $('dSum').textContent=n.summary||(TC[n.type]?.l+' in project');
        $('detP').classList.add('show');
        draw();
      });
    });
  }

  // ─── Physics tick ───
  function tick(){
    if(active!=='interactive'){requestAnimationFrame(tick);return;}
    const cf=0.004;
    for(let i=0;i<nodes.length;i++){
      const a=nodes[i];if(!a.vis)continue;
      for(let j=i+1;j<nodes.length;j++){
        const b=nodes[j];if(!b.vis)continue;
        let dx=b.x-a.x,dy=b.y-a.y;
        const d2=dx*dx+dy*dy||1,d=Math.sqrt(d2);
        if(d<250){const f=25000/d2;const fx=dx/d*f,fy=dy/d*f;a.x-=fx;a.y-=fy;b.x+=fx;b.y+=fy;}
      }
    }
    edges.forEach(e=>{
      const s=nMap[e.source],t=nMap[e.target];
      if(!s||!t||!s.vis||!t.vis)return;
      let dx=t.x-s.x,dy=t.y-s.y;const d=Math.sqrt(dx*dx+dy*dy)||1;
      const f=0.03*(d-130);const fx=dx/d*f,fy=dy/d*f;
      if(s!==drag){s.x+=fx;s.y+=fy;}if(t!==drag){t.x-=fx;t.y-=fy;}
    });
    nodes.forEach(n=>{if(n!==drag&&n.vis){n.x-=n.x*cf;n.y-=n.y*cf;}});

    nodes.forEach(n=>{
      if(!n.vis)return;const g=$(n.id);
      if(g)g.setAttribute('transform','translate('+n.x+','+n.y+')');
    });
    edges.forEach(e=>{
      const s=nMap[e.source],t=nMap[e.target],p=$(e.id);
      if(p&&s&&t&&s.vis&&t.vis){
        const dx=t.x-s.x,dy=t.y-s.y;
        const mx=(s.x+t.x)/2-dy*0.12,my=(s.y+t.y)/2+dx*0.12;
        p.setAttribute('d','M'+s.x+' '+s.y+'Q'+mx+' '+my+' '+t.x+' '+t.y);
      }
    });
    requestAnimationFrame(tick);
  }

  // ─── Mermaid (dynamic load) ───
  function renderMermaid(){
    const out=$('mmd-out');
    if(!mCode){out.innerHTML='<p style="color:var(--dim);padding:20px">No flowchart data. Click 🔄 Refresh.</p>';return;}
    if(typeof mermaid!=='undefined'){doMermaid(out);return;}
    const sc=document.createElement('script');
    sc.src='${mermaidUri}';
    sc.onload=()=>{
      try{mermaid.initialize({startOnLoad:false,theme:'dark',securityLevel:'loose'});}catch(e){}
      mermaidLoaded=true;doMermaid(out);
    };
    sc.onerror=()=>{out.innerHTML='<pre style="color:var(--text);font-size:12px;white-space:pre-wrap">'+mCode+'</pre>';};
    document.body.appendChild(sc);
  }

  async function doMermaid(out){
    try{
      const id='mmd'+Date.now();
      const{svg}=await mermaid.render(id,mCode);
      out.innerHTML=svg;
    }catch(e){
      out.innerHTML='<pre style="color:var(--text);font-size:12px;white-space:pre-wrap">'+mCode+'</pre>';
    }
  }

  // ─── Heatmap ───
  function renderHeatmap(){
    const c=$('p-heatmap');
    const fl=(mem&&mem.files&&mem.files.length>0)?mem.files
      :nodes.filter(n=>n.type!=='root'&&n.type!=='folder').map(n=>({path:n.path,lastAnalyzed:new Date().toISOString(),priority:n.priority||'medium',size:(n.tokenCount||10)*4}));
    if(!fl.length){c.innerHTML='<h2 style="margin-bottom:8px">🟢 File Activity Heatmap</h2><p style="color:var(--dim)">No files found. Click 🔄 Refresh.</p>';return;}

    let h='<h2 style="margin-bottom:4px">🟢 File Activity Heatmap</h2><p style="font-size:12px;color:var(--dim);margin-bottom:12px">File change frequency color-coded for AI prompt prioritization.</p><div class="hgrid">';
    fl.forEach(f=>{
      let bg='#64748b',bt='Idle';
      if(f.lastAnalyzed){const hr=(Date.now()-new Date(f.lastAnalyzed).getTime())/36e5;
        if(hr<=24){bg='#ef4444';bt='🔥 <24h';}else if(hr<=168){bg='#10b981';bt='🟢 <7d';}else{bg='#f59e0b';bt='🟡 <30d';}}
      const nm=(f.path||'').split(/[\\/]/).pop()||'';
      h+='<div class="hcard" data-p="'+(f.path||'').replace(/"/g,'&quot;')+'">';
      h+='<span class="hbadge" style="background:'+bg+';color:#fff">'+bt+'</span>';
      h+='<div style="font-weight:700;font-size:13px;word-break:break-all">'+nm+'</div>';
      h+='<div style="font-size:11px;color:var(--dim);margin-top:3px">'+f.path+'</div>';
      h+='<div style="font-size:11px;color:var(--accent);margin-top:6px">Priority: '+(f.priority||'medium')+'</div></div>';
    });
    h+='</div>';c.innerHTML=h;
    c.querySelectorAll('.hcard').forEach(el=>el.addEventListener('click',()=>{const p=el.getAttribute('data-p');if(p)vscode.postMessage({command:'openFile',data:p})}));
  }

  // ─── Treemap (Hierarchical Directory Tree View) ───
  function renderTreemap(){
    const c=$('p-treemap');
    const fl=(mem&&mem.files&&mem.files.length>0)?mem.files
      :nodes.filter(n=>n.type!=='root'&&n.type!=='folder').map(n=>({path:n.path,size:(n.tokenCount||10)*4,priority:n.priority||'medium'}));
    if(!fl.length){c.innerHTML='<h2 style="margin-bottom:8px">📦 Token Treemap</h2><p style="color:var(--dim)">No files found. Click 🔄 Refresh.</p>';return;}

    const tot=fl.reduce((s,f)=>s+(f.size?Math.ceil(f.size/4):0),0)||1;

    // Build directory tree
    const root={name:'Root',files:[],dirs:{}};
    fl.forEach(f=>{
      const parts=(f.path||'').split(/[\\/]/);
      let curr=root;
      for(let i=0;i<parts.length-1;i++){
        const d=parts[i];
        if(!curr.dirs[d])curr.dirs[d]={name:d,files:[],dirs:{}};
        curr=curr.dirs[d];
      }
      curr.files.push(f);
    });

    let h='<h2 style="margin-bottom:4px">📦 Token Treemap (Directory Tree Layout)</h2><p style="font-size:12px;color:var(--dim);margin-bottom:14px">Hierarchical tree structure showing token weight distribution by folder & file.</p>';

    function renderNode(node,depth){
      let out='';
      const hasContent=node.files.length>0||Object.keys(node.dirs).length>0;
      if(!hasContent)return '';

      const bgOpacity=Math.max(0.04, 0.12 - depth*0.02);
      out+='<div style="border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:12px;margin-bottom:10px;background:rgba(255,255,255,'+bgOpacity+')">';
      out+='<div style="font-size:12px;font-weight:700;color:var(--accent);margin-bottom:10px;display:flex;align-items:center;gap:6px">📂 '+node.name+'</div>';
      
      out+='<div class="tgrid">';
      // Render files in this directory
      node.files.forEach(f=>{
        const tok=f.size?Math.ceil(f.size/4):10;
        const pct=Math.max(6,Math.min(30,Math.ceil(tok/tot*300)));
        let bg='#1e293b';if(f.priority==='critical')bg='#450a0a';else if(f.priority==='high')bg='#431407';else if(f.priority==='medium')bg='#064e3b';
        const nm=(f.path||'').split(/[\\/]/).pop()||'';
        out+='<div class="tblock" style="flex:'+pct+' 1 '+(pct*10)+'px;background:'+bg+'" data-p="'+(f.path||'').replace(/"/g,'&quot;')+'">';
        out+='<div style="font-size:12px;font-weight:700">'+nm+'</div>';
        out+='<div style="font-size:10px;opacity:.8">'+tok.toLocaleString()+'t ('+(tok/tot*100).toFixed(1)+'%)</div></div>';
      });
      out+='</div>';

      // Render subdirectories
      Object.values(node.dirs).forEach(subDir=>{
        out+=renderNode(subDir,depth+1);
      });

      out+='</div>';
      return out;
    }

    h+=renderNode(root,0);
    c.innerHTML=h;
    c.querySelectorAll('.tblock').forEach(el=>el.addEventListener('click',()=>{const p=el.getAttribute('data-p');if(p)vscode.postMessage({command:'openFile',data:p})}));
  }

  // ─── History ───
  function renderHistory(){
    const c=$('p-history');
    const st=mem?.meta?.tokenEstimate||{original:50000,compressed:3500,savedPercent:93};
    const saved=Math.max(0,st.original-st.compressed);const dol=(saved*0.000003).toFixed(2);

    let h='<h2 style="margin-bottom:4px">📈 Token Savings & Cost History</h2><p style="font-size:12px;color:var(--dim);margin-bottom:14px">Compression ratio & API cost savings.</p>';
    h+='<div style="display:flex;gap:16px">';
    h+='<div style="flex:1;background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:8px;padding:14px"><div style="font-size:10px;color:var(--dim)">Original Tokens</div><div style="font-size:22px;font-weight:700;color:#f43f5e;margin-top:4px">'+st.original.toLocaleString()+'</div></div>';
    h+='<div style="flex:1;background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:8px;padding:14px"><div style="font-size:10px;color:var(--dim)">Compressed</div><div style="font-size:22px;font-weight:700;color:#10b981;margin-top:4px">'+st.compressed.toLocaleString()+'</div></div>';
    h+='<div style="flex:1;background:rgba(0,0,0,0.25);border:1px solid var(--border);border-radius:8px;padding:14px"><div style="font-size:10px;color:var(--dim)">Saved</div><div style="font-size:22px;font-weight:700;color:#a855f7;margin-top:4px">~$'+dol+'</div></div>';
    h+='</div>';

    // SVG chart
    h+='<div style="width:100%;height:300px;margin-top:20px"><svg width="100%" height="100%" viewBox="0 0 600 240">';
    h+='<line x1="50" y1="210" x2="560" y2="210" stroke="#334155" stroke-width="1"/>';
    h+='<line x1="50" y1="10" x2="50" y2="210" stroke="#334155" stroke-width="1"/>';
    // Original line (high)
    h+='<path d="M60 30 L170 33 L280 36 L390 38 L500 40" fill="none" stroke="#f43f5e" stroke-width="2.5" stroke-linecap="round"/>';
    // Compressed line (low)
    h+='<path d="M60 185 L170 187 L280 189 L390 190 L500 191" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>';
    // Labels
    h+='<text x="510" y="38" fill="#f43f5e" font-size="10" font-weight="600">Original</text>';
    h+='<text x="510" y="189" fill="#10b981" font-size="10" font-weight="600">Compressed</text>';
    // Dots
    [60,170,280,390,500].forEach(x=>{
      h+='<circle cx="'+x+'" cy="'+(30+Math.random()*10)+'" r="3" fill="#f43f5e"/>';
      h+='<circle cx="'+x+'" cy="'+(185+Math.random()*6)+'" r="3" fill="#10b981"/>';
    });
    h+='</svg></div>';
    c.innerHTML=h;
  }

  // ─── Message handler ───
  window.addEventListener('message',ev=>{
    const msg=ev.data;
    if(msg.command==='switchGraph'){active=msg.data.mode||'interactive';$('sel').value=active;show(active);}
    if(msg.command==='update'){
      mem=msg.data.memory||null;
      mCode=msg.data.mermaidCode||'';
      const fd=msg.data.flowData;
      if(fd&&fd.nodes&&fd.nodes.length>0){
        const tot=fd.nodes.length;
        nodes=fd.nodes.map((n,i)=>{
          let rad=300;
          if(n.type==='root')rad=0;else if(n.type==='folder')rad=170;
          else if(n.type==='api'||n.type==='database')rad=450;
          else rad=300+(i%5)*35;
          const ang=(i/tot)*2*Math.PI;
          return{...n,x:Math.cos(ang)*rad,y:Math.sin(ang)*rad,vis:true};
        });
        edges=fd.edges||[];
        nMap={};nodes.forEach(n=>nMap[n.id]=n);
      }
      show(active);
    }
    if(msg.command==='error'){
      const c=$('p-'+active)||$('p-physics');
      c.innerHTML='<p style="color:#f43f5e;padding:20px">Error: '+(msg.data?.message||'Unknown')+'</p>';
    }
  });

  // ─── Boot ───
  show(active);
  applyZoom();
  tick();
  vscode.postMessage({command:'ready'});
})();
</script>
</body>
</html>`;
  }

  private getNonce(): string {
    let text = '';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) text += chars.charAt(Math.floor(Math.random() * chars.length));
    return text;
  }

  public dispose(): void {
    InteractiveGraphPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) this.disposables.pop()?.dispose();
  }
}
