import { initializeApp } from "firebase/app";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { getDatabase, ref, get, set, update, onValue, onDisconnect } from "firebase/database";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getDatabase(app);
let uid = null, resolveReady; const ready = new Promise(r => resolveReady = r);
const LS = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch (_) {} };

// ---- واجهة تسجيل الدخول ----
const ov = document.createElement("div");
ov.style.cssText = "position:fixed;inset:0;z-index:99999;background:#0b1a12;color:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;direction:rtl;touch-action:manipulation;user-select:text;-webkit-user-select:text;overflow:auto";
ov.innerHTML = '<div style="width:min(92vw,360px);text-align:center;padding:16px"><h2 style="margin:0 0 14px">⚽ لعبة كرة القدم</h2><div id="gs">جارٍ التحميل...</div><div id="gf" style="display:none"><input id="ge" type="email" placeholder="البريد الإلكتروني" autocomplete="email" style="direction:ltr"><input id="gp" type="password" placeholder="كلمة المرور (6 أحرف على الأقل)" autocomplete="current-password" style="direction:ltr"><button id="gl" class="gb">تسجيل الدخول</button><button id="gr" class="gb g">إنشاء حساب جديد</button><button id="gx" class="gb g" style="font-size:.8em">نسيت كلمة المرور؟</button><div id="gm" style="min-height:1.5em;margin-top:8px;color:#ffb4b4"></div></div></div>';
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
window.fbLogout = async () => { ["fb_acct", "fb_prof2", "fb_prof"].forEach(k => LS(k, null)); try { await signOut(auth) } catch (_) {} location.reload() };

// ---- بديل claude.use: db / user / room عبر Firebase ----
let roomObj = null;
function makeRoom() {
  if (roomObj) return roomObj;
  const me = ref(db, "lobby/" + uid); let list = [];
  onValue(ref(db, ".info/connected"), s => { if (s.val()) onDisconnect(me).remove().catch(() => {}) });
  onValue(ref(db, "lobby"), s => { const v = s.val() || {}; list = Object.keys(v).map(id => ({ id, isMe: id === uid, presence: v[id] })) });
  roomObj = {
    presence(o) { const u = {}; for (const k in o) u[k] = o[k] === undefined ? null : o[k]; return update(me, u) },
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
