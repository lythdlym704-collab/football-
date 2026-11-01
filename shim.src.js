import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { getDatabase, ref, get, set, update, push, onValue, onChildAdded, onDisconnect, runTransaction, query, orderByChild, startAt, endAt, limitToFirst } from "firebase/database";
import { firebaseConfig } from "./firebase-config.js";
import { createDcNet } from "./dcnet.js";
import { shopConfig } from "./shop-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
let uid = null, resolveReady; const ready = new Promise(r => resolveReady = r);
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch (_) {} };

// ---- واجهة تسجيل الدخول ----
const ov = document.createElement("div");
ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0b1a12;color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;direction:rtl;touch-action:manipulation;user-select:text;-webkit-user-select:text;overflow:auto";
ov.innerHTML = '<div style="width:min(92vw,360px);text-align:center;padding:16px"><h2 style="margin:0 0 14px">⚽ لعبة كرة القدم</h2><div id="gs">جارٍ التحميل...</div><div style="opacity:.4;font-size:.7em;margin-top:10px">v9</div><div id="gf" style="display:none"><input id="ge" type="email" placeholder="البريد الإلكتروني" autocomplete="email" style="direction:ltr"><input id="gp" type="password" placeholder="كلمة المرور (6 أحرف على الأقل)" autocomplete="current-password" style="direction:ltr"><button id="gl" class="gb">تسجيل الدخول</button><button id="gr" class="gb g">إنشاء حساب جديد</button><button id="gx" class="gb g" style="font-size:.8em">نسيت كلمة المرور؟</button><div id="gm" style="min-height:1.5em;margin-top:8px;color:#ffb4b4"></div></div></div>';
const st = document.createElement("style");
st.textContent = "#gf input{display:block;width:100%;margin:8px 0;padding:12px;border-radius:10px;border:0;font-size:16px;box-sizing:border-box}.gb{display:block;width:100%;margin:8px 0;padding:12px;border:0;border-radius:10px;background:#1f8a4c;color:#fff;font-size:16px;font-weight:700}.gb.g{background:rgba(255,255,255,.18)}";
(document.head || document.documentElement).appendChild(st);
document.documentElement.appendChild(ov);
const $ = id => ov.querySelector("#" + id), msg = t => $("gm").textContent = t;
const ERR = { "auth/invalid-credential": "البريد أو كلمة المرور غير صحيحة", "auth/wrong-password": "كلمة المرور غير صحيحة", "auth/user-not-found": "الحساب غير موجود", "auth/email-already-in-use": "هذا البريد مسجّل، سجّل دخولك", "auth/weak-password": "كلمة المرور ضعيفة (6 أحرف على الأقل)", "auth/invalid-email": "البريد الإلكتروني غير صحيح", "auth/network-request-failed": "لا يوجد اتصال بالإنترنت", "auth/too-many-requests": "محاولات كثيرة، انتظر قليلاً" };
const fail = e => msg(ERR[e && e.code] || "حدث خطأ، حاول مرة أخرى");
const creds = () => [($("ge").value || "").trim().toLowerCase(), $("gp").value || ""];
$("gl").onclick = async () => { const [e, p] = creds(); msg("..."); try { await signInWithEmailAndPassword(auth, e, p) } catch (x) { fail(x) } };
$("gr").onclick = async () => { const [e, p] = creds(); msg("..."); try { const c = await createUserWithEmailAndPassword(auth, e, p); await set(ref(db, "d/accounts/" + c.user.uid), { json: "{}", ts: 0 }) } catch (x) { fail(x) } };
$("gx").onclick = async () => { const [e] = creds(); if (!e) return msg("اكتب بريدك أولاً"); try { await sendPasswordResetEmail(auth, e); msg("✅ أُرسل رابط إعادة التعيين لبريدك") } catch (x) { fail(x) } };

onAuthStateChanged(auth, u => {
  if (!u) { uid = null; $("gs").style.display = "none"; $("gf").style.display = ""; ov.style.display = "flex"; return }
  uid = u.uid;
  let old = null; try { old = JSON.parse(LS("fb_acct") || "null") } catch (_) {}
  LS("fb_acct", JSON.stringify({ id: u.uid, email: u.email }));
  if (!old || old.id !== u.uid) { location.reload(); return }  // يعيد تحميل اللعبة لتقرأ الحساب
  ov.style.display = "none"; resolveReady(u);
});
window.fbLogout = async () => { ["fb_acct", "fb_prof2", "fb_prof", "fb_ban"].forEach(k => LS(k, null)); try { await signOut(auth) } catch (_) {} location.reload() };

