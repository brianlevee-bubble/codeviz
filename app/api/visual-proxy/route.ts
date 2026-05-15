export const runtime = 'nodejs';

import type { NextRequest } from 'next/server';

// ─── Navigation interceptor injected into <head> ─────────────────────────────
// Patches history.pushState (NOT replaceState — Next.js uses that for init/state
// updates without navigating). Resolves pushed paths against the target origin so
// the parent can reload the proxy with the correct URL.
function makeNavScript(targetOrigin: string): string {
  return `<script data-cviz="nav">
(function(){
  var TARGET='${targetOrigin}';
  // Capture proxy origin + initial href NOW, before Next.js replaceState changes window.location
  var PROXY=window.location.origin;
  window.__cvizInitialHref=window.location.href;
  window.__cvizInspecting=false;
  var last='';
  function toTarget(url){
    if(!url)return null;
    var s=String(url);
    try{
      var u=new URL(s);
      if(u.origin===TARGET)return u.href;
      // Proxy-origin absolute URL → remap to target
      if(u.origin===PROXY)return TARGET+u.pathname+u.search+u.hash;
    }catch(e){}
    // relative path — resolve against target origin
    try{return new URL(s,TARGET+'/').href;}catch(e){return null;}
  }
  function notify(url){
    var a=toTarget(url);
    if(!a||a===last)return;
    last=a;
    window.parent.postMessage({type:'CVIZ_NAVIGATE',url:a},'*');
  }
  // Patch pushState for programmatic SPA navigation (router.push etc.)
  var pp=history.pushState.bind(history);
  history.pushState=function(s,t,url){pp(s,t,url);notify(url);};
  window.addEventListener('popstate',function(){notify(location.href);});
  // Intercept anchor clicks — catches both SPA links and regular <a href> navigation.
  // Runs in capture phase before React's handlers; sends CVIZ_NAVIGATE to parent
  // which reloads the iframe through the proxy (ensuring correct URL bar + assets).
  document.addEventListener('click',function(e){
    if(window.__cvizInspecting)return;  // inspector handles clicks in inspect mode
    var el=e.target;
    while(el&&el.tagName!=='A'&&el!==document.body)el=el.parentElement;
    if(!el||el.tagName!=='A')return;
    var href=el.href;if(!href||el.target==='_blank'||el.hasAttribute('download'))return;
    var targetUrl=toTarget(href);
    if(!targetUrl)return;  // external link, don't intercept
    // Don't intercept hash-only same-page anchors
    try{var u=new URL(href);if(u.pathname===location.pathname&&!u.search&&u.hash)return;}catch(ex){}
    e.preventDefault();
    e.stopImmediatePropagation();
    notify(targetUrl);
  },true);
})();
</script>`;
}

// ─── Inspector script injected into every proxied HTML page ───────────────────

