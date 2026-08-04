import './styles.css';
import { doors, modules, activity } from './data.js';

const app = document.querySelector('#app');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  route: 'home',
  door: doors[0],
  phase: 'idle',
  hold: 0,
  role: 'Contributor',
  evidence: []
};

const icons = {
  home: '<path d="M3 11.5 12 4l9 7.5v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  door: '<path d="M6 3h11a1 1 0 0 1 1 1v17H6z"/><path d="M10 3v18M14.5 12h.01"/>',
  network: '<circle cx="6" cy="7" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m8 8.5 3 7m5-7-3 7M8.5 7h7"/>',
  tasks: '<path d="M8 5h12M8 12h12M8 19h12M3.5 5h.01M3.5 12h.01M3.5 19h.01"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  shield: '<path d="M12 3 20 6v5c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z"/><path d="m8.5 12 2.2 2.2 4.8-5"/>',
  river: '<path d="M4 6c4-3 6 3 10 0s6 0 6 0M4 12c4-3 6 3 10 0s6 0 6 0M4 18c4-3 6 3 10 0s6 0 6 0"/>',
  spark: '<path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'
};
function icon(name, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${icons[name] || icons.spark}</svg>`;
}
function vibrate(pattern = 14) { if ('vibrate' in navigator) navigator.vibrate(pattern); }
function record(type, detail) {
  state.evidence.unshift({ type, detail, at: new Date().toISOString() });
  console.info('[RiverOS evidence]', state.evidence[0]);
}
function route(next, door) {
  if (door) state.door = door;
  state.route = next;
  if (next === 'door') { state.phase = 'idle'; state.hold = 0; }
  render();
  window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
}
function shell(content, active = 'doors', immersive = false) {
  const back = state.route !== 'home';
  return `<main class="app-shell ${immersive ? 'immersive' : ''}">
    <header class="topbar glass">
      <button class="icon-button" data-action="${back ? 'back' : 'brand'}" aria-label="${back ? 'Go back' : 'VSR home'}">${back ? icon('back') : '<span class="brand">V</span>'}</button>
      <div class="topbar-title"><small>VIRTUAL SILK ROAD</small><strong>Creators Door</strong></div>
      <button class="icon-button" aria-label="Notifications">${icon('bell')}<i></i></button>
    </header>
    <section class="screen">${content}</section>
    ${immersive ? '' : bottomNav(active)}
  </main>`;
}
function bottomNav(active) {
  const nav = [['home','Home','home'],['doors','Doors','home'],['network','Network','arc'],['tasks','Tasks','arc'],['profile','Profile','arc']];
  return `<nav class="bottom-nav glass">${nav.map(([key,label,to]) => `<button class="${active === key ? 'active' : ''}" data-route="${to}">${icon(key === 'doors' ? 'door' : key)}<span>${label}</span></button>`).join('')}</nav>`;
}
function home() {
  return shell(`
    <section class="hero">
      <p class="kicker">DISCOVER · TOUCH · ENTER</p>
      <h1>Doors open.<br><em>Opportunities begin.</em></h1>
      <p>Each Door is a governed entry into a creator, product, service or mission network.</p>
    </section>
    <section class="assurances">
      <article class="glass">${icon('shield')}<strong>Verified</strong><span>Warden checked</span></article>
      <article class="glass">${icon('river')}<strong>Transparent</strong><span>RiverOS evidence</span></article>
      <article class="glass">${icon('spark')}<strong>Yours to build</strong><span>Participate and grow</span></article>
    </section>
    <div class="section-title"><div><small>EXPLORE</small><h2>Active Doors</h2></div><button>Filters</button></div>
    <section class="door-list">${doors.map((door, i) => doorCard(door, i)).join('')}</section>
  `);
}
function doorCard(door, i) {
  return `<article class="door-card glass" data-door="${door.id}" style="--delay:${i * 90}ms" tabindex="0" role="button">
    <div class="card-portal"><span class="card-light"></span><i class="card-left"></i><i class="card-right"></i></div>
    <div class="card-copy"><small>${door.eyebrow}</small><h3>${door.name}</h3><p>${door.summary}</p>
      <div class="tags">${door.tags.map(t => `<span>${t}</span>`).join('')}</div>
      <button class="primary">View Door ${icon('chevron', 17)}</button>
    </div>
    <b class="status">${door.status}</b>
  </article>`;
}
function particles() { return Array.from({length: 22}, (_,i) => `<i style="--i:${i};--x:${(i*37)%100}%;--d:${2 + (i%6)}s"></i>`).join(''); }
function doorScreen() {
  const d = state.door;
  return shell(`
    <section class="door-heading"><small>${d.eyebrow}</small><h1>${d.name}</h1><p>${d.summary}</p></section>
    <section class="portal-wrap ${state.phase}" aria-label="Interactive participation Door">
      <div class="ambient-halo"></div><div class="light-beam beam-a"></div><div class="light-beam beam-b"></div>
      <div class="floor-spill"></div><div class="particles">${particles()}</div>
      <div class="portal-frame">
        <div class="threshold-light"></div><div class="glass-caustic"></div>
        <div class="door-panel left"><span></span></div><div class="door-panel right"><span></span></div>
        <div class="touch-ripple"></div><div class="ward-seal">${state.phase === 'open' ? icon('check', 32) : icon('shield', 32)}</div>
      </div>
    </section>
    <section class="door-console glass">
      <div class="phase-row"><span class="${['verifying','opening','open'].includes(state.phase) ? 'done' : 'active'}">1 Touch</span><span class="${['opening','open'].includes(state.phase) ? 'done' : state.phase === 'verifying' ? 'active' : ''}">2 Verify</span><span class="${state.phase === 'open' ? 'done' : state.phase === 'opening' ? 'active' : ''}">3 Open</span></div>
      <div class="progress"><i style="width:${state.phase === 'open' ? 100 : state.phase === 'opening' ? 74 : state.phase === 'verifying' ? 42 : state.hold}%"></i></div>
      ${state.phase === 'open'
        ? `<h2>Access verified</h2><p>Warden confirmed your DigitalMe authority. The threshold is open.</p><button class="primary enter" data-route="arc">Enter ${d.name}</button>`
        : `<h2>${state.phase === 'verifying' ? 'Warden is verifying' : state.phase === 'opening' ? 'Opening the threshold' : 'Touch and hold to open'}</h2><p>${state.phase === 'idle' ? 'Hold the seal. Consent and authority are checked before the Door opens.' : 'Identity, consent, role and active Arc context are being evaluated.'}</p><button class="hold-button" data-hold aria-label="Touch and hold the seal">${icon('lock')}<span>Hold to verify</span></button>`}
    </section>
  `, 'doors', true);
}
function arcScreen() {
  const d = state.door;
  return shell(`
    <section class="arc-hero glass"><div><small>YOU HAVE ENTERED</small><h1>${d.name}</h1><p>${d.eyebrow}</p></div><b>Warden verified</b></section>
    <section class="metrics"><article class="glass"><strong>${d.members}</strong><span>DigitalMe Actors</span></article><article class="glass"><strong>${d.doors}</strong><span>Connected Doors</span></article><article class="glass"><strong>${d.progress}%</strong><span>Mission progress</span></article></section>
    <div class="section-title"><div><small>INSIDE THE DOOR</small><h2>Arc workspace</h2></div></div>
    <section class="module-grid">${modules.map(([id,title,desc]) => `<button class="module glass" data-module="${id}"><span>${icon(id === 'actors' ? 'network' : id === 'tasks' ? 'tasks' : id === 'payments' ? 'spark' : 'door')}</span><div><strong>${title}</strong><small>${desc}</small></div>${icon('chevron',18)}</button>`).join('')}</section>
    <div class="section-title"><div><small>RIVER</small><h2>Recent evidence</h2></div></div>
    <section class="feed glass">${activity.map(([title,desc,time]) => `<article><span>${icon('river',18)}</span><div><strong>${title}</strong><p>${desc}</p></div><time>${time}</time></article>`).join('')}</section>
    <button class="participate" data-route="participate">Participate in this Arc ${icon('chevron',18)}</button>
  `, 'network');
}
function participate() {
  const roles = [['Contributor','Create, complete tasks and add evidence'],['Partner','Provide capabilities, services or reach'],['Investor','Support a governed mission or product'],['Observer','Follow progress without operating authority']];
  return shell(`<section class="hero compact"><p class="kicker">PARTICIPATION ROUTE</p><h1>Choose your role.</h1><p>Warden will attach the selected role to your DigitalMe Actor and the active Arc context.</p></section>
    <section class="role-list">${roles.map(([r,d]) => `<button class="role glass ${state.role === r ? 'selected' : ''}" data-role="${r}"><span>${icon(state.role === r ? 'check' : 'profile')}</span><div><strong>${r}</strong><small>${d}</small></div></button>`).join('')}</section>
    <section class="consent glass"><div>${icon('shield')}<div><strong>Consent boundary</strong><p>This action records your selected role, authority context and timestamp. It does not enable covert device access.</p></div></div><label><input type="checkbox" checked/> Record participation evidence in RiverOS</label></section>
    <button class="participate" data-confirm>Confirm ${state.role} role</button>
  `, 'network');
}
function success() {
  return shell(`<section class="success"><div>${icon('check',58)}</div><small>RIVEROS EVENT RECORDED</small><h1>Welcome through the Door.</h1><p>Your ${state.role} role is active inside ${state.door.name}. The next action is now visible in the Arc workspace.</p><button class="primary" data-route="arc">Open workspace</button></section>`, 'network');
}
function render() {
  app.innerHTML = state.route === 'home' ? home() : state.route === 'door' ? doorScreen() : state.route === 'participate' ? participate() : state.route === 'success' ? success() : arcScreen();
  bind();
}
let holdFrame, holdStarted = 0;
function startHold() {
  if (state.phase !== 'idle') return;
  holdStarted = performance.now();
  const duration = reduceMotion ? 250 : 1150;
  const tick = now => {
    state.hold = Math.min(100, ((now - holdStarted) / duration) * 100);
    const bar = document.querySelector('.progress i'); if (bar) bar.style.width = `${state.hold}%`;
    if (state.hold < 100) holdFrame = requestAnimationFrame(tick); else verify();
  };
  vibrate(8); holdFrame = requestAnimationFrame(tick);
}
function cancelHold() { if (state.phase === 'idle') { cancelAnimationFrame(holdFrame); state.hold = 0; const bar = document.querySelector('.progress i'); if (bar) bar.style.width = '0%'; } }
function verify() {
  state.phase = 'verifying'; record('door.verify.requested', { door: state.door.id }); vibrate([18,30,18]); render();
  setTimeout(() => { state.phase = 'opening'; render(); }, reduceMotion ? 100 : 900);
  setTimeout(() => { state.phase = 'open'; record('door.opened', { door: state.door.id, authority: 'mock-warden-approved' }); vibrate([22,50,28]); render(); }, reduceMotion ? 220 : 2200);
}
function bind() {
  document.querySelectorAll('[data-route]').forEach(el => el.addEventListener('click', () => route(el.dataset.route)));
  document.querySelectorAll('[data-door]').forEach(el => {
    const open = () => route('door', doors.find(d => d.id === el.dataset.door));
    el.addEventListener('click', open); el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
  document.querySelector('[data-action="back"]')?.addEventListener('click', () => route(state.route === 'door' ? 'home' : state.route === 'arc' ? 'door' : 'arc'));
  const hold = document.querySelector('[data-hold]');
  ['pointerdown','keydown'].forEach(type => hold?.addEventListener(type, e => { if (type === 'keydown' && !['Enter',' '].includes(e.key)) return; e.preventDefault(); startHold(); }));
  ['pointerup','pointercancel','pointerleave','keyup'].forEach(type => hold?.addEventListener(type, cancelHold));
  document.querySelectorAll('[data-role]').forEach(el => el.addEventListener('click', () => { state.role = el.dataset.role; vibrate(); render(); }));
  document.querySelector('[data-confirm]')?.addEventListener('click', () => { record('participation.role.activated', { role: state.role, door: state.door.id }); route('success'); });
  document.querySelectorAll('[data-module]').forEach(el => el.addEventListener('click', () => alert(`${el.dataset.module} module is ready for API wiring.`)));
}
render();
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