// ---- بديل claude.use: db / user / room عبر Firebase ----
let roomObj = null, rebuildPeers = () => {};
const net = createDcNet();
function makeRoom() {
  if (roomObj) return roomObj;
  const me = ref(db, "lobby/" + uid); let raw = {}, list = [];
  onValue(ref(db, ".info/connected"), s => { if (s.val()) onDisconnect(me).remove().catch(() => {}) });
  rebuildPeers = () => {
    const v = V;
    list = Object.keys(raw).map(id => {
      const p = raw[id], isMe = id === uid;
      const pr = (!isMe && v && p && p.code === v.code && p.role && p.role !== v.role) ? net.overlay(p) : p;
      return { id, isMe, presence: pr };
    });
  };
  onValue(ref(db, "lobby"), s => { raw = s.val() || {}; rebuildPeers() });
  roomObj = {
    presence(o) {
      if (net.tryRoute(o)) return Promise.resolve();
      const u = {}; for (const k in o) u[k] = o[k] === undefined ? null : o[k]; return update(me, u);
    },
    peers: () => list
  };
  return roomObj;
}
const dbApi = {
  collection: c => ({ doc: id => { const r = () => ref(db, "d/" + c + "/" + id); return {
    get: async () => { const s = await get(r()); const v = s.val(); return { exists: s.exists(), data: () => v } },
    set: v => set(r(), v), update: v => update(r(), v) } } })
};
window.claude = { use: async n => { await ready; if (n === "db") return dbApi; if (n === "user") return { id: async () => uid }; if (n === "room") return makeRoom(); return null } };

