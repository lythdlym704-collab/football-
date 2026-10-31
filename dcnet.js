// قناة بيانات مباشرة بين اللاعبين (WebRTC DataChannel) لتقليل اللاج.
// تنقل فقط st (حالة المباراة من المضيف) و inp (حركة الضيف). إذا تعطلت ترجع اللعبة لـ Firebase تلقائياً.
export function createDcNet(now = () => Date.now(), setIv = setInterval, clrIv = clearInterval) {
  let dc = null, onChange = () => {}, lastRx = -1e12, lastTx = -1e12, seq = 0, lastQ = 0, out = {}, fresh = {}, ivs = [];
  const live = () => !!dc && dc.readyState === "open" && now() - lastRx < 1500;
  const send = o => { try { dc.send(JSON.stringify({ q: ++seq, ...o })); lastTx = now(); return true } catch (_) { return false } };
  function detach() {
    ivs.forEach(clrIv); ivs = [];
    if (dc) { try { dc.onmessage = dc.onopen = dc.onclose = null; dc.close() } catch (_) {} }
    const had = !!dc; dc = null; out = {}; fresh = {}; lastRx = -1e12; lastQ = 0; seq = 0;
    if (had) onChange();
  }
  function attach(ch, cb) {
    detach(); dc = ch; onChange = cb || (() => {});
    ch.onmessage = e => {
      let m; try { m = JSON.parse(e.data) } catch (_) { return }
      if (!m || typeof m.q !== "number" || m.q <= lastQ) return;
      lastQ = m.q; lastRx = now(); let got = false;
      for (const k of ["st", "inp"]) if (m[k] !== undefined) { fresh[k] = { v: m[k], t: lastRx }; got = true }
      if (got) onChange();
    };
    ivs.push(setIv(() => {
      if (!dc || dc.readyState !== "open") return;
      if (out.inp) send({ inp: out.inp }); else if (now() - lastTx > 300) send({ hb: 1 });
    }, 100));
  }
  return {
    attach, detach, live,
    tryRoute(o) {
      if (!live()) return false;
      const ks = Object.keys(o);
      if (!ks.length || !ks.every(k => (k === "st" || k === "inp") && Array.isArray(o[k]))) return false;
      for (const k of ks) out[k] = o[k];
      return send(o);
    },
    overlay(p) {
      const t = now(); let r = null;
      for (const k of ["st", "inp"]) { const f = fresh[k]; if (f && t - f.t < 1500) { r = r || { ...p }; r[k] = f.v } }
      return r || p;
    }
  };
}
