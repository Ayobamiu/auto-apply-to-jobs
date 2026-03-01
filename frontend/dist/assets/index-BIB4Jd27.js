(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))c(a);new MutationObserver(a=>{for(const o of a)if(o.type==="childList")for(const v of o.addedNodes)v.tagName==="LINK"&&v.rel==="modulepreload"&&c(v)}).observe(document,{childList:!0,subtree:!0});function s(a){const o={};return a.integrity&&(o.integrity=a.integrity),a.referrerPolicy&&(o.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?o.credentials="include":a.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function c(a){if(a.ep)return;a.ep=!0;const o=s(a);fetch(a.href,o)}})();const ae="";let O=null;function $e(t){O=t}function G(){return localStorage.getItem("token")}function Ce(t){localStorage.setItem("token",t)}function de(){localStorage.removeItem("token")}function Ae(){return!!G()}function Pe(){const t=G();if(!t)return null;try{return JSON.parse(atob(t.split(".")[1])).sub??null}catch{return null}}async function A(t,n={}){const s={"Content-Type":"application/json",...n.headers??{}},c=G();c&&(s.Authorization=`Bearer ${c}`);const a=await fetch(`${ae}${t}`,{...n,headers:s});if(a.status===401)throw de(),O==null||O(),new Error("Session expired. Please sign in again.");const o=await a.json();if(!a.ok)throw new Error(o.error||o.message||`Request failed (${a.status})`);return o}async function De(t,n){return A("/auth/register",{method:"POST",body:JSON.stringify({email:t,password:n})})}async function Ee(t,n){const s=await A("/auth/login",{method:"POST",body:JSON.stringify({email:t,password:n})});return s.token&&Ce(s.token),s}async function Re(t){const n=G(),s={};n&&(s.Authorization=`Bearer ${n}`);const c=new FormData;c.append("resume",t);const a=await fetch(`${ae}/profile/from-resume`,{method:"POST",headers:s,body:c});if(a.status===401)throw de(),O==null||O(),new Error("Session expired. Please sign in again.");const o=await a.json();if(!a.ok)throw new Error(o.error||o.message||`Upload failed (${a.status})`);return o}async function Ue(t){const n=G(),s={};n&&(s.Authorization=`Bearer ${n}`);const c=new FormData;c.append("transcript",t);const a=await fetch(`${ae}/users/me/transcript`,{method:"POST",headers:s,body:c});if(a.status===401)throw de(),O==null||O(),new Error("Session expired. Please sign in again.");const o=await a.json();if(!a.ok)throw new Error(o.error||o.message||`Upload failed (${a.status})`);return o}async function Oe(t,n=[]){return A("/chat",{method:"POST",body:JSON.stringify({message:t,messages:n})})}async function He(t){return A(`/pipeline/jobs/${encodeURIComponent(t)}`)}async function qe(t){return A(`/pipeline/jobs/${encodeURIComponent(t)}/artifacts`)}async function Ne(t,n){return A(`/pipeline/jobs/${encodeURIComponent(t)}/artifacts/resume`,{method:"PUT",body:JSON.stringify(n)})}async function Me(t,n){return A(`/pipeline/jobs/${encodeURIComponent(t)}/artifacts/cover`,{method:"PUT",body:JSON.stringify({text:n})})}async function Fe(t){return A(`/pipeline/jobs/${encodeURIComponent(t)}/approve`,{method:"POST"})}async function ke(t,n){const s=`/pipeline/jobs/${encodeURIComponent(t)}/artifacts/${n}?format=pdf`,c=G(),a={};c&&(a.Authorization=`Bearer ${c}`);const o=await fetch(ae+s,{headers:a});if(!o.ok)throw new Error(o.status===401?"Session expired":`Download failed: ${o.status}`);const v=await o.blob(),h=n==="resume"?"resume.pdf":"cover-letter.pdf",p=document.createElement("a");p.href=URL.createObjectURL(v),p.download=h,p.click(),URL.revokeObjectURL(p.href)}async function Se(t,n){const s=`/pipeline/jobs/${encodeURIComponent(t)}/applied-artifacts/${n}?format=pdf`,c=G(),a={};c&&(a.Authorization=`Bearer ${c}`);const o=await fetch(ae+s,{headers:a});if(!o.ok)throw new Error(o.status===401?"Session expired":o.status===404?"No applied document":`Download failed: ${o.status}`);const v=await o.blob(),h=n==="resume"?"resume.pdf":"cover-letter.pdf",p=document.createElement("a");p.href=URL.createObjectURL(v),p.download=h,p.click(),URL.revokeObjectURL(p.href)}async function je(){return A("/settings")}async function Je(t){return A("/settings",{method:"PUT",body:JSON.stringify(t)})}async function pe(){return A("/handshake/session/status")}function _e(t,n){t.innerHTML=`
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
  `;let s=!1;const c=document.getElementById("auth-form"),a=document.getElementById("auth-email"),o=document.getElementById("auth-password"),v=document.getElementById("auth-submit"),h=document.getElementById("auth-toggle-text"),p=document.getElementById("auth-toggle-btn"),P=document.getElementById("auth-error");p.addEventListener("click",()=>{s=!s,v.textContent=s?"Sign Up":"Sign In",h.textContent=s?"Already have an account?":"Don't have an account?",p.textContent=s?"Sign In":"Sign Up",P.hidden=!0}),c.addEventListener("submit",async K=>{K.preventDefault(),P.hidden=!0,v.disabled=!0,v.textContent=s?"Signing up...":"Signing in...";try{s?(await De(a.value.trim(),o.value),await Ee(a.value.trim(),o.value)):await Ee(a.value.trim(),o.value),n()}catch(E){P.textContent=E instanceof Error?E.message:"Authentication failed",P.hidden=!1}finally{v.disabled=!1,v.textContent=s?"Sign Up":"Sign In"}})}function x(t){const n=document.createElement("div");return n.textContent=t,n.innerHTML}function xe(t,n){return t[n]}function g(t,n){const s=t[n];return typeof s=="string"?s:""}function fe(t,n){const s=t[n];return Array.isArray(s)?s:[]}function Ke(t,n){const s=n&&typeof n=="object"?n:{},c=xe(s,"basics")||{},a=fe(s,"work"),o=fe(s,"education"),v=xe(s,"skills");let h=[];if(Array.isArray(v))h=v.map(m=>String(typeof m=="string"?m:(m==null?void 0:m.name)??"").trim()).filter(Boolean);else if(typeof v=="object"&&v!==null&&!Array.isArray(v)){const m=v;Array.isArray(m.keywords)&&(h=m.keywords.map(l=>String(l)).filter(Boolean))}const p=a.length?a:[{}],P=o.length?o:[{}],K=document.createElement("div");K.className="resume-form",K.innerHTML=`
    <div class="resume-form-section">
      <label class="resume-form-label">Name</label>
      <input type="text" id="rf-name" class="resume-form-input" value="${x(g(c,"name"))}" placeholder="Full name" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Email</label>
      <input type="email" id="rf-email" class="resume-form-input" value="${x(g(c,"email"))}" placeholder="email@example.com" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Phone</label>
      <input type="text" id="rf-phone" class="resume-form-input" value="${x(g(c,"phone"))}" placeholder="Phone" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Title / Label</label>
      <input type="text" id="rf-label" class="resume-form-input" value="${x(g(c,"label"))}" placeholder="e.g. Software Engineer" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Summary</label>
      <textarea id="rf-summary" class="resume-form-textarea" rows="3" placeholder="Short professional summary">${x(g(c,"summary"))}</textarea>
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
      <textarea id="rf-skills" class="resume-form-textarea" rows="3" placeholder="e.g. JavaScript, Node.js">${x(h.join(`
`))}</textarea>
    </div>
  `,t.appendChild(K);const E=document.getElementById("rf-work-list"),te=document.getElementById("rf-education-list");function L(m,l){const f=document.createElement("div");f.className="resume-form-entry",f.dataset.index=String(m);const I=g(l,"position")||g(l,"title"),T=g(l,"name")||g(l,"company"),k=fe(l,"highlights"),D=g(l,"summary"),R=k.length?k.join(`
`):D;f.innerHTML=`
      <div class="resume-form-row">
        <input type="text" class="rf-work-company" placeholder="Company" value="${x(T)}" />
        <input type="text" class="rf-work-position" placeholder="Position" value="${x(I)}" />
        <button type="button" class="rf-remove-work review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-work-start" placeholder="Start (e.g. 2020)" value="${x(g(l,"startDate"))}" />
        <input type="text" class="rf-work-end" placeholder="End (e.g. 2023)" value="${x(g(l,"endDate"))}" />
      </div>
      <textarea class="rf-work-highlights" rows="2" placeholder="Bullet points (one per line)">${x(R)}</textarea>
    `,E.appendChild(f),f.querySelector(".rf-remove-work").addEventListener("click",()=>{f.remove()})}function ne(m,l){const f=document.createElement("div");f.className="resume-form-entry",f.dataset.index=String(m);const I=g(l,"institution")||g(l,"school"),T=g(l,"area")||g(l,"degree");f.innerHTML=`
      <div class="resume-form-row">
        <input type="text" class="rf-edu-institution" placeholder="School" value="${x(I)}" />
        <input type="text" class="rf-edu-area" placeholder="Degree / Area" value="${x(T)}" />
        <button type="button" class="rf-remove-edu review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-edu-start" placeholder="Start year" value="${x(g(l,"startDate"))}" />
        <input type="text" class="rf-edu-end" placeholder="End year" value="${x(g(l,"endDate"))}" />
      </div>
    `,te.appendChild(f),f.querySelector(".rf-remove-edu").addEventListener("click",()=>{f.remove()})}p.forEach((m,l)=>L(l,m)),P.forEach((m,l)=>ne(l,m)),document.getElementById("rf-add-work").addEventListener("click",()=>{L(E.children.length,{})}),document.getElementById("rf-add-education").addEventListener("click",()=>{ne(te.children.length,{})});function W(){const m=document.getElementById("rf-name").value.trim(),l=document.getElementById("rf-email").value.trim(),f=document.getElementById("rf-phone").value.trim(),I=document.getElementById("rf-label").value.trim(),T=document.getElementById("rf-summary").value.trim(),k={};m&&(k.name=m),l&&(k.email=l),f&&(k.phone=f),I&&(k.label=I),T&&(k.summary=T);const D=[];E.querySelectorAll(".resume-form-entry").forEach(S=>{var Q,$,H,V,j,X,e,i,r,d;const u=($=(Q=S.querySelector(".rf-work-company"))==null?void 0:Q.value)==null?void 0:$.trim(),Y=(V=(H=S.querySelector(".rf-work-position"))==null?void 0:H.value)==null?void 0:V.trim(),B=(X=(j=S.querySelector(".rf-work-start"))==null?void 0:j.value)==null?void 0:X.trim(),U=(i=(e=S.querySelector(".rf-work-end"))==null?void 0:e.value)==null?void 0:i.trim(),M=(d=(r=S.querySelector(".rf-work-highlights"))==null?void 0:r.value)==null?void 0:d.trim(),F=M?M.split(/\n/).map(C=>C.trim()).filter(Boolean):[];D.push({name:u||void 0,position:Y||void 0,startDate:B||void 0,endDate:U||void 0,highlights:F.length?F:void 0})});const R=[];te.querySelectorAll(".resume-form-entry").forEach(S=>{var M,F,Q,$,H,V,j,X;const u=(F=(M=S.querySelector(".rf-edu-institution"))==null?void 0:M.value)==null?void 0:F.trim(),Y=($=(Q=S.querySelector(".rf-edu-area"))==null?void 0:Q.value)==null?void 0:$.trim(),B=(V=(H=S.querySelector(".rf-edu-start"))==null?void 0:H.value)==null?void 0:V.trim(),U=(X=(j=S.querySelector(".rf-edu-end"))==null?void 0:j.value)==null?void 0:X.trim();R.push({institution:u||void 0,area:Y||void 0,startDate:B||void 0,endDate:U||void 0})});const se=document.getElementById("rf-skills").value.trim(),ue=se?se.split(/[\n,]/).map(S=>S.trim()).filter(Boolean):[];return{...s,basics:Object.keys(k).length?k:{name:"",email:""},work:D,education:R,skills:ue}}function N(){const l=W().basics||{},f=String(l.name??"").trim(),I=String(l.email??"").trim();return!f&&!I?"Name or email is required.":null}return{getValue:W,validate:N}}const We=50,ve=3e3,Le=100;function Ie(){return`chat_history_${Pe()??"unknown"}`}function Ye(){try{const t=localStorage.getItem(Ie());return t?JSON.parse(t):[]}catch{return[]}}function Ve(t){localStorage.setItem(Ie(),JSON.stringify(t))}function z(t){const n=document.createElement("div");return n.textContent=t,n.innerHTML}function Xe(t){let n=z(t);return n=n.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>"),n=n.replace(/\n/g,"<br>"),n}function ze(t,n){const s=Ye();let c=null,a=0,o=null,v=null,h=null,p=null,P=null;const K=localStorage.getItem("token")??"";t.innerHTML=`
    <div class="chat-layout">
      <header class="chat-header">
        <h1 class="chat-header-title">Auto Apply</h1>
        <div class="chat-header-actions">
          <label class="header-label">Automation: <select id="automation-level" class="header-select" title="Review: pause to edit before apply. Full: apply automatically.">
            <option value="review">Review before apply</option>
            <option value="full">Full auto</option>
          </select></label>
          <button id="upload-resume-pdf-btn" class="header-btn" title="Set profile from resume PDF">Upload resume PDF</button>
          <input type="file" id="upload-resume-pdf-input" accept=".pdf,application/pdf" hidden />
          <button id="upload-transcript-btn" class="header-btn" title="Upload transcript for jobs that require it">Upload transcript</button>
          <input type="file" id="upload-transcript-input" accept=".pdf,application/pdf" hidden />
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
  `;const E=document.getElementById("chat-messages"),te=document.getElementById("chat-form"),L=document.getElementById("chat-input"),ne=document.getElementById("chat-send"),W=document.getElementById("automation-level"),N=document.getElementById("check-connection-btn"),m=document.getElementById("copy-token-btn"),l=document.getElementById("logout-btn"),f=document.getElementById("upload-resume-pdf-btn"),I=document.getElementById("upload-resume-pdf-input"),T=document.getElementById("upload-transcript-btn"),k=document.getElementById("upload-transcript-input");je().then(e=>{W.value=e.automationLevel}).catch(()=>{}),W.addEventListener("change",()=>{const e=W.value;Je({automationLevel:e}).catch(()=>{W.value=e==="full"?"review":"full"})});function D(){E.scrollTop=E.scrollHeight}function R(){h==null||h.remove(),h=null,v=null}function se(){p==null||p.remove(),p=null,P=null}function ue(e,i,r){var re,ie,ce;if(P===e)return;se(),P=e;const d=i.resume&&typeof i.resume=="object",C=(re=i.coverLetter)==null?void 0:re.text,b=document.createElement("div");b.id="applied-card-container",b.className="chat-bubble chat-bubble-assistant review-card applied-artifacts-card";const q=d?(()=>{const w=i.resume.basics,Z=(w==null?void 0:w.name)??"",J=(w==null?void 0:w.label)??"",_=i.resume.work,ee=Array.isArray(_)?_.length:0;return`${Z}${J?` · ${J}`:""}${ee?` · ${ee} experience(s)`:""}`})():"",oe=C?i.coverLetter.text.slice(0,200)+(i.coverLetter.text.length>200?"…":""):"";b.innerHTML=`
      <div class="chat-bubble-content">
        <div class="review-card-header">
          <strong>Applied with these documents</strong>
          <div class="review-job-title">${z(r)}</div>
        </div>
        ${d?`<div class="applied-section"><div class="applied-summary">${z(q)}</div><button type="button" class="review-btn applied-download-resume">Download resume PDF</button></div>`:""}
        ${C?`<div class="applied-section"><div class="applied-cover-preview">${z(oe)}</div><button type="button" class="review-btn applied-download-cover">Download cover PDF</button></div>`:""}
      </div>
    `,p=b,E.appendChild(b),D(),(ie=b.querySelector(".applied-download-resume"))==null||ie.addEventListener("click",()=>{Se(e,"resume").catch(w=>u("assistant",w instanceof Error?w.message:"Download failed."))}),(ce=b.querySelector(".applied-download-cover"))==null||ce.addEventListener("click",()=>{Se(e,"cover").catch(w=>u("assistant",w instanceof Error?w.message:"Download failed."))})}function ye(e,i){var we;if(v===e)return;R(),v=e;const r=i.requiredSections??["resume","coverLetter"],d=r.includes("resume"),C=r.includes("coverLetter"),b=document.createElement("div");b.id="review-card-container",b.className="chat-bubble chat-bubble-assistant review-card";let q=((we=i.cover)==null?void 0:we.text)??"";const oe=d?`<details class="review-section">
          <summary>Resume</summary>
          <div id="review-resume-form"></div>
          <div id="review-resume-error" class="review-error" hidden></div>
        </details>`:"",re=C?`<details class="review-section">
          <summary>Cover letter</summary>
          <textarea id="review-cover" class="review-textarea" rows="10" spellcheck="false"></textarea>
          <div id="review-cover-error" class="review-error" hidden></div>
        </details>`:"",ie=d?'<button type="button" id="review-download-resume" class="review-btn">Download resume PDF</button>':"",ce=C?'<button type="button" id="review-download-cover" class="review-btn">Download cover PDF</button>':"",w=document.createElement("div");w.className="chat-bubble-content",w.innerHTML=`
      <div class="review-card-header">
        <strong>Review before apply</strong>
        <div class="review-job-title">${z(i.jobTitle)}</div>
      </div>
      ${oe}
      ${re}
      <div class="review-actions">
        <button type="button" id="review-save" class="review-btn">Save edits</button>
        ${ie}
        ${ce}
        <button type="button" id="review-approve" class="review-btn review-btn-primary">Approve and apply</button>
        <button type="button" id="review-cancel" class="review-btn">Cancel</button>
      </div>
      <div id="review-action-error" class="review-error" hidden></div>
    `,b.appendChild(w),h=b,E.appendChild(b),D();let Z=null;if(d){const y=document.getElementById("review-resume-form");Z=Ke(y,i.resume??{})}const J=document.getElementById("review-cover");J&&(J.value=q);function _(y,le){const me=document.getElementById(y);me&&(me.textContent=le,me.hidden=!1)}function ee(y){const le=document.getElementById(y);le&&(le.hidden=!0)}document.getElementById("review-save").addEventListener("click",async()=>{ee("review-resume-error"),ee("review-cover-error");try{if(d&&Z){const y=Z.validate();if(y){_("review-resume-error",y);return}await Ne(e,Z.getValue())}C&&J&&(await Me(e,J.value.trim()||" "),q=J.value)}catch(y){_("review-resume-error",y instanceof Error?y.message:"Save failed.")}});const ge=document.getElementById("review-download-resume");ge&&ge.addEventListener("click",async()=>{try{await ke(e,"resume")}catch(y){_("review-action-error",y instanceof Error?y.message:"Download failed.")}});const be=document.getElementById("review-download-cover");be&&be.addEventListener("click",async()=>{try{await ke(e,"cover")}catch(y){_("review-action-error",y instanceof Error?y.message:"Download failed.")}}),document.getElementById("review-approve").addEventListener("click",async()=>{ee("review-action-error");try{await Fe(e),R(),o&&M(o)}catch(y){_("review-action-error",y instanceof Error?y.message:"Approve failed.")}}),document.getElementById("review-cancel").addEventListener("click",()=>{R(),u("assistant","No problem. You can download the resume and cover letter to apply manually.")})}function S(){h==null||h.remove(),p==null||p.remove(),E.innerHTML=s.map(e=>`<div class="chat-bubble chat-bubble-${e.role}">
            <div class="chat-bubble-content">${Xe(e.content)}</div>
            ${e.timestamp?`<span class="chat-bubble-time">${new Date(e.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>`:""}
          </div>`).join(""),h&&E.appendChild(h),p&&E.appendChild(p),D()}function u(e,i){s.push({role:e,content:i,timestamp:new Date().toISOString()}),Ve(s),S()}function Y(e){const i=document.getElementById("typing-indicator");if(i){const d=i.querySelector(".chat-bubble-content");d&&(d.innerHTML=e?`<span class="chat-phase">${z(e)}</span>`:'<span class="dot"></span><span class="dot"></span><span class="dot"></span>'),D();return}const r=document.createElement("div");r.className="chat-bubble chat-bubble-assistant chat-typing",r.id="typing-indicator",r.innerHTML=e?`<div class="chat-bubble-content"><span class="chat-phase">${z(e)}</span></div>`:'<div class="chat-bubble-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>',E.appendChild(r),D()}function B(){var e;(e=document.getElementById("typing-indicator"))==null||e.remove()}function U(){c&&(clearTimeout(c),c=null),o=null,a=0}function M(e){U(),o=e,a=0,Y("Starting...");function i(){if(!o||a>=Le){a>=Le&&u("assistant",`I've been checking for a while. You can ask "check status" anytime to get an update.`),B(),U();return}a++,He(o).then(r=>{var d,C;if(r.status==="awaiting_approval"){B(),qe(o).then(b=>ye(o,b)).catch(()=>u("assistant","Could not load artifacts for review.")),c=setTimeout(i,ve);return}if(r.status==="done"){B(),R();const b=r.userMessage??(r.error?`Failed: ${r.error}`:"Pipeline completed.");u("assistant",b);const q=(d=r.result)==null?void 0:d.appliedArtifacts,oe=r.result&&typeof r.result=="object"&&r.result.job&&typeof r.result.job=="object"?String(r.result.job.title??""):"";q&&(q.resume||(C=q.coverLetter)!=null&&C.text)&&ue(o,q,oe||"Job"),U();return}if(r.status==="failed"){B(),R(),u("assistant",`Failed: ${r.error??"Unknown error"}`),U();return}Y(r.phase??"Processing..."),c=setTimeout(i,ve)}).catch(()=>{B(),U()})}c=setTimeout(i,ve)}async function F(){var i;const e=L.value.trim();if(e){u("user",e),L.value="",L.style.height="auto",ne.disabled=!0,Y();try{const r=s.slice(-We),d=await Oe(e,r);B(),u("assistant",d.reply),(i=d.meta)!=null&&i.pollStatus&&d.meta.jobId&&M(d.meta.jobId)}catch(r){B();const d=r instanceof Error?r.message:"Something went wrong.";u("assistant",`Error: ${d}`)}finally{ne.disabled=!1,L.focus()}}}if(te.addEventListener("submit",e=>{e.preventDefault(),F()}),L.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),F())}),L.addEventListener("input",()=>{L.style.height="auto",L.style.height=Math.min(L.scrollHeight,200)+"px"}),N.addEventListener("click",async()=>{const e=N.textContent;N.textContent="Checking…",N.disabled=!0;try{(await pe()).connected?u("assistant","Handshake connected successfully."):u("assistant","Handshake is not connected. Use the browser extension to upload your session.")}catch{u("assistant","Could not verify connection. Please try again.")}finally{N.textContent=e,N.disabled=!1}}),m.addEventListener("click",()=>{navigator.clipboard.writeText(K).then(()=>{m.textContent="Copied!",setTimeout(()=>{m.textContent="Copy Token"},2e3)},()=>{m.textContent="Failed",setTimeout(()=>{m.textContent="Copy Token"},2e3)})}),f.addEventListener("click",()=>I.click()),I.addEventListener("change",async()=>{var r;const e=(r=I.files)==null?void 0:r[0];if(I.value="",!e)return;if(!e.name.toLowerCase().endsWith(".pdf")&&e.type!=="application/pdf"){u("assistant","Please choose a PDF file.");return}const i=f.textContent;f.textContent="Uploading…",f.disabled=!0;try{await Re(e),u("assistant","Profile updated from your resume PDF. You can send a job URL to apply.")}catch(d){u("assistant",d instanceof Error?d.message:"Upload failed.")}finally{f.textContent=i??"Upload resume PDF",f.disabled=!1}}),T.addEventListener("click",()=>k.click()),k.addEventListener("change",async()=>{var r;const e=(r=k.files)==null?void 0:r[0];if(k.value="",!e)return;if(!e.name.toLowerCase().endsWith(".pdf")&&e.type!=="application/pdf"){u("assistant","Please choose a PDF file.");return}const i=T.textContent;T.textContent="Uploading…",T.disabled=!0;try{await Ue(e),u("assistant","Transcript saved. I'll use it when a job requires one.")}catch(d){u("assistant",d instanceof Error?d.message:"Upload failed.")}finally{T.textContent=i??"Upload transcript",T.disabled=!1}}),l.addEventListener("click",()=>{U(),n()}),S(),L.focus(),new URLSearchParams(window.location.search).get("session")==="uploaded"){const e=window.location.pathname+(window.location.hash||"");window.history.replaceState({},"",e),pe().then(i=>{i.connected?u("assistant","Handshake connected successfully."):u("assistant",'Could not verify connection. Try the "Check connection" button.')}).catch(()=>{u("assistant",'Could not verify connection. Try the "Check connection" button.')})}let $=null,H=null;function V(){pe().then(e=>{e.connected&&e.updatedAt&&(H!==null&&e.updatedAt!==H&&u("assistant","Handshake connected successfully."),H=e.updatedAt)}).catch(()=>{})}function j(){$||($=setInterval(V,6e4))}function X(){$&&(clearInterval($),$=null)}document.visibilityState==="visible"&&j(),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"?j():X()})}const Te=document.getElementById("app");function Be(){ze(Te,()=>{de(),he()})}function he(){_e(Te,()=>{Be()})}$e(()=>{he()});Ae()?Be():he();
