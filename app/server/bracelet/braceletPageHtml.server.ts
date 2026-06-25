/**
 * 自包含 C 端定制页 HTML（经 App Proxy 下发，不依赖 React 水合）。
 */
export function renderBraceletConfiguratorPage(params: {
  preparePath: string;
}): string {
  const preparePath = params.preparePath.replace(/"/g, "");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>定制手环 · AI Assistant</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #0f172a;
      line-height: 1.5;
    }
    .wrap {
      max-width: 960px;
      margin: 0 auto;
      padding: 24px 16px 48px;
    }
    h1 { font-size: 1.5rem; margin: 0 0 8px; }
    .sub { color: #64748b; margin: 0 0 24px; font-size: 0.95rem; }
    .grid {
      display: grid;
      gap: 24px;
      grid-template-columns: 1fr;
    }
    @media (min-width: 768px) {
      .grid { grid-template-columns: 1fr 1fr; }
    }
    .panel {
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
    }
    .panel h2 { font-size: 1rem; margin: 0 0 16px; }
    .styles { display: flex; gap: 12px; flex-wrap: wrap; }
    .style-btn {
      flex: 1;
      min-width: 120px;
      padding: 12px 16px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      background: #fff;
      cursor: pointer;
      text-align: left;
      transition: border-color 0.15s, background 0.15s;
    }
    .style-btn strong { display: block; font-size: 0.95rem; }
    .style-btn span { font-size: 0.8rem; color: #64748b; }
    .style-btn.active {
      border-color: #00a67c;
      background: #ecfdf5;
    }
    label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 6px; }
    input[type="text"] {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 1rem;
    }
    .hint { font-size: 0.75rem; color: #94a3b8; margin-top: 6px; }
    canvas {
      width: 100%;
      max-width: 360px;
      height: auto;
      display: block;
      margin: 0 auto;
      border-radius: 8px;
      background: #fff;
      border: 1px solid #e2e8f0;
    }
    .actions { margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap; }
    button.primary {
      background: #00a67c;
      color: #fff;
      border: none;
      border-radius: 8px;
      padding: 12px 24px;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
    }
    button.primary:disabled { opacity: 0.55; cursor: not-allowed; }
    .status {
      margin-top: 12px;
      font-size: 0.875rem;
      min-height: 1.25rem;
    }
    .status.error { color: #dc2626; }
    .status.ok { color: #059669; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>定制你的手环</h1>
    <p class="sub">选择样式、填写刻字，预览后一键加入购物车并结账。</p>
    <div class="grid">
      <div class="panel">
        <h2>1. 选择样式</h2>
        <div class="styles" id="style-group">
          <button type="button" class="style-btn active" data-style="classic">
            <strong>经典款</strong>
            <span>简约金属手环</span>
          </button>
          <button type="button" class="style-btn" data-style="beaded">
            <strong>串珠款</strong>
            <span>彩色串珠手环</span>
          </button>
        </div>
        <div style="margin-top: 20px;">
          <label for="engraving">刻字（可选，最多 20 字）</label>
          <input id="engraving" type="text" maxlength="20" placeholder="例如 LOVE 2026" />
          <p class="hint">刻字会显示在预览与订单详情中。</p>
        </div>
      </div>
      <div class="panel">
        <h2>2. 预览</h2>
        <canvas id="preview" width="360" height="280" aria-label="手环预览"></canvas>
        <div class="actions">
          <button type="button" class="primary" id="add-btn">加入购物车</button>
        </div>
        <p class="status" id="status" role="status"></p>
      </div>
    </div>
  </div>
  <script>
    (function () {
      var PREPARE_PATH = "${preparePath}";
      var style = "classic";
      var canvas = document.getElementById("preview");
      var ctx = canvas.getContext("2d");
      var engravingInput = document.getElementById("engraving");
      var statusEl = document.getElementById("status");
      var addBtn = document.getElementById("add-btn");

      function setStatus(msg, kind) {
        statusEl.textContent = msg || "";
        statusEl.className = "status" + (kind ? " " + kind : "");
      }

      function drawClassic() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = "#94a3b8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(180, 140, 120, 70, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = "#c0a060";
        ctx.lineWidth = 14;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(180, 140, 95, 0.3 * Math.PI, 0.7 * Math.PI);
        ctx.stroke();
        var text = engravingInput.value.trim() || "YOUR TEXT";
        ctx.fillStyle = "#334155";
        ctx.font = "600 18px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(text, 180, 148);
      }

      function drawBeaded() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#f1f5f9";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        var colors = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
        var cx = 180, cy = 140, r = 88;
        for (var i = 0; i < 18; i++) {
          var angle = (i / 18) * Math.PI * 1.2 + 0.35 * Math.PI;
          var x = cx + Math.cos(angle) * r;
          var y = cy + Math.sin(angle) * r * 0.55;
          ctx.beginPath();
          ctx.fillStyle = colors[i % colors.length];
          ctx.arc(x, y, 9, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(0,0,0,0.12)";
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 115, 68, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        var text = engravingInput.value.trim() || "YOUR TEXT";
        ctx.fillStyle = "#0f172a";
        ctx.font = "600 16px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(text, cx, cy + 6);
      }

      function redraw() {
        if (style === "beaded") drawBeaded();
        else drawClassic();
      }

      document.getElementById("style-group").addEventListener("click", function (e) {
        var btn = e.target.closest("[data-style]");
        if (!btn) return;
        style = btn.getAttribute("data-style");
        document.querySelectorAll(".style-btn").forEach(function (el) {
          el.classList.toggle("active", el === btn);
        });
        redraw();
      });

      engravingInput.addEventListener("input", redraw);
      redraw();

      function proxyQueryString() {
        return window.location.search || "";
      }

      addBtn.addEventListener("click", async function () {
        setStatus("正在准备订单…");
        addBtn.disabled = true;
        try {
          var previewDataUrl = canvas.toDataURL("image/png");
          var res = await fetch(PREPARE_PATH + proxyQueryString(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              style: style,
              engraving: engravingInput.value.trim(),
              previewDataUrl: previewDataUrl,
            }),
          });
          var data = await res.json();
          if (!res.ok || !data.ok) {
            throw new Error(data.error || "准备失败");
          }
          var cartRes = await fetch("/cart/add.js", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{
                id: data.variantId,
                quantity: 1,
                properties: data.properties,
              }],
            }),
          });
          if (!cartRes.ok) {
            var cartErr = await cartRes.json().catch(function () { return {}; });
            throw new Error(cartErr.description || cartErr.message || "加入购物车失败");
          }
          setStatus("已加入购物车，正在跳转…", "ok");
          window.location.href = "/cart";
        } catch (err) {
          setStatus(err.message || "操作失败", "error");
          addBtn.disabled = false;
        }
      });
    })();
  </script>
</body>
</html>`;
}
