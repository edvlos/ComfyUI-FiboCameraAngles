import { app } from "../../scripts/app.js";

// ---------------------------------------------------------------- prompt preview (mirrors camera_prompt.py)
const wrap = (a) => { a = ((Number(a) % 360) + 360) % 360; return a > 180 ? a - 360 : a; };
function viewLabel(h) {
  const a = Math.abs(h), side = h > 0 ? "right" : "left";
  if (a <= 15) return "front view";
  if (a <= 65) return `front-${side} three-quarter view`;
  if (a <= 115) return `${side} side profile view`;
  if (a <= 165) return `back-${side} three-quarter view`;
  return "back view, seen from behind";
}
function elevLabel(v) {
  if (v <= -40) return "worm's-eye view from the ground, looking steeply up, the subject towering against the sky";
  if (v <= -12) return "low-angle shot from below, the camera close to the ground looking up at the subject, more sky visible behind";
  if (v < 12) return "eye-level shot";
  if (v < 40) return "high-angle shot from above, the camera looking down at the subject, more of the ground visible around";
  if (v < 70) return "bird's-eye view from high above, looking steeply down, the top of the head and the ground around clearly visible";
  return "top-down overhead shot from directly above, looking straight down";
}
function shotLabel(z, person) {
  if (z < 1.5) return "extreme wide shot, the subject small in a large environment";
  if (z < 3.5) return person ? "wide shot showing the full body and the surroundings" : "wide shot showing the whole subject and the surroundings";
  if (z < 5.5) return person ? "full shot from head to toe" : "full shot of the whole subject";
  if (z < 7.0) return person ? "medium shot from the waist up" : "medium shot";
  if (z < 8.5) return person ? "medium close-up from the chest up" : "medium close-up";
  if (z < 9.5) return person ? "close-up of the face" : "close-up";
  return person ? "extreme close-up of the face" : "extreme close-up of a detail";
}
function shortLabel(h, v, z, person) {
  return `${viewLabel(h)} · ${elevLabel(v).split(",")[0]} · ${shotLabel(z, person).split(",")[0]}`;
}

// ---------------------------------------------------------------- 3D view (orthographic, fixed oblique viewpoint)
const DEG = Math.PI / 180;
const VIEW_YAW = 38 * DEG, VIEW_PITCH = 30 * DEG;
const RING_R = 1.0;      // pink ring: rotation (azimuth)
const ARC_R = 1.0;       // green arc: height (elevation), rising from the ring
const ELEV_MIN = -20, ELEV_MAX = 80;  // the arc is drawn short, mostly above the ring; values outside are clamped on the arc
// the green arc stays fixed on the left of the ring (the leftmost ring point, so it is seen fully curved)
const COL = { pink: "#f0437f", green: "#2ee6c0", yellow: "#ffb81f", text: "#d6dbe0", dim: "#5d6772", prompt: "#ff6f8f" };

function project(p, cx, cy, s) {
  const x1 = p[0] * Math.cos(VIEW_YAW) + p[2] * Math.sin(VIEW_YAW);
  const z1 = -p[0] * Math.sin(VIEW_YAW) + p[2] * Math.cos(VIEW_YAW);
  const y2 = p[1] * Math.cos(VIEW_PITCH) - z1 * Math.sin(VIEW_PITCH);
  return { x: cx + x1 * s, y: cy - y2 * s };
}
// subject faces +Z (front); +h moves the camera to the right (towards +X)
const ringPt = (h) => [RING_R * Math.sin(h * DEG), 0, RING_R * Math.cos(h * DEG)];
const ARC_H = -90 * 1 - 38;
const arcPt = (h, v) => [ARC_R * Math.cos(v * DEG) * Math.sin(h * DEG), ARC_R * Math.sin(v * DEG), ARC_R * Math.cos(v * DEG) * Math.cos(h * DEG)];
const zoomT = (z) => 1 - 0.9 * (z / 10);   // yellow handle position on the line: 1 = at the ring (far), 0.1 = at the subject (close)

