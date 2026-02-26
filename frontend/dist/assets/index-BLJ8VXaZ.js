(function(){const n=document.createElement("link").relList;if(n&&n.supports&&n.supports("modulepreload"))return;for(const t of document.querySelectorAll('link[rel="modulepreload"]'))r(t);new MutationObserver(t=>{for(const a of t)if(a.type==="childList")for(const c of a.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&r(c)}).observe(document,{childList:!0,subtree:!0});function s(t){const a={};return t.integrity&&(a.integrity=t.integrity),t.referrerPolicy&&(a.referrerPolicy=t.referrerPolicy),t.crossOrigin==="use-credentials"?a.credentials="include":t.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function r(t){if(t.ep)return;t.ep=!0;const a=s(t);fetch(t.href,a)}})();const j="";let b=null;function J(e){b=e}function v(){return localStorage.getItem("token")}function U(e){localStorage.setItem("token",e)}function P(){localStorage.removeItem("token")}function q(){return!!v()}function K(){const e=v();if(!e)return null;try{return JSON.parse(atob(e.split(".")[1])).sub??null}catch{return null}}async function S(e,n={}){const s={"Content-Type":"application/json",...n.headers??{}},r=v();r&&(s.Authorization=`Bearer ${r}`);const t=await fetch(`${j}${e}`,{...n,headers:s});if(t.status===401)throw P(),b==null||b(),new Error("Session expired. Please sign in again.");const a=await t.json();if(!t.ok)throw new Error(a.error||a.message||`Request failed (${t.status})`);return a}async function F(e,n){return S("/auth/register",{method:"POST",body:JSON.stringify({email:e,password:n})})}async function B(e,n){const s=await S("/auth/login",{method:"POST",body:JSON.stringify({email:e,password:n})});return s.token&&U(s.token),s}async function C(e,n=[]){return S("/chat",{method:"POST",body:JSON.stringify({message:e,messages:n})})}function R(e,n){e.innerHTML=`
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
  `;let s=!1;const r=document.getElementById("auth-form"),t=document.getElementById("auth-email"),a=document.getElementById("auth-password"),c=document.getElementById("auth-submit"),h=document.getElementById("auth-toggle-text"),f=document.getElementById("auth-toggle-btn"),i=document.getElementById("auth-error");f.addEventListener("click",()=>{s=!s,c.textContent=s?"Sign Up":"Sign In",h.textContent=s?"Already have an account?":"Don't have an account?",f.textContent=s?"Sign In":"Sign Up",i.hidden=!0}),r.addEventListener("submit",async y=>{y.preventDefault(),i.hidden=!0,c.disabled=!0,c.textContent=s?"Signing up...":"Signing in...";try{s?(await F(t.value.trim(),a.value),await B(t.value.trim(),a.value)):await B(t.value.trim(),a.value),n()}catch(u){i.textContent=u instanceof Error?u.message:"Authentication failed",i.hidden=!1}finally{c.disabled=!1,c.textContent=s?"Sign Up":"Sign In"}})}const x=50,A=15e3,O=10;function M(){return`chat_history_${K()??"unknown"}`}function X(){try{const e=localStorage.getItem(M());return e?JSON.parse(e):[]}catch{return[]}}function Y(e){localStorage.setItem(M(),JSON.stringify(e))}function z(e){const n=document.createElement("div");return n.textContent=e,n.innerHTML}function G(e){let n=z(e);return n=n.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>"),n=n.replace(/\n/g,"<br>"),n}function V(e,n){const s=X();let r=null,t=0,a=null;const c=localStorage.getItem("token")??"";e.innerHTML=`
    <div class="chat-layout">
      <header class="chat-header">
        <h1 class="chat-header-title">Auto Apply</h1>
        <div class="chat-header-actions">
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
  `;const h=document.getElementById("chat-messages"),f=document.getElementById("chat-form"),i=document.getElementById("chat-input"),y=document.getElementById("chat-send"),u=document.getElementById("copy-token-btn"),H=document.getElementById("logout-btn");function E(){h.scrollTop=h.scrollHeight}function T(){h.innerHTML=s.map(o=>`<div class="chat-bubble chat-bubble-${o.role}">
            <div class="chat-bubble-content">${G(o.content)}</div>
            ${o.timestamp?`<span class="chat-bubble-time">${new Date(o.timestamp).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>`:""}
          </div>`).join(""),E()}function p(o,d){s.push({role:o,content:d,timestamp:new Date().toISOString()}),Y(s),T()}function _(){const o=document.createElement("div");o.className="chat-bubble chat-bubble-assistant chat-typing",o.id="typing-indicator",o.innerHTML='<div class="chat-bubble-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>',h.appendChild(o),E()}function w(){var o;(o=document.getElementById("typing-indicator"))==null||o.remove()}function g(){r&&(clearTimeout(r),r=null),a=null,t=0}function D(o){g(),a=o,t=0;function d(){if(!a||t>=O){t>=O&&p("assistant",`I've been checking for a while. You can ask "check status" anytime to get an update.`),g();return}t++;const m=s.slice(-x);C(`check status for ${a}`,m).then(l=>{var L;(L=l.meta)!=null&&L.pollStatus?r=setTimeout(d,A):(p("assistant",l.reply),g())}).catch(()=>{g()})}r=setTimeout(d,A)}async function k(){var d;const o=i.value.trim();if(o){p("user",o),i.value="",i.style.height="auto",y.disabled=!0,_();try{const m=s.slice(-x),l=await C(o,m);w(),p("assistant",l.reply),(d=l.meta)!=null&&d.pollStatus&&l.meta.jobId&&D(l.meta.jobId)}catch(m){w();const l=m instanceof Error?m.message:"Something went wrong.";p("assistant",`Error: ${l}`)}finally{y.disabled=!1,i.focus()}}}f.addEventListener("submit",o=>{o.preventDefault(),k()}),i.addEventListener("keydown",o=>{o.key==="Enter"&&!o.shiftKey&&(o.preventDefault(),k())}),i.addEventListener("input",()=>{i.style.height="auto",i.style.height=Math.min(i.scrollHeight,200)+"px"}),u.addEventListener("click",()=>{navigator.clipboard.writeText(c).then(()=>{u.textContent="Copied!",setTimeout(()=>{u.textContent="Copy Token"},2e3)},()=>{u.textContent="Failed",setTimeout(()=>{u.textContent="Copy Token"},2e3)})}),H.addEventListener("click",()=>{g(),n()}),T(),i.focus()}const N=document.getElementById("app");function $(){V(N,()=>{P(),I()})}function I(){R(N,()=>{$()})}J(()=>{I()});q()?$():I();
