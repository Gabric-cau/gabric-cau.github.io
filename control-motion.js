(function (global) {
  'use strict';

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

  function validMotionData(data) {
    const vector = value => Array.isArray(value) && value.length >= 3 && value.slice(0, 3).every(Number.isFinite);
    const plan = value => Number.isFinite(value?.length_mm) && value.length_mm > 0
      && Number.isFinite(value?.duration_s) && value.duration_s > 0 && Number.isInteger(value?.count) && value.count > 1
      && Array.isArray(value.samples) && value.samples.length > 1
      && value.samples.every((sample, i, samples) => vector(sample.p) && Number.isFinite(sample.speed)
        && Number.isFinite(sample.t) && (!i || sample.t > samples[i - 1].t));
    return Array.isArray(data?.waypoints) && data.waypoints.length > 1 && data.waypoints.every(vector)
      && plan(data.interpolated) && ['fillet', 'zone'].every(mode =>
        Array.from({ length: 15 }, (_, i) => String(10 + i * 5)).every(radius => plan(data.profiles?.[mode]?.[radius])));
  }

  // Measure the exported polyline, not equal-time samples with different speeds.
  function closestPathPoint(point, samples) {
    let closest = { distance: Infinity, point: null };
    for (let i = 1; i < samples.length; i += 1) {
      const start = samples[i - 1].p.slice(0, 3);
      const vector = samples[i].p.slice(0, 3).map((value, axis) => value - start[axis]);
      const squaredLength = vector.reduce((sum, value) => sum + value * value, 0);
      const phase = squaredLength ? clamp(vector.reduce((sum, value, axis) => sum + value * (point[axis] - start[axis]), 0) / squaredLength, 0, 1) : 0;
      const projected = start.map((value, axis) => value + phase * vector[axis]);
      const distance = Math.hypot(...projected.map((value, axis) => value - point[axis]));
      if (distance < closest.distance) closest = { distance, point: projected };
    }
    return closest;
  }

  // A controlled arrival schedule isolates a short delivery gap from low throughput.
  // This is a timing illustration, not a replay of the robot controller.
  function simulateQueue({ prefill = 6, period = 4, latency = 8, gap = 12, horizon = 200 } = {}) {
    const packets = [];
    let previousArrival = -1;
    for (let id = 0; id < 80; id += 1) {
      const sent = id * period;
      const delayed = sent >= 48 && sent < 64;
      const arrived = Math.max(sent + latency + (delayed ? gap : 0), previousArrival + 0.25);
      packets.push({ id, sent, arrived });
      previousArrival = arrived;
    }
    const pending = [];
    const frames = [];
    let arrivalIndex = 0;
    let active = null;
    let started = false;
    let startTime = null;
    let completed = 0;
    let waiting = 0;
    for (let time = 0; time <= horizon; time += 0.25) {
      while (arrivalIndex < packets.length && packets[arrivalIndex].arrived <= time) {
        pending.push(packets[arrivalIndex++]);
      }
      if (active && time >= active.until) { completed += 1; active = null; }
      if (!started && pending.length >= prefill) { started = true; startTime = time; }
      if (started && !active && pending.length) active = { packet: pending.shift(), since: time, until: time + 4 };
      const isWaiting = started && !active;
      if (isWaiting) waiting += 0.25;
      if (Number.isInteger(time)) {
        frames.push({
          time, pending: pending.map(packet => packet.id), completed,
          current: active ? active.packet.id : null,
          position: completed + (active ? (time - active.since) / 4 : 0),
          age: active ? time - active.packet.sent : 0,
          waiting, started, startTime,
          status: !started ? 'prefill' : isWaiting ? 'wait' : 'moving',
        });
      }
    }
    return { packets, frames, prefill };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { simulateQueue, validMotionData, closestPathPoint };
    return;
  }

  const colors = { bg: '#09291f', paper: '#f5f7f2', muted: '#acbdb5', grid: '#2e493e', raw: '#ff927d', spline: '#93cdeb', blend: '#d9f46a', fillet: '#d9f46a', zone: '#edca7e', gold: '#edca7e' };
  const strings = {
    zh: {
      path: '路径怎么变平滑', queue: '怎样连续下发', raw: '离散路点', spline: '五次插值', blend: '加入转角处理',
      radius: '转角参数', full: '全路径', corner: '转角细节', play: '播放', pause: '暂停', reset: '回到起点', step: '推进一步',
      progress: '运动进度', clock: '发送与执行时间', pathTitle: '同一组路点，两种转角处理',
      fillet: 'Fillet', zone: 'Zone', filletParameter: '圆角半径 R', zoneParameter: '沿段交融距离 d',
      cornerGap: '路径至 P3 的最近距离',
      comparisonCopy: '90° 转角，同值时路径较接近；较大参数还会受相邻转角限制。',
      pathCopy: '我把位置的五次插值、姿态插值和转角处理接进同一套规划接口。Fillet / Zone 先调整拐角附近的几何，再生成满足速度约束的连续路径；随后检查逆解与关节连续性，输出每 4 ms 一个的 ServoCart 目标点。',
      filletCopy: '圆角半径决定转弯幅度。我加入相邻圆角的重叠检查，避免局部平滑破坏整条路径。',
      zoneCopy: '交融距离决定多早离开原来的线段。我对相邻交融区做冲突处理，重叠时缩小范围，给连续运动留出空间。',
      source: '轨迹由原 SDK 规划器生成，使用同一组示例路点。',
      targetCount: '输出点数', interval: '下发周期', distance: '路径长度', speed: '沿路径速度', phase: '时间进度',
      queueTitle: '为什么要保留短缓冲',
      queueCopy: '真机调试时，我发现路径算得平滑，执行仍可能卡顿：当前点走完，下一点却还没到。因此我在发送端加入预填充、低水位补点和高水位节流，用短队列缓冲到点间隔，同时限制尚未执行的点数。',
      queueDetail: '我把初始水位设为 6，低、高水位设为 5 和 8，并预留 2 点余量。发送端集中补点，读到队列超过 6 点就暂停发送，兼顾连续执行和目标滞后。',
      queueLimit: '短队列可以吸收短时到点间隔。若供点长期慢于每 4 ms 的消费速度，队列仍会耗尽。',
      timingNote: '缓冲深度示意：统一设定 8 ms 传输和一次 12 ms 波动，再比较 1、6、14 点缓冲。图中等待缓冲建成的启动规则不代表控制器实测；SDK 实际通过发送端补点与节流维持短队列，8 ms 是轮询周期。',
      supply: '持续供点间隔', queueLabels: ['1 点缓冲', '6 点缓冲', '14 点缓冲'],
      queueDetails: ['缓冲深度对比 · 示意', '缓冲深度对比 · 示意', '缓冲深度对比 · 示意'],
      statuses: { prefill: '缓冲建立中', wait: '等待下一点', moving: '连续执行' },
      sent: '发送', received: '到达', now: '当前时刻', endEffector: '末端进度', pending: '待执行点',
      wait: '执行中断', startDelay: '启动等待', backlog: '待执行时长', age: '当前点龄', units: '点',
      empty: '空队列', complete: '运动完成',
      fieldLabel: '莆田 · PUMA 鞋厂', fieldTitle: '从轨迹规划到现场机械臂',
      fieldCopy: '我把路径规划、转角处理和队列下发封装成 SDK，让应用侧通过点位列表调用机械臂运动。这套接口已用于莆田 PUMA 鞋厂的机械臂，现场录像记录了 SDK 驱动机械臂执行的过程。',
      fieldSource: '现场应用录像', loading: '正在载入路径', error: '路径数据暂时无法载入', retry: '重新载入',
    },
    en: {
      path: 'Shape the path', queue: 'Keep execution continuous', raw: 'Discrete waypoints', spline: 'Quintic interpolation', blend: 'With corner blending',
      radius: 'Corner parameter', full: 'Full path', corner: 'Corner detail', play: 'Play', pause: 'Pause', reset: 'Restart', step: 'Step forward',
      progress: 'Motion progress', clock: 'Send / execution time', pathTitle: 'One input, two corner treatments',
      fillet: 'Fillet', zone: 'Zone', filletParameter: 'Fillet radius R', zoneParameter: 'Blend distance d',
      cornerGap: 'Minimum distance to P3',
      comparisonCopy: 'At these 90° corners, equal values give similar paths. Neighboring corners also limit larger values.',
      pathCopy: 'I built one planning interface for position, orientation and corner blending. Fillet / Zone reshapes each corner before speed-constrained quintic planning. IK and joint-continuity checks then screen the path before I stream ServoCart targets every 4 ms.',
      filletCopy: 'The radius sets how broadly the path turns. I check adjacent fillets for overlap so smoothing one corner does not compromise the next.',
      zoneCopy: 'The blend distance sets how early the path leaves each segment. My planner reduces overlapping zones to keep neighboring corners compatible.',
      source: 'Paths from my SDK planner, using the same set of example waypoints.',
      targetCount: 'Targets', interval: 'Command period', distance: 'Path length', speed: 'Path speed', phase: 'Normalized time',
      queueTitle: 'Keeping the arm moving',
      queueCopy: 'I wanted smooth paths to stay smooth on the real arm. My sender prefills a short queue, then refills and throttles it using watermarks, covering brief delivery gaps without building a stale backlog.',
      queueDetail: 'I start with 6 targets, set low/high watermarks at 5/8 and reserve 2 slots. The sender refills in bursts, pausing when the sampled queue exceeds 6 to balance continuous motion with fresh commands.',
      queueLimit: 'A short queue absorbs brief gaps. If targets keep arriving more slowly than the 4 ms consumption period, it will still run empty.',
      timingNote: 'Buffer-depth illustration: the same assumed 8 ms transport and 12 ms disturbance for 1, 6 and 14 targets. Waiting for a full initial buffer is illustrative, not measured controller behavior. The SDK instead uses sender-side refill and throttling; its 8 ms parameter is the polling interval.',
      supply: 'Sustained arrival period', queueLabels: ['1-target buffer', '6-target buffer', '14-target buffer'],
      queueDetails: ['Buffer depth · illustration', 'Buffer depth · illustration', 'Buffer depth · illustration'],
      statuses: { prefill: 'BUILDING BUFFER', wait: 'WAITING', moving: 'EXECUTING' },
      sent: 'SEND', received: 'ARRIVE', now: 'PLAYHEAD', endEffector: 'END EFFECTOR', pending: 'PENDING',
      wait: 'Execution stalls', startDelay: 'Startup wait', backlog: 'Pending time', age: 'Target age', units: 'targets',
      empty: 'EMPTY', complete: 'Complete',
      fieldLabel: 'PUTIAN · PUMA FOOTWEAR FACTORY', fieldTitle: 'My SDK on a factory arm',
      fieldCopy: 'Applications provide waypoints; my SDK handles interpolation, corners and queued delivery. This recording shows it in use on a robot arm at the PUMA footwear factory in Putian.',
      fieldSource: 'Recorded factory application', loading: 'Loading paths', error: 'Path data could not be loaded', retry: 'Reload',
    },
  };

  const state = { lang: 'zh', tab: 'path', mode: 'fillet', radii: { fillet: 40, zone: 40 }, view: 'full', phase: 0.36, time: 61, period: 4,
    playing: false, layers: { raw: true, spline: true, fillet: true, zone: true }, data: null, error: false, simulations: null };
  let root;
  let canvas;
  let resizeObserver;
  let visibilityObserver;
  let frameHandle;
  let previousFrame;
  let fetching = null;
  const tr = () => strings[state.lang];
  const text = (zh, en) => state.lang === 'zh' ? zh : en;

  function icon(kind) {
    const names = { play: '&#9654;', pause: '&#10074;&#10074;', reset: '&#8634;', step: '&#9654;&#124;' };
    return `<span aria-hidden="true">${names[kind]}</span>`;
  }

  function profile(mode = state.mode) { return state.data?.profiles[mode][String(state.radii[mode])]; }
  function compileQueue() { state.simulations = [1, 6, 14].map(prefill => simulateQueue({ prefill, period: state.period })); }

  function markup() {
    const t = tr();
    const active = state.tab;
    root.className = 'pm-root';
    root.dataset.motionView = active;
    root.innerHTML = `
      <nav class="pm-tabs" aria-label="${text('运动 SDK', 'Motion SDK')}">
        <button type="button" data-pm-tab="path" aria-pressed="${active === 'path'}"><span>01</span>${t.path}</button>
        <button type="button" data-pm-tab="queue" aria-pressed="${active === 'queue'}"><span>02</span>${t.queue}</button>
      </nav>
      <div class="pm-workspace">
        <div class="pm-visual">
          ${active === 'path' ? `<div class="pm-options">
            <div class="pm-legend" aria-label="${text('路径图层', 'Path layers')}">${['raw', 'spline', 'fillet', 'zone'].map(key => `<label><input type="checkbox" data-pm-layer="${key}" ${state.layers[key] ? 'checked' : ''}><i style="--pm-swatch:${colors[key]}"></i>${t[key]}${['fillet', 'zone'].includes(key) ? ` <output data-pm-readout="${key}-legend"></output>` : ''}</label>`).join('')}</div>
            <div class="pm-view" aria-label="${text('路径视角', 'Path view')}"><button type="button" data-pm-view="full" aria-pressed="${state.view === 'full'}">${t.full}</button><button type="button" data-pm-view="corner" aria-pressed="${state.view === 'corner'}">${t.corner}</button></div>
          </div>` : `<div class="pm-queue-key"><span><i style="--pm-swatch:${colors.spline}"></i>${t.sent}</span><span><i style="--pm-swatch:${colors.blend}"></i>${t.received}</span><b>8 ms ${text('传输', 'transport')} · 4 ms ${text('执行', 'execution')}</b></div>`}
          <canvas class="pm-canvas" aria-label="${active === 'path' ? text('同一坐标系内的离散路点、五次插值、Fillet与Zone路径，P3转角放大及对应速度曲线', 'Overlaid waypoints, quintic, Fillet and Zone paths, a P3 close-up and speed curves') : text('相同到点时序下，随到随走、6点预填充和14点预填充的等待与积压对比', 'One arrival schedule compared with 1, 6 and 14 target startup queues')}"></canvas>
          <div class="pm-playback">
            <button class="pm-icon" type="button" data-pm-action="play" title="${t.play}" aria-label="${t.play}">${icon('play')}</button>
            <button class="pm-icon" type="button" data-pm-action="reset" title="${t.reset}" aria-label="${t.reset}">${icon('reset')}</button>
            <button class="pm-icon" type="button" data-pm-action="step" title="${t.step}" aria-label="${t.step}">${icon('step')}</button>
            <label class="pm-scrub"><span>${active === 'path' ? t.progress : t.clock}</span><input type="range" data-pm-input="phase" min="0" max="1000" value="${active === 'path' ? state.phase * 1000 : state.time * 5}"></label>
            <output data-pm-readout="time"></output>
          </div>
          <p class="pm-source">${active === 'path' ? t.source : t.timingNote}</p>
        </div>
        <aside class="pm-aside">
          <p class="pm-eyebrow">${active === 'path' ? 'PATH GEOMETRY' : text('缓冲深度 · 时序示意', 'BUFFER DEPTH · TIMING ILLUSTRATION')}</p>
          <h3>${active === 'path' ? t.pathTitle : t.queueTitle}</h3>
          <p>${active === 'path' ? t.pathCopy : t.queueCopy}</p>
          ${active === 'path' ? `
            <div class="pm-mode" aria-label="${text('转角处理方式', 'Corner treatment')}"><button type="button" data-pm-mode="fillet" aria-pressed="${state.mode === 'fillet'}">Fillet</button><button type="button" data-pm-mode="zone" aria-pressed="${state.mode === 'zone'}">Zone</button></div>
            <label class="pm-parameter"><span><span data-pm-readout="parameter-label">${t[`${state.mode}Parameter`]}</span><output data-pm-readout="radius">${state.radii[state.mode]} mm</output></span><input type="range" data-pm-input="radius" min="10" max="80" step="5" value="${state.radii[state.mode]}"></label>
            <p class="pm-detail" data-pm-readout="mode-copy">${state.mode === 'fillet' ? t.filletCopy : t.zoneCopy}</p>
            <div class="pm-comparison"><p>${t.cornerGap}</p><div><span>Fillet <output data-pm-readout="fillet-gap"></output></span><span>Zone <output data-pm-readout="zone-gap"></output></span></div><p>${t.comparisonCopy}</p></div>
            <dl class="pm-stats"><div><dt>${t.targetCount}</dt><dd data-pm-readout="count">—</dd></div><div><dt>${t.interval}</dt><dd>4 ms</dd></div><div><dt>${t.distance}</dt><dd data-pm-readout="distance">—</dd></div></dl>
          ` : `
            <label class="pm-parameter"><span>${t.supply}<output data-pm-readout="period">${state.period} ms</output></span><input type="range" data-pm-input="period" min="4" max="8" step="2" value="${state.period}"></label>
            <p class="pm-detail">${t.queueDetail}</p><p class="pm-limit">${t.queueLimit}</p>
            <dl class="pm-stats"><div><dt>${text('低 / 高水位', 'Low / high')}</dt><dd>5 / 8</dd></div><div><dt>${text('预填充', 'Prefill')}</dt><dd>6</dd></div><div><dt>${text('发送暂停', 'Send pauses')}</dt><dd>Q &gt; 6</dd></div></dl>
          `}
        </aside>
      </div>
      <figure class="pm-field">
        <video src="assets/media/servo-spline-puma-factory.mp4" poster="assets/media/servo-spline-puma-factory-poster.jpg" controls playsinline preload="metadata" aria-label="${t.fieldSource}"></video>
        <figcaption><p class="pm-eyebrow">${t.fieldLabel}</p><h3>${t.fieldTitle}</h3><p>${t.fieldCopy}</p><span class="pm-field-note">${t.fieldSource}</span></figcaption>
      </figure>`;
    canvas = root.querySelector('canvas');
    attachEvents();
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(draw);
    resizeObserver.observe(root.querySelector('.pm-visual'));
    syncLoadState();
    syncReadouts();
    draw();
  }

  function attachEvents() {
    root.querySelectorAll('[data-pm-tab]').forEach(button => button.addEventListener('click', () => {
      stop(); root.querySelectorAll('video').forEach(video => video.pause());
      state.tab = button.dataset.pmTab; markup();
    }));
    root.querySelectorAll('[data-pm-mode]').forEach(button => button.addEventListener('click', () => {
      state.mode = button.dataset.pmMode;
      root.querySelectorAll('[data-pm-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      root.querySelector('[data-pm-readout="mode-copy"]').textContent = state.mode === 'fillet' ? tr().filletCopy : tr().zoneCopy;
      root.querySelector('[data-pm-input="radius"]').value = state.radii[state.mode];
      syncReadouts(); draw();
    }));
    root.querySelectorAll('[data-pm-view]').forEach(button => button.addEventListener('click', () => {
      state.view = button.dataset.pmView;
      root.querySelectorAll('[data-pm-view]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      draw();
    }));
    root.querySelectorAll('[data-pm-layer]').forEach(input => input.addEventListener('change', () => {
      state.layers[input.dataset.pmLayer] = input.checked; draw();
    }));
    root.querySelectorAll('[data-pm-input]').forEach(input => input.addEventListener('input', () => {
      const key = input.dataset.pmInput;
      if (key === 'phase') { stop(); if (state.tab === 'path') state.phase = Number(input.value) / 1000; else state.time = Number(input.value) / 5; }
      if (key === 'radius') state.radii[state.mode] = Number(input.value);
      if (key === 'period') { state.period = Number(input.value); compileQueue(); }
      syncReadouts(); draw();
    }));
    root.querySelectorAll('[data-pm-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.pmAction;
      if (action === 'play') { if (state.playing) stop(); else play(); }
      if (action === 'reset') { stop(); state.phase = 0; state.time = 0; }
      if (action === 'step') { stop(); if (state.tab === 'path') state.phase = clamp(state.phase + 0.04, 0, 1); else state.time = clamp(state.time + 4, 0, 200); }
      syncReadouts(); draw();
    }));
  }

  function stop() {
    state.playing = false;
    cancelAnimationFrame(frameHandle);
    previousFrame = null;
    syncPlayButton();
  }

  function play() {
    if (state.tab === 'path' && state.phase >= 1) state.phase = 0;
    if (state.tab === 'queue' && state.time >= 200) state.time = 0;
    state.playing = true;
    previousFrame = null;
    syncPlayButton();
    frameHandle = requestAnimationFrame(tick);
  }

  function tick(timestamp) {
    if (!state.playing || !root.getClientRects().length || document.hidden) { stop(); return; }
    if (previousFrame !== null) {
      const elapsed = Math.min(timestamp - previousFrame, 60);
      if (state.tab === 'path') state.phase = clamp(state.phase + elapsed / 9000, 0, 1);
      else state.time = clamp(state.time + elapsed / 50, 0, 200);
    }
    previousFrame = timestamp;
    syncReadouts(); draw();
    if ((state.tab === 'path' && state.phase >= 1) || (state.tab === 'queue' && state.time >= 200)) stop();
    else frameHandle = requestAnimationFrame(tick);
  }

  function syncPlayButton() {
    const button = root?.querySelector('[data-pm-action="play"]');
    if (!button) return;
    const label = state.playing ? tr().pause : tr().play;
    button.innerHTML = icon(state.playing ? 'pause' : 'play');
    button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-pressed', String(state.playing));
  }

  function syncReadouts() {
    if (!root) return;
    root.dataset.motionMode = state.mode;
    const put = (key, value) => { const node = root.querySelector(`[data-pm-readout="${key}"]`); if (node) node.textContent = value; };
    const current = profile();
    put('time', state.tab === 'path' ? `${Math.round(state.phase * 100)}%` : `${Math.round(state.time)} ms`);
    put('radius', `${state.radii[state.mode]} mm`); put('period', `${state.period} ms`);
    put('parameter-label', tr()[`${state.mode}Parameter`]);
    ['fillet', 'zone'].forEach(mode => {
      put(`${mode}-legend`, `${mode === 'fillet' ? 'R' : 'd'} ${state.radii[mode]} mm`);
      const plan = profile(mode);
      if (plan) put(`${mode}-gap`, `≈ ${closestPathPoint(state.data.waypoints[2], plan.samples).distance.toFixed(1)} mm`);
    });
    if (current) { put('count', current.count.toLocaleString()); put('distance', `${Math.round(current.length_mm)} mm`); }
    const range = root.querySelector('[data-pm-input="phase"]');
    if (range) range.value = state.tab === 'path' ? String(state.phase * 1000) : String(state.time * 5);
  }

  function line(ctx, points, color, width = 2, dash = []) {
    if (!points.length) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    points.forEach((point, i) => i ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1]));
    ctx.stroke(); ctx.setLineDash([]);
  }
  function label(ctx, value, x, y, color = colors.muted, size = 13, align = 'left', weight = 500) {
    ctx.fillStyle = color; ctx.font = `${weight} ${size}px "Microsoft YaHei", Arial, sans-serif`; ctx.textAlign = align; ctx.fillText(value, x, y);
  }
  function dot(ctx, x, y, color, radius = 5) {
    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  }
  function grid(ctx, x, y, width, height, columns = 5, rows = 4) {
    for (let i = 0; i <= columns; i += 1) line(ctx, [[x + width * i / columns, y], [x + width * i / columns, y + height]], colors.grid, 0.6);
    for (let i = 0; i <= rows; i += 1) line(ctx, [[x, y + height * i / rows], [x + width, y + height * i / rows]], colors.grid, 0.6);
  }
  function poseAt(samples, fraction) {
    const index = clamp(fraction, 0, 1) * (samples.length - 1);
    const a = samples[Math.floor(index)].p;
    const b = samples[Math.ceil(index)].p;
    return a.map((value, axis) => value + (b[axis] - value) * (index % 1));
  }

  function drawPath(ctx, width, height) {
    const t = tr();
    if (!state.data) {
      label(ctx, state.error ? t.error : t.loading, width / 2, height / 2, colors.paper, 18, 'center');
      return;
    }
    const mobile = width < 520;
    const left = mobile ? 38 : 48;
    const top = 44;
    const plotWidth = width - left - 24;
    const plotHeight = height - 214;
    const raw = state.data.waypoints;
    const interpolated = state.data.interpolated;
    const treatments = ['fillet', 'zone'].map(mode => ({ mode, plan: profile(mode), nearest: closestPathPoint(raw[2], profile(mode).samples) }));
    const all = [...raw, ...interpolated.samples.map(item => item.p), ...treatments.flatMap(({ plan }) => plan.samples.map(item => item.p))];
    let minX = Math.min(...all.map(p => p[0])) - 16;
    let maxX = Math.max(...all.map(p => p[0])) + 16;
    let minY = Math.min(...all.map(p => p[1])) - 16;
    let maxY = Math.max(...all.map(p => p[1])) + 16;
    if (state.view === 'corner') {
      minX = raw[2][0] - 12; maxX = raw[2][0] + 63;
      minY = raw[2][1] - 63; maxY = raw[2][1] + 12;
    }
    const scale = Math.min(plotWidth / (maxX - minX), plotHeight / (maxY - minY));
    const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
    minX = centerX - plotWidth / (2 * scale); maxX = centerX + plotWidth / (2 * scale);
    minY = centerY - plotHeight / (2 * scale); maxY = centerY + plotHeight / (2 * scale);
    const map = point => [left + (point[0] - minX) * scale, top + plotHeight - (point[1] - minY) * scale];
    label(ctx, 'X–Y / mm', left, 23, colors.muted, 12);
    label(ctx, state.view === 'corner' ? text('P3 · 90° 转角', 'P3 · 90° CORNER') : text('5 个相同输入路点', '5 IDENTICAL INPUT WAYPOINTS'), width - 24, 23, colors.muted, 12, 'right');
    const tickStep = state.view === 'corner' ? 20 : Math.max(maxX - minX, maxY - minY) > 450 ? 100 : 50;
    for (let x = Math.ceil(minX / tickStep) * tickStep; x <= maxX; x += tickStep) {
      const px = map([x, minY])[0];
      line(ctx, [[px, top], [px, top + plotHeight]], colors.grid, .6);
      label(ctx, String(x), px, top + plotHeight + 19, colors.muted, 11, 'center');
    }
    for (let y = Math.ceil(minY / tickStep) * tickStep; y <= maxY; y += tickStep) {
      const py = map([minX, y])[1];
      line(ctx, [[left, py], [left + plotWidth, py]], colors.grid, .6);
      label(ctx, String(y), left - 9, py + 4, colors.muted, 11, 'right');
    }
    ctx.save(); ctx.beginPath(); ctx.rect(left, top, plotWidth, plotHeight); ctx.clip();
    if (state.layers.raw) line(ctx, raw.map(map), colors.raw, 2, [7, 5]);
    if (state.layers.spline) line(ctx, interpolated.samples.map(item => map(item.p)), colors.spline, 3);
    treatments.forEach(({ mode, plan }) => {
      if (state.layers[mode]) line(ctx, plan.samples.map(item => map(item.p)), colors[mode], mode === state.mode ? 3.2 : 2.4, mode === 'zone' ? [8, 4] : []);
    });
    if (state.layers.raw) raw.forEach((point, i) => {
      const [x, y] = map(point);
      if (x < left || x > left + plotWidth || y < top || y > top + plotHeight) return;
      dot(ctx, x, y, colors.bg, 7); ctx.strokeStyle = colors.raw; ctx.lineWidth = 2; ctx.stroke();
      const offset = i === 2 ? 22 : -13;
      label(ctx, `P${i + 1}`, clamp(x, left + 14, left + plotWidth - 14), clamp(y + offset, top + 16, top + plotHeight - 4), colors.paper, 13, 'center', 600);
    });
    if (state.layers.spline) { const p = map(poseAt(interpolated.samples, state.phase)); dot(ctx, ...p, colors.spline, 6); }
    treatments.forEach(({ mode, plan, nearest }) => {
      if (!state.layers[mode]) return;
      const p = map(poseAt(plan.samples, state.phase)); dot(ctx, ...p, colors[mode], 6);
      if (state.view === 'corner') {
        line(ctx, [map(raw[2]), map(nearest.point)], colors[mode], 1, [3, 4]);
        dot(ctx, ...map(nearest.point), colors[mode], 3);
      }
    });
    ctx.restore();
    if (state.view === 'full' && !mobile) {
      // The 90-degree example is intentionally close. Enlarge its actual exports
      // in unused plot space rather than exaggerating either trajectory.
      const inset = { x: left + 12, y: top + 12, width: Math.min(250, plotWidth * .36), height: Math.min(200, plotHeight * .67) };
      const insetScale = Math.min((inset.width - 26) / 70, (inset.height - 34) / 70);
      const insetMap = point => [inset.x + 12 + (point[0] - raw[2][0] + 10) * insetScale, inset.y + 28 + (raw[2][1] + 10 - point[1]) * insetScale];
      const focusA = map([raw[2][0] - 10, raw[2][1] + 10]);
      const focusB = map([raw[2][0] + 60, raw[2][1] - 60]);
      line(ctx, [focusA, [focusB[0], focusA[1]], focusB, [focusA[0], focusB[1]], focusA], colors.muted, .7, [3, 5]);
      line(ctx, [[inset.x + inset.width, inset.y + inset.height], focusA], colors.grid, .8, [3, 5]);
      ctx.fillStyle = colors.bg; ctx.fillRect(inset.x, inset.y, inset.width, inset.height);
      ctx.strokeStyle = colors.grid; ctx.lineWidth = 1; ctx.strokeRect(inset.x, inset.y, inset.width, inset.height);
      label(ctx, text('P3 转角放大', 'P3 CLOSE-UP'), inset.x + 6, inset.y + 17, colors.paper, 11);
      ctx.save(); ctx.beginPath(); ctx.rect(inset.x, inset.y + 22, inset.width, inset.height - 22); ctx.clip();
      if (state.layers.raw) line(ctx, raw.map(insetMap), colors.raw, 1.4, [5, 4]);
      if (state.layers.spline) line(ctx, interpolated.samples.map(item => insetMap(item.p)), colors.spline, 2);
      treatments.forEach(({ mode, plan, nearest }) => {
        if (!state.layers[mode]) return;
        line(ctx, plan.samples.map(item => insetMap(item.p)), colors[mode], 2.4, mode === 'zone' ? [6, 3] : []);
        line(ctx, [insetMap(raw[2]), insetMap(nearest.point)], colors[mode], .8, [2, 3]);
        dot(ctx, ...insetMap(nearest.point), colors[mode], 2.5);
      });
      ctx.restore();
      const barX = inset.x + inset.width - 16 - 20 * insetScale;
      const barY = inset.y + inset.height - 13;
      line(ctx, [[barX, barY - 3], [barX, barY], [barX + 20 * insetScale, barY], [barX + 20 * insetScale, barY - 3]], colors.muted, 1);
      label(ctx, '20 mm', barX + 10 * insetScale, barY - 7, colors.muted, 10, 'center');
    }
    const speedTop = top + plotHeight + 64;
    const speedHeight = 76;
    const maxSpeed = Math.max(...interpolated.samples.map(item => item.speed), ...treatments.flatMap(({ plan }) => plan.samples.map(item => item.speed))) * 1.08;
    label(ctx, `${t.speed} / mm·s⁻¹`, left, speedTop - 14, colors.paper, 13);
    grid(ctx, left, speedTop, plotWidth, speedHeight, 4, 2);
    label(ctx, String(Math.round(maxSpeed)), left - 8, speedTop + 4, colors.muted, 11, 'right');
    label(ctx, '0', left - 8, speedTop + speedHeight + 4, colors.muted, 11, 'right');
    const speedMap = item => [left + item[0] * plotWidth, speedTop + speedHeight * (1 - item[1] / maxSpeed)];
    if (state.layers.spline) line(ctx, interpolated.samples.map(item => speedMap([item.t / interpolated.duration_s, item.speed])), colors.spline, 2);
    treatments.forEach(({ mode, plan }) => {
      if (state.layers[mode]) line(ctx, plan.samples.map(item => speedMap([item.t / plan.duration_s, item.speed])), colors[mode], 2, mode === 'zone' ? [6, 3] : []);
    });
    line(ctx, [[left + plotWidth * state.phase, speedTop], [left + plotWidth * state.phase, speedTop + speedHeight]], colors.paper, 1, [4, 4]);
    label(ctx, `${t.phase} / %`, width - 24, speedTop + speedHeight + 23, colors.muted, 11, 'right');
    label(ctx, '0', left, speedTop + speedHeight + 23, colors.muted, 11);
    label(ctx, '50', left + plotWidth / 2, speedTop + speedHeight + 23, colors.muted, 11, 'center');
  }

  function drawQueue(ctx, width, height) {
    const t = tr();
    const mobile = width < 570;
    const pad = mobile ? 18 : 24;
    const timelineX = mobile ? 76 : 82;
    const timelineWidth = width - timelineX - pad;
    const timeX = time => timelineX + time / 200 * timelineWidth;
    const packets = state.simulations[0].packets;
    label(ctx, t.sent, pad, 26, colors.spline, 12);
    label(ctx, t.received, pad, 61, colors.blend, 12);
    line(ctx, [[timelineX, 22], [width - pad, 22]], colors.grid, 1);
    line(ctx, [[timelineX, 57], [width - pad, 57]], colors.grid, 1);
    packets.filter(packet => packet.sent <= 200).forEach(packet => {
      const visible = packet.sent <= state.time;
      ctx.globalAlpha = visible ? 1 : 0.3;
      dot(ctx, timeX(packet.sent), 22, colors.spline, mobile ? 2 : 3);
      if (packet.arrived <= 200) {
        dot(ctx, timeX(packet.arrived), 57, colors.blend, mobile ? 2 : 3);
        if (packet.sent <= state.time && packet.arrived > state.time) line(ctx, [[timeX(packet.sent), 25], [timeX(packet.arrived), 54]], colors.spline, 1);
      }
    });
    ctx.globalAlpha = 1;
    line(ctx, [[timeX(state.time), 5], [timeX(state.time), 72]], colors.paper, 1, [4, 3]);
    for (let time = 0; time <= 200; time += 50) label(ctx, `${time}`, timeX(time), 87, colors.muted, 11, 'center');
    label(ctx, 'ms', width - pad, 104, colors.muted, 11, 'right');
    const rowHeight = mobile ? 203 : 155;
    const start = 122;
    const palette = [colors.raw, colors.blend, colors.gold];
    state.simulations.forEach((simulation, index) => {
      const y = start + index * rowHeight;
      const frame = simulation.frames[Math.round(clamp(state.time, 0, 200))];
      const statusColor = frame.status === 'wait' ? colors.raw : frame.status === 'prefill' ? colors.gold : colors.blend;
      line(ctx, [[pad, y - 10], [width - pad, y - 10]], colors.grid, 1);
      label(ctx, t.queueLabels[index], pad, y + 15, colors.paper, mobile ? 16 : 17, 'left', 600);
      label(ctx, t.statuses[frame.status], width - pad, y + 15, statusColor, 12, 'right', 600);
      label(ctx, `${t.startDelay} ${Math.round(frame.startTime ?? frame.time)} ms`, pad, y + 37, colors.muted, 12);
      const trackY = y + 51;
      const trackWidth = mobile ? width - pad * 2 : Math.max(190, width * 0.35);
      const progress = clamp(frame.position / 48, 0, 1);
      const trackHeight = 36;
      const trajectory = state.data?.profiles.fillet['40'].samples;
      if (trajectory) {
        const minimumX = Math.min(...trajectory.map(sample => sample.p[0]));
        const maximumX = Math.max(...trajectory.map(sample => sample.p[0]));
        const minimumY = Math.min(...trajectory.map(sample => sample.p[1]));
        const maximumY = Math.max(...trajectory.map(sample => sample.p[1]));
        const routeMap = point => [pad + (point[0] - minimumX) / (maximumX - minimumX) * trackWidth, trackY + trackHeight - (point[1] - minimumY) / (maximumY - minimumY) * trackHeight];
        line(ctx, trajectory.map(sample => routeMap(sample.p)), colors.grid, 3);
        line(ctx, trajectory.slice(0, Math.max(1, Math.floor(progress * trajectory.length))).map(sample => routeMap(sample.p)), palette[index], 3);
        dot(ctx, ...routeMap(poseAt(trajectory, progress)), statusColor, 6);
      } else {
        line(ctx, [[pad, trackY + 18], [pad + trackWidth, trackY + 18]], colors.grid, 3);
        dot(ctx, pad + trackWidth * progress, trackY + 18, statusColor, 6);
      }
      label(ctx, `${t.endEffector} · P${Math.min(49, Math.floor(frame.position) + 1)}`, pad, trackY + trackHeight + 17, colors.muted, 11);
      const queueX = mobile ? pad : width * 0.45;
      const queueY = mobile ? y + 134 : y + 54;
      label(ctx, `${t.pending} · ${frame.pending.length}`, queueX, queueY - 8, colors.muted, 12);
      const slots = 14;
      const boxWidth = mobile ? Math.min(18, (width - pad * 2 - 13 * 3) / slots) : Math.min(21, (width * 0.5 - 13 * 3) / slots);
      for (let slot = 0; slot < slots; slot += 1) {
        ctx.fillStyle = slot < frame.pending.length ? palette[index] : colors.grid;
        ctx.fillRect(queueX + slot * (boxWidth + 3), queueY, boxWidth, 18);
      }
      const highMark = queueX + 8 * (boxWidth + 3) - 1.5;
      line(ctx, [[highMark, queueY - 4], [highMark, queueY + 25]], colors.gold, 1, [3, 2]);
      label(ctx, '8', highMark, queueY + 37, colors.gold, 10, 'center');
      if (frame.pending.length > 14) label(ctx, `+${frame.pending.length - 14}`, width - pad, queueY + 35, colors.gold, 12, 'right');
      const metricsY = mobile ? y + 178 : y + 122;
      label(ctx, `${t.wait} ${Math.round(frame.waiting)} ms`, pad, metricsY, frame.waiting ? colors.raw : colors.muted, 12);
      label(ctx, `${t.backlog} ${frame.pending.length * 4} ms`, width - pad, metricsY, colors.muted, 12, 'right');
      const endY = y + rowHeight - 19;
      const barX = pad;
      const barWidth = width - pad * 2;
      for (let time = 0; time < 200; time += 1) {
        const status = simulation.frames[time].status;
        ctx.fillStyle = status === 'wait' ? colors.raw : status === 'prefill' ? '#665c42' : '#536a42';
        ctx.globalAlpha = time <= state.time ? 1 : 0.3;
        ctx.fillRect(barX + time / 200 * barWidth, endY, barWidth / 200 + 0.5, 5);
      }
      ctx.globalAlpha = 1;
      line(ctx, [[barX + state.time / 200 * barWidth, endY - 4], [barX + state.time / 200 * barWidth, endY + 9]], colors.paper, 1);
    });
  }

  function draw() {
    if (!canvas || !root.getClientRects().length) return;
    const width = Math.round(canvas.getBoundingClientRect().width);
    if (width < 10) return;
    const height = state.tab === 'path' ? (state.data ? Math.max(width < 520 ? 460 : 510, Math.min(720, width / 2.2 + 200)) : 220) : (width < 570 ? 738 : 600);
    canvas.style.height = `${height}px`;
    const ratio = Math.min(global.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height); ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, width, height);
    if (state.tab === 'path') drawPath(ctx, width, height); else drawQueue(ctx, width, height);
    root.dataset.motionReady = state.data ? 'true' : 'false';
    root.dataset.motionPlaying = String(state.playing);
  }

  function syncLoadState() {
    if (!root) return;
    root.dataset.motionLoad = state.data ? 'ready' : state.error ? 'error' : 'loading';
    const note = root.querySelector('.pm-source');
    if (!note) return;
    if (state.tab === 'path' && state.error) {
      note.innerHTML = `<span role="status">${tr().error}</span> <button type="button" data-pm-retry>${tr().retry}</button>`;
      note.querySelector('button').addEventListener('click', load);
    } else note.textContent = state.tab === 'path' ? tr().source : tr().timingNote;
    root.querySelectorAll('[data-pm-mode], [data-pm-view], [data-pm-layer], [data-pm-input="radius"], [data-pm-action], [data-pm-input="phase"]').forEach(control => {
      control.disabled = state.tab === 'path' && !state.data;
    });
  }

  async function load() {
    if (state.data || fetching) return fetching;
    state.error = false;
    syncLoadState(); draw();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    fetching = fetch('assets/data/motion-comparison.json', { signal: controller.signal, cache: 'no-cache' }).then(response => {
      if (!response.ok) throw new Error('Motion data unavailable');
      return response.json();
    }).then(data => {
      if (!validMotionData(data)) throw new Error('Incomplete motion data');
      state.data = data; state.error = false;
    }).catch(() => {
      state.error = true;
    }).finally(() => {
      clearTimeout(timeout); fetching = null;
      syncLoadState(); syncReadouts(); draw();
    });
    return fetching;
  }

  function init() {
    const element = document.getElementById('motion-lab');
    if (!element) return;
    if (root === element && canvas) { draw(); load(); return; }
    root = element;
    state.lang = document.documentElement.lang.startsWith('en') ? 'en' : 'zh';
    compileQueue(); markup(); load();
    visibilityObserver = new IntersectionObserver(entries => { if (!entries[0].isIntersecting) stop(); else draw(); });
    visibilityObserver.observe(root);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else { draw(); if (state.error && root.getBoundingClientRect().width) load(); } });
    global.addEventListener('online', () => { if (state.error) load(); });
    global.addEventListener('pageshow', draw);
  }

  function render(language) {
    if (!root) init();
    if (!root) return;
    const next = language === 'en' ? 'en' : 'zh';
    if (next !== state.lang) { stop(); state.lang = next; markup(); }
    draw(); load();
  }
  global.PortfolioMotion = { init, render, pause: stop, simulateQueue };
})(typeof window === 'undefined' ? globalThis : window);
