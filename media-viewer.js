(() => {
  "use strict";

  const bindings = new WeakMap();
  const pendingSeeks = new WeakMap();
  const previews = '[data-work-preview], #menu-preview-video, #work-preview-video, [aria-hidden="true"]';
  let dialog;
  let player;
  let active;
  let opening = 0;
  const chinese = () => document.documentElement.lang.startsWith("zh");
  const label = (zh, en) => chinese() ? zh : en;
  const visible = video => !video.hidden && !video.closest('[hidden], [inert]') && video.getClientRects().length > 0;

  function hydrate(video) {
    if (!video) return;
    const src = video.dataset.src;
    if (src && video.getAttribute("src") !== src) {
      video.preload = "metadata";
      video.src = src;
    }
    return video;
  }

  function setSource(video, src, poster = "") {
    if (!video || !src) return;
    const previous = video.dataset.src || video.getAttribute("src");
    if (previous !== src) {
      const pending = pendingSeeks.get(video);
      if (pending) video.removeEventListener("loadedmetadata", pending);
      pendingSeeks.delete(video);
      video.pause();
      video.removeAttribute("src");
      video.dataset.src = src;
      video.preload = "none";
      video.load();
    } else video.dataset.src = src;
    if (poster) video.poster = poster;
    refreshButton(video);
  }

  function refreshButton(video) {
    const button = bindings.get(video)?.button;
    if (!button) return;
    button.hidden = video.hidden;
    button.title = label("放大播放", "Expand video");
    button.setAttribute("aria-label", button.title);
    positionButton(video);
  }

  function positionButton(video) {
    const button = bindings.get(video)?.button;
    if (!button || video.hidden || !video.offsetWidth || !video.offsetHeight) return;
    const size = 32;
    const controls = video.controls ? 48 : 0;
    button.style.left = `${video.offsetLeft + video.offsetWidth - size - 8}px`;
    button.style.top = `${video.offsetTop + video.offsetHeight - size - 8 - controls}px`;
  }

  function createDialog() {
    if (dialog) return;
    dialog = document.createElement("dialog");
    dialog.id = "media-viewer";
    dialog.className = "media-viewer";
    dialog.setAttribute("aria-labelledby", "media-viewer-title");
    dialog.innerHTML = '<div class="media-viewer-bar"><h2 id="media-viewer-title"></h2><button type="button" class="media-viewer-fullscreen"><span aria-hidden="true">⛶</span></button><button type="button" class="media-viewer-close"><span aria-hidden="true">×</span></button></div><video id="media-viewer-video" controls playsinline preload="none"></video>';
    document.body.append(dialog);
    player = dialog.querySelector("video");
    dialog.querySelector(".media-viewer-close").addEventListener("click", close);
    const fullscreen = dialog.querySelector(".media-viewer-fullscreen");
    fullscreen.hidden = !player.requestFullscreen && !player.webkitEnterFullscreen;
    fullscreen.addEventListener("click", () => {
      if (player.requestFullscreen) player.requestFullscreen().catch(() => {});
      else if (player.webkitEnterFullscreen) player.webkitEnterFullscreen();
    });
    dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
    dialog.addEventListener("click", event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
    });
    dialog.addEventListener("close", dispose);
  }

  function localize() {
    document.querySelectorAll("video").forEach(refreshButton);
    if (!dialog) return;
    dialog.querySelector("h2").textContent = active?.video.getAttribute("aria-label") || label("视频", "Video");
    const fullscreen = dialog.querySelector(".media-viewer-fullscreen");
    fullscreen.title = label("全屏播放", "Enter fullscreen");
    fullscreen.setAttribute("aria-label", fullscreen.title);
    const closeButton = dialog.querySelector(".media-viewer-close");
    closeButton.title = label("关闭视频", "Close video");
    closeButton.setAttribute("aria-label", closeButton.title);
  }

  function open(video) {
    if (!video) return;
    const src = video.dataset.fullSrc || video.dataset.src || video.currentSrc || video.getAttribute("src");
    if (!src) return;
    createDialog();
    if (active) close();
    const token = ++opening;
    active = { video, opener: document.activeElement, time: video.currentTime || 0 };
    document.dispatchEvent(new CustomEvent("portfolio:media-open", { detail: { video } }));
    document.querySelectorAll("video").forEach(item => item.pause());
    player.poster = video.poster;
    player.muted = video.muted;
    player.volume = video.volume;
    player.playbackRate = video.playbackRate;
    player.loop = video.loop;
    player.src = src;
    player.onloadedmetadata = () => {
      if (!active || token !== opening) return;
      player.currentTime = Math.min(active.time, Math.max(0, player.duration - .05));
    };
    localize();
    document.body.classList.add("media-viewer-open");
    dialog.showModal();
    dialog.querySelector(".media-viewer-close").focus({ preventScroll: true });
    player.play().catch(() => {});
  }

  function dispose() {
    if (!active) return;
    const previous = active;
    const time = player.readyState ? player.currentTime : previous.time;
    const duration = player.duration;
    active = null;
    opening++;
    player.pause();
    player.onloadedmetadata = null;
    player.removeAttribute("src");
    player.removeAttribute("poster");
    player.load();
    const seek = () => {
      previous.video.currentTime = Math.min(time, Math.max(0, previous.video.duration - .05));
      pendingSeeks.delete(previous.video);
    };
    if (previous.video.readyState > 0) seek();
    else {
      const pending = pendingSeeks.get(previous.video);
      if (pending) previous.video.removeEventListener("loadedmetadata", pending);
      pendingSeeks.set(previous.video, seek);
      previous.video.addEventListener("loadedmetadata", seek, { once: true });
      hydrate(previous.video);
    }
    document.body.classList.remove("media-viewer-open");
    document.dispatchEvent(new CustomEvent("portfolio:media-close", { detail: { video: previous.video, time, duration } }));
    if (previous.opener?.isConnected) previous.opener.focus({ preventScroll: true });
  }

  function close() {
    if (dialog?.open) dialog.close();
    dispose();
  }

  const observer = "IntersectionObserver" in window ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting && visible(entry.target)) {
        const video = hydrate(entry.target);
        const binding = bindings.get(video);
        if (video.autoplay && binding && !binding.autoplayStarted && !active
          && !matchMedia("(prefers-reduced-motion: reduce)").matches && !navigator.connection?.saveData) {
          binding.autoplayStarted = true;
          video.play().catch(() => {});
        }
      }
      else if (!entry.isIntersecting && !entry.target.closest(".sync-grid")) entry.target.pause();
    }
  }, { threshold: .01 }) : null;

  function attach(root = document) {
    const videos = root.matches?.("video") ? [root] : root.querySelectorAll("video");
    for (const video of videos) {
      if (video.id === "media-viewer-video" || video.matches(previews) || video.closest('button, a, [role="button"]')) continue;
      let binding = bindings.get(video);
      if (!binding) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "media-expand";
        button.innerHTML = '<span aria-hidden="true">⛶</span>';
        button.addEventListener("click", () => open(video));
        const resize = new ResizeObserver(() => positionButton(video));
        binding = { button, resize };
        bindings.set(video, binding);
        resize.observe(video);
        video.addEventListener("loadedmetadata", () => positionButton(video));
        video.addEventListener("pointerdown", () => hydrate(video), { passive: true });
        video.addEventListener("keydown", () => hydrate(video));
        video.addEventListener("play", () => { if (!video.getAttribute("src")) hydrate(video); });
        new MutationObserver(() => refreshButton(video)).observe(video, { attributes: true, attributeFilter: ["hidden"] });
        observer?.observe(video);
      }
      const parent = video.parentElement;
      parent.classList.add("media-expand-host");
      if (binding.button.parentElement !== parent) parent.append(binding.button);
      binding.resize.observe(parent);
      refreshButton(video);
    }
  }

  window.PortfolioMedia = { attach, hydrate, setSource, open, close, localize, get isOpen() { return Boolean(active); } };
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && active) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    }
  }, true);
  document.addEventListener("visibilitychange", () => { if (document.hidden) player?.pause(); });
})();
