/*
 * NX Avatar Studio — Roblox Catalog Browser add-on
 * Add this file beside avatar-studio.html and reference it with:
 * <script type="module" src="nx-roblox-catalog.js"></script>
 *
 * Uses Roblox's public Catalog search and Thumbnail endpoints. It stores selected
 * items through the existing catalogForm, so the original Supabase save flow is kept.
 */
(() => {
  "use strict";

  const STYLE_ID = "nxRobloxCatalogStyle";
  const PANEL_ID = "nxRobloxCatalogPanel";
  const SEARCH_URL = "https://catalog.roblox.com/v1/search/items/details";
  const THUMB_URL = "https://thumbnails.roblox.com/v1/assets";
  const PAGE_SIZE = 30;
  const state = {
    query: "",
    category: "all",
    nextPageCursor: null,
    results: [],
    loading: false,
    request: 0,
    thumbCache: new Map(),
  };

  const $ = (id) => document.getElementById(id);

  function el(tag, attrs = {}, text = "") {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === "class") node.className = value;
      else if (key === "dataset") Object.assign(node.dataset, value);
      else if (key in node && key !== "style") node[key] = value;
      else node.setAttribute(key, value);
    }
    if (text !== "") node.textContent = text;
    return node;
  }

  function addStyles() {
    if ($(STYLE_ID)) return;
    const style = el("style", { id: STYLE_ID });
    style.textContent = `
      #${PANEL_ID}{margin-top:14px;border:1px solid var(--line,#282f40);border-radius:12px;background:#0d121c;padding:12px;min-width:0}
      #${PANEL_ID} .nx-cat-title{font-weight:750;font-size:13px;display:flex;align-items:center;gap:8px;margin-bottom:5px}
      #${PANEL_ID} .nx-cat-sub{color:var(--muted,#929db4);font-size:11px;line-height:1.6}
      #${PANEL_ID} .nx-cat-search{display:grid;grid-template-columns:minmax(0,1fr) 135px auto;gap:7px;margin-top:10px}
      #${PANEL_ID} .nx-cat-search input,#${PANEL_ID} .nx-cat-search select{min-width:0;width:100%;height:38px;padding:7px 9px;font-size:12px}
      #${PANEL_ID} .nx-cat-search button{padding:7px 11px;font-size:12px;white-space:nowrap}
      #${PANEL_ID} .nx-cat-status{font-size:11px;line-height:1.6;color:var(--muted,#929db4);margin:9px 0;overflow-wrap:anywhere}
      #${PANEL_ID} .nx-cat-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
      #${PANEL_ID} .nx-cat-card{min-width:0;overflow:hidden;border:1px solid var(--line,#282f40);border-radius:10px;background:#111824;display:flex;flex-direction:column}
      #${PANEL_ID} .nx-cat-thumb{width:100%;aspect-ratio:1/1;object-fit:contain;display:block;background:radial-gradient(ellipse at center,#20283a,#090d14);}
      #${PANEL_ID} .nx-cat-card-body{display:flex;flex:1;flex-direction:column;padding:7px;min-width:0}
      #${PANEL_ID} .nx-cat-name{font-size:11px;line-height:1.45;font-weight:700;overflow-wrap:anywhere;min-height:31px}
      #${PANEL_ID} .nx-cat-meta{font-size:10px;color:var(--muted,#929db4);line-height:1.55;margin:5px 0 8px;overflow-wrap:anywhere;flex:1}
      #${PANEL_ID} .nx-cat-add{width:100%;font-size:10px;padding:7px 4px;background:#7652d8;border:1px solid #8b6be5;border-radius:8px;color:#fff;cursor:pointer}
      #${PANEL_ID} .nx-cat-add:disabled{opacity:.5;cursor:wait}
      #${PANEL_ID} .nx-cat-open{display:block;font-size:10px;text-align:center;margin-top:7px;color:var(--cyan,#7dd3fc);text-decoration:none}
      #${PANEL_ID} .nx-cat-footer{display:flex;gap:8px;margin-top:10px}
      #${PANEL_ID} .nx-cat-footer button{flex:1;font-size:11px;padding:8px}
      #${PANEL_ID} .nx-cat-empty{grid-column:1/-1;text-align:center;padding:18px 10px;border:1px dashed var(--line,#282f40);border-radius:10px;color:var(--muted,#929db4);font-size:11px;line-height:1.6}
      @media(max-width:700px){#${PANEL_ID} .nx-cat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#${PANEL_ID} .nx-cat-search{grid-template-columns:minmax(0,1fr) auto}#${PANEL_ID} .nx-cat-search select{grid-column:1/-1;grid-row:2}#${PANEL_ID} .nx-cat-search button{grid-column:2;grid-row:1}}
      @media(max-width:420px){#${PANEL_ID} .nx-cat-grid{grid-template-columns:repeat(2,minmax(0,1fr))}#${PANEL_ID}{padding:9px}}
    `;
    document.head.appendChild(style);
  }

  function buildPanel() {
    if ($(PANEL_ID)) return $(PANEL_ID);
    const addCatalog = $("addCatalog");
    if (!addCatalog) return null;
    const parentPanel = addCatalog.closest(".panel");
    if (!parentPanel) return null;

    const panel = el("div", { id: PANEL_ID });
    const title = el("div", { class: "nx-cat-title" }, "✦ Roblox Marketplace");
    const intro = el("div", { class: "nx-cat-sub" }, "ค้นหาไอเทมจาก Roblox Catalog พร้อมรูปตัวอย่าง แล้วเพิ่มรายการเข้า Avatar Studio ได้เลย");
    const searchRow = el("div", { class: "nx-cat-search" });
    const query = el("input", { id: "nxRobloxQuery", type: "search", placeholder: "ค้นหา เช่น black hair, cat ears", maxlength: "100", autocomplete: "off", "aria-label": "ค้นหา Roblox Catalog" });
    const category = el("select", { id: "nxRobloxCategory", "aria-label": "หมวดหมู่ Roblox Catalog" });
    [
      ["all", "ทุกหมวดหมู่"], ["11", "Accessories"], ["3", "Clothing"],
      ["4", "Body Parts"], ["12", "Animations"],
    ].forEach(([value, label]) => category.add(el("option", { value }, label)));
    const searchButton = el("button", { id: "nxRobloxSearchButton", class: "primary", type: "button" }, "ค้นหา");
    const status = el("div", { id: "nxRobloxCatalogStatus", class: "nx-cat-status", role: "status" }, "กำลังเตรียม Roblox Catalog…");
    const results = el("div", { id: "nxRobloxCatalogResults", class: "nx-cat-grid" });
    const footer = el("div", { class: "nx-cat-footer" });
    const loadMore = el("button", { id: "nxRobloxLoadMore", type: "button", disabled: true }, "โหลดรายการเพิ่ม");
    const clear = el("button", { id: "nxRobloxClear", type: "button" }, "ล้างผลการค้นหา");
    footer.append(loadMore, clear);
    searchRow.append(query, category, searchButton);
    panel.append(title, intro, searchRow, status, results, footer);

    // Insert the browser between the existing Asset ID controls and model upload.
    const uploadButton = $("uploadModel");
    if (uploadButton && uploadButton.parentElement === parentPanel) parentPanel.insertBefore(panel, uploadButton);
    else parentPanel.appendChild(panel);

    searchButton.addEventListener("click", () => searchCatalog(false));
    query.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchCatalog(false);
      }
    });
    category.addEventListener("change", () => {
      if (query.value.trim()) searchCatalog(false);
    });
    loadMore.addEventListener("click", () => searchCatalog(true));
    clear.addEventListener("click", () => {
      state.query = "";
      state.category = "all";
      state.nextPageCursor = null;
      state.results = [];
      query.value = "";
      category.value = "all";
      results.replaceChildren();
      status.textContent = "พิมพ์ชื่อไอเทมแล้วกดค้นหา";
      loadMore.disabled = true;
    });
    results.addEventListener("click", (event) => {
      const button = event.target.closest("[data-nx-add-index]");
      if (!button) return;
      const item = state.results[Number(button.dataset.nxAddIndex)];
      if (item) addToStudio(item, button);
    });
    return panel;
  }

  function setStatus(message, error = false) {
    const node = $("nxRobloxCatalogStatus");
    if (!node) return;
    node.textContent = message;
    node.style.color = error ? "#fb7185" : "var(--muted,#929db4)";
  }

  function getTypeInfo(item) {
    const raw = item?.assetType;
    const name = typeof raw === "string" ? raw : (raw?.name || item?.assetTypeName || item?.itemType || "");
    const id = Number((raw && typeof raw === "object" ? raw.id : null) ?? item?.assetTypeId ?? item?.assetTypeID ?? NaN);
    const lower = String(name).toLowerCase();
    if (lower.includes("bundle") || String(item?.itemType || "").toLowerCase() === "bundle") return { category: "Bundle", typeName: "Bundle" };
    if ([25, 41].includes(id) || lower.includes("hair")) return { category: "Hair", typeName: name || "Hair" };
    if ([26, 42, 54, 55, 57].includes(id) || /face|eyebrow|eyelash|dynamic head/.test(lower)) return { category: "Face", typeName: name || "Face" };
    if ([11, 2].includes(id) || /classic shirt|t-shirt|^shirt$/.test(lower)) return { category: "Shirt", typeName: name || "Shirt" };
    if (id === 12 || /classic pants|^pants$/.test(lower)) return { category: "Pants", typeName: name || "Pants" };
    if ([15, 32, 33, 34, 35, 36, 37, 38, 39, 40, 43, 56].includes(id) || /animation|emote|pose/.test(lower)) return { category: "Animation", typeName: name || "Animation" };
    if ([16, 17, 18, 19, 20, 57].includes(id) || /body part|torso|left arm|right arm|left leg|right leg|head/.test(lower)) return { category: "Body Part", typeName: name || "Body Part" };
    if ([45, 46, 47, 48, 49, 50, 51, 52, 53, 60, 61, 62, 63, 64, 65].includes(id) || /layered|jacket|sweater|shorts|shoes|dress|skirt|clothing accessory/.test(lower)) return { category: "Layered Clothing", typeName: name || "Layered Clothing" };
    if ([8, 27, 28, 29, 30, 31, 41, 42, 58, 59].includes(id) || /accessory|accessories|hat|neck|shoulder|back|waist|ear|eye/.test(lower)) return { category: "Accessory", typeName: name || "Accessory" };
    return { category: "Other", typeName: name || (Number.isFinite(id) ? `Asset Type ${id}` : "Roblox Asset") };
  }

  function formatPrice(item) {
    if (typeof item?.price === "number") return item.price === 0 ? "ฟรี" : `${item.price.toLocaleString()} Robux`;
    const stateText = String(item?.priceStatus || item?.priceStatusDisplayName || "").trim();
    return stateText || "ดูราคาใน Roblox";
  }

  function itemUrl(item) {
    const id = encodeURIComponent(String(item?.id ?? ""));
    return `https://www.roblox.com/catalog/${id}`;
  }

  function fallbackThumb(id) {
    return `https://www.roblox.com/asset-thumbnail/image?assetId=${encodeURIComponent(id)}&width=150&height=150&format=png`;
  }

  async function getThumbnails(items) {
    const ids = items.map((item) => String(item?.id ?? "")).filter((id) => /^\d+$/.test(id));
    const unknown = [...new Set(ids)].filter((id) => !state.thumbCache.has(id));
    if (unknown.length) {
      try {
        const params = new URLSearchParams({ assetIds: unknown.slice(0, 100).join(","), size: "150x150", format: "Png", isCircular: "false" });
        const response = await fetch(`${THUMB_URL}?${params}`, { headers: { Accept: "application/json" }, mode: "cors" });
        if (response.ok) {
          const body = await response.json();
          for (const thumb of body.data || []) {
            if (thumb.targetId != null && thumb.imageUrl) state.thumbCache.set(String(thumb.targetId), thumb.imageUrl);
          }
        }
      } catch (_) {
        // Keep the catalog fallback URL when thumbnail lookup is blocked.
      }
      unknown.forEach((id) => { if (!state.thumbCache.has(id)) state.thumbCache.set(id, fallbackThumb(id)); });
    }
    return items.map((item) => state.thumbCache.get(String(item?.id ?? "")) || fallbackThumb(item?.id ?? ""));
  }

  async function searchCatalog(append) {
    if (state.loading) return;
    const query = $("nxRobloxQuery")?.value.trim() || "";
    if (!query) {
      setStatus("กรอกคำค้นก่อน เช่น black hair หรือ cat ears");
      $("nxRobloxQuery")?.focus();
      return;
    }
    if (!append) {
      state.query = query;
      state.category = $("nxRobloxCategory")?.value || "all";
      state.nextPageCursor = null;
      state.results = [];
      $("nxRobloxCatalogResults")?.replaceChildren();
    } else if (!state.nextPageCursor) {
      return;
    }

    const requestId = ++state.request;
    state.loading = true;
    const searchButton = $("nxRobloxSearchButton");
    const loadMore = $("nxRobloxLoadMore");
    if (searchButton) searchButton.disabled = true;
    if (loadMore) loadMore.disabled = true;
    setStatus(append ? "กำลังโหลดรายการถัดไป…" : `กำลังค้นหา “${state.query}” จาก Roblox Catalog…`);

    const params = new URLSearchParams({ Keyword: state.query, Limit: String(PAGE_SIZE), SortType: "0", SortAggregation: "5" });
    if (state.category !== "all") params.set("Category", state.category);
    if (append && state.nextPageCursor) params.set("Cursor", state.nextPageCursor);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(`${SEARCH_URL}?${params.toString()}`, {
        method: "GET",
        headers: { Accept: "application/json" },
        mode: "cors",
        credentials: "omit",
        signal: controller.signal,
      });
      if (!response.ok) {
        let detail = "";
        try { detail = (await response.text()).slice(0, 180); } catch (_) {}
        throw new Error(`Roblox Catalog ตอบกลับ HTTP ${response.status}${detail ? ` · ${detail}` : ""}`);
      }
      const payload = await response.json();
      if (requestId !== state.request) return;
      const pageItems = Array.isArray(payload.data) ? payload.data : [];
      state.nextPageCursor = payload.nextPageCursor || payload.nextPageToken || null;
      if (!pageItems.length && !append) {
        setStatus("ไม่พบไอเทม ลองคำค้นอื่นหรือเปลี่ยนหมวดหมู่");
        return;
      }

      const startIndex = state.results.length;
      state.results.push(...pageItems);
      const thumbs = await getThumbnails(pageItems);
      if (requestId !== state.request) return;
      renderResults(pageItems, thumbs, startIndex);
      setStatus(`แสดง ${state.results.length} รายการ${state.nextPageCursor ? " · ยังมีรายการถัดไป" : " · ถึงรายการสุดท้ายแล้ว"}`);
      if (loadMore) loadMore.disabled = !state.nextPageCursor;
    } catch (error) {
      if (requestId !== state.request) return;
      const message = error?.name === "AbortError" ? "การค้นหาหมดเวลา ลองอีกครั้ง" : (error?.message || "ไม่สามารถเชื่อมต่อ Roblox Catalog ได้");
      setStatus(`${message} — ตรวจสอบอินเทอร์เน็ตหรือข้อจำกัด CORS ของเบราว์เซอร์`, true);
    } finally {
      clearTimeout(timeout);
      if (requestId === state.request) {
        state.loading = false;
        if (searchButton) searchButton.disabled = false;
        if (loadMore) loadMore.disabled = !state.nextPageCursor;
      }
    }
  }

  function renderResults(items, thumbnails, startIndex) {
    const results = $("nxRobloxCatalogResults");
    if (!results) return;
    items.forEach((item, localIndex) => {
      const index = startIndex + localIndex;
      const id = String(item?.id ?? "");
      const name = String(item?.name || "Roblox Asset");
      const creator = String(item?.creatorName || item?.creator?.name || "Creator not listed");
      const type = getTypeInfo(item);
      const card = el("article", { class: "nx-cat-card" });
      const img = el("img", { class: "nx-cat-thumb", loading: "lazy", alt: `${name} thumbnail` });
      img.src = thumbnails[localIndex] || fallbackThumb(id);
      img.onerror = () => {
        if (img.dataset.fallbackTried) { img.removeAttribute("src"); return; }
        img.dataset.fallbackTried = "1";
        img.src = fallbackThumb(id);
      };
      const body = el("div", { class: "nx-cat-card-body" });
      const title = el("div", { class: "nx-cat-name" }, name);
      const meta = el("div", { class: "nx-cat-meta" }, `ID ${id}\n${type.typeName}\n${creator}\n${formatPrice(item)}`);
      meta.style.whiteSpace = "pre-line";
      const add = el("button", { class: "nx-cat-add", type: "button", dataset: { nxAddIndex: String(index) } }, "＋ เพิ่มเข้าชุด");
      const link = el("a", { class: "nx-cat-open", href: itemUrl(item), target: "_blank", rel: "noopener noreferrer" }, "เปิดใน Roblox ↗");
      body.append(title, meta, add, link);
      card.append(img, body);
      results.appendChild(card);
    });
    if (startIndex === 0 && items.length === 0) results.appendChild(el("div", { class: "nx-cat-empty" }, "ไม่พบรายการที่ตรงกับคำค้น"));
  }

  function addToStudio(item, button) {
    const form = $("catalogForm");
    const nameField = $("catalogName");
    const idField = $("catalogId");
    const categoryField = $("catalogCategory");
    const urlField = $("catalogUrl");
    if (!form || !nameField || !idField || !categoryField || !urlField) {
      setStatus("ไม่พบฟอร์ม Catalog ของ Avatar Studio — ตรวจสอบว่า avatar-studio.html เป็นเวอร์ชันเดิมครบถ้วน", true);
      return;
    }
    const authNotice = $("studioAuthNotice");
    if (authNotice && !authNotice.hidden) {
      setStatus("กรุณาเข้าสู่ระบบที่ NX Cloud Drive ก่อนเพิ่มไอเทม", true);
      return;
    }
    const id = String(item?.id ?? "").trim();
    if (!/^\d+$/.test(id)) {
      setStatus("รายการนี้ไม่มี Asset ID ที่ถูกต้อง", true);
      return;
    }
    const type = getTypeInfo(item);
    nameField.value = String(item?.name || "Roblox Asset").slice(0, 160);
    idField.value = id;
    categoryField.value = type.category;
    // The existing form writes the record through the current Supabase session.
    urlField.value = itemUrl(item);
    if (button) button.disabled = true;
    setStatus(`กำลังเพิ่ม “${nameField.value}” ลงในชุดและ Avatar Vault…`);
    try {
      const dialog = $("catalogDialog");
      if (dialog?.open) dialog.close();
      if (typeof form.requestSubmit === "function") form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      // The original addCatalog() handler shows the authoritative save result in #studioStatus.
      const mainStatus = $("studioStatus");
      if (mainStatus) {
        const observer = new MutationObserver(() => {
          if (mainStatus.textContent.trim()) {
            setStatus(mainStatus.textContent.trim(), mainStatus.classList.contains("error"));
            observer.disconnect();
            if (button) button.disabled = false;
          }
        });
        observer.observe(mainStatus, { childList: true, characterData: true, subtree: true });
        setTimeout(() => { observer.disconnect(); if (button) button.disabled = false; }, 20000);
      } else if (button) button.disabled = false;
    } catch (error) {
      if (button) button.disabled = false;
      setStatus(`เพิ่มรายการไม่สำเร็จ: ${error?.message || "ไม่ทราบสาเหตุ"}`, true);
    }
  }

  function boot() {
    addStyles();
    if (!buildPanel()) {
      // The page module can still be initializing; retry a few times after parse.
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (buildPanel() || attempts >= 20) clearInterval(timer);
      }, 150);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