// ---- دردشة صوتية (WebRTC) داخل غرف الأونلاين ----
const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };
let V = null, micOn = false, micStream = null, micTrack = null;
const wrapEl = () => document.getElementById("wrap");
const say = t => { try { if (typeof toast === "function") toast(t); else alert(t) } catch (_) {} };
const mb = document.createElement("button");
mb.style.cssText = "position:absolute;top:.3em;left:.4em;width:1.8em;height:1.8em;border-radius:50%;border:0;color:#fff;font-size:1em;padding:0;z-index:6;display:none;align-items:center;justify-content:center;touch-action:manipulation";
const MIC = '<svg viewBox="0 0 24 24" width="62%" height="62%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4M8 22h8"/></svg>';
const XB = '<svg viewBox="0 0 24 24" style="position:absolute;right:-.12em;bottom:-.12em;width:.85em;height:.85em"><circle cx="12" cy="12" r="11" fill="#e53935"/><path d="M7.5 7.5l9 9M16.5 7.5l-9 9" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>';
const paint = () => { mb.innerHTML = MIC + (micOn ? "" : XB); mb.style.background = micOn ? "rgba(31,138,76,.95)" : "rgba(0,0,0,.45)" };
paint();
function micOff() { micOn = false; try { V && V.sender && V.sender.replaceTrack(null) } catch (_) {} if (micStream) micStream.getTracks().forEach(t => t.stop()); micStream = null; micTrack = null; paint() }
mb.onclick = async () => {
  if (micOn) return micOff();
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    micTrack = micStream.getAudioTracks()[0]; micOn = true;
    if (V && V.sender) V.sender.replaceTrack(micTrack).catch(() => {});
  } catch (_) { say("تعذّر تشغيل المايك، اسمح للتطبيق باستخدام المايك") }
  paint();
};
function vTeardown() {
  micOff(); net.detach(); if (!V) return;
  V.dead = true; V.unsubs.forEach(f => { try { f() } catch (_) {} });
  try { V.iceOff && V.iceOff() } catch (_) {} try { V.pc && V.pc.close() } catch (_) {}
  if (V.audio) { V.audio.srcObject = null; V.audio.remove() } V = null;
}
function vSetup(code, role) {
  const base = "voice/" + code, S = { code, role, key: code + role, dead: false, unsubs: [], pc: null, sid: null, sender: null, audio: document.createElement("audio") };
  V = S; S.audio.autoplay = true; S.audio.setAttribute("playsinline", ""); document.body.appendChild(S.audio);
  const rdDone = pc => { pc._rd = true; pc._q.splice(0).forEach(c => pc.addIceCandidate(c).catch(() => {})) };
  const newPC = (sid, mine, theirs) => {
    try { S.iceOff && S.iceOff() } catch (_) {} try { S.pc && S.pc.close() } catch (_) {}
    const pc = new RTCPeerConnection(ICE); pc._q = []; pc._rd = false; S.pc = pc; S.sid = sid;
    S.sender = null;
    if (role === "host") S.sender = pc.addTransceiver("audio", { direction: "sendrecv" }).sender;
    if (role === "host") net.attach(pc.createDataChannel("g", { ordered: false, maxRetransmits: 0 }), rebuildPeers); else pc.ondatachannel = e => net.attach(e.channel, rebuildPeers);
    if (S.sender && micTrack) S.sender.replaceTrack(micTrack).catch(() => {});
    pc.ontrack = e => { S.audio.srcObject = e.streams[0] || new MediaStream([e.track]); S.audio.play().catch(() => {}) };
    pc.onicecandidate = e => { if (e.candidate) push(ref(db, base + "/" + mine), { sid, c: JSON.stringify(e.candidate) }).catch(() => {}) };
    S.iceOff = onChildAdded(ref(db, base + "/" + theirs), s => { const v = s.val(); if (!v || v.sid !== S.sid || S.pc !== pc) return; let c; try { c = JSON.parse(v.c) } catch (_) { return } if (pc._rd) pc.addIceCandidate(c).catch(() => {}); else pc._q.push(c) });
    return pc;
  };
  if (role === "host") {
    (async () => {
      await set(ref(db, base), null); if (S.dead) return;
      const sid = Date.now() + "-" + Math.random().toString(36).slice(2, 6), pc = newPC(sid, "ih", "ig");
      const off = await pc.createOffer(); await pc.setLocalDescription(off);
      await set(ref(db, base + "/offer"), { sid, sdp: off.sdp });
      S.unsubs.push(onValue(ref(db, base + "/answer"), async s => {
        const v = s.val(); if (!v || v.sid !== sid || S.dead || S.pc !== pc || pc.signalingState !== "have-local-offer") return;
        try { await pc.setRemoteDescription({ type: "answer", sdp: v.sdp }); rdDone(pc) } catch (_) {}
      }));
    })().catch(() => {});
  } else {
    S.unsubs.push(onValue(ref(db, base + "/offer"), async s => {
      const v = s.val(); if (!v || S.dead || v.sid === S.sid) return;
      try {
        const pc = newPC(v.sid, "ig", "ih"); await pc.setRemoteDescription({ type: "offer", sdp: v.sdp }); rdDone(pc);
        const tr = pc.getTransceivers().find(t => t.receiver && t.receiver.track && t.receiver.track.kind === "audio");
        if (tr) { tr.direction = "sendrecv"; S.sender = tr.sender; if (micTrack) tr.sender.replaceTrack(micTrack).catch(() => {}) }
        const a = await pc.createAnswer(); await pc.setLocalDescription(a);
        await set(ref(db, base + "/answer"), { sid: v.sid, sdp: a.sdp });
      } catch (_) {}
    }));
  }
}
setInterval(() => {
  if (!uid) return;
  const w = wrapEl(); if (w && mb.parentNode !== w) w.appendChild(mb);
  let key = null, c = "", r = "";
  try { if (typeof online === "function" && online() && w && w.style.display === "block") { c = String(code || ""); r = role; if (c && (r === "host" || r === "guest") && !banned()) key = c + r } } catch (_) {}
  mb.style.display = key ? "flex" : "none";
  if ((V ? V.key : null) !== key) { vTeardown(); if (key) vSetup(c, r) }
}, 1000);

