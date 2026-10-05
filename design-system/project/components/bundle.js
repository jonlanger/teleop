/* @ds-bundle: {"format":4,"namespace":"teleop","components":[{"name":"ControlState"},{"name":"Button"},{"name":"HoldToConfirm"},{"name":"ControlGlyph"},{"name":"LinkMeter"},{"name":"AlertRow"},{"name":"VehicleTile"},{"name":"CameraSwitcher"}]} */
(function () {
  var React = window.React;
  var h = React.createElement;
  function cx() { return Array.prototype.filter.call(arguments, Boolean).join(" "); }

  var STATE_LABEL = { autonomy: "Autonomy", operator: "Operator", transitioning: "Transitioning", stopped: "Stopped" };

  /* The halo: the same ring + three spokes as the mark and the wheel's LED ring. */
  function Halo(props) {
    var s = props.size || 16;
    return h("svg", { className: "tp-halo", width: s, height: s, viewBox: "0 0 24 24", "aria-hidden": "true" },
      h("circle", { cx: 12, cy: 12, r: 8.5, fill: "none", stroke: "currentColor", strokeWidth: 3 }),
      h("path", { d: "M12 12V5.5M12 12l-5.6 3.2M12 12l5.6 3.2", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" }),
      h("circle", { cx: 12, cy: 12, r: 2, fill: "currentColor" }));
  }

  function ControlState(props) {
    var state = props.state || "autonomy";
    return h("span", { className: cx("tp-state", "tp-state-" + state, props.size === "lg" && "tp-state-lg", props.className), role: "status" },
      h(Halo, { size: props.size === "lg" ? 22 : 16 }),
      h("span", { className: "tp-state-label" }, props.label || STATE_LABEL[state]),
      props.vehicle ? h("span", { className: "tp-state-unit" }, props.vehicle) : null);
  }

  function Button(props) {
    var variant = props.variant || "secondary";
    var rest = Object.assign({}, props);
    delete rest.variant; delete rest.glyph; delete rest.size; delete rest.className; delete rest.children;
    return h("button", Object.assign({ type: "button" }, rest, {
      className: cx("tp-btn", "tp-btn-" + variant, props.size === "lg" && "tp-btn-lg", props.className)
    }), props.glyph ? h(ControlGlyph, { control: props.glyph, size: 18 }) : null, h("span", null, props.children));
  }

  function HoldToConfirm(props) {
    var holdMs = props.holdMs || 1200;
    var st = React.useState(0), progress = st[0], setProgress = st[1];
    var dn = React.useState(false), done = dn[0], setDone = dn[1];
    var raf = React.useRef(0), t0 = React.useRef(0);
    function tick(now) {
      var p = Math.min(1, (now - t0.current) / holdMs);
      setProgress(p);
      if (p >= 1) { setDone(true); if (props.onConfirm) props.onConfirm(); return; }
      raf.current = requestAnimationFrame(tick);
    }
    function start(e) { if (done || props.disabled) return; if (e && e.preventDefault) e.preventDefault(); t0.current = performance.now(); raf.current = requestAnimationFrame(tick); }
    function stop() { cancelAnimationFrame(raf.current); if (!done) setProgress(0); }
    React.useEffect(function () { return function () { cancelAnimationFrame(raf.current); }; }, []);
    var label = done ? (props.doneLabel || "Released") : progress > 0 ? "Keep holding" : (props.label || "Hold to release");
    return h("button", {
      type: "button", className: cx("tp-hold", "tp-hold-" + (props.tone || "amber"), done && "tp-hold-done", props.className),
      disabled: props.disabled, "aria-label": (props.label || "Hold to release") + ", hold " + (holdMs / 1000) + " seconds",
      onPointerDown: start, onPointerUp: stop, onPointerLeave: stop,
      onKeyDown: function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); },
      onKeyUp: function (e) { if (e.key === " " || e.key === "Enter") stop(); }
    },
      h("span", { className: "tp-hold-fill", style: { transform: "scaleX(" + (done ? 1 : progress) + ")" } }),
      h(ControlGlyph, { control: props.glyph || "release", size: 18 }),
      h("span", { className: "tp-hold-label" }, label));
  }

  /* Glyphs mirror the physical cap shapes so an on-screen prompt matches what the thumb finds. */
  var GLYPH = {
    estop: function () { return [h("circle", { key: 1, cx: 12, cy: 12, r: 10, className: "g-stop" }), h("rect", { key: 2, x: 7.5, y: 10.5, width: 9, height: 3, rx: 1, className: "g-on-stop" })]; },
    hazard: function () { return [h("circle", { key: 1, cx: 12, cy: 12, r: 10, className: "g-cap" }), h("path", { key: 2, d: "M12 6.5l5.5 9.5h-11z", className: "g-hazard" })]; },
    claim: function () { return [h("rect", { key: 1, x: 2, y: 6, width: 20, height: 12, rx: 6, className: "g-mint" }), h("path", { key: 2, d: "M8 12h8M13 9l3 3-3 3", className: "g-on-mint-line" })]; },
    release: function () { return [h("rect", { key: 1, x: 2.75, y: 6.75, width: 18.5, height: 10.5, rx: 5.25, className: "g-outline" }), h("path", { key: 2, d: "M16 12H8M11 9l-3 3 3 3", className: "g-line" })]; },
    horn: function () { return [h("rect", { key: 1, x: 2, y: 7, width: 20, height: 10, rx: 3, className: "g-cap" }), h("path", { key: 2, d: "M8 14v-4l4-1.5v7L8 14zM15 10.5c.8.8.8 2.2 0 3", className: "g-line" })]; },
    ptt: function () { return [h("circle", { key: 1, cx: 12, cy: 12, r: 10, className: "g-cap" }), h("rect", { key: 2, x: 10, y: 6.5, width: 4, height: 7, rx: 2, className: "g-ink" }), h("path", { key: 3, d: "M8.5 12a3.5 3.5 0 007 0M12 15.5V18", className: "g-line" })]; },
    log: function () { return [h("rect", { key: 1, x: 3, y: 3, width: 18, height: 18, rx: 4.5, className: "g-cap" }), h("path", { key: 2, d: "M8 9h8M8 12h8M8 15h5", className: "g-line" })]; },
    speaker: function () { return [h("circle", { key: 1, cx: 12, cy: 12, r: 10, className: "g-cap" }), h("circle", { key: 2, cx: 8, cy: 12, r: 1.2, className: "g-ink" }), h("circle", { key: 3, cx: 12, cy: 12, r: 1.2, className: "g-ink" }), h("circle", { key: 4, cx: 16, cy: 12, r: 1.2, className: "g-ink" })]; },
    dpad: function () { return [h("circle", { key: 1, cx: 12, cy: 12, r: 11, className: "g-well" }), h("path", { key: 2, d: "M9.5 3.5h5v6h6v5h-6v6h-5v-6h-6v-5h6z", className: "g-cap" })]; },
    stick: function () { return [h("circle", { key: 1, cx: 12, cy: 12, r: 11, className: "g-well" }), h("circle", { key: 2, cx: 12, cy: 12, r: 7, className: "g-cap" }), h("circle", { key: 3, cx: 12, cy: 12, r: 4.2, className: "g-dish" })]; },
    p1: function () { return progGlyph("1"); }, p2: function () { return progGlyph("2"); },
    throttle: function () { return [h("path", { key: 1, d: "M6 3h7a5 5 0 015 5v13H6z", className: "g-cap" }), h("path", { key: 2, d: "M10 16V9M10 9l-2.5 2.5M10 9l2.5 2.5", className: "g-line" })]; },
    brake: function () { return [h("path", { key: 1, d: "M18 3h-7a5 5 0 00-5 5v13h12z", className: "g-cap" }), h("path", { key: 2, d: "M14 9v7M14 16l-2.5-2.5M14 16l2.5-2.5", className: "g-line" })]; }
  };
  function progGlyph(n) {
    return [h("rect", { key: 1, x: 4, y: 4, width: 16, height: 16, rx: 4, className: "g-cap" }),
      h("text", { key: 2, x: 12, y: 16, textAnchor: "middle", className: "g-num" }, n)];
  }
  var GLYPH_NAME = { estop: "Emergency stop", hazard: "Hazard lights", claim: "Claim vehicle", release: "Release vehicle", horn: "Horn",
    ptt: "Talk", log: "Log", speaker: "External speaker", dpad: "D-pad", stick: "Thumbstick (click to acknowledge)",
    p1: "Rear key P1", p2: "Rear key P2", throttle: "Throttle paddle", brake: "Brake paddle" };

  function ControlGlyph(props) {
    var c = props.control || "stick", s = props.size || 20, f = GLYPH[c] || GLYPH.stick;
    var svg = h("svg", { className: cx("tp-glyph", props.className), width: s, height: s, viewBox: "0 0 24 24", role: "img", "aria-label": GLYPH_NAME[c] || c }, f());
    if (!props.showLabel) return svg;
    return h("span", { className: "tp-glyph-row" }, svg, h("span", null, GLYPH_NAME[c] || c));
  }

  function linkQuality(ms) { return ms == null ? "lost" : ms < 120 ? "good" : ms < 250 ? "fair" : "poor"; }
  var Q_LABEL = { good: "Good", fair: "Fair", poor: "Poor", lost: "Link lost" };
  function LinkMeter(props) {
    var q = props.quality || linkQuality(props.latencyMs), bars = { good: 4, fair: 3, poor: 1, lost: 0 }[q];
    return h("span", { className: cx("tp-link", "tp-link-" + q, props.compact && "tp-link-compact", props.className), role: "meter",
      "aria-label": "Link " + Q_LABEL[q] + (props.latencyMs != null ? ", " + props.latencyMs + " milliseconds" : "") },
      h("span", { className: "tp-link-bars", "aria-hidden": "true" }, [0, 1, 2, 3].map(function (i) { return h("i", { key: i, className: i < bars ? "on" : "" }); })),
      h("span", { className: "tp-link-ms" }, props.latencyMs != null ? props.latencyMs : "—", h("small", null, " ms")),
      props.compact ? null : h("span", { className: "tp-link-q" }, Q_LABEL[q]));
  }

  var SEV = { critical: "Critical", warning: "Warning", info: "Info" };
  function AlertRow(props) {
    var sev = props.severity || "warning";
    return h("div", { className: cx("tp-alert", "tp-alert-" + sev, props.acknowledged && "tp-alert-acked", props.className), role: sev === "critical" ? "alert" : undefined },
      h("span", { className: "tp-alert-sev" }, SEV[sev]),
      h("div", { className: "tp-alert-body" },
        h("div", { className: "tp-alert-title" }, props.title),
        props.detail ? h("div", { className: "tp-alert-detail" }, props.detail) : null,
        h("div", { className: "tp-alert-meta" }, [props.vehicle, props.time].filter(Boolean).join("  ·  "))),
      props.acknowledged
        ? h("span", { className: "tp-alert-done" }, h(ControlGlyph, { control: "stick", size: 16 }), "Acknowledged")
        : h("button", { type: "button", className: "tp-alert-ack", onClick: props.onAck }, h(ControlGlyph, { control: "stick", size: 18 }), "Acknowledge"));
  }

  function VehicleTile(props) {
    var state = props.state || "autonomy";
    return h("button", { type: "button", className: cx("tp-tile", "tp-tile-" + state, props.selected && "tp-tile-sel", props.className), onClick: props.onSelect, "aria-pressed": !!props.selected },
      h("span", { className: "tp-tile-top" },
        h("span", { className: "tp-tile-id" }, props.id),
        h(ControlState, { state: state })),
      h("span", { className: "tp-tile-route" }, props.route),
      h("span", { className: "tp-tile-stats" },
        h("span", { className: "tp-tile-speed" }, props.speed != null ? props.speed : "—", h("small", null, " km/h")),
        h(LinkMeter, { latencyMs: props.latencyMs, compact: true })),
      props.alert ? h("span", { className: "tp-tile-alert tp-tile-alert-" + (props.alertSeverity || "warning") }, props.alert) : null);
  }

  var CAMS = [{ id: "front", label: "Front" }, { id: "rear", label: "Rear" }, { id: "left", label: "Left" }, { id: "right", label: "Right" }];
  function CameraSwitcher(props) {
    var views = props.views || CAMS;
    var ctl = React.useState(props.active || views[0].id), active = props.active || ctl[0];
    function pick(id) { ctl[1](id); if (props.onChange) props.onChange(id); }
    return h("div", { className: cx("tp-cams", props.className), role: "tablist", "aria-label": "Camera" },
      h(ControlGlyph, { control: "dpad", size: 18, className: "tp-cams-glyph" }),
      views.map(function (v) {
        return h("button", { key: v.id, type: "button", role: "tab", "aria-selected": active === v.id, className: cx("tp-cam", active === v.id && "on"), onClick: function () { pick(v.id); } }, v.label);
      }));
  }

  window.teleop = window.teleop || {};
  Object.assign(window.teleop, { ControlState: ControlState, Button: Button, HoldToConfirm: HoldToConfirm, ControlGlyph: ControlGlyph,
    LinkMeter: LinkMeter, AlertRow: AlertRow, VehicleTile: VehicleTile, CameraSwitcher: CameraSwitcher, Halo: Halo, linkQuality: linkQuality });
})();
