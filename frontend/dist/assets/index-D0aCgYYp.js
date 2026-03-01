(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const a of document.querySelectorAll('link[rel="modulepreload"]'))l(a);new MutationObserver(a=>{for(const o of a)if(o.type==="childList")for(const m of o.addedNodes)m.tagName==="LINK"&&m.rel==="modulepreload"&&l(m)}).observe(document,{childList:!0,subtree:!0});function i(a){const o={};return a.integrity&&(o.integrity=a.integrity),a.referrerPolicy&&(o.referrerPolicy=a.referrerPolicy),a.crossOrigin==="use-credentials"?o.credentials="include":a.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function l(a){if(a.ep)return;a.ep=!0;const o=i(a);fetch(a.href,o)}})();const le="";let T=null;function Ye(n){T=n}function Z(){return localStorage.getItem("token")}function Ve(n){localStorage.setItem("token",n)}function ve(){localStorage.removeItem("token")}function Ke(){return!!Z()}async function S(n,t={}){const i={"Content-Type":"application/json",...t.headers??{}},l=Z();l&&(i.Authorization=`Bearer ${l}`);const a=await fetch(`${le}${n}`,{...t,headers:i});if(a.status===401)throw ve(),T==null||T(),new Error("Session expired. Please sign in again.");const o=await a.json();if(!a.ok)throw new Error(o.error||o.message||`Request failed (${a.status})`);return o}async function Xe(n,t){return S("/auth/register",{method:"POST",body:JSON.stringify({email:n,password:t})})}async function Re(n,t){const i=await S("/auth/login",{method:"POST",body:JSON.stringify({email:n,password:t})});return i.token&&Ve(i.token),i}async function Ge(){return S("/profile")}async function ze(){return S("/users/me/transcript")}async function Qe(n){const t=Z(),i={};t&&(i.Authorization=`Bearer ${t}`);const l=new FormData;l.append("resume",n);const a=await fetch(`${le}/profile/from-resume`,{method:"POST",headers:i,body:l});if(a.status===401)throw ve(),T==null||T(),new Error("Session expired. Please sign in again.");const o=await a.json();if(!a.ok)throw new Error(o.error||o.message||`Upload failed (${a.status})`);return o}async function Ze(n){const t=Z(),i={};t&&(i.Authorization=`Bearer ${t}`);const l=new FormData;l.append("transcript",n);const a=await fetch(`${le}/users/me/transcript`,{method:"POST",headers:i,body:l});if(a.status===401)throw ve(),T==null||T(),new Error("Session expired. Please sign in again.");const o=await a.json();if(!a.ok)throw new Error(o.error||o.message||`Upload failed (${a.status})`);return o}async function De(){return S("/users/me/resume")}async function et(n){const t=Z(),i={};t&&(i.Authorization=`Bearer ${t}`);const l=new FormData;l.append("resume",n);const a=await fetch(`${le}/users/me/resume`,{method:"POST",headers:i,body:l});if(a.status===401)throw ve(),T==null||T(),new Error("Session expired. Please sign in again.");if(!(a.headers.get("content-type")??"").includes("application/json")){const v=await a.text();throw v.startsWith("<")?new Error("Server returned HTML — is the API running and the dev proxy set up? (e.g. proxy /users to backend)"):new Error(v||`Upload failed (${a.status})`)}const m=await a.json();if(!a.ok)throw new Error(m.error||m.message||`Upload failed (${a.status})`);return m}async function tt(n){return S("/users/me/resume",{method:"POST",body:JSON.stringify({resumeText:n})})}async function nt(n){return S("/users/me/resume",{method:"PUT",body:JSON.stringify(n)})}async function at(n=50){const t=new URLSearchParams;return t.set("limit",String(n)),S(`/chat/messages?${t.toString()}`)}async function st(n,t=[]){return S("/chat",{method:"POST",body:JSON.stringify({message:n,messages:t})})}async function ot(n){return S(`/pipeline/jobs/${encodeURIComponent(n)}`)}async function rt(n){return S(`/pipeline/jobs/${encodeURIComponent(n)}/artifacts`)}async function it(n,t){return S(`/pipeline/jobs/${encodeURIComponent(n)}/artifacts/resume`,{method:"PUT",body:JSON.stringify(t)})}async function ct(n,t){return S(`/pipeline/jobs/${encodeURIComponent(n)}/artifacts/cover`,{method:"PUT",body:JSON.stringify({text:t})})}async function lt(n){return S(`/pipeline/jobs/${encodeURIComponent(n)}/approve`,{method:"POST"})}async function Ue(n){return S(`/pipeline/jobs/${encodeURIComponent(n)}/cancel`,{method:"POST"})}async function Me(n,t){const i=`/pipeline/jobs/${encodeURIComponent(n)}/artifacts/${t}?format=pdf`,l=Z(),a={};l&&(a.Authorization=`Bearer ${l}`);const o=await fetch(le+i,{headers:a});if(!o.ok)throw new Error(o.status===401?"Session expired":`Download failed: ${o.status}`);const m=await o.blob(),v=t==="resume"?"resume.pdf":"cover-letter.pdf",f=document.createElement("a");f.href=URL.createObjectURL(m),f.download=v,f.click(),URL.revokeObjectURL(f.href)}async function Oe(n,t){const i=`/pipeline/jobs/${encodeURIComponent(n)}/applied-artifacts/${t}?format=pdf`,l=Z(),a={};l&&(a.Authorization=`Bearer ${l}`);const o=await fetch(le+i,{headers:a});if(!o.ok)throw new Error(o.status===401?"Session expired":o.status===404?"No applied document":`Download failed: ${o.status}`);const m=await o.blob(),v=t==="resume"?"resume.pdf":"cover-letter.pdf",f=document.createElement("a");f.href=URL.createObjectURL(m),f.download=v,f.click(),URL.revokeObjectURL(f.href)}async function dt(){return S("/settings")}async function ut(n){return S("/settings",{method:"PUT",body:JSON.stringify(n)})}async function ke(){return S("/handshake/session/status")}function mt(n,t){n.innerHTML=`
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
  `;let i=!1;const l=document.getElementById("auth-form"),a=document.getElementById("auth-email"),o=document.getElementById("auth-password"),m=document.getElementById("auth-submit"),v=document.getElementById("auth-toggle-text"),f=document.getElementById("auth-toggle-btn"),F=document.getElementById("auth-error");f.addEventListener("click",()=>{i=!i,m.textContent=i?"Sign Up":"Sign In",v.textContent=i?"Already have an account?":"Don't have an account?",f.textContent=i?"Sign In":"Sign Up",F.hidden=!0}),l.addEventListener("submit",async V=>{V.preventDefault(),F.hidden=!0,m.disabled=!0,m.textContent=i?"Signing up...":"Signing in...";try{i?(await Xe(a.value.trim(),o.value),await Re(a.value.trim(),o.value)):await Re(a.value.trim(),o.value),t()}catch(k){F.textContent=k instanceof Error?k.message:"Authentication failed",F.hidden=!1}finally{m.disabled=!1,m.textContent=i?"Sign Up":"Sign In"}})}function B(n){const t=document.createElement("div");return t.textContent=n,t.innerHTML}function Fe(n,t){return n[t]}function E(n,t){const i=n[t];return typeof i=="string"?i:""}function xe(n,t){const i=n[t];return Array.isArray(i)?i:[]}function Ne(n,t){const i=t&&typeof t=="object"?t:{},l=Fe(i,"basics")||{},a=xe(i,"work"),o=xe(i,"education"),m=Fe(i,"skills");let v=[];if(Array.isArray(m))v=m.map(p=>String(typeof p=="string"?p:(p==null?void 0:p.name)??"").trim()).filter(Boolean);else if(typeof m=="object"&&m!==null&&!Array.isArray(m)){const p=m;Array.isArray(p.keywords)&&(v=p.keywords.map(d=>String(d)).filter(Boolean))}const f=a.length?a:[{}],F=o.length?o:[{}],V=document.createElement("div");V.className="resume-form",V.innerHTML=`
    <div class="resume-form-section">
      <label class="resume-form-label">Name</label>
      <input type="text" id="rf-name" class="resume-form-input" value="${B(E(l,"name"))}" placeholder="Full name" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Email</label>
      <input type="email" id="rf-email" class="resume-form-input" value="${B(E(l,"email"))}" placeholder="email@example.com" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Phone</label>
      <input type="text" id="rf-phone" class="resume-form-input" value="${B(E(l,"phone"))}" placeholder="Phone" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Title / Label</label>
      <input type="text" id="rf-label" class="resume-form-input" value="${B(E(l,"label"))}" placeholder="e.g. Software Engineer" />
    </div>
    <div class="resume-form-section">
      <label class="resume-form-label">Summary</label>
      <textarea id="rf-summary" class="resume-form-textarea" rows="3" placeholder="Short professional summary">${B(E(l,"summary"))}</textarea>
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
      <textarea id="rf-skills" class="resume-form-textarea" rows="3" placeholder="e.g. JavaScript, Node.js">${B(v.join(`
`))}</textarea>
    </div>
  `,n.appendChild(V);const k=document.getElementById("rf-work-list"),de=document.getElementById("rf-education-list");function P(p,d){const h=document.createElement("div");h.className="resume-form-entry",h.dataset.index=String(p);const I=E(d,"position")||E(d,"title"),_=E(d,"name")||E(d,"company"),C=xe(d,"highlights"),te=E(d,"summary"),ne=C.length?C.join(`
`):te;h.innerHTML=`
      <div class="resume-form-row">
        <input type="text" class="rf-work-company" placeholder="Company" value="${B(_)}" />
        <input type="text" class="rf-work-position" placeholder="Position" value="${B(I)}" />
        <button type="button" class="rf-remove-work review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-work-start" placeholder="Start (e.g. 2020)" value="${B(E(d,"startDate"))}" />
        <input type="text" class="rf-work-end" placeholder="End (e.g. 2023)" value="${B(E(d,"endDate"))}" />
      </div>
      <textarea class="rf-work-highlights" rows="2" placeholder="Bullet points (one per line)">${B(ne)}</textarea>
    `,k.appendChild(h),h.querySelector(".rf-remove-work").addEventListener("click",()=>{h.remove()})}function ue(p,d){const h=document.createElement("div");h.className="resume-form-entry",h.dataset.index=String(p);const I=E(d,"institution")||E(d,"school"),_=E(d,"area")||E(d,"degree");h.innerHTML=`
      <div class="resume-form-row">
        <input type="text" class="rf-edu-institution" placeholder="School" value="${B(I)}" />
        <input type="text" class="rf-edu-area" placeholder="Degree / Area" value="${B(_)}" />
        <button type="button" class="rf-remove-edu review-btn">Remove</button>
      </div>
      <div class="resume-form-row">
        <input type="text" class="rf-edu-start" placeholder="Start year" value="${B(E(d,"startDate"))}" />
        <input type="text" class="rf-edu-end" placeholder="End year" value="${B(E(d,"endDate"))}" />
      </div>
    `,de.appendChild(h),h.querySelector(".rf-remove-edu").addEventListener("click",()=>{h.remove()})}f.forEach((p,d)=>P(d,p)),F.forEach((p,d)=>ue(d,p)),document.getElementById("rf-add-work").addEventListener("click",()=>{P(k.children.length,{})}),document.getElementById("rf-add-education").addEventListener("click",()=>{ue(de.children.length,{})});function K(){const p=document.getElementById("rf-name").value.trim(),d=document.getElementById("rf-email").value.trim(),h=document.getElementById("rf-phone").value.trim(),I=document.getElementById("rf-label").value.trim(),_=document.getElementById("rf-summary").value.trim(),C={};p&&(C.name=p),d&&(C.email=d),h&&(C.phone=h),I&&(C.label=I),_&&(C.summary=_);const te=[];k.querySelectorAll(".resume-form-entry").forEach(x=>{var w,q,M,$,z,Q,he,ae,u,se;const pe=(q=(w=x.querySelector(".rf-work-company"))==null?void 0:w.value)==null?void 0:q.trim(),X=($=(M=x.querySelector(".rf-work-position"))==null?void 0:M.value)==null?void 0:$.trim(),b=(Q=(z=x.querySelector(".rf-work-start"))==null?void 0:z.value)==null?void 0:Q.trim(),G=(ae=(he=x.querySelector(".rf-work-end"))==null?void 0:he.value)==null?void 0:ae.trim(),N=(se=(u=x.querySelector(".rf-work-highlights"))==null?void 0:u.value)==null?void 0:se.trim(),j=N?N.split(/\n/).map(A=>A.trim()).filter(Boolean):[];te.push({name:pe||void 0,position:X||void 0,startDate:b||void 0,endDate:G||void 0,highlights:j.length?j:void 0})});const ne=[];de.querySelectorAll(".resume-form-entry").forEach(x=>{var N,j,w,q,M,$,z,Q;const pe=(j=(N=x.querySelector(".rf-edu-institution"))==null?void 0:N.value)==null?void 0:j.trim(),X=(q=(w=x.querySelector(".rf-edu-area"))==null?void 0:w.value)==null?void 0:q.trim(),b=($=(M=x.querySelector(".rf-edu-start"))==null?void 0:M.value)==null?void 0:$.trim(),G=(Q=(z=x.querySelector(".rf-edu-end"))==null?void 0:z.value)==null?void 0:Q.trim();ne.push({institution:pe||void 0,area:X||void 0,startDate:b||void 0,endDate:G||void 0})});const me=document.getElementById("rf-skills").value.trim(),ge=me?me.split(/[\n,]/).map(x=>x.trim()).filter(Boolean):[];return{...i,basics:Object.keys(C).length?C:{name:"",email:""},work:te,education:ne,skills:ge}}function ee(){const d=K().basics||{},h=String(d.name??"").trim(),I=String(d.email??"").trim();return!h&&!I?"Name or email is required.":null}return{getValue:K,validate:ee}}const pt=50,Le=3e3,qe=100;function J(n){const t=document.createElement("div");return t.textContent=n,t.innerHTML}function ft(n){let t=J(n);return t=t.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>"),t=t.replace(/\n/g,"<br>"),t}function vt(n,t){const i=[];let l=null,a=0,o=null,m=null,v=null,f=null,F=null;const V=localStorage.getItem("token")??"";n.innerHTML=`
    <div class="chat-layout">
      <header class="chat-header">
        <h1 class="chat-header-title">Auto Apply</h1>
        <div class="chat-header-actions">
          <label class="header-label">Automation: <select id="automation-level" class="header-select" title="Review: pause to edit before apply. Full: apply automatically.">
            <option value="review">Review before apply</option>
            <option value="full">Full auto</option>
          </select></label>
          <div class="header-menu-wrap">
            <button type="button" id="menu-btn" class="header-btn" aria-haspopup="true" aria-expanded="false">Menu</button>
            <div id="header-menu" class="header-menu" hidden>
              <button type="button" class="menu-item" data-action="preview-profile">Preview profile</button>
              <button type="button" class="menu-item" data-action="preview-resume">Preview resume</button>
              <button type="button" class="menu-item" data-action="preview-transcript">Preview transcript</button>
              <div class="menu-divider"></div>
              <button type="button" class="menu-item" data-action="upload-resume-pdf">Upload resume PDF</button>
              <input type="file" id="upload-resume-pdf-input" accept=".pdf,application/pdf" hidden />
              <button type="button" class="menu-item" data-action="upload-transcript">Upload transcript</button>
              <input type="file" id="upload-transcript-input" accept=".pdf,application/pdf" hidden />
              <button type="button" class="menu-item" data-action="base-resume">Base resume</button>
              <button type="button" class="menu-item" data-action="check-connection">Check connection</button>
              <button type="button" class="menu-item" data-action="copy-token">Copy Token</button>
              <div class="menu-divider"></div>
              <button type="button" class="menu-item menu-item-secondary" data-action="logout">Sign Out</button>
            </div>
          </div>
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

      <div id="base-resume-modal" class="base-resume-modal" hidden>
        <div class="base-resume-modal-content">
          <div class="base-resume-modal-header">
            <h2>Base resume</h2>
            <button type="button" id="base-resume-modal-close" class="header-btn">Close</button>
          </div>
          <div class="base-resume-upload">
            <p class="base-resume-hint">Upload a PDF or paste text to set your base resume. It will be tailored per job.</p>
            <div class="base-resume-upload-row">
              <input type="file" id="base-resume-file" accept=".pdf,application/pdf" />
              <button type="button" id="base-resume-upload-pdf" class="review-btn">Upload PDF</button>
            </div>
            <div class="base-resume-upload-row">
              <textarea id="base-resume-paste" class="review-textarea" rows="6" placeholder="Or paste resume text here..."></textarea>
              <button type="button" id="base-resume-save-text" class="review-btn">Save from text</button>
            </div>
            <div id="base-resume-upload-error" class="review-error" hidden></div>
          </div>
          <div class="base-resume-edit">
            <button type="button" id="base-resume-load-edit" class="review-btn">Load and edit</button>
            <button type="button" id="base-resume-save-edits" class="review-btn" hidden>Save edits</button>
            <div id="base-resume-form-container" class="base-resume-form-wrap" hidden></div>
            <div id="base-resume-edit-error" class="review-error" hidden></div>
          </div>
        </div>
      </div>

      <div id="preview-modal" class="base-resume-modal" hidden>
        <div class="base-resume-modal-content">
          <div class="base-resume-modal-header">
            <h2 id="preview-modal-title">Preview</h2>
            <button type="button" id="preview-modal-close" class="header-btn">Close</button>
          </div>
          <pre id="preview-modal-body" class="preview-modal-body"></pre>
        </div>
      </div>
    </div>
  `;const k=document.getElementById("chat-messages"),de=document.getElementById("chat-form"),P=document.getElementById("chat-input"),ue=document.getElementById("chat-send"),K=document.getElementById("automation-level"),ee=document.getElementById("menu-btn"),p=document.getElementById("header-menu"),d=document.getElementById("upload-resume-pdf-input"),h=document.getElementById("upload-transcript-input"),I=document.getElementById("preview-modal"),_=document.getElementById("preview-modal-close"),C=document.getElementById("preview-modal-title"),te=document.getElementById("preview-modal-body"),ne=document.querySelector('[data-action="logout"]'),me=document.getElementById("base-resume-modal"),ge=document.getElementById("base-resume-modal-close"),we=document.getElementById("base-resume-file"),x=document.getElementById("base-resume-upload-pdf"),pe=document.getElementById("base-resume-paste"),X=document.getElementById("base-resume-save-text"),b=document.getElementById("base-resume-upload-error"),G=document.getElementById("base-resume-load-edit"),N=document.getElementById("base-resume-save-edits"),j=document.getElementById("base-resume-form-container"),w=document.getElementById("base-resume-edit-error");let q=null;dt().then(e=>{K.value=e.automationLevel}).catch(()=>{}),K.addEventListener("change",()=>{const e=K.value;ut({automationLevel:e}).catch(()=>{K.value=e==="full"?"review":"full"})});function M(){k.scrollTop=k.scrollHeight}function $(){v==null||v.remove(),v=null,m=null}function z(){f==null||f.remove(),f=null,F=null}function Q(e,r,c){var U,re,be;if(F===e)return;z(),F=e;const s=r.resume&&typeof r.resume=="object",R=(U=r.coverLetter)==null?void 0:U.text,g=document.createElement("div");g.id="applied-card-container",g.className="chat-bubble chat-bubble-assistant review-card applied-artifacts-card";const O=s?(()=>{const L=r.resume.basics,ie=(L==null?void 0:L.name)??"",W=(L==null?void 0:L.label)??"",Y=r.resume.work,ce=Array.isArray(Y)?Y.length:0;return`${ie}${W?` · ${W}`:""}${ce?` · ${ce} experience(s)`:""}`})():"",D=R?r.coverLetter.text.slice(0,200)+(r.coverLetter.text.length>200?"…":""):"";g.innerHTML=`
      <div class="chat-bubble-content">
        <div class="review-card-header">
          <strong>Applied with these documents</strong>
          <div class="review-job-title">${J(c)}</div>
        </div>
        ${s?`<div class="applied-section"><div class="applied-summary">${J(O)}</div><button type="button" class="review-btn applied-download-resume">Download resume PDF</button></div>`:""}
        ${R?`<div class="applied-section"><div class="applied-cover-preview">${J(D)}</div><button type="button" class="review-btn applied-download-cover">Download cover PDF</button></div>`:""}
      </div>
    `,f=g,k.appendChild(g),M(),(re=g.querySelector(".applied-download-resume"))==null||re.addEventListener("click",()=>{Oe(e,"resume").catch(L=>u("assistant",L instanceof Error?L.message:"Download failed."))}),(be=g.querySelector(".applied-download-cover"))==null||be.addEventListener("click",()=>{Oe(e,"cover").catch(L=>u("assistant",L instanceof Error?L.message:"Download failed."))})}function he(e,r){var Ae;if(m===e)return;$(),m=e;const c=r.requiredSections??["resume","coverLetter"],s=c.includes("resume"),R=c.includes("coverLetter"),g=document.createElement("div");g.id="review-card-container",g.className="chat-bubble chat-bubble-assistant review-card";let O=((Ae=r.cover)==null?void 0:Ae.text)??"";const D=s?`<details class="review-section">
          <summary>Resume</summary>
          <div id="review-resume-form"></div>
          <div id="review-resume-error" class="review-error" hidden></div>
        </details>`:"",U=R?`<details class="review-section">
          <summary>Cover letter</summary>
          <textarea id="review-cover" class="review-textarea" rows="10" spellcheck="false"></textarea>
          <div id="review-cover-error" class="review-error" hidden></div>
        </details>`:"",re=s?'<button type="button" id="review-download-resume" class="review-btn">Download resume PDF</button>':"",be=R?'<button type="button" id="review-download-cover" class="review-btn">Download cover PDF</button>':"",L=document.createElement("div");L.className="chat-bubble-content",L.innerHTML=`
      <div class="review-card-header">
        <strong>Review before apply</strong>
        <div class="review-job-title">${J(r.jobTitle)}</div>
      </div>
      ${D}
      ${U}
      <div class="review-actions">
        <button type="button" id="review-save" class="review-btn">Save edits</button>
        ${re}
        ${be}
        <button type="button" id="review-approve" class="review-btn review-btn-primary">Approve and apply</button>
        <button type="button" id="review-cancel" class="review-btn">Cancel</button>
      </div>
      <div id="review-action-error" class="review-error" hidden></div>
    `,g.appendChild(L),v=g,k.appendChild(g),M();let ie=null;if(s){const y=document.getElementById("review-resume-form");ie=Ne(y,r.resume??{})}const W=document.getElementById("review-cover");W&&(W.value=O);function Y(y,ye){const Se=document.getElementById(y);Se&&(Se.textContent=ye,Se.hidden=!1)}function ce(y){const ye=document.getElementById(y);ye&&(ye.hidden=!0)}document.getElementById("review-save").addEventListener("click",async()=>{ce("review-resume-error"),ce("review-cover-error");try{if(s&&ie){const y=ie.validate();if(y){Y("review-resume-error",y);return}await it(e,ie.getValue())}R&&W&&(await ct(e,W.value.trim()||" "),O=W.value)}catch(y){Y("review-resume-error",y instanceof Error?y.message:"Save failed.")}});const Ce=document.getElementById("review-download-resume");Ce&&Ce.addEventListener("click",async()=>{try{await Me(e,"resume")}catch(y){Y("review-action-error",y instanceof Error?y.message:"Download failed.")}});const $e=document.getElementById("review-download-cover");$e&&$e.addEventListener("click",async()=>{try{await Me(e,"cover")}catch(y){Y("review-action-error",y instanceof Error?y.message:"Download failed.")}}),document.getElementById("review-approve").addEventListener("click",async()=>{ce("review-action-error");try{await lt(e),$(),o&&Ie(o)}catch(y){Y("review-action-error",y instanceof Error?y.message:"Approve failed.")}}),document.getElementById("review-cancel").addEventListener("click",()=>{$(),u("assistant","No problem. You can download the resume and cover letter to apply manually.")})}function ae(){v==null||v.remove(),f==null||f.remove(),k.innerHTML=i.map(e=>`<div class="chat-bubble chat-bubble-${e.role}">
            <div class="chat-bubble-content">${ft(e.content)}</div>
            ${e.timestamp?`<span class="chat-bubble-time">${new Date(e.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>`:""}
          </div>`).join(""),v&&k.appendChild(v),f&&k.appendChild(f),M()}function u(e,r){i.push({role:e,content:r,timestamp:new Date().toISOString()}),ae()}function se(e,r){const c=document.getElementById("typing-indicator");if(c){const O=c.querySelector(".chat-bubble-content");if(O){let D=e?`<span class="chat-phase">${J(e)}</span>`:'<span class="dot"></span><span class="dot"></span><span class="dot"></span>';r&&(D+=` <button type="button" class="chat-cancel-btn" data-job-id="${J(r.jobId)}">Cancel application</button>`),O.innerHTML=D;const U=O.querySelector(".chat-cancel-btn");U&&r&&U.addEventListener("click",r.onCancel)}M();return}const s=document.createElement("div");s.className="chat-bubble chat-bubble-assistant chat-typing",s.id="typing-indicator";let R=e?`<span class="chat-phase">${J(e)}</span>`:'<span class="dot"></span><span class="dot"></span><span class="dot"></span>';r&&(R+=` <button type="button" class="chat-cancel-btn" data-job-id="${J(r.jobId)}">Cancel application</button>`),s.innerHTML=`<div class="chat-bubble-content">${R}</div>`;const g=s.querySelector(".chat-cancel-btn");g&&r&&g.addEventListener("click",r.onCancel),k.appendChild(s),M()}function A(){var e;(e=document.getElementById("typing-indicator"))==null||e.remove()}function H(){l&&(clearTimeout(l),l=null),o=null,a=0}function Ie(e){H(),o=e,a=0,se("Starting...",{jobId:e,onCancel:()=>{Ue(e).then(s=>{s.cancelled&&(A(),u("assistant","Application cancelled."),H())}).catch(()=>{u("assistant",'Could not cancel. You can try again or ask "check status".')})}});function c(){if(!o||a>=qe){a>=qe&&u("assistant",`I've been checking for a while. You can ask "check status" anytime to get an update.`),A(),H();return}a++,ot(o).then(s=>{var g,O;if(s.status==="awaiting_approval"){A(),rt(o).then(D=>he(o,D)).catch(()=>u("assistant","Could not load artifacts for review.")),l=setTimeout(c,Le);return}if(s.status==="done"){A(),$();const D=s.userMessage??(s.error?`Failed: ${s.error}`:"Pipeline completed.");u("assistant",D);const U=(g=s.result)==null?void 0:g.appliedArtifacts,re=s.result&&typeof s.result=="object"&&s.result.job&&typeof s.result.job=="object"?String(s.result.job.title??""):"";U&&(U.resume||(O=U.coverLetter)!=null&&O.text)&&Q(o,U,re||"Job"),H();return}if(s.status==="failed"){A(),$(),u("assistant",`Failed: ${s.error??"Unknown error"}`),H();return}if(s.status==="cancelled"){A(),$(),u("assistant","That application was cancelled."),H();return}const R=o;se(s.phase??"Processing...",{jobId:R,onCancel:()=>{Ue(R).then(D=>{D.cancelled&&(A(),u("assistant","Application cancelled."),H())}).catch(()=>{u("assistant",'Could not cancel. You can try again or ask "check status".')})}}),l=setTimeout(c,Le)}).catch(()=>{A(),H()})}l=setTimeout(c,Le)}async function Pe(){var r;const e=P.value.trim();if(e){u("user",e),P.value="",P.style.height="auto",ue.disabled=!0,se();try{const c=i.slice(-pt),s=await st(e,c);A(),u("assistant",s.reply),(r=s.meta)!=null&&r.pollStatus&&s.meta.jobId&&Ie(s.meta.jobId)}catch(c){A();const s=c instanceof Error?c.message:"Something went wrong.";u("assistant",`Error: ${s}`)}finally{ue.disabled=!1,P.focus()}}}de.addEventListener("submit",e=>{e.preventDefault(),Pe()}),P.addEventListener("keydown",e=>{e.key==="Enter"&&!e.shiftKey&&(e.preventDefault(),Pe())}),P.addEventListener("input",()=>{P.style.height="auto",P.style.height=Math.min(P.scrollHeight,200)+"px"});function oe(e,r){C.textContent=e,te.textContent=r,I.hidden=!1}_.addEventListener("click",()=>{I.hidden=!0}),I.addEventListener("click",e=>{e.target===I&&(I.hidden=!0)}),ee.addEventListener("click",e=>{e.stopPropagation(),p.hidden=!p.hidden,ee.setAttribute("aria-expanded",String(!p.hidden))}),document.addEventListener("click",()=>{p.hidden=!0,ee.setAttribute("aria-expanded","false")}),p.addEventListener("click",e=>e.stopPropagation()),p.addEventListener("click",async e=>{const r=e.target.closest(".menu-item");if(!r)return;const c=r.getAttribute("data-action");if(p.hidden=!0,ee.setAttribute("aria-expanded","false"),c==="preview-profile"){try{const{profile:s}=await Ge();oe("Profile",s?JSON.stringify(s,null,2):"No profile set.")}catch(s){oe("Profile",s instanceof Error?s.message:"Failed to load profile.")}return}if(c==="preview-resume"){try{const{resume:s}=await De();oe("Base resume",JSON.stringify(s,null,2))}catch(s){oe("Base resume",s instanceof Error?s.message:"No base resume or failed to load.")}return}if(c==="preview-transcript"){try{const{hasTranscript:s}=await ze();oe("Transcript",s?"Transcript uploaded and saved.":"No transcript uploaded.")}catch(s){oe("Transcript",s instanceof Error?s.message:"Failed to check transcript.")}return}if(c==="upload-resume-pdf"){d.click();return}if(c==="upload-transcript"){h.click();return}if(c==="base-resume"){me.hidden=!1,b.hidden=!0,w.hidden=!0;return}if(c==="check-connection"){try{const s=await ke();u("assistant",s.connected?"Handshake connected successfully.":"Handshake is not connected. Use the browser extension to upload your session.")}catch{u("assistant","Could not verify connection. Please try again.")}return}if(c==="copy-token"){navigator.clipboard.writeText(V).then(()=>u("assistant","Token copied to clipboard."),()=>u("assistant","Failed to copy token."));return}c==="logout"&&(H(),t())}),d.addEventListener("change",async()=>{var r;const e=(r=d.files)==null?void 0:r[0];if(d.value="",!!e){if(!e.name.toLowerCase().endsWith(".pdf")&&e.type!=="application/pdf"){u("assistant","Please choose a PDF file.");return}try{await Qe(e),u("assistant","Profile updated from your resume PDF. You can send a job URL to apply.")}catch(c){u("assistant",c instanceof Error?c.message:"Upload failed.")}}}),h.addEventListener("change",async()=>{var r;const e=(r=h.files)==null?void 0:r[0];if(h.value="",!!e){if(!e.name.toLowerCase().endsWith(".pdf")&&e.type!=="application/pdf"){u("assistant","Please choose a PDF file.");return}try{await Ze(e),u("assistant","Transcript saved. I'll use it when a job requires one.")}catch(c){u("assistant",c instanceof Error?c.message:"Upload failed.")}}}),ge.addEventListener("click",()=>{me.hidden=!0}),x.addEventListener("click",async()=>{var r;const e=(r=we.files)==null?void 0:r[0];if(we.value="",b.hidden=!0,!e||!e.name.toLowerCase().endsWith(".pdf")&&e.type!=="application/pdf"){b.textContent="Please select a PDF file.",b.hidden=!1;return}x.disabled=!0,b.textContent="";try{await et(e),b.textContent="Base resume saved from PDF.",b.hidden=!1,b.style.color=""}catch(c){b.textContent=c instanceof Error?c.message:"Upload failed.",b.hidden=!1}finally{x.disabled=!1}}),X.addEventListener("click",async()=>{var r;const e=((r=pe.value)==null?void 0:r.trim())??"";if(b.hidden=!0,!e){b.textContent="Paste some resume text first.",b.hidden=!1;return}X.disabled=!0,b.textContent="";try{await tt(e),b.textContent="Base resume saved from text.",b.hidden=!1,b.style.color=""}catch(c){b.textContent=c instanceof Error?c.message:"Save failed.",b.hidden=!1}finally{X.disabled=!1}}),G.addEventListener("click",async()=>{w.hidden=!0,G.disabled=!0;try{const{resume:e}=await De();j.hidden=!1,j.innerHTML="",q=Ne(j,e),N.hidden=!1}catch(e){w.textContent=e instanceof Error?e.message:"No base resume found. Upload or paste one first.",w.hidden=!1}finally{G.disabled=!1}}),N.addEventListener("click",async()=>{if(!q)return;const e=q.validate();if(e){w.textContent=e,w.hidden=!1;return}w.hidden=!0,N.disabled=!0;try{const r=q.getValue();await nt(r),w.textContent="Edits saved.",w.hidden=!1,w.style.color=""}catch(r){w.textContent=r instanceof Error?r.message:"Save failed.",w.hidden=!1}finally{N.disabled=!1}}),ne.addEventListener("click",()=>{H(),t()});function Je(){k.innerHTML=`
      <div class="chat-messages-loading" aria-live="polite">
        <span class="chat-messages-loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>
        <span class="chat-messages-loading-text">Loading messages…</span>
      </div>
    `}if(Je(),P.focus(),at(50).then(e=>{i.length=0,i.push(...e.messages),ae()}).catch(()=>{ae()}),new URLSearchParams(window.location.search).get("session")==="uploaded"){const e=window.location.pathname+(window.location.hash||"");window.history.replaceState({},"",e),ke().then(r=>{r.connected?u("assistant","Handshake connected successfully."):u("assistant",'Could not verify connection. Try the "Check connection" button.')}).catch(()=>{u("assistant",'Could not verify connection. Try the "Check connection" button.')})}let fe=null,Ee=null;function _e(){ke().then(e=>{e.connected&&e.updatedAt&&(Ee!==null&&e.updatedAt!==Ee&&u("assistant","Handshake connected successfully."),Ee=e.updatedAt)}).catch(()=>{})}function Te(){fe||(fe=setInterval(_e,6e4))}function We(){fe&&(clearInterval(fe),fe=null)}document.visibilityState==="visible"&&Te(),document.addEventListener("visibilitychange",()=>{document.visibilityState==="visible"?Te():We()})}const He=document.getElementById("app");function je(){vt(He,()=>{ve(),Be()})}function Be(){mt(He,()=>{je()})}Ye(()=>{Be()});Ke()?je():Be();