// ---- متجر المفاتيح (طلبات دفع يدوية يقبلها صاحب اللعبة) ----
window.shopConfig = shopConfig;
const odb = (u, id) => ref(db, "d/shop_orders/" + u + (id ? "/" + id : ""));
const flat = v => { const r = []; for (const u in v || {}) for (const id in v[u]) r.push({ u, id, ...v[u][id] }); return r.sort((a, b) => (b.t || 0) - (a.t || 0)) };
window.fbShop = {
  credit: async () => (await get(ref(db, "d/shop_credit/" + uid + "/total"))).val() || 0,
  submit: async o => {
    const id = Date.now() + "_" + Math.random().toString(36).slice(2, 6);
    await set(odb(uid, id), { k: +o.k, price: String(o.price).slice(0, 20), method: String(o.method).slice(0, 40), ref: String(o.ref).slice(0, 80), email: String(o.email || "").slice(0, 80), name: String(o.name || "").slice(0, 30), status: "pending", t: Date.now() });
  },
  myOrders: async () => flat({ [uid]: (await get(odb(uid))).val() }),
  allOrders: async () => flat((await get(ref(db, "d/shop_orders"))).val()).filter(o => o.status === "pending"),
  approve: async (u, id) => {
    const r = await runTransaction(ref(db, "d/shop_orders/" + u + "/" + id + "/status"), c => c === "pending" ? "done" : undefined);
    if (!r.committed) return false;
    const k = (await get(ref(db, "d/shop_orders/" + u + "/" + id + "/k"))).val() | 0;
    await runTransaction(ref(db, "d/shop_credit/" + u + "/total"), c => (c || 0) + k);
    return true;
  },
  reject: async (u, id) => { await set(ref(db, "d/shop_orders/" + u + "/" + id + "/status"), "rejected") }
};

// ---- إدارة اللاعبين والحظر ----
const nl = x => String(x || "").trim().toLowerCase();
Object.assign(window.fbShop, {
  reg: async (name, email) => { await set(ref(db, "d/players/" + uid), { name: String(name).slice(0, 30), nameL: nl(name).slice(0, 30), email: nl(email).slice(0, 80), t: Date.now() }) },
  search: async q => {
    q = nl(q); if (!q) return [];
    const run = async f => { const s = await get(query(ref(db, "d/players"), orderByChild(f), startAt(q), endAt(q + "\uf8ff"), limitToFirst(20))); const r = []; s.forEach(c => { r.push({ u: c.key, ...c.val() }) }); return r };
    const r = await run("nameL"); for (const x of await run("email")) if (!r.some(y => y.u === x.u)) r.push(x);
    return r;
  },
  playerInfo: async u => {
    const [a, c, b] = await Promise.all([get(ref(db, "d/accounts/" + u + "/json")), get(ref(db, "d/shop_credit/" + u + "/total")), get(ref(db, "d/bans/" + u))]);
    let prof = {}; try { prof = JSON.parse(a.val() || "{}") } catch (_) {}
    return { prof, credit: c.val() || 0, ban: b.val() };
  },
  addKeys: async (u, n) => { await runTransaction(ref(db, "d/shop_credit/" + u + "/total"), c => (c || 0) + n) },
  ban: async (u, days) => { await set(ref(db, "d/bans/" + u), { until: Date.now() + days * 864e5, days, t: Date.now() }) },
  unban: async u => { await set(ref(db, "d/bans/" + u), null) }
});
let banUntil = 0;
const bo = document.createElement("div");
bo.style.cssText = "position:fixed;inset:0;z-index:100000;background:#150909;color:#fff;display:none;align-items:center;justify-content:center;font-family:system-ui,sans-serif;direction:rtl;text-align:center;touch-action:none";
bo.innerHTML = '<div style="padding:24px"><div style="font-size:3.2rem">⛔</div><h2 style="margin:8px 0">تم حظر حسابك</h2><p style="opacity:.85">لا يمكنك اللعب أو فتح الباكجات أو استخدام أي شيء حتى ينتهي الحظر.</p><p>المتبقي: <b id="bt"></b></p></div>';
document.documentElement.appendChild(bo);
const banned = () => !!uid && banUntil > Date.now();
const fmtLeft = ms => { const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3); return d ? d + " يوم و " + h + " ساعة" : h ? h + " ساعة و " + m + " دقيقة" : m + " دقيقة و " + s + " ثانية" };
function showBan() {
  const on = banned(); bo.style.display = on ? "flex" : "none";
  if (on) { bo.querySelector("#bt").textContent = fmtLeft(banUntil - Date.now()); try { micOff() } catch (_) {} try { if (typeof stopAll === "function") stopAll() } catch (_) {} }
}
async function checkBan() {
  if (!uid) return;
  try { const v = (await get(ref(db, "d/bans/" + uid))).val(); banUntil = v && v.until ? +v.until : 0; LS("fb_ban", banUntil ? uid + ":" + banUntil : null) } catch (_) {}
  showBan();
}
onAuthStateChanged(auth, u => { if (!u) { banUntil = 0; showBan(); return } const c = (LS("fb_ban") || "").split(":"); if (c[0] === u.uid) banUntil = +c[1] || 0; showBan(); checkBan() });
setInterval(showBan, 1000); setInterval(checkBan, 30000);
