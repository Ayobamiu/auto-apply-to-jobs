(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))l(r);new MutationObserver(r=>{for(const o of r)if(o.type==="childList")for(const p of o.addedNodes)p.tagName==="LINK"&&p.rel==="modulepreload"&&l(p)}).observe(document,{childList:!0,subtree:!0});function a(r){const o={};return r.integrity&&(o.integrity=r.integrity),r.referrerPolicy&&(o.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?o.credentials="include":r.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function l(r){if(r.ep)return;r.ep=!0;const o=a(r);fetch(r.href,o)}})();const ue="";let se=null;function Le(t){se=t}function te(){return localStorage.getItem("token")}function Ie(t){localStorage.setItem("token",t)}function Se(){localStorage.removeItem("token")}function Te(){return!!te()}function $e(){const t=te();if(!t)return null;try{return JSON.parse(atob(t.split(".")[1])).sub??null}catch{return null}}async function A(t,n={}){const a={"Content-Type":"application/json",...n.headers??{}},l=te();l&&(a.Authorization=`Bearer ${l}`);const r=await fetch(`${ue}${t}`,{...n,headers:a});if(r.status===401)throw Se(),se==null||se(),new Error("Session expired. Please sign in again.");const o=await r.json();if(!r.ok)throw new Error(o.error||o.message||`Request failed (${r.status})`);return o}async function Ae(t,n){return A("/auth/register",{method:"POST",body:JSON.stringify({email:t,password:n})})}async function he(t,n){const a=await A("/auth/login",{method:"POST",body:JSON.stringify({email:t,password:n})});return a.token&&Ie(a.token),a}async function Be(t,n=[]){return A("/chat",{method:"POST",body:JSON.stringify({message:t,messages:n})})}async function Ce(t){return A(`/pipeline/jobs/${encodeURIComponent(t)}`)}async function Pe(t){return A(`/pipeline/jobs/${encodeURIComponent(t)}/artifacts`)}async function De(t,n){return A(`/pipeline/jobs/${encodeURIComponent(t)}/artifacts/resume`,{method:"PUT",body:JSON.stringify(n)})}async function Oe(t,n){return A(`/pipeline/jobs/${encodeURIComponent(t)}/artifacts/cover`,{method:"PUT",body:JSON.stringify({text:n})})}async function Re(t){return A(`/pipeline/jobs/${encodeURIComponent(t)}/approve`,{method:"POST"})}async function ye(t,n){const a=`/pipeline/jobs/${encodeURIComponent(t)}/artifacts/${n}?format=pdf`,l=te(),r={};l&&(r.Authorization=`Bearer ${l}`);const o=await fetch(ue+a,{headers:r});if(!o.ok)throw new Error(o.status===401?"Session expired":`Download failed: ${o.status}`);const p=await o.blob(),v=n==="resume"?"resume.pdf":"cover-letter.pdf",m=document.createElement("a");m.href=URL.createObjectURL(p),m.download=v,m.click(),URL.revokeObjectURL(m.href)}async function ge(t,n){const a=`/pipeline/jobs/${encodeURIComponent(t)}/applied-artifacts/${n}?format=pdf`,l=te(),r={};l&&(r.Authorization=`Bearer ${l}`);const o=await fetch(ue+a,{headers:r});if(!o.ok)throw new Error(o.status===401?"Session expired":o.status===404?"No applied document":`Download failed: ${o.status}`);const p=await o.blob(),v=n==="resume"?"resume.pdf":"cover-letter.pdf",m=document.createElement("a");m.href=URL.createObjectURL(p),m.download=v,m.click(),URL.revokeObjectURL(m.href)}async function Ue(){return A("/settings")}async function He(t){return A("/settings",{method:"PUT",body:JSON.stringify(t)})}async function ce(){return A("/handshake/session/status")}function Ne(t,n){t.innerHTML=`
    <div class="auth-wrapper">
      <div class="auth-card">
        <h1 class="auth-title">Auto Apply</h1>
        <p class="auth-subtitle">Your AI job application assistant</p>

        <form id="auth-form" class="auth-form">
          <input
            type="email"
            id="auth-email"
            placeholder="Email"
            required
            autocomplete="email"
            class="auth-input"
          />
          <input
            type="password"
            id="auth-password"
            placeholder="Password (min 8 characters)"
            required
            minlength="8"
            autocomplete="current-password"
            class="auth-input"
          />
          <button type="submit" id="auth-submit" class="auth-btn auth-btn-primary">
            Sign In
          </button>
        </form>

        <p class="auth-toggle">
          <span id="auth-toggle-text">Don't have an account?</span>
          <button id="auth-toggle-btn" class="auth-btn-link">Sign Up</button>
        </p>

        <p id="auth-error" class="auth-error" hidden></p>
      </div>
    </div>
  `;let a=!1;const l=document.getElementById("auth-form"),r=document.getElementById("auth-email"),o=document.getElementById("auth-password"),p=document.getElementById("auth-submit"),v=document.getElementById("auth-toggle-text"),m=document.getElementById("auth-toggle-btn"),B=document.getElementById("auth-error");m.addEventListener("click",()=>{a=!a,p.textContent=a?"Sign Up":"Sign In",v.textContent=a?"Already have an account?":"Don't have an account?",m.textContent=a?"Sign In":"Sign Up",B.hidden=!0}),l.addEventListener("submit",async M=>{M.preventDefault(),B.hidden=!0,p.disabled=!0,p.textContent=a?"Signing up...":"Signing in...";try{a?(await Ae(r.value.trim(),o.value),await he(r.value.trim(),o.value)):await he(r.value.trim(),o.value),n()}catch(k){B.textContent=k instanceof Error?k.message:"Authentication failed",B.hidden=!1}finally{p.disabled=!1,p.textContent=a?"Sign Up":"Sign In"}})}function E(t){const n=document.createElement("div");return n.textContent=t,n.innerHTML}function be(t,n){return t[n]}function w(t,n){const a=t[n];return typeof a=="string"?a:""}function le(t,n){const a=t[n];return Array.isArray(a)?a:[]}function qe(t,n){const a=n&&typeof n=="object"?n:{},l=be(a,"basics")||{},r=le(a,"work"),o=le(a,"education"),p=be(a,"skills");let v=[];if(Array.isArray(p))v=p.map(d=>String(typeof d=="string"?d:(d==null?void 0:d.name)??"").trim()).filter(Boolean);else if(typeof p=="object"&&p!==null&&!Array.isArray(p)){const d=p;Array.isArray(d.keywords)&&(v=d.keywords.map(c=>String(c)).filter(Boolean))}const m=r.length?r:[{}],B=o.length?o:[{}],M=document.createElement("div");M.className="resume-form",M.innerHTML=`
    <div class="resume-form-section">
      <label class="resume-form-label">Name</label>
      <input type="text" id="rf-name" class="resume-form-input" value="${E(w(l,"name"))}" placeholder="Full name" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Email</label>
      <input type="email" id="rf-email" class="resume-form-input" value="${E(w(l,"email"))}" placeholder="email@example.com" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Phone</label>
      <input type="text" id="rf-phone" class="resume-form-input" value="${E(w(l,"phone"))}" placeholder="Phone" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Title / Label</label>
      <input type="text" id="rf-label" class="resume-form-input" value="${E(w(l,"label"))}" placeholder="e.g. Software Engineer" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Summary</label>
      <textarea id="rf-summary" class="resume-form-textarea" rows="3" placeholder="Short professional summary">${E(w(l,"summary"))}</textarea>
    </div>
    <div class="resume-form-section">
      <strong class="resume-form-label">Work experience</strong>
      <div id="rf-work-list"></div>
      <button type="button" id="rf-add-work" class="review-btn">Add experience</button>
    </div>
    <div class="resume-form-section">
      <strong class="resume-form-label">Education</strong>
      <div id="rf-education-list"></div>
      <button type="button" id="rf-add-education" class="review-btn">Add education</button>
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Skills (one per line or comma-separated)</label>
      <textarea id="rf-skills" class="resume-form-textarea" rows="3" placeholder="e.g. JavaScript, Node.js">${E(v.join(`
`))}</textarea>
    </div>
  `,t.appendChild(M);const k=document.getElementById("rf-work-list"),Q=document.getElementById("rf-education-list");function L(d,c){const f=document.createElement("div");f.className="resume-form-entry",f.dataset.index=String(d);const x=w(c,"position")||w(c,"title"),O=w(c,"name")||w(c,"company"),I=le(c,"highlights"),z=w(c,"summary"),F=I.length?I.join(`
`):z;f.innerHTML=`
      <div class="resume-form-row">
        <input type="text" class="rf-work-company" placeholder="Company" value="${E(O)}" />
        <input type="text" class="rf-work-position" placeholder="Position" value="${E(x)}" />
        <button type="button" class="rf-remove-work review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-work-start" placeholder="Start (e.g. 2020)" value="${E(w(c,"startDate"))}" />
        <input type="text" class="rf-work-end" placeholder="End (e.g. 2023)" value="${E(w(c,"endDate"))}" />
      </div>
      <textarea class="rf-work-highlights" rows="2" placeholder="Bullet points (one per line)">${E(F)}</textarea>
    `,k.appendChild(f),f.querySelector(".rf-remove-work").addEventListener("click",()=>{f.remove()})}function Z(d,c){const f=document.createElement("div");f.className="resume-form-entry",f.dataset.index=String(d);const x=w(c,"institution")||w(c,"school"),O=w(c,"area")||w(c,"degree");f.innerHTML=`
      <div class="resume-form-row">
        <input type="text" class="rf-edu-institution" placeholder="School" value="${E(x)}" />
        <input type="text" class="rf-edu-area" placeholder="Degree / Area" value="${E(O)}" />
        <button type="button" class="rf-remove-edu review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-edu-start" placeholder="Start year" value="${E(w(c,"startDate"))}" />
        <input type="text" class="rf-edu-end" placeholder="End year" value="${E(w(c,"endDate"))}" />
      </div>
    `,Q.appendChild(f),f.querySelector(".rf-remove-edu").addEventListener("click",()=>{f.remove()})}m.forEach((d,c)=>L(c,d)),B.forEach((d,c)=>Z(c,d)),document.getElementById("rf-add-work").addEventListener("click",()=>{L(k.children.length,{})}),document.getElementById("rf-add-education").addEventListener("click",()=>{Z(Q.children.length,{})});function J(){const d=document.getElementById("rf-name").value.trim(),c=document.getElementById("rf-email").value.trim(),f=document.getElementById("rf-phone").value.trim(),x=document.getElementById("rf-label").value.trim(),O=document.getElementById("rf-summary").value.trim(),I={};d&&(I.name=d),c&&(I.email=c),f&&(I.phone=f),x&&(I.label=x),O&&(I.summary=O);const z=[];k.querySelectorAll(".resume-form-entry").forEach(b=>{var U,_,e,i,s,u,T,y,$,H;const V=(_=(U=b.querySelector(".rf-work-company"))==null?void 0:U.value)==null?void 0:_.trim(),Y=(i=(e=b.querySelector(".rf-work-position"))==null?void 0:e.value)==null?void 0:i.trim(),ne=(u=(s=b.querySelector(".rf-work-start"))==null?void 0:s.value)==null?void 0:u.trim(),C=(y=(T=b.querySelector(".rf-work-end"))==null?void 0:T.value)==null?void 0:y.trim(),P=(H=($=b.querySelector(".rf-work-highlights"))==null?void 0:$.value)==null?void 0:H.trim(),j=P?P.split(/\n/).map(W=>W.trim()).filter(Boolean):[];z.push({name:V||void 0,position:Y||void 0,startDate:ne||void 0,endDate:C||void 0,highlights:j.length?j:void 0})});const F=[];Q.querySelectorAll(".resume-form-entry").forEach(b=>{var P,j,U,_,e,i,s,u;const V=(j=(P=b.querySelector(".rf-edu-institution"))==null?void 0:P.value)==null?void 0:j.trim(),Y=(_=(U=b.querySelector(".rf-edu-area"))==null?void 0:U.value)==null?void 0:_.trim(),ne=(i=(e=b.querySelector(".rf-edu-start"))==null?void 0:e.value)==null?void 0:i.trim(),C=(u=(s=b.querySelector(".rf-edu-end"))==null?void 0:s.value)==null?void 0:u.trim();F.push({institution:V||void 0,area:Y||void 0,startDate:ne||void 0,endDate:C||void 0})});const h=document.getElementById("rf-skills").value.trim(),ee=h?h.split(/[\n,]/).map(b=>b.trim()).filter(Boolean):[];return{...a,basics:Object.keys(I).length?I:{name:"",email:""},work:z,education:F,skills:ee}}function D(){const c=J().basics||{},f=String(c.name??"").trim(),x=String(c.email??"").trim();return!f&&!x?"Name or email is required.":null}return{getValue:J,validate:D}}const Me=50,de=3e3,we=100;function ke(){return`chat_history_${$e()??"unknown"}`}function Je(){try{const t=localStorage.getItem(ke());return t?JSON.parse(t):[]}catch{return[]}}function Fe(t){localStorage.setItem(ke(),JSON.stringify(t))}function K(t){const n=document.createElement("div");return n.textContent=t,n.innerHTML}function je(t){let n=K(t);return n=n.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>"),n=n.replace(/\n/g,"<br>"),n}function _e(t,n){const a=Je();let l=null,r=0,o=null,p=null,v=null,m=null,B=null;const M=localStorage.getItem("token")??"";t.innerHTML=`
    <div class="chat-layout">
      <header class="chat-header">
        <h1 class="chat-header-title">Auto Apply</h1>
        <div class="chat-header-actions">
          <label class="header-label">Automation: <select id="automation-level" class="header-select" title="Review: pause to edit before apply. Full: apply automatically.">
            <option value="review">Review before apply</option>
            <option value="full">Full auto</option>
          </select></label>
          <button id="check-connection-btn" class="header-btn" title="Check Handshake connection">Check connection</button>
          <button id="copy-token-btn" class="header-btn" title="Copy API token for extension">Copy Token</button>
          <button id="logout-btn" class="header-btn header-btn-secondary">Sign Out</button>
        </div>
      </header>

      <main id="chat-messages" class="chat-messages"></main>

      <footer class="chat-footer">
        <form id="chat-form" class="chat-form">
          <textarea
            id="chat-input"
            class="chat-input"
            placeholder="Type a message... (paste resume, send a job URL, or ask for help)"
            rows="2"
          ></textarea>
          <button type="submit" id="chat-send" class="chat-send-btn">Send</button>
        </form>
      </footer>
    </div>
  `;const k=document.getElementById("chat-messages"),Q=document.getElementById("chat-form"),L=document.getElementById("chat-input"),Z=document.getElementById("chat-send"),J=document.getElementById("automation-level"),D=document.getElementById("check-connection-btn"),d=document.getElementById("copy-token-btn"),c=document.getElementById("logout-btn");Ue().then(e=>{J.value=e.automationLevel}).catch(()=>{}),J.addEventListener("change",()=>{const e=J.value;He({automationLevel:e}).catch(()=>{J.value=e==="full"?"review":"full"})});function f(){k.scrollTop=k.scrollHeight}function x(){v==null||v.remove(),v=null,p=null}function O(){m==null||m.remove(),m=null,B=null}function I(e,i,s){var W,oe,re;if(B===e)return;O(),B=e;const u=i.resume&&typeof i.resume=="object",T=(W=i.coverLetter)==null?void 0:W.text,y=document.createElement("div");y.id="applied-card-container",y.className="chat-bubble chat-bubble-assistant review-card applied-artifacts-card";const $=u?(()=>{const S=i.resume.basics,X=(S==null?void 0:S.name)??"",N=(S==null?void 0:S.label)??"",q=i.resume.work,G=Array.isArray(q)?q.length:0;return`${X}${N?` · ${N}`:""}${G?` · ${G} experience(s)`:""}`})():"",H=T?i.coverLetter.text.slice(0,200)+(i.coverLetter.text.length>200?"…":""):"";y.innerHTML=`
      <div class="chat-bubble-content">
        <div class="review-card-header">
          <strong>Applied with these documents</strong>
          <div class="review-job-title">${K(s)}</div>
        </div>
        ${u?`<div class="applied-section"><div class="applied-summary">${K($)}</div><button type="button" class="review-btn applied-download-resume">Download resume PDF</button></div>`:""}
        ${T?`<div class="applied-section"><div class="applied-cover-preview">${K(H)}</div><button type="button" class="review-btn applied-download-cover">Download cover PDF</button></div>`:""}
      </div>
    `,m=y,k.appendChild(y),f(),(oe=y.querySelector(".applied-download-resume"))==null||oe.addEventListener("click",()=>{ge(e,"resume").catch(S=>h("assistant",S instanceof Error?S.message:"Download failed."))}),(re=y.querySelector(".applied-download-cover"))==null||re.addEventListener("click",()=>{ge(e,"cover").catch(S=>h("assistant",S instanceof Error?S.message:"Download failed."))})}function z(e,i){var ve;if(p===e)return;x(),p=e;const s=i.requiredSections??["resume","coverLetter"],u=s.includes("resume"),T=s.includes("coverLetter"),y=document.createElement("div");y.id="review-card-container",y.className="chat-bubble chat-bubble-assistant review-card";let $=((ve=i.cover)==null?void 0:ve.text)??"";const H=u?`<details class="review-section">
          <summary>Resume</summary>
          <div id="review-resume-form"></div>
          <div id="review-resume-error" class="review-error" hidden></div>
        </details>`:"",W=T?`<details class="review-section">
          <summary>Cover letter</summary>
          <textarea id="review-cover" class="review-textarea" rows="10" spellcheck="false"></textarea>
          <div id="review-cover-error" class="review-error" hidden></div>
        </details>`:"",oe=u?'<button type="button" id="review-download-resume" class="review-btn">Download resume PDF</button>':"",re=T?'<button type="button" id="review-download-cover" class="review-btn">Download cover PDF</button>':"",S=document.createElement("div");S.className="chat-bubble-content",S.innerHTML=`
      <div class="review-card-header">
        <strong>Review before apply</strong>
        <div class="review-job-title">${K(i.jobTitle)}</div>
      </div>
      ${H}
      ${W}
      <div class="review-actions">
        <button type="button" id="review-save" class="review-btn">Save edits</button>
        ${oe}
        ${re}
        <button type="button" id="review-approve" class="review-btn review-btn-primary">Approve and apply</button>
        <button type="button" id="review-cancel" class="review-btn">Cancel</button>
      </div>
      <div id="review-action-error" class="review-error" hidden></div>
    `,y.appendChild(S),v=y,k.appendChild(y),f();let X=null;if(u){const g=document.getElementById("review-resume-form");X=qe(g,i.resume??{})}const N=document.getElementById("review-cover");N&&(N.value=$);function q(g,ae){const ie=document.getElementById(g);ie&&(ie.textContent=ae,ie.hidden=!1)}function G(g){const ae=document.getElementById(g);ae&&(ae.hidden=!0)}document.getElementById("review-save").addEventListener("click",async()=>{G("review-resume-error"),G("review-cover-error");try{if(u&&X){const g=X.validate();if(g){q("review-resume-error",g);return}await De(e,X.getValue())}T&&N&&(await Oe(e,N.value.trim()||" "),$=N.value)}catch(g){q("review-resume-error",g instanceof Error?g.message:"Save failed.")}});const pe=document.getElementById("review-download-resume");pe&&pe.addEventListener("click",async()=>{try{await ye(e,"resume")}catch(g){q("review-action-error",g instanceof Error?g.message:"Download failed.")}});const fe=document.getElementById("review-download-cover");fe&&fe.addEventListener("click",async()=>{try{await ye(e,"cover")}catch(g){q("review-action-error",g instanceof Error?g.message:"Download failed.")}}),document.getElementById("review-approve").addEventListener("click",async()=>{G("review-action-error");try{await Re(e),x(),o&&V(o)}catch(g){q("review-action-error",g instanceof Error?g.message:"Approve failed.")}}),document.getElementById("review-cancel").addEventListener("click",()=>{x(),h("assistant","No problem. You can download the resume and cover letter to apply manually.")})}function F(){v==null||v.remove(),m==null||m.remove(),k.innerHTML=a.map(e=>`<div class="chat-bubble chat-bubble-${e.role}">
            <div class="chat-bubble-content">${je(e.content)}</div>
            ${e.timestamp?`<span class="chat-bubble-time">${new Date(e.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>`:""}
          </div>`).join(""),v&&k.appendChild(v),m&&k.appendChild(m),f()}function h(e,i){a.push({role:e,content:i,timestamp:new Date().toISOString()}),Fe(a),F()}function ee(e){const i=document.getElementById("typing-indicator");if(i){const u=i.querySelector(".chat-bubble-content");u&&(u.innerHTML=e?`<span class="chat-phase">${K(e)}</span>`:'<span class="dot"></span><span class="dot"></span><span class="dot"></span>'),f();return}const s=document.createElement("div");s.className="chat-bubble chat-bubble-assistant chat-typing",s.id="typing-indicator",s.innerHTML=e?`<div class="chat-bubble-content"><span class="chat-phase">${K(e)}</span></div>`:'<div class="chat-bubble-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>',k.appendChild(s),f()}function R(){var e;(e=document.getElementById("typing-indicator"))==null||e.remove()}function b(){l&&(clearTimeout(l),l=null),o=null,r=0}function V(e){b(),o=e,r=0,ee("Starting...");function i(){if(!o||r>=we){r>=we&&h("assistant",`I've been checking for a while. You can ask "check status" anytime to get an update.`),R(),b();return}r++,Ce(o).then(s=>{var u,T;if(s.status==="awaiting_approval"){R(),Pe(o).then(y=>z(o,y)).catch(()=>h("assistant","Could not load artifacts for review.")),l=setTimeout(i,de);return}if(s.status==="done"){R(),x();const y=s.userMessage??(s.error?`Failed: ${s.error}`:"Pipeline completed.");h("assistant",y);const $=(u=s.result)==null?void 0:u.appliedArtifacts,H=s.result&&typeof s.result=="object"&&s.result.job&&typeof s.result.job=="object"?String(s.result.job.title??""):"";$&&($.resume||(T=$.coverLetter)!=null&&T.text)&&I(o,$,H||"Job"),b();return}if(s.status==="failed"){R(),x(),h("assistant",`Failed: ${s.error??"Unknown error"}`),b();return}ee(s.phase??"Processing..."),l=setTimeout(i,de)}).catch(()=>{R(),b()})}l=setTimeout(i,de)}async function Y(){var i;const e=L.value.trim();if(e){h("user",e),L.value="",L.style.height="auto",Z.disabled=!0,ee();try{const s=a.slice(-Me),u=await Be(e,s);R(),h("assistant",u.reply),(i=u.meta)!=null&&i.pollStatus&&u.meta.jobId&&V(u.meta.jobId)}catch(s){R();const u=s instanceof Error?s.message:"Something went wrong.";h("assistant",`Error: ${u}`)}finally{Z.disabled=!1,L.focus()}}}if(Q.addEventListener("submit",e=>{e.preventDefault(),Y()}),L.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),Y())}),L.addEventListener("input",()=>{L.style.height="auto",L.style.height=Math.min(L.scrollHeight,200)+"px"}),D.addEventListener("click",async()=>{const e=D.textContent;D.textContent="Checking…",D.disabled=!0;try{(await ce()).connected?h("assistant","Handshake connected successfully."):h("assistant","Handshake is not connected. Use the browser extension to upload your session.")}catch{h("assistant","Could not verify connection. Please try again.")}finally{D.textContent=e,D.disabled=!1}}),d.addEventListener("click",()=>{navigator.clipboard.writeText(M).then(()=>{d.textContent="Copied!",setTimeout(()=>{d.textContent="Copy Token"},2e3)},()=>{d.textContent="Failed",setTimeout(()=>{d.textContent="Copy Token"},2e3)})}),c.addEventListener("click",()=>{b(),n()}),F(),L.focus(),new URLSearchParams(window.location.search).get("session")==="uploaded"){const e=window.location.pathname+(window.location.hash||"");window.history.replaceState({},"",e),ce().then(i=>{i.connected?h("assistant","Handshake connected successfully."):h("assistant",'Could not verify connection. Try the "Check connection" button.')}).catch(()=>{h("assistant",'Could not verify connection. Try the "Check connection" button.')})}let C=null,P=null;function j(){ce().then(e=>{e.connected&&e.updatedAt&&(P!==null&&e.updatedAt!==P&&h("assistant","Handshake connected successfully."),P=e.updatedAt)}).catch(()=>{})}function U(){C||(C=setInterval(j,6e4))}function _(){C&&(clearInterval(C),C=null)}document.visibilityState==="visible"&&U(),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"?U():_()})}const Ee=document.getElementById("app");function xe(){_e(Ee,()=>{Se(),me()})}function me(){Ne(Ee,()=>{xe()})}Le(()=>{me()});Te()?xe():me();
