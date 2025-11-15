/* public/widget.js */
(function () {
  // Wait until the DOM is ready (so document.body exists)
  function onReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn, { once: true });
    } else {
      fn();
    }
  }

  function bootstrap() {
    // Find the <script> tag that loaded this file & read data-attributes FIRST
    // so we can use them when building styles.
    const currentScript =
      document.currentScript ||
      Array.from(document.scripts).find((s) => (s.src || "").includes("/widget.js"));

    // Defaults (can be overridden via data-* on the script)
    const defaults = {
      endpoint: "/api/chat",
      tenantId: null,
      title: "FAQ Bot",
      bubbleSize: 56,                     // px (button width/height)
      bubbleLabel: null,                  // text to show next to bubble
      themeColor: "#111827",              // header & button background
      textColor: "#ffffff",
    };

    // Read attributes
    const attr = (name, fallback = null) =>
      (currentScript && currentScript.getAttribute(name)) || fallback;

    const initialOptions = {
      endpoint: attr("data-endpoint", defaults.endpoint),
      tenantId: attr("data-tenant", defaults.tenantId),
      title: attr("data-title", defaults.title),
      bubbleSize: parseInt(attr("data-bubble-size", String(defaults.bubbleSize)), 10) || defaults.bubbleSize,
      bubbleLabel: attr("data-bubble-label", defaults.bubbleLabel),
      themeColor: attr("data-theme-color", defaults.themeColor) || defaults.themeColor,
      textColor: attr("data-text-color", defaults.textColor) || defaults.textColor,
    };

    // Create container + Shadow DOM
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    document.body.appendChild(host);

    // Derived measurements
    const BTN = initialOptions.bubbleSize;                // button size (px)
    const GAP = 20;                                      // distance to viewport edges
    const FONT = Math.max(12, Math.round(BTN * 0.5));    // emoji/text size in button
    const LABEL_OFFSET = 8;                               // space between button and label

    // Styles (scoped to the Shadow DOM)
    const style = document.createElement("style");
    style.textContent = `
      .faqbot-button {
        position: fixed; right: ${GAP}px; bottom: ${GAP}px;
        width: ${BTN}px; height: ${BTN}px; border-radius: 50%;
        border: none; cursor: pointer;
        box-shadow: 0 6px 18px rgba(0,0,0,0.2);
        font-size: ${FONT}px; line-height: ${BTN}px; text-align: center;
        background: ${initialOptions.themeColor}; color: ${initialOptions.textColor};
        z-index: 2147483647;
      }
      .faqbot-label {
        position: fixed;
        right: ${GAP + BTN + LABEL_OFFSET}px;
        bottom: ${GAP + Math.round(BTN/2) - 12}px;
        background: #ffffff;
        color: #111827;
        border: 1px solid #e5e7eb;
        border-radius: 999px;
        padding: 6px 10px;
        font: 500 14px/1.1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        box-shadow: 0 6px 18px rgba(0,0,0,0.12);
        z-index: 2147483647;
        white-space: nowrap;
        user-select: none;
      }
      .faqbot-panel {
        position: fixed; right: ${GAP}px; bottom: ${GAP + BTN + 14}px;
        width: 320px; max-height: 60vh; display: none;
        background: #ffffff; border: 1px solid #e5e7eb; border-radius: 12px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.15);
        overflow: hidden; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
        z-index: 2147483647;
      }
      .faqbot-header { background: ${initialOptions.themeColor}; color: ${initialOptions.textColor}; padding: 12px 14px; font-weight: 600; }
      .faqbot-messages { padding: 12px; overflow-y: auto; max-height: 44vh; font-size: 14px; }
      .faqbot-input { display: flex; gap: 8px; padding: 10px; border-top: 1px solid #e5e7eb; background: #f9fafb; }
      .faqbot-input input { flex: 1; padding: 8px 10px; border: 1px solid #e5e7eb; border-radius: 8px; }
      .faqbot-input button { padding: 8px 12px; border: none; background: ${initialOptions.themeColor}; color: ${initialOptions.textColor}; border-radius: 8px; cursor: pointer; }
      .msg { margin: 8px 0; }
      .msg.me { text-align: right; }
      .bubble { display: inline-block; padding: 8px 10px; border-radius: 10px; max-width: 85%; }
      .me .bubble { background: ${initialOptions.themeColor}; color: ${initialOptions.textColor}; }
      .bot .bubble { background: #f3f4f6; color: #111827; }
    `;
    shadow.appendChild(style);

    // Panel UI
    const panel = document.createElement("div");
    panel.className = "faqbot-panel";
    panel.innerHTML = `
      <div class="faqbot-header" id="faqbot-title">${(initialOptions.title || "FAQ Bot")}</div>
      <div class="faqbot-messages" id="faqbot-messages"></div>
      <div class="faqbot-input">
        <input id="faqbot-input" type="text" placeholder="Type your question..." />
        <button id="faqbot-send">Send</button>
      </div>
    `;
    shadow.appendChild(panel);

    // Button
    const button = document.createElement("button");
    button.className = "faqbot-button";
    button.setAttribute("aria-label", "Open chat");
    button.textContent = "💬";
    shadow.appendChild(button);

    // Optional label
    let labelEl = null;
    if (initialOptions.bubbleLabel) {
      labelEl = document.createElement("div");
      labelEl.className = "faqbot-label";
      labelEl.textContent = initialOptions.bubbleLabel;
      shadow.appendChild(labelEl);
    }

    // Toggle
    let open = false;
    button.addEventListener("click", () => {
      open = !open;
      panel.style.display = open ? "block" : "none";
      // Hide label when open (optional UX)
      if (labelEl) labelEl.style.display = open ? "none" : "block";
    });

    // Messaging
    const messagesEl = panel.querySelector("#faqbot-messages");
    function addMsg(text, who) {
      const item = document.createElement("div");
      item.className = `msg ${who}`;
      const bubble = document.createElement("div");
      bubble.className = "bubble";
      bubble.textContent = text;
      item.appendChild(bubble);
      messagesEl.appendChild(item);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Config & init
    let initOptions = { ...initialOptions };

    function init(opts) {
      initOptions = Object.assign(initOptions, opts || {});
      // Update title if provided later
      const titleEl = panel.querySelector("#faqbot-title");
      if (titleEl && initOptions.title) titleEl.textContent = String(initOptions.title);

      // Update label dynamically (create/remove if needed)
      if (initOptions.bubbleLabel) {
        if (!labelEl) {
          labelEl = document.createElement("div");
          labelEl.className = "faqbot-label";
          shadow.appendChild(labelEl);
        }
        labelEl.textContent = initOptions.bubbleLabel;
        if (!open) labelEl.style.display = "block";
      } else if (labelEl) {
        labelEl.remove();
        labelEl = null;
      }
    }

    async function send(text) {
      addMsg(text, "me");
      addMsg("Thinking...", "bot");
      try {
        const res = await fetch(initOptions.endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: text,
            tenantId: initOptions.tenantId || null,
          }),
        });
        const data = await res.json();
        const last = messagesEl.lastChild;
        if (last && last.querySelector) {
          const b = last.querySelector(".bubble");
          if (b) b.textContent = data?.reply || "I'm not sure.";
        }
      } catch (e) {
        const last = messagesEl.lastChild;
        if (last && last.querySelector) {
          const b = last.querySelector(".bubble");
          if (b) b.textContent = "Network error. Please try again.";
        }
      }
    }

    const inputEl = panel.querySelector("#faqbot-input");
    const sendBtn = panel.querySelector("#faqbot-send");
    sendBtn.addEventListener("click", () => {
      const text = inputEl.value.trim();
      if (!text) return;
      inputEl.value = "";
      send(text);
    });
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendBtn.click();
    });

    // Expose global init (optional for host pages)
    window.FAQBot = { init };
  }

  onReady(bootstrap);
})();