const INSPECTOR_SCRIPT = `<script data-cviz="inspector">
(function(){
  var inspecting=false,hovered=null,selected=null;
  var st=document.createElement('style');
  st.textContent='[data-cviz-h]{outline:2px dashed rgba(59,130,246,.7)!important;outline-offset:-1px;cursor:crosshair!important;}[data-cviz-s]{outline:2px solid #3b82f6!important;outline-offset:-1px;box-shadow:0 0 0 4px rgba(59,130,246,.15)!important;}';
  (document.head||document.documentElement).appendChild(st);
  function styles(el){
    var cs=getComputedStyle(el);
    return{color:cs.color,fontSize:cs.fontSize,fontWeight:cs.fontWeight,
      fontFamily:(cs.fontFamily||'').split(',')[0].trim().replace(/['"]/g,''),
      lineHeight:cs.lineHeight,textAlign:cs.textAlign,letterSpacing:cs.letterSpacing,
      textDecorationLine:cs.textDecorationLine,backgroundColor:cs.backgroundColor,opacity:cs.opacity,
      paddingTop:cs.paddingTop,paddingRight:cs.paddingRight,paddingBottom:cs.paddingBottom,paddingLeft:cs.paddingLeft,
      marginTop:cs.marginTop,marginRight:cs.marginRight,marginBottom:cs.marginBottom,marginLeft:cs.marginLeft,
      borderRadius:cs.borderTopLeftRadius,borderWidth:cs.borderTopWidth,borderColor:cs.borderTopColor,borderStyle:cs.borderTopStyle,
      display:cs.display,flexDirection:cs.flexDirection,gap:cs.gap,alignItems:cs.alignItems,justifyContent:cs.justifyContent,
      width:cs.width,height:cs.height,boxShadow:cs.boxShadow};
  }
  function elInfo(el){
    var dataAttrs={};var attrs=el.attributes;
    for(var i=0;i<attrs.length;i++){var a=attrs[i];if(a.name.startsWith('data-')&&!a.name.startsWith('data-cviz'))dataAttrs[a.name]=a.value;}
    return{
      tagName:el.tagName.toLowerCase(),
      id:el.id||null,
      className:typeof el.className==='string'?el.className:'',
      ariaLabel:el.getAttribute('aria-label')||null,
      role:el.getAttribute('role')||null,
      dataAttrs:dataAttrs,
    };
  }
  function ancestors(el){
    var chain=[];var cur=el.parentElement;
    while(cur&&cur!==document.body&&cur!==document.documentElement&&chain.length<8){
      chain.push(elInfo(cur));cur=cur.parentElement;
    }
    return chain;
  }
  function reactSource(el){
    try{
      var fiberKey=Object.keys(el).find(function(k){return k.startsWith('__reactFiber')||k.startsWith('__reactInternalInstance');});
      if(!fiberKey)return null;
      var fiber=el[fiberKey];
      // Walk up the fiber tree to find the nearest component with _debugSource
      var visited=0;
      while(fiber&&visited++<50){
        if(fiber._debugSource&&fiber._debugSource.fileName){
          return{
            fileName:fiber._debugSource.fileName,
            lineNumber:fiber._debugSource.lineNumber||null,
            columnNumber:fiber._debugSource.columnNumber||null,
            componentName:(fiber.type&&(fiber.type.displayName||fiber.type.name))||null,
          };
        }
        fiber=fiber.return;
      }
    }catch(e){}
    return null;
  }
  function emit(el){
    window.parent.postMessage({type:'CVIZ_SELECTED',info:{
      tagName:el.tagName.toLowerCase(),id:el.id||null,
      className:typeof el.className==='string'?el.className:'',
      textContent:(el.textContent||'').trim().slice(0,80),
      ariaLabel:el.getAttribute('aria-label')||null,
      role:el.getAttribute('role')||null,
      dataAttrs:(function(){var d={};var a=el.attributes;for(var i=0;i<a.length;i++){if(a[i].name.startsWith('data-')&&!a[i].name.startsWith('data-cviz'))d[a[i].name]=a[i].value;}return d;})(),
      outerHTMLSnippet:(el.outerHTML||'').slice(0,400),
      pageUrl:window.location.href,
      ancestors:ancestors(el),
      styles:styles(el),
      reactSource:reactSource(el),
    }},'*');
  }
  document.addEventListener('mouseover',function(e){
    if(!inspecting)return;
    var t=e.target;if(t===document.body||t===document.documentElement)return;
    if(hovered&&hovered!==t)delete hovered.dataset.cvizH;
    hovered=t;t.dataset.cvizH='1';
  },true);
  document.addEventListener('mouseout',function(e){
    if(!inspecting)return;
    delete e.target.dataset.cvizH;if(hovered===e.target)hovered=null;
  },true);
  document.addEventListener('click',function(e){
    if(!inspecting)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    if(hovered){delete hovered.dataset.cvizH;hovered=null;}
    if(selected)delete selected.dataset.cvizS;
    var t=e.target;
    if(t===document.body||t===document.documentElement){
      selected=null;window.parent.postMessage({type:'CVIZ_DESELECTED'},'*');return;
    }
    selected=t;t.dataset.cvizS='1';emit(t);
  },true);
  document.addEventListener('submit',function(e){
    if(!inspecting)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
  },true);
  // ── State watching ──────────────────────────────────────────────────────────
  var _wInt=null;var _nLog=[];var _nId=0;
  function _sv(v,d){
    if(d<=0)return'…';if(v===null||v===undefined)return v;
    var t=typeof v;
    if(t==='string')return v.length>150?v.slice(0,150)+'…':v;
    if(t==='number'||t==='boolean')return v;
    if(t==='function')return'[fn '+(v.name||'?')+']';
    if(Array.isArray(v)){if(!v.length)return[];return v.slice(0,8).map(function(x){return _sv(x,d-1);});}
    if(t==='object'){try{var ks=Object.keys(v).slice(0,12);var o={};for(var i=0;i<ks.length;i++){try{o[ks[i]]=_sv(v[ks[i]],d-1);}catch(e2){o[ks[i]]='[err]';}}return o;}catch(e3){return'[obj]';}}
    return String(v);
  }
  function _rc(){
    var comps=[];var seen=new WeakSet();
    function wf(fb,dep){
      if(!fb||seen.has(fb)||dep>500)return;
      seen.add(fb);
      if(typeof fb.type==='function'&&fb.memoizedState){
        var nm=fb.type.displayName||fb.type.name||'?';
        var hooks=[];var h=fb.memoizedState;var hi=0;
        while(h&&hi++<20){
          var ht='?';var hv=h.memoizedState;
          if(hv!==null&&typeof hv==='object'&&'current'in hv&&Object.keys(hv).length===1)ht='ref';
          else if(h.queue)ht='state';
          hooks.push({t:ht,v:_sv(hv,3)});
          h=h.next;
        }
        if(hooks.length){
          var src=null;
          try{if(fb._debugSource)src=fb._debugSource.fileName.split('/').slice(-2).join('/')+':'+fb._debugSource.lineNumber;}catch(e4){}
          comps.push({n:nm,s:src,h:hooks});
        }
      }
      wf(fb.child,dep+1);wf(fb.sibling,dep);
    }
    try{
      var roots=new Set();
      function _findFk(el){try{var ak=Object.keys(el);for(var j=0;j<ak.length;j++){if(ak[j].startsWith('__reactFiber')||ak[j].startsWith('__reactInternalInstance'))return ak[j];}return null;}catch(e){return null;}}
      function _addRoot(el){if(!el)return;var fk=_findFk(el);if(fk){var f=el[fk];var c=0;while(f&&f.return&&c++<500)f=f.return;if(f)roots.add(f);}}
      // React 19 hydrateRoot attaches fibers to the document-level elements
      _addRoot(document.documentElement);_addRoot(document.head);_addRoot(document.body);
      // Scan all DOM elements (no cap) to find any additional React roots
      var all=document.querySelectorAll('*');
      for(var i=0;i<all.length;i++){_addRoot(all[i]);}
      roots.forEach(function(r){wf(r,0);});
    }catch(e5){}
    return comps;
  }
  function _us(){
    var p={};try{new URLSearchParams(window.location.search).forEach(function(v,k){p[k]=v;});}catch(e){}
    return{href:window.location.href,pathname:window.location.pathname,params:p,hash:window.location.hash};
  }
  function _es(){
    try{window.parent.postMessage({type:'CVIZ_STATE_SNAPSHOT',url:_us(),components:_rc(),networkLog:_nLog.slice(-40)},'*');}catch(e){}
  }
  (function(){
    if(!window.fetch)return;
    var _f=window.fetch;
    window.fetch=function(){
      var a=arguments,id=++_nId,m='GET',u='',ts=Date.now();
      try{m=(a[1]&&a[1].method)||'GET';u=typeof a[0]==='string'?a[0]:(a[0]&&a[0].url)||'';}catch(e){}
      _nLog.push({id:id,m:m.toUpperCase(),u:u,ts:ts,st:null,d:null});
      if(_nLog.length>60)_nLog.shift();
      return _f.apply(window,a).then(function(r){
        var e=_nLog.find(function(x){return x.id===id;});if(e){e.st=r.status;e.d=Date.now()-ts;}return r;
      },function(err){
        var e=_nLog.find(function(x){return x.id===id;});if(e){e.st=0;e.d=Date.now()-ts;}throw err;
      });
    };
  })();
  window.addEventListener('message',function(e){
    if(!e.data||typeof e.data!=='object')return;
    switch(e.data.type){
      case'CVIZ_SET_INSPECT':
        inspecting=e.data.enabled;
        window.__cvizInspecting=inspecting;
        if(!inspecting){if(hovered){delete hovered.dataset.cvizH;hovered=null;}if(selected)delete selected.dataset.cvizS;}
        break;
      case'CVIZ_APPLY_STYLE':if(selected){selected.style[e.data.prop]=e.data.value;emit(selected);}break;
      case'CVIZ_APPLY_STYLE_RULE':
        var rs=document.getElementById('cviz-rules');
        if(!rs){rs=document.createElement('style');rs.id='cviz-rules';(document.head||document.documentElement).appendChild(rs);}
        rs.textContent=e.data.css||'';
        break;
      case'CVIZ_DESELECT':if(selected){delete selected.dataset.cvizS;selected=null;}window.parent.postMessage({type:'CVIZ_DESELECTED'},'*');break;
      case'CVIZ_START_STATE_WATCH':_es();if(!_wInt)_wInt=setInterval(_es,600);break;
      case'CVIZ_STOP_STATE_WATCH':if(_wInt){clearInterval(_wInt);_wInt=null;}break;
    }
  });
  window.parent.postMessage({type:'CVIZ_READY',url:(window.__cvizInitialHref||window.location.href)},'*');
})();
</script>`;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isLocalhost(hostname: string) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname);
}

