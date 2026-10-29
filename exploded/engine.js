(() => {
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /*
    Isometric projection. World space is z-up; screen space is SVG's
    y-down. A point further along +x or +y comes towards the viewer and
    slides down the screen. The whole figure can spin about its vertical
    axis by `theta`, applied in local x/y before projecting.
  */
  const C30 = Math.cos(Math.PI / 6);
  const S30 = 0.5;
  let cosT = 1;
  let sinT = 0;
  const R = (x, y) => [x * cosT - y * sinT, x * sinT + y * cosT];
  const P = (x, y, z) => {
    const [rx, ry] = R(x, y);
    return [(rx - ry) * C30, (rx + ry) * S30 - z];
  };
  // A circle of radius r on a horizontal plane projects to an
  // axis-aligned ellipse whatever the spin. sqrt(2) comes from the 45°
  // rotation of iso.
  const RX = Math.SQRT2 * C30;
  const RY = Math.SQRT2 * S30;

  const f = (n) => Math.round(n * 10) / 10;
  const pts = (list) => list.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");
  const poly = (list, cls) => `<polygon class="s ${cls}" points="${pts(list)}"/>`;

  // How much a local face normal points at the viewer, who looks along
  // -(1, 1) in rotated world x/y. Positive means visible.
  const facing = (nx, ny) => {
    const [wx, wy] = R(nx, ny);
    return wx + wy;
  };
  // Faces turned to the screen's right get one shade, left the other,
  // which keeps a consistent "light from the upper left" while spinning.
  const shade = (nx, ny) => {
    const [wx, wy] = R(nx, ny);
    return wx - wy > 0 ? "fx" : "fy";
  };

  // Top-face decorations, in the part's local x/y on its top plane.
  function details(list, z, ox, oy) {
    return (list || [])
      .map((d) => {
        const cls = d.fill || "none";
        if (d.rect) {
          const [u0, v0, u1, v1] = d.rect;
          const r = d.round ?? 3;
          return poly(roundRect(ox + u0, ox + u1, oy + v0, oy + v1, r).map((c) => P(...c, z)), cls);
        }
        if (d.circle) {
          const [u, v, r] = d.circle;
          const [cx, cy] = P(ox + u, oy + v, z);
          return `<ellipse class="s ${cls}" cx="${f(cx)}" cy="${f(cy)}" rx="${f(r * RX)}" ry="${f(r * RY)}"/>`;
        }
        // Radial lines, for gills and growth marks.
        // A patch of honeycomb: flat-topped hexagons in a staggered grid,
        // some of them filled (capped) by a cheap deterministic hash.
        if (d.hexes) {
          const [u0, v0, u1, v1, size] = d.hexes;
          const w = size * 1.5;
          const h = size * Math.sqrt(3);
          let out = "";
          for (let col = 0, u = u0 + size; u <= u1 - size; col++, u += w) {
            for (let v = v0 + h / 2 + (col % 2) * (h / 2); v <= v1 - h / 2; v += h) {
              const cell = [];
              for (let k = 0; k < 6; k++) {
                const a = (k / 6) * Math.PI * 2;
                cell.push(P(ox + u + size * 0.92 * Math.cos(a), oy + v + size * 0.92 * Math.sin(a), z));
              }
              const capped = Math.sin(u * 12.9898 + v * 78.233) * 43758.5453 % 1;
              out += poly(cell, Math.abs(capped) < 0.55 ? "a top thin" : "none thin");
            }
          }
          return out;
        }
        if (d.rays) {
          const [r0, r1, count] = d.rays;
          let out = "";
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const [ax, ay] = P(ox + r0 * Math.cos(a), oy + r0 * Math.sin(a), z);
            const [bx, by] = P(ox + r1 * Math.cos(a), oy + r1 * Math.sin(a), z);
            out += `<line class="s thin" x1="${f(ax)}" y1="${f(ay)}" x2="${f(bx)}" y2="${f(by)}"/>`;
          }
          return out;
        }
        return "";
      })
      .join("");
  }

  // Left-most and right-most of some projected points, which is where
  // leader lines and assembly guides hook onto a part.
  const extremes = (list) =>
    list.reduce(
      (acc, p) => ({
        left: p[0] < acc.left[0] ? p : acc.left,
        right: p[0] > acc.right[0] ? p : acc.right,
      }),
      { left: list[0], right: list[0] },
    );

  /*
    Footprints. Everything below is drawn from a closed outline in
    plan (counter-clockwise), extruded upwards. A rounded rectangle is
    four quarter-circles joined by straight runs; a circle is just a
    rounded rectangle that's all corner. `wobble` nudges the radius
    with a couple of slow sine waves, which is all it takes to turn a
    disc into a pebble or a patch of ground.
  */
  function roundRect(x0, x1, y0, y1, r, seg = 6) {
    r = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
    if (!r) return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const out = [];
    const corners = [
      [x1 - r, y0 + r, -Math.PI / 2],
      [x1 - r, y1 - r, 0],
      [x0 + r, y1 - r, Math.PI / 2],
      [x0 + r, y0 + r, Math.PI],
    ];
    for (const [cx, cy, a0] of corners) {
      for (let i = 0; i <= seg; i++) {
        const a = a0 + (i / seg) * (Math.PI / 2);
        out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
      }
    }
    return out;
  }

  function circle(cx, cy, r, wobble = 0, seg = 64) {
    const out = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const k = 1 + wobble * (0.6 * Math.sin(a * 3 + 1.3) + 0.4 * Math.sin(a * 5 + 0.4));
      out.push([cx + r * k * Math.cos(a), cy + r * k * Math.sin(a)]);
    }
    return out;
  }

  /*
    Extrude a convex outline from z0 to z1 (`top` may be a smaller
    outline, for a frustum). Side quads that face the viewer are filled
    without strokes, shaded by which way they face, so a rounded corner
    reads as a soft turn instead of a row of facets. The only lines are
    the ones a pen would draw: the top outline, the front of the base,
    and the two silhouette edges.
  */
  function prism(base, top, z0, z1, accent) {
    const a = accent ? "a " : "";
    const B = base.map((c) => P(...c, z0));
    const T = top.map((c) => P(...c, z1));
    const n = base.length;
    let fills = "";
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const [dx, dy] = [base[j][0] - base[i][0], base[j][1] - base[i][1]];
      if (facing(dy, -dx) <= 1e-6) continue;
      const cls = a + shade(dy, -dx);
      fills += `<polygon class="${cls} nf" points="${pts([B[i], B[j], T[j], T[i]])}"/>`;
    }
    // Silhouette: the left-most and right-most base points, and the
    // run of base between them that's nearer the viewer.
    let l = 0;
    let r = 0;
    B.forEach((p, i) => {
      if (p[0] < B[l][0]) l = i;
      if (p[0] > B[r][0]) r = i;
    });
    const walk = (from, to, step) => {
      const out = [];
      for (let i = from; ; i = (i + step + n) % n) {
        out.push(B[i]);
        if (i === to) break;
      }
      return out;
    };
    const a1 = walk(l, r, 1);
    const a2 = walk(l, r, -1);
    const avg = (list) => list.reduce((s, p) => s + p[1], 0) / list.length;
    const front = avg(a1) > avg(a2) ? a1 : a2;
    const lines =
      `<polyline class="s none" points="${pts(front)}"/>` +
      `<line class="s" x1="${f(B[l][0])}" y1="${f(B[l][1])}" x2="${f(T[l][0])}" y2="${f(T[l][1])}"/>` +
      `<line class="s" x1="${f(B[r][0])}" y1="${f(B[r][1])}" x2="${f(T[r][0])}" y2="${f(T[r][1])}"/>`;
    const zm = (z0 + z1) / 2;
    const mid = [P(...base[l], zm), P(...base[r], zm)];
    return {
      svg: fills + lines + poly(T, a + "top"),
      left: mid[0],
      right: mid[1],
    };
  }

  const shapes = {
    // A box with softened corners (`round`), optionally a frustum
    // (`inset` pulls the top in, which is all a keycap really is).
    box(p, o) {
      const [x0, x1] = [p.x[0] + o[0], p.x[1] + o[0]];
      const [y0, y1] = [p.y[0] + o[1], p.y[1] + o[1]];
      const d = p.inset || 0;
      const r = p.round ?? 10;
      const out = prism(
        roundRect(x0, x1, y0, y1, r),
        roundRect(x0 + d, x1 - d, y0 + d, y1 - d, Math.max(2, r - d / 2)),
        p.z[0] + o[2],
        p.z[1] + o[2],
        p.accent,
      );
      out.svg += details(p.details, p.z[1] + o[2], o[0], o[1]);
      // Side-face marks (handholds, an entrance, a plate), each on one
      // face and only drawn while that face is turned towards you. This is
      // what makes spinning a figure worth it: every side says something.
      for (const m of p.sides || []) {
        const [nx, ny] = { "+x": [1, 0], "-x": [-1, 0], "+y": [0, 1], "-y": [0, -1] }[m.face];
        if (facing(nx, ny) <= 1e-6) continue;
        const [u0, u1, z0, z1] = m.rect;
        const at = (u, z) =>
          nx ? P(nx > 0 ? x1 : x0, o[1] + u, z + o[2]) : P(o[0] + u, ny > 0 ? y1 : y0, z + o[2]);
        out.svg += poly([at(u0, z0), at(u1, z0), at(u1, z1), at(u0, z1)], m.fill || "hole");
      }
      return out;
    },

    // A disc, or with `wobble`, a pebble-ish slab.
    cyl(p, o) {
      const [cx, cy] = [(p.c?.[0] || 0) + o[0], (p.c?.[1] || 0) + o[1]];
      const outline = circle(cx, cy, p.r, p.wobble || 0);
      const out = prism(outline, outline, p.z[0] + o[2], p.z[1] + o[2], p.accent);
      out.svg += details(p.details, p.z[1] + o[2], cx, cy);
      return out;
    },

    /*
      A ring around another part (a mushroom's annulus). It's drawn
      twice: whole, before the part it wraps, then just its front half
      (clipped below its own centre line) after it, so the stem
      passes through instead of sitting on top or behind.
    */
    ring(p, o) {
      const [cx, cy] = [o[0], o[1]];
      const [z0, z1] = [p.z[0] + o[2], p.z[1] + o[2]];
      const outer = prism(circle(cx, cy, p.r), circle(cx, cy, p.r), z0, z1, p.accent);
      const [hx, hy] = P(cx, cy, z1);
      // The hole: knock the inner ellipse out of the top with a paper
      // fill (the stem is drawn over it), plus the inner wall's lower lip.
      const hole =
        `<ellipse class="s hole" cx="${f(hx)}" cy="${f(hy)}" rx="${f(p.inner * RX)}" ry="${f(p.inner * RY)}"/>`;
      const svg = outer.svg + hole;
      const id = `clip-${p.name.replace(/\W/g, "")}`;
      const [, by] = P(cx, cy, z0);
      const frontHalf =
        `<clipPath id="${id}"><rect x="-2000" y="${f(hy)}" width="4000" height="${f(by - hy + 400)}"/></clipPath>` +
        `<g clip-path="url(#${id})">${outer.svg}<ellipse class="s none" cx="${f(hx)}" cy="${f(hy)}" ` +
        `rx="${f(p.inner * RX)}" ry="${f(p.inner * RY)}"/></g>`;
      return { svg, after: frontHalf, left: outer.left, right: outer.right };
    },

    /*
      A dome: the top half of a squashed sphere, radius r, height h.
      Under any orthographic view a spheroid's outline is an ellipse.
      Its width is the same as the base circle's; its height comes
      from projecting the semi-axes onto screen y, (x + y) / 2 - z,
      which gives sqrt(r²/2 + h²). So: the upper half of that ellipse,
      closed by the front half of the base ellipse.
    */
    dome(p, o) {
      const [cx, cy] = [o[0], o[1]];
      const z0 = p.z[0] + o[2];
      const [bx, by] = P(cx, cy, z0);
      const rx = p.r * RX;
      const ryb = p.r * RY;
      const rys = Math.sqrt((p.r * p.r) / 2 + p.h * p.h);
      const a = p.accent ? "a " : "";
      let svg =
        `<path class="s ${a}top" d="M${f(bx - rx)},${f(by)} A${f(rx)},${f(rys)} 0 0 1 ${f(bx + rx)},${f(by)} ` +
        `A${f(rx)},${f(ryb)} 0 0 1 ${f(bx - rx)},${f(by)} Z"/>`;
      // A couple of faint latitude lines (their front halves) give the
      // dome its roundness without any shading.
      for (const k of [0.38, 0.72]) {
        const rr = p.r * Math.sqrt(1 - k * k);
        const [, ly] = P(cx, cy, z0 + p.h * k);
        svg +=
          `<path class="s none faint" d="M${f(bx - rr * RX)},${f(ly)} ` +
          `A${f(rr * RX)},${f(rr * RY)} 0 0 0 ${f(bx + rr * RX)},${f(ly)}"/>`;
      }
      // Spots sit on the surface. Only the ones whose surface normal
      // points at the viewer, (1, 1, 1) in iso, are drawn.
      for (const [u, v, s] of p.spots || []) {
        const q = Math.min(0.98, (u * u + v * v) / (p.r * p.r));
        const z = p.h * Math.sqrt(1 - q);
        const [nx, ny] = R(u / (p.r * p.r), v / (p.r * p.r));
        const nz = z / (p.h * p.h);
        if (nx + ny + nz <= 0) continue;
        const [sx, sy] = P(cx + u, cy + v, z0 + z);
        // Foreshorten each spot by how much it tilts away.
        const tilt = Math.max(0.35, nz / Math.hypot(nx, ny, nz));
        svg += `<ellipse class="s top" cx="${f(sx)}" cy="${f(sy)}" rx="${f(s * RX)}" ry="${f(s * RY * (0.6 + tilt))}"/>`;
      }
      return { svg, left: [bx - rx, by], right: [bx + rx, by] };
    },

    // A coil spring. Its height grows with the part's explode amount so
    // it visibly decompresses as the parts around it fly apart.
    helix(p, o, e) {
      const [cx, cy] = [o[0], o[1]];
      const z0 = p.z[0] + o[2];
      const z1 = z0 + p.h + p.stretch * Math.max(0, e);
      const steps = p.turns * 28;
      const line = [];
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * p.turns * Math.PI * 2;
        line.push(P(cx + p.r * Math.cos(t), cy + p.r * Math.sin(t), z0 + ((z1 - z0) * i) / steps));
      }
      const [bx] = P(cx, cy, z0);
      const ym = (P(cx, cy, z0)[1] + P(cx, cy, z1)[1]) / 2;
      return {
        svg: `<polyline class="s none" points="${pts(line)}"/>`,
        left: [bx - p.r * RX, ym],
        right: [bx + p.r * RX, ym],
      };
    },
  };

  // The figure comes from the page (window.EXPLODED). See the comment
  // there for how parts are described.
  const def = window.EXPLODED;

  const zs = def.parts.flatMap((p) => p.z.concat(p.h ? [p.z[0] + p.h] : []));
  const zc = (Math.min(...zs) + Math.max(...zs)) / 2;

  const VIEW = { w: def.view?.[0] ?? 760, h: def.view?.[1] ?? 820 };
  const svg = document.querySelector(".stage");
  svg.setAttribute("viewBox", `${-VIEW.w / 2} ${-VIEW.h / 2} ${VIEW.w} ${VIEW.h}`);
  svg.setAttribute(
    "aria-label",
    `Isometric drawing of a ${def.name.toLowerCase()} that comes apart into ` +
      `${def.parts.map((p) => p.name.toLowerCase()).join(", ")}${def.spin ? ", spins," : ""} and goes back together as you scroll`,
  );
  document.querySelector(".caption").innerHTML = `Fig. ${def.fig} — ${def.name}<span>${def.note}</span>`;
  const stageName = document.querySelector(".stage-name");
  const angleOut = document.querySelector(".angle");

  const arrow = ([x, y], dir) => {
    // A small filled arrowhead pointing in `dir` (unit vector).
    const [dx, dy] = dir;
    const s = 7;
    const w = 3.2;
    return `<polygon class="head" points="${pts([
      [x, y],
      [x - dx * s - dy * w, y - dy * s + dx * w],
      [x - dx * s + dy * w, y - dy * s - dx * w],
    ])}"/>`;
  };

  // Per part: explode amount, plus a little landing bounce.
  const state = def.parts.map(() => ({ e: 0, bounce: 0, age: 1 }));

  function render(theta) {
    cosT = Math.cos(theta);
    sinT = Math.sin(theta);
    let guides = "";
    let behind = "";
    let body = "";
    let front = "";
    let labels = "";
    const pending = [];
    // A ring's front half waits here to be painted over whatever it
    // wraps, which is the part listed right after it.
    let carry = "";

    def.parts.forEach((p, i) => {
      const { e } = state[i];
      // Bounce: a decaying hop, only ever upwards, after landing.
      const hop = state[i].bounce * Math.exp(-state[i].age * 9) * Math.abs(Math.sin(state[i].age * 26)) * 7;
      const o = [p.off[0] * e, p.off[1] * e, p.off[2] * e - zc + hop];
      const cur = shapes[p.shape](p, o, e);
      let hidden = false;

      if (p.flush) {
        // A flush part leaves a slot in its host's +x face. Until it has
        // slid clear it's hidden and the slot is drawn in its colour, so
        // assembled it reads as one surface with a seam. Once out, it's
        // painted in front of or behind the stack depending on which
        // side of it the spin has carried it to.
        const out = Math.abs(p.off[0] * e) > p.x[1] - p.x[0];
        if (facing(1, 0) > 1e-6) {
          const [y0, y1] = p.y;
          const [z0, z1] = p.z.map((z) => z - zc);
          body += poly(
            [P(p.x[1], y0, z0), P(p.x[1], y1, z0), P(p.x[1], y1, z1), P(p.x[1], y0, z1)],
            out ? "hole" : "a fx",
          );
        }
        hidden = !out;
        if (out) {
          const [wx, wy] = R(p.x[1] + o[0], 0);
          if (wx + wy > 0) front += cur.svg;
          else {
            behind += cur.svg;
            // Tucked behind the stack: no point labelling what you
            // can't see.
            hidden = true;
          }
        }
      } else {
        body += cur.svg + carry;
        carry = cur.after || "";
      }

      const travel = Math.hypot(...p.off) * e;
      if (travel > 4) {
        // Assembly guides: dashed lines from where the part lives to
        // where it is now. No arrowheads: the motion already says which
        // way is home, and a ring of arrows round the base is just noise.
        const rest = shapes[p.shape](p, [0, 0, -zc], 0);
        const alpha = f(Math.min(1, travel / 40));
        for (const key of ["left", "right"]) {
          const [ax, ay] = rest[key];
          const [bx, by] = cur[key];
          guides += `<line class="guide" opacity="${alpha}" x1="${f(bx)}" y1="${f(by)}" x2="${f(ax)}" y2="${f(ay)}"/>`;
        }
      }

      // Labels fade in as the parts separate; assembled, the drawing is
      // just a shape. Placed after the loop, once all anchors are known.
      const t = Math.min(1, Math.max(0, (e - 0.25) / 0.45));
      if (t > 0 && !hidden) {
        const left = p.side === "l";
        pending.push({ left, t, name: p.name, anchor: left ? cur.left : cur.right });
      }
    });

    /*
      While the figure spins, anchors on the same side can drift into
      each other. Sort each column by height and push labels apart to a
      minimum gap; the leader then runs diagonally to its true anchor,
      the way a draughtsperson would dodge a crowded spot.
    */
    const GAP = 22;
    for (const left of [true, false]) {
      const col = pending.filter((l) => l.left === left).sort((a, b) => a.anchor[1] - b.anchor[1]);
      col.forEach((l, i) => {
        l.y = l.anchor[1];
        if (i && l.y < col[i - 1].y + GAP) l.y = col[i - 1].y + GAP;
      });
      const lx = left ? -VIEW.w / 2 + 160 : VIEW.w / 2 - 160;
      for (const l of col) {
        const [ax, ay] = l.anchor;
        const tip = [ax + (left ? -8 : 8), ay];
        const elbow = [lx + (left ? 24 : -24), l.y];
        const len = Math.hypot(tip[0] - elbow[0], tip[1] - elbow[1]) || 1;
        labels +=
          `<g opacity="${f(l.t)}">` +
          `<text class="label" x="${f(left ? lx - 10 : lx + 10)}" y="${f(l.y + 4)}" ` +
          `text-anchor="${left ? "end" : "start"}">${l.name.toUpperCase()}</text>` +
          `<polyline class="leader" points="${pts([[lx, l.y], elbow, tip])}"/>` +
          arrow(tip, [(tip[0] - elbow[0]) / len, (tip[1] - elbow[1]) / len]) +
          `</g>`;
      }
    }

    svg.innerHTML = guides + behind + body + carry + front + labels;
  }

  /*
    Sound. Nothing is created until the toggle is pressed: browsers
    won't start audio without a gesture anyway, and a page that makes
    noise unasked is rude. Two voices:
    - a breathy filtered-noise "whoosh" that follows scroll speed and
      opens up as things come apart;
    - a short wooden click each time a part lands back in place, pitched
      per part, loudness from how fast it was going.
  */
  const sound = {
    ctx: null,
    on: false,
    start() {
      if (!this.ctx) {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(ctx.destination);

        const len = ctx.sampleRate * 2;
        this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = this.noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

        const src = ctx.createBufferSource();
        src.buffer = this.noise;
        src.loop = true;
        this.whooshFilter = ctx.createBiquadFilter();
        this.whooshFilter.type = "bandpass";
        this.whooshFilter.frequency.value = 400;
        this.whooshFilter.Q.value = 0.8;
        this.whooshGain = ctx.createGain();
        this.whooshGain.gain.value = 0;
        src.connect(this.whooshFilter).connect(this.whooshGain).connect(this.master);
        src.start();
      }
      this.ctx.resume();
      this.master.gain.setTargetAtTime(0.9, this.ctx.currentTime, 0.05);
      this.on = true;
    },
    stop() {
      if (!this.ctx) return;
      this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.on = false;
      setTimeout(() => !this.on && this.ctx.suspend(), 300);
    },
    air(speed, spread) {
      if (!this.on) return;
      const t = this.ctx.currentTime;
      this.whooshGain.gain.setTargetAtTime(Math.min(0.22, speed * 0.09), t, 0.06);
      this.whooshFilter.frequency.setTargetAtTime(350 + spread * 1600, t, 0.08);
    },
    click(freq, strength) {
      if (!this.on) return;
      const ctx = this.ctx;
      const t = ctx.currentTime;
      const g = Math.min(1, strength);

      // The tone: a triangle blip that drops a touch in pitch, which
      // reads as "wood" more than "beep".
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq * 2, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.6, t + 0.08);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.28 * g + 0.0001, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      osc.connect(og).connect(this.master);
      osc.start(t);
      osc.stop(t + 0.16);

      // The tick: a very short burst of bright noise for the contact.
      const n = ctx.createBufferSource();
      n.buffer = this.noise;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 3200 + Math.random() * 1200;
      bp.Q.value = 1.4;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.exponentialRampToValueAtTime(0.35 * g + 0.0001, t + 0.002);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      n.connect(bp).connect(ng).connect(this.master);
      n.start(t, Math.random());
      n.stop(t + 0.04);
    },
  };

  const button = document.querySelector(".sound");
  const buttonLabel = button.querySelector(".sound-label");
  const bars = [...button.querySelectorAll(".meter i")];
  button.addEventListener("click", () => {
    if (sound.on) sound.stop();
    else sound.start();
    button.setAttribute("aria-pressed", String(sound.on));
    buttonLabel.textContent = sound.on ? "Sound on" : "Sound off";
  });

  /*
    The loop. One cycle of scrolling takes the figure through:

      rest → explode → spin 360° → reassemble → rest

    The page is a few cycles tall and we start in the middle. Whenever
    you get near either end we jump the scroll position by a whole
    number of cycles, which lands on an identical frame, so you can
    scroll forever in either direction and never see the seam.
  */
  const CYCLE = 2400; // px of scroll per cycle
  const COPIES = 6;
  document.querySelector(".track").style.height = `${CYCLE * COPIES + innerHeight}px`;
  history.scrollRestoration = "manual";
  scrollTo(0, CYCLE * (COPIES / 2));

  // Where each phase ends, as a fraction of the cycle.
  // Without a spin (a mushroom looks the same from every side) the
  // middle phase is just a pause, exploded, to read the labels.
  const PHASES = def.spin
    ? [
        ["Assembled", 0.08],
        ["Exploding", 0.38],
        ["Rotating", 0.68],
        ["Assembling", 0.96],
        ["Assembled", 1],
      ]
    : [
        ["Assembled", 0.1],
        ["Exploding", 0.42],
        ["Exploded", 0.58],
        ["Assembling", 0.92],
        ["Assembled", 1],
      ];
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const smooth = (x) => x * x * (3 - 2 * x);
  const span = (u, a, b) => clamp01((u - a) / (b - a));

  // Parts don't all move at once: each one's window is offset so they
  // peel off one by one, and land one by one, which is also what turns
  // the clicks into a little run of notes.
  const STAGGER = 0.45;
  const n = def.parts.length;
  const partT = (t, i) => clamp01((t - (i / Math.max(1, n - 1)) * STAGGER) / (1 - STAGGER));
  // The outermost parts (the ones that travel furthest) leave first and
  // come back last, so nothing ever has to pass through a neighbour
  // that hasn't got out of the way yet.
  const rank = def.parts.map(() => 0);
  def.parts
    .map((p, i) => [Math.hypot(...p.off), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i], r) => (rank[i] = r));

  function pose(u) {
    const out = span(u, PHASES[0][1], PHASES[1][1]);
    const spin = span(u, PHASES[1][1], PHASES[2][1]);
    const back = span(u, PHASES[2][1], PHASES[3][1]);
    return {
      // Lifting off eases in and out. Coming back uses a quarter sine,
      // which leaves gently and arrives at full speed, so each part
      // lands with a knock instead of drifting into place.
      e: (i) =>
        u < PHASES[1][1]
          ? smooth(partT(out, rank[i]))
          : u < PHASES[2][1]
            ? 1
            : Math.sin((1 - partT(back, n - 1 - rank[i])) * (Math.PI / 2)),
      theta: def.spin ? smooth(spin) * Math.PI * 2 : 0,
      stage: PHASES.find(([, end]) => u < end)?.[0] ?? "Assembled",
    };
  }

  let lastY = scrollY;
  let total = 0; // unwrapped scroll distance, immune to the jumps
  let shown = 0; // `total`, smoothed, so the drawing has a little weight
  let speed = 0;
  let lastT = performance.now();
  let lastKey = "";
  const hint = document.querySelector(".hint");
  const PENTA = [0, 3, 5, 7, 10, 12, 15];

  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;

    let y = scrollY;
    if (y < CYCLE || y > CYCLE * (COPIES - 1)) {
      const jump = y < CYCLE ? CYCLE * 2 : -CYCLE * 2;
      scrollTo(0, y + jump);
      lastY += jump;
      y = scrollY;
    }
    const dy = y - lastY;
    lastY = y;
    total += dy;
    if (dy && !hint.classList.contains("gone")) hint.classList.add("gone");

    const ease = reduceMotion ? 1 : 1 - Math.exp(-dt * 12);
    shown += (total - shown) * ease;
    if (Math.abs(total - shown) < 0.05) shown = total;

    speed += (Math.abs(dy) / Math.max(dt * 1000, 1) - speed) * 0.2;
    if (speed < 0.001) speed = 0;

    const u = (((shown / CYCLE) % 1) + 1) % 1;
    const { e, theta, stage } = pose(u);

    let moving = false;
    let spread = 0;
    state.forEach((s, i) => {
      const next = e(i);
      // Landing: the part was in the air and now it's home.
      if (s.e > 0.002 && next <= 0.002 && Math.hypot(...def.parts[i].off) > 0) {
        const hit = Math.min(1, (s.e - next) / Math.max(dt, 1e-3) / 3);
        sound.click(def.root * Math.pow(2, PENTA[i % PENTA.length] / 12), 0.25 + hit);
        if (!reduceMotion) {
          s.bounce = 0.4 + hit * 0.6;
          s.age = 0;
        }
      }
      if (s.age < 1) {
        s.age += dt;
        moving = true;
      }
      s.e = next;
      spread += next / n;
    });

    sound.air(speed, spread);
    if (sound.on) {
      bars.forEach((bar, i) => {
        const level = Math.min(1, speed * 0.8 + spread * 0.6) * (0.6 + 0.4 * Math.sin(now / 90 + i * 1.7));
        bar.style.height = `${2 + Math.round(Math.max(0, level) * 8)}px`;
      });
    } else {
      bars.forEach((bar) => (bar.style.height = "2px"));
    }

    // Only touch the DOM when something visibly changed.
    const key = `${f(shown)}|${moving}`;
    if (key !== lastKey || moving) {
      lastKey = key;
      render(theta);
      stageName.textContent = stage;
      if (def.spin) angleOut.textContent = `Rot ${String(Math.round((theta * 180) / Math.PI) % 360).padStart(3, "0")}°`;
    }

    requestAnimationFrame(frame);
  }

  /*
    The background: contour lines, like a survey map of a forest floor.
    Smooth value noise is sampled on a coarse grid and marching squares
    traces where it crosses evenly spaced heights. It's drawn once (and on
    resize or a colour-scheme change), so it costs nothing while you scroll.
  */
  const topo = document.createElement("canvas");
  topo.className = "topo";
  topo.setAttribute("aria-hidden", "true");
  document.body.prepend(topo);

  const seed = 7.31;
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed) * 43758.5453;
    return s - Math.floor(s);
  };
  const valueNoise = (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = smooth(xf);
    const v = smooth(yf);
    const a = hash(xi, yi);
    const b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1);
    const d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const field = (x, y) =>
    valueNoise(x, y) * 0.6 + valueNoise(x * 2.1 + 5, y * 2.1 + 9) * 0.28 + valueNoise(x * 4.3, y * 4.3) * 0.12;

  function drawTopo() {
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = innerWidth;
    const H = innerHeight;
    topo.width = W * dpr;
    topo.height = H * dpr;
    const ctx = topo.getContext("2d");
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--topo").trim();
    ctx.lineWidth = 1;
    ctx.beginPath();

    const cell = 7;
    const scale = 1 / 440;
    const cols = Math.ceil(W / cell) + 1;
    const rows = Math.ceil(H / cell) + 1;
    const g = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < cols; i++) g[j * cols + i] = field(i * cell * scale, j * cell * scale);

    const STEP = 0.04;
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = g[j * cols + i];
        const b = g[j * cols + i + 1];
        const c = g[(j + 1) * cols + i + 1];
        const d = g[(j + 1) * cols + i];
        const lo = Math.min(a, b, c, d);
        const hi = Math.max(a, b, c, d);
        const x = i * cell;
        const y = j * cell;
        for (let L = Math.ceil(lo / STEP) * STEP; L < hi; L += STEP) {
          // Where the level crosses each edge, if it does.
          const hits = [];
          const edge = (v0, v1, x0, y0, x1, y1) => {
            if ((v0 < L) !== (v1 < L)) {
              const t = (L - v0) / (v1 - v0);
              hits.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
            }
          };
          edge(a, b, x, y, x + cell, y);
          edge(b, c, x + cell, y, x + cell, y + cell);
          edge(c, d, x + cell, y + cell, x, y + cell);
          edge(d, a, x, y + cell, x, y);
          for (let k = 0; k + 1 < hits.length; k += 2) {
            ctx.moveTo(...hits[k]);
            ctx.lineTo(...hits[k + 1]);
          }
        }
      }
    }
    ctx.stroke();
  }

  let topoTimer = 0;
  const redrawTopo = () => {
    clearTimeout(topoTimer);
    topoTimer = setTimeout(drawTopo, 150);
  };
  addEventListener("resize", redrawTopo);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", drawTopo);
  drawTopo();

  render(0);
  requestAnimationFrame(frame);
})();