const H_PRESETS = [["front view", 0], ["front-right quarter", 45], ["right side", 90], ["back-right quarter", 135], ["back view", 180], ["back-left quarter", -135], ["left side", -90], ["front-left quarter", -45]];
const V_PRESETS = [["worm's-eye", -60], ["low-angle", -25], ["eye-level", 0], ["high-angle", 25], ["bird's-eye", 55], ["top-down", 85]];
const Z_PRESETS = [["extreme wide", 1], ["wide shot", 2.5], ["full body", 4.5], ["medium shot", 6.2], ["medium close-up", 7.8], ["close-up", 9], ["extreme close-up", 9.8]];
const nearest = (list, val, circ) => list.reduce((b, it) => {
  let d = Math.abs(it[1] - val); if (circ) d = Math.min(d, 360 - d);
  return d < b[1] ? [it, d] : b;
}, [list[0], 1e9])[0];

app.registerExtension({
  name: "fibo.camera.angles",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "FiboCameraAngles") return;
    const onCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = onCreated?.apply(this, arguments);
      const node = this;
      const W = (n) => node.widgets?.find((w) => w.name === n);
      const get = () => ({
        h: wrap(W("horizontal_angle")?.value ?? 0),
        v: Number(W("vertical_angle")?.value ?? 0),
        z: Number(W("zoom")?.value ?? 5),
        person: W("subject_is_person")?.value ?? true,
      });
      const setVal = (name, val, commit = true) => {
        const w = W(name); if (!w) return;
        w.value = val; if (commit) w.callback?.(val);
        node.setDirtyCanvas?.(true, true); draw();
      };

      // ------------------------------------------------ DOM
      const root = document.createElement("div");
      root.style.cssText = "display:flex;flex-direction:column;width:100%;background:#0d1114;border-radius:8px;overflow:hidden;font:11px sans-serif;color:" + COL.text;
      const promptLine = document.createElement("div");
      promptLine.style.cssText = `padding:6px 8px;font:10px monospace;color:${COL.prompt};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-bottom:1px solid #1b2228`;
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "width:100%;height:330px;display:block;touch-action:none";
      const bar = document.createElement("div");
      bar.style.cssText = "display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:6px;padding:6px 8px;border-top:1px solid #1b2228;align-items:center";
      root.append(promptLine, canvas, bar);

      const mkSel = (color, list, onPick) => {
        const wrapEl = document.createElement("div");
        wrapEl.style.cssText = "display:flex;flex-direction:column;gap:2px;align-items:center";
        const sel = document.createElement("select");
        sel.style.cssText = `width:100%;background:#151c21;color:#d6dbe0;border:1px solid #2a333b;border-radius:4px;font-size:10px;padding:2px`;
        list.forEach(([t, v]) => { const o = document.createElement("option"); o.value = String(v); o.textContent = t; sel.append(o); });
        sel.addEventListener("change", (e) => { e.stopPropagation(); onPick(Number(sel.value)); });
        sel.addEventListener("pointerdown", (e) => e.stopPropagation());
        const num = document.createElement("div");
        num.style.cssText = `color:${color};font:11px monospace`;
        wrapEl.append(sel, num); bar.append(wrapEl);
        return { sel, num };
      };
      const hSel = mkSel(COL.pink, H_PRESETS, (v) => setVal("horizontal_angle", v));
      const vSel = mkSel(COL.green, V_PRESETS, (v) => setVal("vertical_angle", v));
      const zSel = mkSel(COL.yellow, Z_PRESETS, (v) => setVal("zoom", v));
      const reset = document.createElement("button");
      reset.textContent = "↺"; reset.title = "Reset";
      reset.style.cssText = `background:#151c21;color:${COL.pink};border:1px solid #2a333b;border-radius:4px;cursor:pointer;padding:2px 7px;font-size:13px`;
      reset.onclick = (e) => { e.stopPropagation(); setVal("horizontal_angle", 0); setVal("vertical_angle", 0); setVal("zoom", 5); };
      bar.append(reset);

      // ------------------------------------------------ photo on the subject card
      let img = null, imgSrc = "";
      const findImageSrc = () => {
        const inp = node.inputs?.find((i) => i.name === "image");
        if (!inp || inp.link == null) return "";
        const link = node.graph?.links?.get ? node.graph.links.get(inp.link) : node.graph?.links?.[inp.link];
        if (!link) return "";
        const src = node.graph.getNodeById(link.origin_id);
        const iw = src?.widgets?.find((w) => w.name === "image");
        if (!iw || typeof iw.value !== "string" || !iw.value) return "";
        let name = iw.value, sub = "";
        const m = name.replace(/\\/g, "/").match(/^(.*)\/([^/]+)$/);
        if (m) { sub = m[1]; name = m[2]; }
        return `/view?filename=${encodeURIComponent(name)}&type=input&subfolder=${encodeURIComponent(sub)}`;
      };

      // ------------------------------------------------ geometry for the current size
      let geo = null;
      const layout = () => {
        const cw = canvas.clientWidth || 400, ch = canvas.clientHeight || 330;
        const s = Math.min(cw / 3.3, ch / 2.75);
        return { cw, ch, s, cx: cw / 2, cy: ch * 0.64 };
      };
      const handles = (st, L) => {
        const P = (p) => project(p, L.cx, L.cy, L.s);
        const center = P([0, 0, 0]);
        const pink = P(ringPt(st.h));
        const green = P(arcPt(ARC_H, Math.max(ELEV_MIN, Math.min(ELEV_MAX, st.v))));
        const t = zoomT(st.z);
        const yellow = { x: center.x + (pink.x - center.x) * t, y: center.y + (pink.y - center.y) * t };
        return { center, pink, green, yellow, P };
      };

      // ------------------------------------------------ drawing
      let hover = null, drag = null;
      function draw() {
        const st = get();
        const src = findImageSrc();
        if (src !== imgSrc) {
          imgSrc = src; img = null;
          if (src) { const im = new Image(); im.onload = () => { img = im; draw(); }; im.src = src; }
        }
        promptLine.textContent = `${viewLabel(st.h)} ${elevLabel(st.v).split(",")[0]} ${shotLabel(st.z, st.person).split(",")[0]}`;
        hSel.sel.value = String(nearest(H_PRESETS, st.h, true)[1]); hSel.num.textContent = `${Math.round(st.h)}°`;
        vSel.sel.value = String(nearest(V_PRESETS, st.v)[1]); vSel.num.textContent = `${Math.round(st.v)}°`;
        zSel.sel.value = String(nearest(Z_PRESETS, st.z)[1]); zSel.num.textContent = st.z.toFixed(1);

        const L = layout(); geo = L;
        const dpr = window.devicePixelRatio || 1;
        if (canvas.width !== Math.round(L.cw * dpr) || canvas.height !== Math.round(L.ch * dpr)) {
          canvas.width = Math.round(L.cw * dpr); canvas.height = Math.round(L.ch * dpr);
        }
        const ctx = canvas.getContext("2d");
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, L.cw, L.ch);
        const Hd = handles(st, L), P = Hd.P;

        // faint ground grid
        ctx.strokeStyle = "#151b20"; ctx.lineWidth = 1;
        for (let i = -3; i <= 3; i++) {
          const a = P([i * 0.5, 0, -1.6]), b = P([i * 0.5, 0, 1.6]), c = P([-1.6, 0, i * 0.5]), d = P([1.6, 0, i * 0.5]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
        }
        // pink ring (rotation)
        const ring = (r, w, col, alpha) => {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = alpha; ctx.beginPath();
          for (let a = 0; a <= 360; a += 4) { const p = P([r * Math.sin(a * DEG), 0, r * Math.cos(a * DEG)]); a ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
          ctx.stroke(); ctx.globalAlpha = 1;
        };
        ring(RING_R, hover === "pink" || drag === "pink" ? 7 : 5, COL.pink, 0.85);
        ring(0.16, 2, COL.pink, 0.6);
        ctx.fillStyle = COL.dim; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
        [["FRONT", 0], ["RIGHT", 90], ["BACK", 180], ["LEFT", -90]].forEach(([t, a]) => {
          const p = P([1.42 * Math.sin(a * DEG), 0, 1.42 * Math.cos(a * DEG)]); ctx.fillText(t, p.x, p.y + 4);
        });

        // subject card (faces the front, +Z)
        const hw = 0.3, hh = 0.85;
        const c00 = P([-hw, 0, 0]), c10 = P([hw, 0, 0]), c01 = P([-hw, hh, 0]), c11 = P([hw, hh, 0]);
        ctx.save();
        ctx.setTransform(dpr * (c10.x - c00.x), dpr * (c10.y - c00.y), dpr * (c00.x - c01.x), dpr * (c00.y - c01.y), dpr * c01.x, dpr * c01.y);
        ctx.globalAlpha = img ? 0.92 : 0.55;
        if (img) ctx.drawImage(img, 0, 0, 1, 1); else { ctx.fillStyle = "#56606b"; ctx.fillRect(0, 0, 1, 1); }
        ctx.restore(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.strokeStyle = "#8d98a4"; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(c00.x, c00.y); ctx.lineTo(c10.x, c10.y); ctx.lineTo(c11.x, c11.y); ctx.lineTo(c01.x, c01.y); ctx.closePath(); ctx.stroke();

        // green arc (height) in the camera's vertical plane
        ctx.strokeStyle = COL.green; ctx.lineWidth = hover === "green" || drag === "green" ? 6 : 4; ctx.lineCap = "round";
        ctx.beginPath();
        for (let e = ELEV_MIN, i = 0; e <= ELEV_MAX; e += 3, i++) { const p = P(arcPt(ARC_H, e)); i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
        ctx.stroke();
        // dashed drop from the green handle to the ground
        const vv = Math.max(ELEV_MIN, Math.min(ELEV_MAX, st.v));
        const gGround = P([ARC_R * Math.cos(vv * DEG) * Math.sin(ARC_H * DEG), 0, ARC_R * Math.cos(vv * DEG) * Math.cos(ARC_H * DEG)]);
        ctx.strokeStyle = COL.dim; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(gGround.x, gGround.y); ctx.lineTo(Hd.green.x, Hd.green.y); ctx.stroke(); ctx.setLineDash([]);

        // yellow line (distance) from the subject to the pink handle
        ctx.strokeStyle = COL.yellow; ctx.globalAlpha = 0.35; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(Hd.center.x, Hd.center.y); ctx.lineTo(Hd.pink.x, Hd.pink.y); ctx.stroke(); ctx.globalAlpha = 1;
        ctx.lineWidth = hover === "yellow" || drag === "yellow" ? 6 : 4;
        ctx.beginPath(); ctx.moveTo(Hd.yellow.x, Hd.yellow.y); ctx.lineTo(Hd.pink.x, Hd.pink.y); ctx.stroke();

        const ball = (p, r, col, active) => {
          ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = active ? 22 : 12;
          ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, active ? r + 2 : r, 0, 7); ctx.fill(); ctx.restore();
          ctx.fillStyle = "rgba(255,255,255,0.55)"; ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.35, 0, 7); ctx.fill();
        };
        ball(Hd.yellow, 10, COL.yellow, hover === "yellow" || drag === "yellow");
        ball(Hd.green, 11, COL.green, hover === "green" || drag === "green");
        ball(Hd.pink, 13, COL.pink, hover === "pink" || drag === "pink");

        ctx.fillStyle = COL.dim; ctx.textAlign = "left"; ctx.font = "10px sans-serif";
        ctx.fillText("drag the balls (or click the ring / arc / line) · pink: rotation · green: height · yellow: distance", 8, L.ch - 8);
      }

      // ------------------------------------------------ interaction (each handle has its own job)
      // the node may be CSS-scaled by the ComfyUI canvas zoom: convert screen pixels to the canvas' own layout pixels
      const mouse = (e) => {
        const b = canvas.getBoundingClientRect();
        const sx = (canvas.clientWidth || b.width) / (b.width || 1), sy = (canvas.clientHeight || b.height) / (b.height || 1);
        return { x: (e.clientX - b.left) * sx, y: (e.clientY - b.top) * sy };
      };
      const pick = (m) => {
        const Hd = handles(get(), layout());
        const d = (p) => Math.hypot(p.x - m.x, p.y - m.y);
        const cands = [["pink", d(Hd.pink)], ["green", d(Hd.green)], ["yellow", d(Hd.yellow)]].filter((c) => c[1] < 24).sort((a, b) => a[1] - b[1]);
        if (cands.length) return cands[0][0];
        // not on a ball: clicking on the ring, the arc or the line also grabs that control
        const st = get(), L = layout(), P = (p) => project(p, L.cx, L.cy, L.s);
        let best = null, bd = 18;
        for (let a = -180; a <= 180; a += 3) { const q = P(ringPt(a)); const dd = Math.hypot(q.x - m.x, q.y - m.y); if (dd < bd) { bd = dd; best = "pink"; } }
        for (let e = ELEV_MIN; e <= ELEV_MAX; e += 3) { const q = P(arcPt(ARC_H, e)); const dd = Math.hypot(q.x - m.x, q.y - m.y); if (dd < bd) { bd = dd; best = "green"; } }
        const vx = Hd.pink.x - Hd.center.x, vy = Hd.pink.y - Hd.center.y, len2 = vx * vx + vy * vy || 1;
        const t = Math.max(0, Math.min(1, ((m.x - Hd.center.x) * vx + (m.y - Hd.center.y) * vy) / len2));
        const dl = Math.hypot(Hd.center.x + vx * t - m.x, Hd.center.y + vy * t - m.y);
        if (dl < bd && t > 0.08) { best = "yellow"; }
        return best;
      };
      const dragTo = (which, m, commit) => {
        const st = get(), L = layout(), P = (p) => project(p, L.cx, L.cy, L.s);
        if (which === "pink") {
          let best = st.h, bd = 1e9;
          for (let a = -180; a <= 180; a += 1) { const p = P(ringPt(a)); const dd = (p.x - m.x) ** 2 + (p.y - m.y) ** 2; if (dd < bd) { bd = dd; best = a; } }
          setVal("horizontal_angle", Math.round(wrap(best)), commit);
        } else if (which === "green") {
          let best = st.v, bd = 1e9;
          for (let e = ELEV_MIN; e <= ELEV_MAX; e += 1) { const p = P(arcPt(ARC_H, e)); const dd = (p.x - m.x) ** 2 + (p.y - m.y) ** 2; if (dd < bd) { bd = dd; best = e; } }
          setVal("vertical_angle", best, commit);
        } else if (which === "yellow") {
          const Hd = handles(st, L);
          const vx = Hd.pink.x - Hd.center.x, vy = Hd.pink.y - Hd.center.y, len2 = vx * vx + vy * vy || 1;
          let t = ((m.x - Hd.center.x) * vx + (m.y - Hd.center.y) * vy) / len2;
          t = Math.max(0.1, Math.min(1, t));
          const z = Math.round(((1 - t) / 0.9) * 10 * 10) / 10;
          setVal("zoom", Math.max(0, Math.min(10, z)), commit);
        }
      };
      canvas.addEventListener("pointerdown", (e) => {
        const which = pick(mouse(e));
        if (!which) return;
        e.preventDefault(); e.stopPropagation();
        drag = which; canvas.setPointerCapture(e.pointerId);
        dragTo(which, mouse(e), false); // jump right away when the ring / arc / line was clicked
        draw();
      });
      canvas.addEventListener("pointermove", (e) => {
        const m = mouse(e);
        if (drag) { e.preventDefault(); e.stopPropagation(); dragTo(drag, m, false); return; }
        const h = pick(m);
        if (h !== hover) { hover = h; canvas.style.cursor = h ? "grab" : "default"; draw(); }
      });
      const end = (e) => {
        if (!drag) return;
        const which = drag; drag = null;
        const name = { pink: "horizontal_angle", green: "vertical_angle", yellow: "zoom" }[which];
        W(name)?.callback?.(W(name).value); draw();
      };
      canvas.addEventListener("pointerup", (e) => { if (drag) { e.preventDefault(); e.stopPropagation(); } end(e); }); canvas.addEventListener("pointercancel", end);
      canvas.addEventListener("pointerleave", () => { if (!drag && hover) { hover = null; draw(); } });
      canvas.addEventListener("wheel", (e) => {
        e.preventDefault(); e.stopPropagation();
        const z = Math.max(0, Math.min(10, get().z - Math.sign(e.deltaY) * 0.2));
        setVal("zoom", Math.round(z * 10) / 10);
      }, { passive: false });

      const widget = this.addDOMWidget("camera_view", "fibo_camera_view", root, {
        serialize: false, hideOnZoom: false, getMinHeight: () => 420,
      });
      widget.computeSize = (w) => [w, 420];

      let last = "";
      const tick = () => {
        if (!node.graph) return;
        const st = get();
        const key = [st.h, st.v, st.z, st.person, findImageSrc(), canvas.clientWidth, hover, drag].join("|");
        if (key !== last) { last = key; draw(); }
      };
      const iv = setInterval(tick, 200);
      const onRemoved = this.onRemoved;
      this.onRemoved = function () { clearInterval(iv); return onRemoved?.apply(this, arguments); };
      this.setSize?.([Math.max(this.size[0], 460), Math.max(this.size[1], 720)]);
      setTimeout(draw, 50);
      return r;
    };
  },
});