function rewriteUrl(href: string, targetBase: string): string {
  try {
    const abs = new URL(href, targetBase);
    const tBase = new URL(targetBase);
    if (abs.hostname === tBase.hostname && abs.port === tBase.port) {
      return `/api/visual-proxy?url=${encodeURIComponent(abs.href)}`;
    }
  } catch { /* ignore */ }
  return href;
}

function injectAndRewrite(html: string, targetUrl: string, origin: string): string {
  // 1. Inject <base> so relative asset URLs resolve correctly
  if (!/<base\s/i.test(html)) {
    html = html.replace(/(<head[^>]*>)/i, `$1<base href="${origin}/">`);
    if (!html.includes('<base ')) html = `<base href="${origin}/">` + html;
  }

  // 2. Inject navigation interceptor into <head> (before any app scripts)
  const navScript = makeNavScript(origin);
  if (html.includes('</head>')) {
    html = html.replace('</head>', `${navScript}</head>`);
  } else {
    html = navScript + html;
  }

  // 3. Rewrite <form action> through the proxy (so POST responses stay proxied)
  html = html.replace(/(<form\b[^>]*?\saction=")([^"]*?)(")/gi, (_m, pre, action, post) => {
    if (!action || /^(mailto:|javascript:)/i.test(action)) return _m;
    return `${pre}${rewriteUrl(action, targetUrl)}${post}`;
  });

  // 4. Inject inspector before </body>
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${INSPECTOR_SCRIPT}</body>`);
  } else {
    html += INSPECTOR_SCRIPT;
  }
  return html;
}

// ─── Core proxy handler (shared by GET + POST) ─────────────────────────────────

async function proxyRequest(request: NextRequest, method: string): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');

  if (!targetUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(targetUrl);
    if (!isLocalhost(parsedUrl.hostname)) {
      return new Response('Only localhost URLs are allowed', { status: 403 });
    }
  } catch {
    return new Response('Invalid URL', { status: 400 });
  }

  const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;

  // Build forwarded headers
  const forwardHeaders: Record<string, string> = {
    Accept: request.headers.get('accept') || 'text/html,application/xhtml+xml,*/*',
    'User-Agent': 'Mozilla/5.0 CodeViz/1.0',
    'Content-Type': request.headers.get('content-type') || 'application/x-www-form-urlencoded',
  };

  // Forward cookies (they were set on our proxy domain, we pass them to the target)
  const cookie = request.headers.get('cookie');
  if (cookie) forwardHeaders['Cookie'] = cookie;

  // Forward referer rewritten to point at target
  const referer = request.headers.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      const proxiedTarget = refUrl.searchParams.get('url');
      if (proxiedTarget) forwardHeaders['Referer'] = proxiedTarget;
    } catch { /* ignore */ }
  }

  const fetchInit: RequestInit = {
    method,
    headers: forwardHeaders,
    signal: AbortSignal.timeout(10000),
    redirect: 'manual', // We handle redirects ourselves
  };

  if (method !== 'GET' && method !== 'HEAD') {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) fetchInit.body = body;
  }

  let resp: globalThis.Response;
  try {
    resp = await fetch(targetUrl, fetchInit);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Connection failed';
    return new Response(
      `<!DOCTYPE html><html><head><base href="${origin}/"></head>
