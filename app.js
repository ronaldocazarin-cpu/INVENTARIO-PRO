const {
  useState,
  useEffect,
  useRef,
  useCallback
} = React;
const sb = window.supabase.createClient(window.KARDEX_CONFIG.supabaseUrl, window.KARDEX_CONFIG.supabaseKey);

// ---------- Barra inferior: se oculta mientras hay ventanas abiertas ----------
let navLocks = 0;
function useHideNav(active) {
  useEffect(() => {
    if (!active) return;
    navLocks++;
    document.body.classList.add("modal-open");
    return () => {
      navLocks = Math.max(0, navLocks - 1);
      if (navLocks === 0) document.body.classList.remove("modal-open");
    };
  }, [active]);
}

// ---------- Tema (color y modo) por persona ----------
const THEME_PRESETS = [{
  id: "indigo",
  name: "Índigo",
  p1: "#4F46E5",
  p2: "#7C5CFF"
}, {
  id: "azul",
  name: "Azul",
  p1: "#2563EB",
  p2: "#38BDF8"
}, {
  id: "turquesa",
  name: "Turquesa",
  p1: "#0D9488",
  p2: "#2DD4BF"
}, {
  id: "esmeralda",
  name: "Esmeralda",
  p1: "#059669",
  p2: "#34D399"
}, {
  id: "naranja",
  name: "Naranja",
  p1: "#EA580C",
  p2: "#FB923C"
}, {
  id: "rosa",
  name: "Rosa",
  p1: "#DB2777",
  p2: "#F472B6"
}, {
  id: "morado",
  name: "Morado",
  p1: "#7C3AED",
  p2: "#C084FC"
}, {
  id: "grafito",
  name: "Grafito",
  p1: "#334155",
  p2: "#64748B"
}];
const THEME_KEY = "kardex-theme";
const DEFAULT_THEME = {
  accent: "indigo",
  custom: "#4F46E5",
  mode: "auto"
};
function mixHex(a, b, t) {
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16)),
    pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function loadTheme() {
  try {
    const t = JSON.parse(localStorage.getItem(THEME_KEY));
    if (t && t.mode) return {
      ...DEFAULT_THEME,
      ...t
    };
  } catch (e) {}
  return {
    ...DEFAULT_THEME
  };
}
function applyTheme(t) {
  const root = document.documentElement;
  const preset = THEME_PRESETS.find(x => x.id === t.accent);
  let p1, p2;
  if (preset) {
    p1 = preset.p1;
    p2 = preset.p2;
  } else {
    p1 = /^#[0-9a-f]{6}$/i.test(t.custom || "") ? t.custom : "#4F46E5";
    p2 = mixHex(p1, "#ffffff", 0.28);
  }
  if (t.mode === "light" || t.mode === "dark") root.setAttribute("data-theme", t.mode);else root.removeAttribute("data-theme");
  const dark = t.mode === "dark" || t.mode !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (dark) {
    p1 = mixHex(p1, "#ffffff", 0.28);
    p2 = mixHex(p2, "#ffffff", 0.28);
  }
  root.style.setProperty("--primary", p1);
  root.style.setProperty("--primary-2", p2);
  root.style.setProperty("--primary-soft", "color-mix(in srgb, " + p1 + " 16%, var(--surface))");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", p1);
}
applyTheme(loadTheme());
const DEFAULT_CATEGORIES = ["Bebidas", "Botanas y galletas", "Panadería", "Lácteos y huevo", "Abarrotes", "Limpieza y hogar"];
const CAT_COLORS = ["#4F46E5", "#F59E0B", "#EF5B6B", "#0EA5E9", "#10B981", "#A855F7", "#EC4899", "#14B8A6"];
const MOTIVOS = ["Producto defectuoso", "Cliente se arrepintió", "Producto equivocado", "Empaque dañado", "Otro"];
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "hace un momento";
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}
function fmtBarcode(b) {
  return b ? b.replace(/(\d{1})(\d{6})(\d{6})/, "$1 $2 $3") : "";
}
function formatMXN(n) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN"
  }).format(n || 0);
}
function formatDateTime(ts) {
  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(ts));
}
function detectBarcodeFromImage(imageUrl) {
  if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) return Promise.resolve(null);
  try {
    const reader = new window.ZXing.BrowserMultiFormatReader();
    return reader.decodeFromImageUrl(imageUrl).then(res => res.getText()).catch(() => null);
  } catch (e) {
    return Promise.resolve(null);
  }
}
function aiErrorMessage(code) {
  const map = {
    not_granted: "No autorizaste el uso de IA para esta sesión",
    sampling_disabled: "La IA no está disponible para esta cuenta",
    images_unavailable: "Esta vista no admite enviar fotos a la IA",
    image_rejected: "La foto no se pudo procesar, intenta con otra",
    rate_limited: "Demasiadas solicitudes de IA, espera un momento",
    unavailable: "La IA no está disponible en este momento",
    auth: "Tu sesión expiró, vuelve a iniciar sesión"
  };
  return map[code] || "No se pudo analizar la foto con IA, intenta de nuevo";
}
function Toast({
  toast
}) {
  if (!toast) return null;
  const icon = toast.kind === "venta" ? "↓" : toast.kind === "devolucion" ? "↑" : "✓";
  return /*#__PURE__*/React.createElement("div", {
    className: "toast"
  }, /*#__PURE__*/React.createElement("span", null, icon), /*#__PURE__*/React.createElement("span", null, toast.msg));
}
function Camera({
  onCapture,
  onCancel
}) {
  const videoRef = useRef(null),
    streamRef = useRef(null);
  const [error, setError] = useState(false),
    [ready, setReady] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment"
          },
          audio: false
        });
        if (!active) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setReady(true);
        }
      } catch (e) {
        setError(true);
      }
    })();
    return () => {
      active = false;
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);
  function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob(blob => {
      if (blob) onCapture(blob, URL.createObjectURL(blob));
    }, "image/jpeg", 0.75);
  }
  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    onCapture(file, URL.createObjectURL(file));
  }
  if (error) {
    return /*#__PURE__*/React.createElement("div", {
      style: {
        padding: "0 18px",
        color: "var(--ink-soft)",
        fontSize: 14,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        alignItems: "flex-start"
      }
    }, /*#__PURE__*/React.createElement("p", null, "No se pudo abrir la cámara del navegador. Usa la cámara del dispositivo:"), /*#__PURE__*/React.createElement("label", {
      className: "btn btn-primary",
      style: {
        display: "inline-flex"
      }
    }, "Abrir cámara", /*#__PURE__*/React.createElement("input", {
      type: "file",
      accept: "image/*",
      capture: "environment",
      style: {
        display: "none"
      },
      onChange: handleFile
    })), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: onCancel
    }, "Cancelar"));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "cam-wrap"
  }, /*#__PURE__*/React.createElement("video", {
    ref: videoRef,
    autoPlay: true,
    playsInline: true,
    muted: true
  }), /*#__PURE__*/React.createElement("div", {
    className: "cam-frame"
  }), /*#__PURE__*/React.createElement("div", {
    className: "cam-ctrl"
  }, /*#__PURE__*/React.createElement("button", {
    className: "rbtn rbtn-ghost",
    onClick: onCancel
  }, "✕"), /*#__PURE__*/React.createElement("button", {
    className: "rbtn rbtn-shutter",
    onClick: capture,
    disabled: !ready
  }, "●"), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 44
    }
  })));
}
function ConfirmCard({
  product,
  qty,
  setQty,
  onConfirm,
  onCancel,
  label,
  color,
  extra,
  busy
}) {
  const after = color === "blue" ? product.stock + qty : product.stock - qty;
  return /*#__PURE__*/React.createElement("div", {
    className: "kcard"
  }, /*#__PURE__*/React.createElement("div", {
    className: "tab"
  }, product.name.charAt(0)), /*#__PURE__*/React.createElement("div", {
    className: "title"
  }, product.name), /*#__PURE__*/React.createElement("div", {
    className: "bar mono"
  }, fmtBarcode(product.barcode)), /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Existencia actual"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, product.stock)), /*#__PURE__*/React.createElement("div", {
    className: "qty"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(Math.max(1, qty - 1))
  }, "–"), /*#__PURE__*/React.createElement("span", {
    className: "mono"
  }, qty), /*#__PURE__*/React.createElement("button", {
    onClick: () => setQty(qty + 1)
  }, "+")), extra, /*#__PURE__*/React.createElement("div", {
    className: "row"
  }, /*#__PURE__*/React.createElement("span", null, "Existencia resultante"), /*#__PURE__*/React.createElement("span", {
    className: "mono " + (after <= product.minStock ? "warn" : "")
  }, Math.max(0, after))), /*#__PURE__*/React.createElement("div", {
    className: "actions"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: onCancel,
    disabled: busy
  }, "Cancelar"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-stamp",
    style: {
      background: color === "red" ? "var(--red)" : color === "blue" ? "var(--blue)" : "var(--green)"
    },
    onClick: onConfirm,
    disabled: busy
  }, busy ? /*#__PURE__*/React.createElement("span", {
    className: "spin"
  }, "↻") : "✓", " ", label)));
}
function VenderView({
  products,
  onVenta,
  showToast,
  onIdentifyPhoto
}) {
  const [mode, setMode] = useState("choose");
  const [barcode, setBarcode] = useState("");
  const [sugg, setSugg] = useState([]);
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  useHideNav(mode === "camera");
  useEffect(() => {
    if (mode === "scan" && inputRef.current) inputRef.current.focus();
  }, [mode]);
  function reset() {
    setMode("choose");
    setBarcode("");
    setSugg([]);
    setSel(null);
    setQty(1);
    setBusy(false);
  }
  function submitBarcode(e) {
    e.preventDefault();
    const f = products.find(p => p.barcode === barcode.trim());
    if (f) {
      setSel(f);
      setQty(1);
      setMode("confirm");
    } else showToast({
      kind: "info",
      msg: "No se encontró ese código de barras"
    });
    setBarcode("");
  }
  async function handleCapture(blob) {
    setMode("analyzing");
    const res = await onIdentifyPhoto(blob, products);
    if (res.error) {
      showToast({
        kind: "info",
        msg: aiErrorMessage(res.error)
      });
      setMode("scan");
      return;
    }
    if (!res.matches || res.matches.length === 0) {
      setMode("noai");
      return;
    }
    setSugg(res.matches);
    setMode("match");
  }
  async function confirmSale() {
    if (!sel || busy) return;
    setBusy(true);
    await onVenta(sel.id, qty);
    reset();
  }
  if (mode === "choose") return /*#__PURE__*/React.createElement("div", {
    className: "pad"
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "Elige cómo identificar el producto que se vendió."), /*#__PURE__*/React.createElement("div", {
    className: "grid2"
  }, /*#__PURE__*/React.createElement("button", {
    className: "tile",
    onClick: () => setMode("scan")
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, "▦"), /*#__PURE__*/React.createElement("span", null, "Escanear código de barras")), /*#__PURE__*/React.createElement("button", {
    className: "tile",
    onClick: () => setMode("camera")
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, "📷"), /*#__PURE__*/React.createElement("span", null, "Tomar foto del SKU"))));
  if (mode === "scan") return /*#__PURE__*/React.createElement("div", {
    className: "pad"
  }, /*#__PURE__*/React.createElement("button", {
    className: "back",
    onClick: reset
  }, "← Volver"), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitBarcode,
    className: "box"
  }, /*#__PURE__*/React.createElement("span", null, "▦"), /*#__PURE__*/React.createElement("input", {
    ref: inputRef,
    className: "mono",
    placeholder: "Escanea o escribe el código",
    value: barcode,
    onChange: e => setBarcode(e.target.value)
  })), /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Apunta el lector de código de barras aquí, o escríbelo y presiona Enter."), /*#__PURE__*/React.createElement("div", {
    className: "list"
  }, products.slice(0, 4).map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    className: "item",
    onClick: () => {
      setSel(p);
      setQty(1);
      setMode("confirm");
    }
  }, /*#__PURE__*/React.createElement("span", null, p.name), /*#__PURE__*/React.createElement("span", {
    className: "mono muted small"
  }, fmtBarcode(p.barcode))))));
  if (mode === "camera") return /*#__PURE__*/React.createElement("div", {
    className: "pad",
    style: {
      paddingLeft: 0,
      paddingRight: 0
    }
  }, /*#__PURE__*/React.createElement(Camera, {
    onCapture: handleCapture,
    onCancel: reset
  }));
  if (mode === "analyzing") return /*#__PURE__*/React.createElement("div", {
    className: "pad center"
  }, /*#__PURE__*/React.createElement("span", {
    className: "spin",
    style: {
      fontSize: 28
    }
  }, "↻"), /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Analizando la foto con IA…"));
  if (mode === "noai") return /*#__PURE__*/React.createElement("div", {
    className: "pad center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "La IA no reconoció ningún producto del catálogo en esa foto."), /*#__PURE__*/React.createElement("div", {
    className: "actions",
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-ghost",
    onClick: () => setMode("camera")
  }, "Intentar otra foto"), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-stamp",
    style: {
      background: "var(--blue)"
    },
    onClick: () => setMode("scan")
  }, "Buscar por código")));
  if (mode === "match") {
    const top = sugg[0],
      others = sugg.slice(1);
    if (!top) return null;
    return /*#__PURE__*/React.createElement("div", {
      className: "pad"
    }, /*#__PURE__*/React.createElement("button", {
      className: "back",
      onClick: reset
    }, "← Volver"), /*#__PURE__*/React.createElement("p", {
      className: "lead"
    }, "Identificamos este producto a partir de la foto:"), /*#__PURE__*/React.createElement("div", {
      className: "sugg top",
      style: {
        cursor: "default"
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sugg-main"
    }, /*#__PURE__*/React.createElement("span", {
      className: "tab-sm"
    }, top.name.charAt(0)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 14
      }
    }, top.name), /*#__PURE__*/React.createElement("div", {
      className: "mono muted small"
    }, fmtBarcode(top.barcode)))), /*#__PURE__*/React.createElement("div", {
      className: "conf-wrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "conf-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "conf-fill",
      style: {
        width: Math.round(top.confidence * 100) + "%"
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "mono small"
    }, Math.round(top.confidence * 100), "% de coincidencia"))), /*#__PURE__*/React.createElement("div", {
      className: "actions",
      style: {
        marginTop: 4
      }
    }, /*#__PURE__*/React.createElement("button", {
      className: "btn btn-ghost",
      onClick: () => setMode("otherMatches")
    }, "No es este"), /*#__PURE__*/React.createElement("button", {
      className: "btn btn-stamp",
      style: {
        background: "var(--green)"
      },
      onClick: () => {
        setSel(top);
        setQty(1);
        setMode("confirm");
      }
    }, "✓ Sí, es este producto")));
  }
  if (mode === "otherMatches") {
    const others = sugg.slice(1);
    return /*#__PURE__*/React.createElement("div", {
      className: "pad"
    }, /*#__PURE__*/React.createElement("button", {
      className: "back",
      onClick: () => setMode("match")
    }, "← Volver"), /*#__PURE__*/React.createElement("p", {
      className: "lead"
    }, "Otras coincidencias posibles:"), others.length === 0 && /*#__PURE__*/React.createElement("p", {
      className: "hint"
    }, "No hay más coincidencias para esta foto."), others.map(s => /*#__PURE__*/React.createElement("button", {
      key: s.id,
      className: "sugg",
      onClick: () => {
        setSel(s);
        setQty(1);
        setMode("confirm");
      }
    }, /*#__PURE__*/React.createElement("div", {
      className: "sugg-main"
    }, /*#__PURE__*/React.createElement("span", {
      className: "tab-sm"
    }, s.name.charAt(0)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      style: {
        fontWeight: 600,
        fontSize: 14
      }
    }, s.name), /*#__PURE__*/React.createElement("div", {
      className: "mono muted small"
    }, fmtBarcode(s.barcode)))), /*#__PURE__*/React.createElement("div", {
      className: "conf-wrap"
    }, /*#__PURE__*/React.createElement("div", {
      className: "conf-bar"
    }, /*#__PURE__*/React.createElement("div", {
      className: "conf-fill",
      style: {
        width: Math.round(s.confidence * 100) + "%"
      }
    })), /*#__PURE__*/React.createElement("span", {
      className: "mono small"
    }, Math.round(s.confidence * 100), "%")))), /*#__PURE__*/React.createElement("button", {
      className: "back",
      onClick: () => setMode("scan")
    }, "Ninguno coincide — buscar por código"));
  }
  if (mode === "confirm" && sel) return /*#__PURE__*/React.createElement("div", {
    className: "pad"
  }, /*#__PURE__*/React.createElement("button", {
    className: "back",
    onClick: reset
  }, "← Volver"), /*#__PURE__*/React.createElement(ConfirmCard, {
    product: sel,
    qty: qty,
    setQty: setQty,
    onConfirm: confirmSale,
    onCancel: reset,
    label: "Confirmar venta",
    color: "red",
    busy: busy
  }));
  return null;
}
function DevolucionView({
  products,
  onDevolucion,
  showToast
}) {
  const [query, setQuery] = useState(""),
    [sel, setSel] = useState(null);
  const [qty, setQty] = useState(1),
    [motivo, setMotivo] = useState(MOTIVOS[0]),
    [nota, setNota] = useState(""),
    [busy, setBusy] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [scanStatus, setScanStatus] = useState(null); // null | "scanning" | "notfound" | "none"
  const [showCamera, setShowCamera] = useState(false);
  useHideNav(showCamera);
  const filtered = products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.barcode.includes(query));
  function reset() {
    setSel(null);
    setQty(1);
    setQuery("");
    setMotivo(MOTIVOS[0]);
    setNota("");
    setBusy(false);
    setBarcodeInput("");
    setScanStatus(null);
  }
  async function confirm() {
    if (busy) return;
    setBusy(true);
    await onDevolucion(sel.id, qty, motivo, nota.trim());
    reset();
  }
  function lookupBarcode(code) {
    const trimmed = (code || "").trim();
    const match = products.find(p => p.barcode === trimmed);
    if (match) {
      setSel(match);
      setScanStatus(null);
    } else if (trimmed) {
      setScanStatus("notfound");
    }
  }
  function submitBarcode(e) {
    e.preventDefault();
    lookupBarcode(barcodeInput);
  }
  function handleScanCaptured(blob, previewUrl) {
    setShowCamera(false);
    setScanStatus("scanning");
    detectBarcodeFromImage(previewUrl).then(code => {
      if (code) {
        setBarcodeInput(code);
        const match = products.find(p => p.barcode === code);
        if (match) {
          setSel(match);
          setScanStatus(null);
        } else {
          setScanStatus("notfound");
          showToast({
            kind: "info",
            msg: "No encontramos un producto con ese código"
          });
        }
      } else {
        setScanStatus("none");
      }
    });
  }
  if (sel) return /*#__PURE__*/React.createElement("div", {
    className: "pad"
  }, /*#__PURE__*/React.createElement("button", {
    className: "back",
    onClick: () => setSel(null)
  }, "← Volver"), /*#__PURE__*/React.createElement(ConfirmCard, {
    product: sel,
    qty: qty,
    setQty: setQty,
    onConfirm: confirm,
    onCancel: reset,
    label: "Confirmar devolución",
    color: "blue",
    busy: busy,
    extra: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("label", {
      className: "field"
    }, /*#__PURE__*/React.createElement("span", null, "Motivo"), /*#__PURE__*/React.createElement("select", {
      value: motivo,
      onChange: e => setMotivo(e.target.value)
    }, MOTIVOS.map(m => /*#__PURE__*/React.createElement("option", {
      key: m,
      value: m
    }, m)))), /*#__PURE__*/React.createElement("label", {
      className: "field"
    }, /*#__PURE__*/React.createElement("span", null, "Nota adicional (opcional)"), /*#__PURE__*/React.createElement("input", {
      placeholder: "Ej. producto abierto, sin empaque, etc.",
      value: nota,
      onChange: e => setNota(e.target.value)
    })))
  }));
  return /*#__PURE__*/React.createElement("div", {
    className: "pad"
  }, /*#__PURE__*/React.createElement("p", {
    className: "lead"
  }, "Regresa producto al inventario por devolución de cliente."), /*#__PURE__*/React.createElement("form", {
    onSubmit: submitBarcode,
    className: "box"
  }, /*#__PURE__*/React.createElement("span", null, "▦"), /*#__PURE__*/React.createElement("input", {
    className: "mono",
    placeholder: "Código de barras",
    value: barcodeInput,
    onChange: e => {
      setBarcodeInput(e.target.value);
      setScanStatus(null);
    }
  })), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    style: {
      marginTop: 0
    },
    onClick: () => setShowCamera(true)
  }, "📷 Escanear código con cámara"), scanStatus === "scanning" && /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Leyendo el código de la foto…"), scanStatus === "notfound" && /*#__PURE__*/React.createElement("p", {
    className: "hint warn"
  }, "Ningún producto tiene ese código — búscalo abajo manualmente."), scanStatus === "none" && /*#__PURE__*/React.createElement("p", {
    className: "hint warn"
  }, "No se detectó código en la foto, intenta de nuevo o busca manualmente."), /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      margin: "16px 0 6px"
    }
  }, "O busca por nombre o código:"), /*#__PURE__*/React.createElement("div", {
    className: "box"
  }, /*#__PURE__*/React.createElement("span", null, "🔍"), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar por nombre o código",
    value: query,
    onChange: e => setQuery(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "list"
  }, filtered.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Sin resultados."), filtered.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    className: "item",
    onClick: () => setSel(p)
  }, /*#__PURE__*/React.createElement("span", null, p.name), /*#__PURE__*/React.createElement("span", {
    className: "mono muted small"
  }, fmtBarcode(p.barcode))))), showCamera && /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    onClick: () => setShowCamera(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    style: {
      padding: "18px 0 22px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h",
    style: {
      padding: "0 18px"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Escanear código de barras"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--card-edge)"
    },
    onClick: () => setShowCamera(false)
  }, "✕")), /*#__PURE__*/React.createElement(Camera, {
    onCapture: handleScanCaptured,
    onCancel: () => setShowCamera(false)
  }))));
}
function EditProductModal({
  product,
  products,
  categories,
  onSave,
  onDelete,
  onClose,
  onUploadPhoto
}) {
  useHideNav(true);
  const [name, setName] = useState(product.name);
  const [barcode, setBarcode] = useState(product.barcode || "");
  const [category, setCategory] = useState(product.category || "");
  const [stock, setStock] = useState(String(product.stock));
  const [minStock, setMinStock] = useState(String(product.minStock));
  const [price, setPrice] = useState(product.price ? String(product.price) : "");
  const [nota, setNota] = useState("");
  const [photo, setPhoto] = useState(null); // {previewUrl,path,uploading,failed}
  const [cameraOpen, setCameraOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const catNames = categories.map(c => c.name);
  if (product.category && !catNames.includes(product.category)) catNames.push(product.category);
  const dup = barcode.trim() ? products.find(p => p.id !== product.id && p.barcode === barcode.trim()) : null;
  const stockNum = Math.max(0, parseInt(stock, 10) || 0);
  const delta = stockNum - product.stock;
  const shownPhoto = photo ? photo.previewUrl : product.photoUrl;
  function bump(n) {
    setStock(String(Math.max(0, stockNum + n)));
  }
  function takePhoto(blob, previewUrl) {
    setCameraOpen(false);
    setPhoto({
      previewUrl,
      path: null,
      uploading: true,
      failed: false
    });
    onUploadPhoto(blob).then(res => {
      if (res) setPhoto(p => p && {
        ...p,
        path: res.id,
        uploading: false
      });else setPhoto(p => p && {
        ...p,
        uploading: false,
        failed: true
      });
    });
  }
  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || dup || saving || photo && photo.uploading) return;
    setSaving(true);
    const changes = {
      name: name.trim(),
      barcode: barcode.trim() || null,
      category,
      min_stock: Math.max(0, parseInt(minStock, 10) || 0),
      price: Number(price) || 0
    };
    if (photo && photo.path) changes.photo_path = photo.path;
    const ok = await onSave(product, changes, stockNum, nota.trim());
    setSaving(false);
    if (ok) onClose();
  }
  async function doDelete() {
    setSaving(true);
    const ok = await onDelete(product);
    setSaving(false);
    if (ok) onClose();
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    onClick: () => !saving && onClose()
  }, /*#__PURE__*/React.createElement("form", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    onSubmit: submit
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h"
  }, /*#__PURE__*/React.createElement("span", null, "Editar producto"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--surface-2)",
      color: "var(--ink)"
    },
    onClick: onClose,
    disabled: saving
  }, "✕")), /*#__PURE__*/React.createElement("div", {
    className: "stock-box"
  }, /*#__PURE__*/React.createElement("div", {
    className: "theme-label",
    style: {
      marginTop: 0
    }
  }, "Existencia"), /*#__PURE__*/React.createElement("div", {
    className: "stock-edit"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => bump(-1),
    "aria-label": "Reducir"
  }, "–"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "numeric",
    min: "0",
    value: stock,
    onChange: e => setStock(e.target.value)
  }), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => bump(1),
    "aria-label": "Aumentar"
  }, "+")), /*#__PURE__*/React.createElement("div", {
    className: "quick-adj"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => bump(-10)
  }, "−10"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => bump(-5)
  }, "−5"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => bump(5)
  }, "+5"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    onClick: () => bump(10)
  }, "+10")), /*#__PURE__*/React.createElement("div", {
    className: "delta " + (delta < 0 ? "neg" : delta > 0 ? "pos" : "")
  }, delta === 0 ? `Existencia actual: ${product.stock}` : `${product.stock} → ${stockNum}  (${delta > 0 ? "+" : ""}${delta})`), delta !== 0 && /*#__PURE__*/React.createElement("label", {
    className: "field",
    style: {
      marginBottom: 0
    }
  }, /*#__PURE__*/React.createElement("span", null, "Motivo del ajuste (opcional)"), /*#__PURE__*/React.createElement("input", {
    value: nota,
    onChange: e => setNota(e.target.value),
    placeholder: "Ej. conteo físico, merma, reposición"
  }))), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Nombre"), /*#__PURE__*/React.createElement("input", {
    value: name,
    onChange: e => setName(e.target.value),
    required: true
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Categoría"), /*#__PURE__*/React.createElement("select", {
    value: category,
    onChange: e => setCategory(e.target.value)
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Sin categoría"), catNames.map(n => /*#__PURE__*/React.createElement("option", {
    key: n,
    value: n
  }, n)))), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Código de barras"), /*#__PURE__*/React.createElement("input", {
    value: barcode,
    onChange: e => setBarcode(e.target.value)
  }), dup && /*#__PURE__*/React.createElement("span", {
    className: "field-error"
  }, "Ya existe: \"", dup.name, "\" usa este código")), /*#__PURE__*/React.createElement("div", {
    className: "two-col"
  }, /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Stock mínimo"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "numeric",
    min: "0",
    value: minStock,
    onChange: e => setMinStock(e.target.value)
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Precio (MXN)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    inputMode: "decimal",
    min: "0",
    step: "0.01",
    value: price,
    onChange: e => setPrice(e.target.value),
    placeholder: "0.00"
  }))), /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      margin: "4px 0 6px"
    }
  }, "Foto de perfil"), shownPhoto ? /*#__PURE__*/React.createElement("div", {
    className: "photo-preview"
  }, /*#__PURE__*/React.createElement("img", {
    src: shownPhoto,
    alt: ""
  }), photo && photo.uploading && /*#__PURE__*/React.createElement("span", {
    className: "photo-tag"
  }, "Subiendo foto…"), photo && photo.failed && /*#__PURE__*/React.createElement("span", {
    className: "photo-tag photo-tag-warn"
  }, "La foto no se guardará"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "photo-change",
    onClick: () => setCameraOpen(true)
  }, "Cambiar foto")) : /*#__PURE__*/React.createElement("div", {
    className: "photo-field"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    style: {
      margin: 0
    },
    onClick: () => setCameraOpen(true)
  }, "📷 Tomar foto"), /*#__PURE__*/React.createElement("label", {
    className: "upload-link"
  }, "o subir una imagen existente", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: e => {
      const f = e.target.files[0];
      if (f) takePhoto(f, URL.createObjectURL(f));
    }
  }))), shownPhoto && /*#__PURE__*/React.createElement("label", {
    className: "upload-link",
    style: {
      display: "inline-block",
      marginBottom: 6
    }
  }, "o subir otra imagen", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: e => {
      const f = e.target.files[0];
      if (f) takePhoto(f, URL.createObjectURL(f));
    }
  })), /*#__PURE__*/React.createElement("div", {
    className: "danger-zone"
  }, !confirmDel ? /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "link-danger",
    onClick: () => setConfirmDel(true),
    disabled: saving
  }, "🗑 Eliminar producto") : /*#__PURE__*/React.createElement("div", {
    className: "cat-confirm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "small"
  }, "¿Eliminar \"", product.name, "\"? Su historial de movimientos se conserva."), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mini danger",
    onClick: doDelete,
    disabled: saving
  }, "Sí, eliminar"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "mini",
    onClick: () => setConfirmDel(false)
  }, "Cancelar"))), /*#__PURE__*/React.createElement("div", {
    className: "sheet-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    type: "submit",
    disabled: saving || !!dup || !name.trim() || photo && photo.uploading,
    style: {
      marginTop: 0
    }
  }, saving ? "Guardando…" : "Guardar cambios")))), cameraOpen && /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    style: {
      zIndex: 60
    },
    onClick: () => setCameraOpen(false)
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    style: {
      padding: "18px 0 22px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h",
    style: {
      padding: "0 18px"
    }
  }, /*#__PURE__*/React.createElement("span", null, "Foto del producto"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--surface-2)",
      color: "var(--ink)"
    },
    onClick: () => setCameraOpen(false)
  }, "✕")), /*#__PURE__*/React.createElement(Camera, {
    onCapture: takePhoto,
    onCancel: () => setCameraOpen(false)
  }))));
}
function ThemeModal({
  theme,
  onChange,
  onClose
}) {
  useHideNav(true);
  const isCustom = !THEME_PRESETS.some(p => p.id === theme.accent);
  const current = isCustom ? "Personalizado" : THEME_PRESETS.find(p => p.id === theme.accent).name;
  return /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    onClick: onClose
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation()
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h"
  }, /*#__PURE__*/React.createElement("span", null, "🎨 Apariencia"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--surface-2)",
      color: "var(--ink)"
    },
    onClick: onClose
  }, "✕")), /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      margin: "2px 0 6px"
    }
  }, "Elige el color y el modo que más te gusten. Se guarda en tu cuenta y te sigue a tus otros dispositivos."), /*#__PURE__*/React.createElement("div", {
    className: "theme-label"
  }, "Color principal · ", current), /*#__PURE__*/React.createElement("div", {
    className: "swatches"
  }, THEME_PRESETS.map(p => /*#__PURE__*/React.createElement("button", {
    key: p.id,
    type: "button",
    className: "swatch" + (theme.accent === p.id ? " on" : ""),
    style: {
      background: `linear-gradient(135deg,${p.p1},${p.p2})`
    },
    onClick: () => onChange({
      ...theme,
      accent: p.id
    }),
    "aria-label": p.name
  }, theme.accent === p.id ? "✓" : "")), /*#__PURE__*/React.createElement("label", {
    className: "swatch custom" + (isCustom ? " on" : ""),
    style: isCustom ? {
      background: theme.custom
    } : undefined,
    title: "Color personalizado"
  }, /*#__PURE__*/React.createElement("input", {
    type: "color",
    value: /^#[0-9a-f]{6}$/i.test(theme.custom || "") ? theme.custom : "#4F46E5",
    onChange: e => onChange({
      ...theme,
      accent: "custom",
      custom: e.target.value
    })
  }), isCustom ? "✓" : "＋")), /*#__PURE__*/React.createElement("div", {
    className: "theme-label"
  }, "Modo"), /*#__PURE__*/React.createElement("div", {
    className: "seg"
  }, [["auto", "Automático"], ["light", "Claro"], ["dark", "Oscuro"]].map(([v, l]) => /*#__PURE__*/React.createElement("button", {
    key: v,
    type: "button",
    className: theme.mode === v ? "on" : "",
    onClick: () => onChange({
      ...theme,
      mode: v
    })
  }, l))), /*#__PURE__*/React.createElement("div", {
    className: "sheet-footer"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-primary",
    style: {
      marginTop: 0
    },
    onClick: onClose
  }, "Listo"))));
}
function InventarioView({
  products,
  movements,
  categories,
  onAddProduct,
  onAddCategory,
  onDeleteCategory,
  onSaveProduct,
  onDeleteProduct,
  onUploadPhoto,
  showToast
}) {
  const [query, setQuery] = useState("");
  const [addMode, setAddMode] = useState(null); // null | "camera" | "form"
  const [cameraTarget, setCameraTarget] = useState(null); // "barcode" | "profile"
  const [form, setForm] = useState({
      name: "",
      barcode: "",
      stock: "",
      minStock: "",
      price: "",
      category: ""
    }),
    [saving, setSaving] = useState(false);
  const [photo, setPhoto] = useState(null); // {previewUrl, assetUrl, assetId, uploading, failed} — foto de perfil
  const [barcodeScan, setBarcodeScan] = useState(null); // null | "scanning" | "found" | "none"
  const [barcodeDup, setBarcodeDup] = useState(null); // producto existente con el mismo código, o null
  const filtered = products.filter(p => p.name.toLowerCase().includes(query.toLowerCase()) || p.barcode.includes(query));
  const low = products.filter(p => p.stock <= p.minStock).length;
  const [activityFilter, setActivityFilter] = useState("todo"); // "todo" | "venta" | "devolucion"
  const [visibleCount, setVisibleCount] = useState(8);
  const [zoomUrl, setZoomUrl] = useState(null);
  const [catFilter, setCatFilter] = useState("all");
  const [collapsed, setCollapsed] = useState({});
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [catError, setCatError] = useState("");
  const [confirmCat, setConfirmCat] = useState(null);
  const [editing, setEditing] = useState(null);
  useHideNav(!!addMode || showCatModal || !!zoomUrl || !!editing);
  const catNames = categories.map(c => c.name);
  products.forEach(p => {
    if (p.category && !catNames.includes(p.category)) catNames.push(p.category);
  });
  const groupNames = [...catNames, ...(filtered.some(p => !p.category) ? [""] : [])].filter(n => catFilter === "all" || n === catFilter);
  const groups = groupNames.map(n => ({
    name: n,
    color: n ? CAT_COLORS[catNames.indexOf(n) % CAT_COLORS.length] : "#9AA3CC",
    items: filtered.filter(p => (p.category || "") === n)
  })).filter(g => g.items.length > 0 || !query.trim());
  function closeCat() {
    setShowCatModal(false);
    setNewCatName("");
    setCatError("");
    setConfirmCat(null);
  }
  async function doDeleteCat(c) {
    const ok = await onDeleteCategory(c);
    setConfirmCat(null);
    if (ok && catFilter === c.name) setCatFilter("all");
  }
  async function submitCat(e) {
    e.preventDefault();
    const name = newCatName.trim();
    if (!name) return;
    if (catNames.some(n => n.toLowerCase() === name.toLowerCase())) {
      setCatError("Ya existe una categoría con ese nombre");
      return;
    }
    const ok = await onAddCategory(name);
    if (ok) {
      if (addMode === "form") setForm(f => ({
        ...f,
        category: name
      }));
      closeCat();
    } else setCatError("No se pudo guardar, intenta de nuevo");
  }
  const filteredMovements = movements.filter(m => activityFilter === "todo" || m.type === activityFilter);
  function closeAdd() {
    setAddMode(null);
    setCameraTarget(null);
    setForm({
      name: "",
      barcode: "",
      stock: "",
      minStock: "",
      price: "",
      category: ""
    });
    setPhoto(null);
    setBarcodeScan(null);
    setBarcodeDup(null);
  }
  function findDuplicateBarcode(code) {
    const trimmed = (code || "").trim();
    if (!trimmed) return null;
    return products.find(p => p.barcode === trimmed) || null;
  }
  function openCamera(target) {
    setCameraTarget(target);
    setAddMode("camera");
  }
  function readBarcodeFromPhoto(previewUrl) {
    setBarcodeScan("scanning");
    detectBarcodeFromImage(previewUrl).then(code => {
      if (code) {
        setForm(f => ({
          ...f,
          barcode: code
        }));
        setBarcodeScan("found");
        const dup = findDuplicateBarcode(code);
        setBarcodeDup(dup);
        showToast(dup ? {
          kind: "info",
          msg: `Ese código ya pertenece a "${dup.name}"`
        } : {
          kind: "info",
          msg: "Código de barras detectado automáticamente"
        });
      } else {
        setBarcodeScan("none");
        setBarcodeDup(null);
      }
    });
  }
  function saveProfilePhoto(blob, previewUrl) {
    setPhoto({
      previewUrl,
      assetUrl: null,
      assetId: null,
      uploading: true,
      failed: false
    });
    onUploadPhoto(blob).then(res => {
      if (res) setPhoto(p => p && {
        ...p,
        assetUrl: res.url,
        assetId: res.id,
        uploading: false
      });else setPhoto(p => p && {
        ...p,
        uploading: false,
        failed: true
      });
    });
  }
  function handleCameraCaptured(blob, previewUrl) {
    setAddMode("form");
    if (cameraTarget === "barcode") readBarcodeFromPhoto(previewUrl);else if (cameraTarget === "profile") saveProfilePhoto(blob, previewUrl);
  }
  async function submitAdd(e) {
    e.preventDefault();
    if (!form.name.trim() || saving) return;
    const dup = findDuplicateBarcode(form.barcode);
    if (dup) {
      setBarcodeDup(dup);
      showToast({
        kind: "info",
        msg: `Ese código de barras ya existe en "${dup.name}"`
      });
      return;
    }
    setSaving(true);
    const ok = await onAddProduct({
      name: form.name.trim(),
      barcode: form.barcode.trim() || String(Date.now()).slice(0, 13),
      stock: Number(form.stock) || 0,
      minStock: Number(form.minStock) || 5,
      price: Number(form.price) || 0,
      category: form.category || "",
      photoUrl: photo && photo.assetUrl || null,
      photoId: photo && photo.assetId || null
    });
    setSaving(false);
    if (ok) closeAdd();
  }
  const totalValue = products.reduce((sum, p) => sum + p.stock * (p.price || 0), 0);
  return /*#__PURE__*/React.createElement("div", {
    className: "pad"
  }, /*#__PURE__*/React.createElement("div", {
    className: "summary"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mono bignum"
  }, products.length), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "productos")), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "mono bignum " + (low > 0 ? "warn" : "")
  }, low), /*#__PURE__*/React.createElement("div", {
    className: "hint"
  }, "con stock bajo"))), /*#__PURE__*/React.createElement("div", {
    className: "value-strip"
  }, /*#__PURE__*/React.createElement("span", {
    className: "hint"
  }, "Valor total de inventario"), /*#__PURE__*/React.createElement("span", {
    className: "mono value-amount"
  }, formatMXN(totalValue))), /*#__PURE__*/React.createElement("div", {
    className: "box"
  }, /*#__PURE__*/React.createElement("span", null, "🔍"), /*#__PURE__*/React.createElement("input", {
    placeholder: "Buscar producto o código",
    value: query,
    onChange: e => setQuery(e.target.value)
  })), products.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "empty-state"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 34
    }
  }, "📦"), /*#__PURE__*/React.createElement("b", null, "Tu inventario está vacío"), /*#__PURE__*/React.createElement("span", null, "Toca “+ Nuevo producto” para agregar el primero. Puedes tomarle foto y escanear su código de barras.")), /*#__PURE__*/React.createElement("div", {
    className: "chips"
  }, /*#__PURE__*/React.createElement("button", {
    className: "chip" + (catFilter === "all" ? " active" : ""),
    onClick: () => setCatFilter("all")
  }, "Todas ", /*#__PURE__*/React.createElement("span", null, products.length)), catNames.map((n, i) => /*#__PURE__*/React.createElement("button", {
    key: n,
    className: "chip" + (catFilter === n ? " active" : ""),
    onClick: () => setCatFilter(n)
  }, /*#__PURE__*/React.createElement("i", {
    className: "chip-dot",
    style: {
      background: CAT_COLORS[i % CAT_COLORS.length]
    }
  }), n, " ", /*#__PURE__*/React.createElement("span", null, products.filter(p => p.category === n).length))), /*#__PURE__*/React.createElement("button", {
    className: "chip chip-add",
    onClick: () => setShowCatModal(true)
  }, "⚙ Categorías")), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-outline",
    onClick: () => {
      setForm(f => ({
        ...f,
        category: catFilter !== "all" ? catFilter : f.category
      }));
      setAddMode("form");
    }
  }, "+ Nuevo producto"), groups.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Sin resultados."), groups.map(g => /*#__PURE__*/React.createElement("div", {
    className: "cat-group",
    key: g.name || "_none"
  }, /*#__PURE__*/React.createElement("button", {
    className: "cat-head",
    onClick: () => setCollapsed(c => ({
      ...c,
      [g.name]: !c[g.name]
    }))
  }, /*#__PURE__*/React.createElement("span", {
    className: "cat-dot",
    style: {
      background: g.color
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "cat-name"
  }, g.name || "Sin categoría"), /*#__PURE__*/React.createElement("span", {
    className: "cat-count"
  }, g.items.length), /*#__PURE__*/React.createElement("span", {
    className: "cat-caret" + (collapsed[g.name] ? "" : " open")
  }, "▾")), !collapsed[g.name] && /*#__PURE__*/React.createElement("div", {
    className: "cards"
  }, g.items.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      margin: "0 4px 10px"
    }
  }, "Aún no hay productos en esta categoría. Agrega uno con \"+ Nuevo producto\"."), g.items.map(p => {
    const isLow = p.stock <= p.minStock;
    return /*#__PURE__*/React.createElement("div", {
      className: "kcard" + (p.photoUrl ? " has-photo" : ""),
      key: p.id
    }, p.photoUrl && /*#__PURE__*/React.createElement("img", {
      src: p.photoUrl,
      className: "kcard-hero",
      alt: p.name,
      onClick: () => setZoomUrl(p.photoUrl)
    }), /*#__PURE__*/React.createElement("div", {
      className: "tab"
    }, p.name.charAt(0)), /*#__PURE__*/React.createElement("div", {
      className: "kcard-corner"
    }, isLow && /*#__PURE__*/React.createElement("div", {
      className: "stamp"
    }, "STOCK BAJO")), /*#__PURE__*/React.createElement("div", {
      className: "title"
    }, p.name), /*#__PURE__*/React.createElement("div", {
      className: "bar mono"
    }, fmtBarcode(p.barcode)), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", null, "Existencia"), /*#__PURE__*/React.createElement("span", {
      className: "mono " + (isLow ? "warn" : "")
    }, p.stock)), /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", null, "Mínimo"), /*#__PURE__*/React.createElement("span", {
      className: "mono muted"
    }, p.minStock)), !!p.price && /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", null, "Precio unitario"), /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, formatMXN(p.price))), !!p.price && /*#__PURE__*/React.createElement("div", {
      className: "row"
    }, /*#__PURE__*/React.createElement("span", null, "Valor en existencia"), /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, formatMXN(p.stock * p.price))), /*#__PURE__*/React.createElement("div", {
      className: "kcard-actions"
    }, /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "kbtn",
      onClick: () => setEditing(p)
    }, "✏️ Editar / ajustar existencia")));
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement("h3", {
    className: "acth",
    style: {
      margin: 0
    }
  }, "🕐 Actividad reciente"), /*#__PURE__*/React.createElement("div", {
    className: "filter-pills"
  }, /*#__PURE__*/React.createElement("button", {
    className: activityFilter === "todo" ? "active" : "",
    onClick: () => {
      setActivityFilter("todo");
      setVisibleCount(8);
    }
  }, "Todo"), /*#__PURE__*/React.createElement("button", {
    className: activityFilter === "venta" ? "active" : "",
    onClick: () => {
      setActivityFilter("venta");
      setVisibleCount(8);
    }
  }, "Ventas"), /*#__PURE__*/React.createElement("button", {
    className: activityFilter === "devolucion" ? "active" : "",
    onClick: () => {
      setActivityFilter("devolucion");
      setVisibleCount(8);
    }
  }, "Devoluciones"), /*#__PURE__*/React.createElement("button", {
    className: activityFilter === "ajuste" ? "active" : "",
    onClick: () => {
      setActivityFilter("ajuste");
      setVisibleCount(8);
    }
  }, "Ajustes"))), /*#__PURE__*/React.createElement("div", {
    className: "acts"
  }, filteredMovements.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Aún no hay movimientos registrados."), filteredMovements.slice(0, visibleCount).map(m => {
    const p = products.find(pr => pr.id === m.productId);
    return /*#__PURE__*/React.createElement("div", {
      className: "act",
      key: m.id
    }, /*#__PURE__*/React.createElement("span", {
      className: "act-ic " + (m.type === "venta" ? "sale" : m.type === "ajuste" ? "adj" : "ret")
    }, m.type === "venta" ? "↓" : m.type === "ajuste" ? "±" : "↑"), /*#__PURE__*/React.createElement("div", {
      className: "act-text"
    }, /*#__PURE__*/React.createElement("div", null, m.type === "venta" ? "Venta" : m.type === "ajuste" ? "Ajuste" : "Devolución", " · ", p ? p.name : "Producto eliminado", /*#__PURE__*/React.createElement("span", {
      className: "mono"
    }, " ", (() => {
      const s = m.type === "venta" ? -m.qty : m.qty;
      return (s > 0 ? "+" : "") + s;
    })())), /*#__PURE__*/React.createElement("div", {
      className: "hint small"
    }, formatDateTime(m.ts), m.type === "venta" && !!m.price && ` · ${formatMXN(m.price)} c/u · total ${formatMXN(m.total)}`, m.motivo ? ` · ${m.motivo}` : "", m.nota ? ` · "${m.nota}"` : "")));
  }), filteredMovements.length > visibleCount && /*#__PURE__*/React.createElement("button", {
    className: "back",
    style: {
      alignSelf: "center"
    },
    onClick: () => setVisibleCount(v => v + 8)
  }, "Mostrar más")), showCatModal && /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    style: {
      zIndex: 40
    },
    onClick: closeCat
  }, /*#__PURE__*/React.createElement("form", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    onSubmit: submitCat
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h"
  }, /*#__PURE__*/React.createElement("span", null, "Categorías"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--surface-2)",
      color: "var(--ink)"
    },
    onClick: closeCat
  }, "✕")), /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      margin: "2px 0 4px"
    }
  }, "Agrega categorías nuevas o elimina las que ya no necesites."), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Nombre de la categoría"), /*#__PURE__*/React.createElement("input", {
    value: newCatName,
    maxLength: 30,
    placeholder: "Ej. Frutas y verduras",
    autoFocus: true,
    onChange: e => {
      setNewCatName(e.target.value);
      setCatError("");
    }
  }), catError && /*#__PURE__*/React.createElement("span", {
    className: "field-error"
  }, catError)), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    type: "submit",
    disabled: !newCatName.trim(),
    style: {
      marginTop: 0
    }
  }, "Agregar categoría"), /*#__PURE__*/React.createElement("div", {
    className: "theme-label",
    style: {
      marginTop: 18
    }
  }, "Tus categorías"), /*#__PURE__*/React.createElement("div", {
    className: "cat-list"
  }, categories.length === 0 && /*#__PURE__*/React.createElement("p", {
    className: "hint"
  }, "Aún no tienes categorías."), categories.map((c, i) => {
    const n = products.filter(p => p.category === c.name).length;
    return /*#__PURE__*/React.createElement("div", {
      className: "cat-row",
      key: c.id
    }, /*#__PURE__*/React.createElement("i", {
      className: "chip-dot",
      style: {
        background: CAT_COLORS[i % CAT_COLORS.length]
      }
    }), /*#__PURE__*/React.createElement("div", {
      className: "cat-row-name"
    }, c.name, /*#__PURE__*/React.createElement("span", {
      className: "hint small"
    }, " · ", n, " ", n === 1 ? "producto" : "productos")), confirmCat === c.id ? /*#__PURE__*/React.createElement("div", {
      className: "cat-confirm"
    }, /*#__PURE__*/React.createElement("span", {
      className: "small"
    }, n > 0 ? "Sus productos quedarán sin categoría. " : "", "¿Eliminar?"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "mini danger",
      onClick: () => doDeleteCat(c)
    }, "Sí"), /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "mini",
      onClick: () => setConfirmCat(null)
    }, "No")) : /*#__PURE__*/React.createElement("button", {
      type: "button",
      className: "mini danger-ghost",
      onClick: () => setConfirmCat(c.id),
      "aria-label": "Eliminar " + c.name
    }, "🗑"));
  })))), editing && /*#__PURE__*/React.createElement(EditProductModal, {
    key: editing.id,
    product: products.find(x => x.id === editing.id) || editing,
    products: products,
    categories: categories,
    onSave: onSaveProduct,
    onDelete: onDeleteProduct,
    onClose: () => setEditing(null),
    onUploadPhoto: onUploadPhoto
  }), zoomUrl && /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    style: {
      alignItems: "center"
    },
    onClick: () => setZoomUrl(null)
  }, /*#__PURE__*/React.createElement("img", {
    src: zoomUrl,
    className: "zoom-img",
    alt: ""
  })), addMode === "camera" && /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    onClick: () => setAddMode("form")
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    style: {
      padding: "18px 0 22px"
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h",
    style: {
      padding: "0 18px"
    }
  }, /*#__PURE__*/React.createElement("span", null, cameraTarget === "barcode" ? "Escanear código de barras" : "Foto de perfil del producto"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--card-edge)"
    },
    onClick: () => setAddMode("form")
  }, "✕")), /*#__PURE__*/React.createElement(Camera, {
    onCapture: handleCameraCaptured,
    onCancel: () => setAddMode("form")
  }))), addMode === "form" && /*#__PURE__*/React.createElement("div", {
    className: "modal-ov",
    onClick: () => !saving && closeAdd()
  }, /*#__PURE__*/React.createElement("form", {
    className: "modal",
    onClick: e => e.stopPropagation(),
    onSubmit: submitAdd
  }, /*#__PURE__*/React.createElement("div", {
    className: "modal-h"
  }, /*#__PURE__*/React.createElement("span", null, "Nuevo producto"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "rbtn",
    style: {
      background: "var(--card-edge)"
    },
    onClick: closeAdd,
    disabled: saving
  }, "✕")), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Nombre"), /*#__PURE__*/React.createElement("input", {
    value: form.name,
    onChange: e => setForm({
      ...form,
      name: e.target.value
    }),
    required: true,
    autoFocus: true
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Categoría"), /*#__PURE__*/React.createElement("select", {
    value: form.category,
    onChange: e => setForm({
      ...form,
      category: e.target.value
    })
  }, /*#__PURE__*/React.createElement("option", {
    value: ""
  }, "Sin categoría"), catNames.map(n => /*#__PURE__*/React.createElement("option", {
    key: n,
    value: n
  }, n)))), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "upload-link",
    style: {
      background: "none",
      border: "none",
      padding: 0,
      margin: "-6px 0 8px",
      textAlign: "left"
    },
    onClick: () => setShowCatModal(true)
  }, "＋ Agregar nueva categoría"), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Código de barras", barcodeScan === "scanning" && /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, " · leyendo de la foto…"), barcodeScan === "found" && !barcodeDup && /*#__PURE__*/React.createElement("span", {
    style: {
      color: "var(--green)"
    }
  }, " · detectado ✓"), barcodeScan === "none" && /*#__PURE__*/React.createElement("span", {
    className: "muted"
  }, " · no detectado, escríbelo")), /*#__PURE__*/React.createElement("input", {
    value: form.barcode,
    onChange: e => {
      const v = e.target.value;
      setForm({
        ...form,
        barcode: v
      });
      setBarcodeDup(findDuplicateBarcode(v));
    }
  }), barcodeDup && /*#__PURE__*/React.createElement("span", {
    className: "field-error"
  }, "Ya existe: \"", barcodeDup.name, "\" usa este código")), /*#__PURE__*/React.createElement("div", {
    className: "photo-field",
    style: {
      marginTop: -6
    }
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    style: {
      margin: 0
    },
    onClick: () => openCamera("barcode")
  }, "📷 Escanear código"), /*#__PURE__*/React.createElement("label", {
    className: "upload-link"
  }, "o subir una foto del código", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: e => {
      const f = e.target.files[0];
      if (f) readBarcodeFromPhoto(URL.createObjectURL(f));
    }
  }))), /*#__PURE__*/React.createElement("p", {
    className: "hint",
    style: {
      margin: "10px 0 6px"
    }
  }, "Foto de perfil (opcional) · ayuda a reconocerlo rápido en la lista"), !photo && /*#__PURE__*/React.createElement("div", {
    className: "photo-field"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "btn btn-outline",
    style: {
      margin: 0
    },
    onClick: () => openCamera("profile")
  }, "📷 Tomar foto"), /*#__PURE__*/React.createElement("label", {
    className: "upload-link"
  }, "o subir una imagen existente", /*#__PURE__*/React.createElement("input", {
    type: "file",
    accept: "image/*",
    style: {
      display: "none"
    },
    onChange: e => {
      const f = e.target.files[0];
      if (f) saveProfilePhoto(f, URL.createObjectURL(f));
    }
  }))), photo && /*#__PURE__*/React.createElement("div", {
    className: "photo-preview"
  }, /*#__PURE__*/React.createElement("img", {
    src: photo.previewUrl,
    alt: ""
  }), photo.uploading && /*#__PURE__*/React.createElement("span", {
    className: "photo-tag"
  }, "Subiendo foto…"), photo.failed && /*#__PURE__*/React.createElement("span", {
    className: "photo-tag photo-tag-warn"
  }, "La foto no se guardará"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: "photo-change",
    onClick: () => openCamera("profile")
  }, "Cambiar foto")), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Existencia inicial"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    value: form.stock,
    onChange: e => setForm({
      ...form,
      stock: e.target.value
    })
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Stock mínimo"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    value: form.minStock,
    onChange: e => setForm({
      ...form,
      minStock: e.target.value
    })
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Precio unitario (MXN)"), /*#__PURE__*/React.createElement("input", {
    type: "number",
    min: "0",
    step: "0.01",
    placeholder: "0.00",
    value: form.price,
    onChange: e => setForm({
      ...form,
      price: e.target.value
    })
  })), /*#__PURE__*/React.createElement("div", {
    className: "sheet-footer"
  }, /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    type: "submit",
    disabled: saving || !!barcodeDup,
    style: {
      marginTop: 0
    }
  }, saving ? "Guardando…" : "Guardar producto")))));
}

// ====================== CAPA DE DATOS (Supabase) ======================
function resizeImage(blob, maxSide, quality) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxSide / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob(b => resolve(b || blob), "image/jpeg", quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    img.src = url;
  });
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}
function mapProduct(r) {
  return {
    id: r.id,
    name: r.name,
    barcode: r.barcode || "",
    category: r.category || "",
    stock: r.stock,
    minStock: r.min_stock,
    price: Number(r.price) || 0,
    photoPath: r.photo_path || null,
    photoUrl: r.photo_path ? sb.storage.from("product-photos").getPublicUrl(r.photo_path).data.publicUrl : null
  };
}
function mapMovement(r) {
  return {
    id: r.id,
    ts: new Date(r.created_at).getTime(),
    type: r.type,
    productId: r.product_id,
    qty: r.qty,
    price: r.price == null ? null : Number(r.price),
    total: r.total == null ? null : Number(r.total),
    motivo: r.motivo,
    nota: r.nota
  };
}
function authErrorText(err) {
  const m = (err && err.message || "").toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos";
  if (m.includes("already registered")) return "Ya existe una cuenta con ese correo";
  if (m.includes("at least")) return "La contraseña debe tener al menos 6 caracteres";
  if (m.includes("not confirmed")) return "Primero confirma tu correo (revisa tu bandeja y spam)";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos, espera un momento";
  if (m.includes("valid email") || m.includes("invalid email")) return "Escribe un correo válido";
  return "No se pudo completar, intenta de nuevo";
}
function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [business, setBusiness] = useState("");
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState(null);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      if (mode === "login") {
        const {
          error
        } = await sb.auth.signInWithPassword({
          email: email.trim(),
          password
        });
        if (error) throw error;
      } else {
        const {
          data,
          error
        } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              business_name: business.trim() || "Mi negocio"
            }
          }
        });
        if (error) throw error;
        if (!data.session) setMsg({
          kind: "ok",
          text: "Te enviamos un correo para confirmar tu cuenta. Ábrelo y luego inicia sesión."
        });
      }
    } catch (err) {
      setMsg({
        kind: "err",
        text: authErrorText(err)
      });
    }
    setBusy(false);
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "auth"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-brand"
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-logo"
  }, "K"), /*#__PURE__*/React.createElement("h1", null, "Kardex"), /*#__PURE__*/React.createElement("p", null, "Control de inventario para tu negocio")), /*#__PURE__*/React.createElement("form", {
    className: "auth-card",
    onSubmit: submit
  }, /*#__PURE__*/React.createElement("div", {
    className: "auth-tabs"
  }, /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: mode === "login" ? "on" : "",
    onClick: () => {
      setMode("login");
      setMsg(null);
    }
  }, "Iniciar sesión"), /*#__PURE__*/React.createElement("button", {
    type: "button",
    className: mode === "register" ? "on" : "",
    onClick: () => {
      setMode("register");
      setMsg(null);
    }
  }, "Crear cuenta")), mode === "register" && /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Nombre de tu negocio"), /*#__PURE__*/React.createElement("input", {
    value: business,
    onChange: e => setBusiness(e.target.value),
    placeholder: "Ej. Abarrotes La Esperanza",
    maxLength: 60
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Correo"), /*#__PURE__*/React.createElement("input", {
    type: "email",
    value: email,
    onChange: e => setEmail(e.target.value),
    required: true,
    autoComplete: "email",
    placeholder: "tucorreo@ejemplo.com"
  })), /*#__PURE__*/React.createElement("label", {
    className: "field"
  }, /*#__PURE__*/React.createElement("span", null, "Contraseña"), /*#__PURE__*/React.createElement("input", {
    type: "password",
    value: password,
    onChange: e => setPassword(e.target.value),
    required: true,
    minLength: 6,
    autoComplete: mode === "login" ? "current-password" : "new-password",
    placeholder: "Mínimo 6 caracteres"
  })), msg && /*#__PURE__*/React.createElement("div", {
    className: "msg " + msg.kind
  }, msg.text), /*#__PURE__*/React.createElement("button", {
    className: "btn btn-primary",
    type: "submit",
    disabled: busy
  }, busy ? "Un momento…" : mode === "login" ? "Entrar" : "Crear mi cuenta")));
}
function MainApp({
  session,
  onLogout
}) {
  const [products, setProducts] = useState([]);
  const [movements, setMovements] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dbState, setDbState] = useState("connecting");
  const [businessName, setBusinessName] = useState("");
  const [tab, setTab] = useState("vender");
  const [toast, setToast] = useState(null);
  const [theme, setTheme] = useState(loadTheme);
  const [showTheme, setShowTheme] = useState(false);
  const themeTimer = useRef(null);
  const businessRef = useRef(null);
  const toastTimer = useRef(null);
  const showToast = useCallback(t => {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const loadAll = useCallback(async () => {
    try {
      const [p, c, m] = await Promise.all([sb.from("products").select("*").order("name"), sb.from("categories").select("id,name").order("sort_order"), sb.from("movements").select("*").order("created_at", {
        ascending: false
      }).limit(200)]);
      if (p.error || c.error || m.error) {
        setDbState("unavailable");
        return;
      }
      setProducts(p.data.map(mapProduct));
      setCategories(c.data);
      setMovements(m.data.map(mapMovement));
      setDbState("ready");
    } catch (e) {
      setDbState("unavailable");
    }
  }, []);
  useEffect(() => {
    (async () => {
      const {
        data
      } = await sb.from("profiles").select("business_id, businesses(name)").eq("id", session.user.id).maybeSingle();
      if (data) {
        businessRef.current = data.business_id;
        setBusinessName(data.businesses && data.businesses.name || "");
      }
      await loadAll();
    })();
    const onVis = () => {
      if (document.visibilityState === "visible") loadAll();
    };
    document.addEventListener("visibilitychange", onVis);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadAll();
    }, 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const mt = session.user && session.user.user_metadata && session.user.user_metadata.theme;
    if (mt && mt.mode && JSON.stringify(mt) !== JSON.stringify(loadTheme())) {
      try {
        localStorage.setItem(THEME_KEY, JSON.stringify(mt));
      } catch (e) {}
      applyTheme({
        ...DEFAULT_THEME,
        ...mt
      });
      setTheme({
        ...DEFAULT_THEME,
        ...mt
      });
    }
  }, []);
  function changeTheme(t) {
    setTheme(t);
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(t));
    } catch (e) {}
    applyTheme(t);
    if (themeTimer.current) clearTimeout(themeTimer.current);
    themeTimer.current = setTimeout(() => {
      try {
        sb.auth.updateUser({
          data: {
            theme: t
          }
        }).catch(() => {});
      } catch (e) {}
    }, 700);
  }
  const uploadProductPhoto = useCallback(async blob => {
    if (!businessRef.current) return null;
    try {
      const small = await resizeImage(blob, 1280, 0.8);
      const uid = window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
      const path = businessRef.current + "/" + uid + ".jpg";
      const {
        error
      } = await sb.storage.from("product-photos").upload(path, small, {
        contentType: "image/jpeg",
        cacheControl: "31536000"
      });
      if (error) return null;
      return {
        id: path,
        url: sb.storage.from("product-photos").getPublicUrl(path).data.publicUrl
      };
    } catch (e) {
      return null;
    }
  }, []);
  const identifyProductFromPhoto = useCallback(async (blob, currentProducts) => {
    if (!currentProducts.length) return {
      matches: []
    };
    try {
      const small = await resizeImage(blob, 1024, 0.7);
      const image = await blobToBase64(small);
      const {
        data
      } = await sb.auth.getSession();
      const token = data && data.session ? data.session.access_token : "";
      const res = await fetch("/api/identify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + token
        },
        body: JSON.stringify({
          image
        })
      });
      if (res.status === 401) return {
        error: "auth"
      };
      if (res.status === 429) return {
        error: "rate_limited"
      };
      if (!res.ok) return {
        error: "unavailable"
      };
      const out = await res.json();
      const matches = (out.matches || []).map(m => {
        const p = currentProducts.find(pr => pr.id === String(m.id));
        if (!p) return null;
        const c = Number(m.confidence);
        return {
          ...p,
          confidence: isFinite(c) ? Math.max(0, Math.min(1, c)) : 0.5
        };
      }).filter(Boolean).slice(0, 3);
      return {
        matches
      };
    } catch (e) {
      return {
        error: "unavailable"
      };
    }
  }, []);
  async function registrarVenta(productId, qty) {
    const {
      error
    } = await sb.rpc("register_movement", {
      p_product: productId,
      p_type: "venta",
      p_qty: qty
    });
    if (error) {
      showToast({
        kind: "info",
        msg: "No se pudo guardar la venta, intenta de nuevo"
      });
      return;
    }
    showToast({
      kind: "venta",
      msg: `Venta registrada · -${qty}`
    });
    await loadAll();
  }
  async function registrarDevolucion(productId, qty, motivo, nota) {
    const {
      error
    } = await sb.rpc("register_movement", {
      p_product: productId,
      p_type: "devolucion",
      p_qty: qty,
      p_motivo: motivo || null,
      p_nota: nota || null
    });
    if (error) {
      showToast({
        kind: "info",
        msg: "No se pudo guardar la devolución, intenta de nuevo"
      });
      return;
    }
    showToast({
      kind: "devolucion",
      msg: `Devolución registrada · +${qty}`
    });
    await loadAll();
  }
  async function agregarCategoria(name) {
    const {
      error
    } = await sb.from("categories").insert({
      name,
      sort_order: Date.now()
    });
    if (error) return false;
    showToast({
      kind: "info",
      msg: `Categoría "${name}" agregada`
    });
    await loadAll();
    return true;
  }
  async function guardarProducto(product, changes, newStock, nota) {
    const {
      error
    } = await sb.from("products").update(changes).eq("id", product.id);
    if (error) {
      showToast({
        kind: "info",
        msg: error.code === "23505" ? "Ese código de barras ya existe" : "No se pudieron guardar los cambios"
      });
      return false;
    }
    if (newStock !== product.stock) {
      const {
        error: e2
      } = await sb.rpc("adjust_stock", {
        p_product: product.id,
        p_new_stock: newStock,
        p_nota: nota || null
      });
      if (e2) {
        const {
          error: e3
        } = await sb.from("products").update({
          stock: newStock
        }).eq("id", product.id);
        await loadAll();
        if (e3) {
          showToast({
            kind: "info",
            msg: "No se pudo actualizar la existencia"
          });
          return false;
        }
        showToast({
          kind: "info",
          msg: "Existencia actualizada (sin historial: falta el paso de Supabase)"
        });
        return true;
      }
    }
    showToast({
      kind: "info",
      msg: "Cambios guardados"
    });
    await loadAll();
    return true;
  }
  async function eliminarProducto(product) {
    const {
      error
    } = await sb.from("products").delete().eq("id", product.id);
    if (error) {
      showToast({
        kind: "info",
        msg: "No se pudo eliminar el producto"
      });
      return false;
    }
    showToast({
      kind: "info",
      msg: `"${product.name}" eliminado`
    });
    await loadAll();
    return true;
  }
  async function eliminarCategoria(cat) {
    const {
      error: e1
    } = await sb.from("products").update({
      category: ""
    }).eq("category", cat.name);
    if (e1) {
      showToast({
        kind: "info",
        msg: "No se pudo eliminar la categoría"
      });
      return false;
    }
    const {
      error
    } = await sb.from("categories").delete().eq("id", cat.id);
    if (error) {
      showToast({
        kind: "info",
        msg: "No se pudo eliminar la categoría"
      });
      await loadAll();
      return false;
    }
    showToast({
      kind: "info",
      msg: `Categoría "${cat.name}" eliminada`
    });
    await loadAll();
    return true;
  }
  async function agregarProducto(d) {
    const {
      error
    } = await sb.from("products").insert({
      name: d.name,
      barcode: d.barcode,
      category: d.category || "",
      stock: d.stock,
      min_stock: d.minStock,
      price: d.price,
      photo_path: d.photoId || null
    });
    if (error) {
      showToast({
        kind: "info",
        msg: error.code === "23505" ? "Ese código de barras ya existe" : "No se pudo agregar el producto"
      });
      return false;
    }
    showToast({
      kind: "info",
      msg: "Producto agregado al catálogo"
    });
    await loadAll();
    return true;
  }
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    className: "header"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "brand"
  }, "Kardex"), /*#__PURE__*/React.createElement("div", {
    className: "brand-sub"
  }, businessName || "Control de inventario")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: "flex",
      gap: 8,
      alignItems: "center"
    }
  }, dbState === "ready" && /*#__PURE__*/React.createElement("span", {
    className: "pill pill-ready"
  }, "Guardado"), dbState === "connecting" && /*#__PURE__*/React.createElement("span", {
    className: "pill pill-wait"
  }, "Conectando…"), dbState === "unavailable" && /*#__PURE__*/React.createElement("span", {
    className: "pill pill-off"
  }, "Sin conexión"), /*#__PURE__*/React.createElement("button", {
    className: "pill pill-btn",
    onClick: () => setShowTheme(true),
    "aria-label": "Apariencia",
    title: "Apariencia"
  }, "🎨"), /*#__PURE__*/React.createElement("button", {
    className: "pill pill-btn",
    onClick: onLogout
  }, "Salir"))), tab === "vender" && /*#__PURE__*/React.createElement(VenderView, {
    products: products,
    onVenta: registrarVenta,
    showToast: showToast,
    onIdentifyPhoto: identifyProductFromPhoto
  }), tab === "inventario" && /*#__PURE__*/React.createElement(InventarioView, {
    products: products,
    movements: movements,
    categories: categories,
    onAddProduct: agregarProducto,
    onAddCategory: agregarCategoria,
    onDeleteCategory: eliminarCategoria,
    onSaveProduct: guardarProducto,
    onDeleteProduct: eliminarProducto,
    onUploadPhoto: uploadProductPhoto,
    showToast: showToast
  }), tab === "devolucion" && /*#__PURE__*/React.createElement(DevolucionView, {
    products: products,
    onDevolucion: registrarDevolucion,
    showToast: showToast
  }), showTheme && /*#__PURE__*/React.createElement(ThemeModal, {
    theme: theme,
    onChange: changeTheme,
    onClose: () => setShowTheme(false)
  }), /*#__PURE__*/React.createElement(Toast, {
    toast: toast
  }), /*#__PURE__*/React.createElement("div", {
    className: "nav"
  }, /*#__PURE__*/React.createElement("button", {
    className: tab === "vender" ? "active" : "",
    onClick: () => setTab("vender")
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, "▦"), "Vender"), /*#__PURE__*/React.createElement("button", {
    className: tab === "inventario" ? "active" : "",
    onClick: () => setTab("inventario")
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, "🗂"), "Inventario"), /*#__PURE__*/React.createElement("button", {
    className: tab === "devolucion" ? "active" : "",
    onClick: () => setTab("devolucion")
  }, /*#__PURE__*/React.createElement("span", {
    className: "ic"
  }, "↩"), "Devolución")));
}
function Root() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const h = () => applyTheme(loadTheme());
    if (mq.addEventListener) mq.addEventListener("change", h);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", h);
    };
  }, []);
  useEffect(() => {
    sb.auth.getSession().then(({
      data
    }) => setSession(data.session || null));
    const {
      data: sub
    } = sb.auth.onAuthStateChange((_e, s) => setSession(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return /*#__PURE__*/React.createElement("div", {
    className: "center",
    style: {
      minHeight: "100vh"
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "spin",
    style: {
      fontSize: 30
    }
  }, "↻"));
  if (!session) return /*#__PURE__*/React.createElement(AuthScreen, null);
  return /*#__PURE__*/React.createElement(MainApp, {
    key: session.user.id,
    session: session,
    onLogout: () => sb.auth.signOut()
  });
}
ReactDOM.createRoot(document.getElementById("root")).render(/*#__PURE__*/React.createElement(Root, null));