<body style="font-family:system-ui,sans-serif;padding:3rem 2rem;color:#64748b;text-align:center">
  <div style="max-width:380px;margin:0 auto">
    <div style="font-size:3rem;margin-bottom:1.5rem">🔌</div>
    <h2 style="color:#1e293b;font-size:1.1rem;font-weight:600;margin:0 0 .5rem">Could not connect</h2>
    <p style="font-size:.875rem;margin:0 0 .25rem">${msg}</p>
    <p style="font-size:.75rem;color:#94a3b8;margin-top:.75rem">
      Make sure your app is running at<br>
      <code style="background:#f1f5f9;padding:.125rem .5rem;border-radius:.25rem;font-size:.8rem">${targetUrl}</code>
    </p>
  </div>
</body></html>`,
      { headers: { 'Content-Type': 'text/html' } }
    );
  }

  // ── Handle redirects ────────────────────────────────────────────────────────
  if (resp.status >= 300 && resp.status < 400) {
    const location = resp.headers.get('location');
    if (location) {
      // Resolve the redirect target relative to the proxied URL
      let absLocation: string;
      try {
        absLocation = new URL(location, targetUrl).href;
      } catch {
        absLocation = location;
      }

      const responseHeaders = new Headers();

      // Forward Set-Cookie headers so auth sessions are preserved
      const setCookies = resp.headers.getSetCookie?.() ?? [];
      if (setCookies.length === 0) {
        // fallback for environments without getSetCookie
        const raw = resp.headers.get('set-cookie');
        if (raw) setCookies.push(...raw.split(/,(?=[^;])/));
      }
      for (const c of setCookies) {
        responseHeaders.append('set-cookie', c);
      }

      // If the redirect targets our allowed origin, proxy it; otherwise let it go direct
      try {
        const absUrl = new URL(absLocation);
        if (isLocalhost(absUrl.hostname)) {
          responseHeaders.set('location', `/api/visual-proxy?url=${encodeURIComponent(absLocation)}`);
        } else {
          responseHeaders.set('location', absLocation);
        }
      } catch {
        responseHeaders.set('location', absLocation);
      }

      return new Response(null, { status: resp.status, headers: responseHeaders });
    }
  }

  // ── Build response headers (forward cookies, cache) ─────────────────────────
  const resHeaders = new Headers({ 'Cache-Control': 'no-store' });

  const setCookies = resp.headers.getSetCookie?.() ?? [];
  if (setCookies.length === 0) {
    const raw = resp.headers.get('set-cookie');
    if (raw) setCookies.push(...raw.split(/,(?=[^;])/));
  }
  for (const c of setCookies) {
    resHeaders.append('set-cookie', c);
  }

  const ct = resp.headers.get('content-type') ?? '';

  // ── Non-HTML: proxy directly ────────────────────────────────────────────────
  if (!ct.includes('text/html')) {
    resHeaders.set('Content-Type', ct);
    const body = await resp.arrayBuffer();
    return new Response(body, { status: resp.status, headers: resHeaders });
  }

  // ── HTML: inject and rewrite ────────────────────────────────────────────────
  let html = await resp.text();
  html = injectAndRewrite(html, targetUrl, origin);

  resHeaders.set('Content-Type', 'text/html; charset=utf-8');
  return new Response(html, { status: resp.status, headers: resHeaders });
}

// ─── Route exports ─────────────────────────────────────────────────────────────

export async function GET(request: NextRequest)    { return proxyRequest(request, 'GET'); }
export async function POST(request: NextRequest)   { return proxyRequest(request, 'POST'); }
export async function PUT(request: NextRequest)    { return proxyRequest(request, 'PUT'); }
export async function PATCH(request: NextRequest)  { return proxyRequest(request, 'PATCH'); }
export async function DELETE(request: NextRequest) { return proxyRequest(request, 'DELETE'); }
