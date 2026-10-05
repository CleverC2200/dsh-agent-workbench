// node_modules/react-grab/dist/freeze-updates-dBIOHHh-.js
var e = null;
var t = () => {
  if (e !== null) return e;
  try {
    e = window.matchMedia(`(color-gamut: p3)`).matches;
  } catch {
    e = false;
  }
  return e;
};
var n = t();
var r = (e2) => n ? `color(display-p3 0.84 0.19 0.78 / ${e2})` : `rgba(210, 57, 192, ${e2})`;
var re = 1e3 / 60;
var oe = r(0.4);
var se = r(0.05);
var ce = r(0.5);
var le = r(0.08);
var ue = r(0.15);
var ve = `data-react-grab-frozen`;
var ye = `data-react-grab-same-origin-frame`;
var Le = new Set(`display.position.top.right.bottom.left.z-index.overflow.overflow-x.overflow-y.width.height.min-width.min-height.max-width.max-height.margin-top.margin-right.margin-bottom.margin-left.padding-top.padding-right.padding-bottom.padding-left.flex-direction.flex-wrap.justify-content.align-items.align-self.align-content.flex-grow.flex-shrink.flex-basis.order.gap.row-gap.column-gap.grid-template-columns.grid-template-rows.grid-template-areas.font-family.font-size.font-weight.font-style.line-height.letter-spacing.text-align.text-decoration-line.text-decoration-style.text-transform.text-overflow.text-shadow.white-space.word-break.overflow-wrap.vertical-align.color.background-color.background-image.background-position.background-size.background-repeat.border-top-width.border-right-width.border-bottom-width.border-left-width.border-top-style.border-right-style.border-bottom-style.border-left-style.border-top-color.border-right-color.border-bottom-color.border-left-color.border-top-left-radius.border-top-right-radius.border-bottom-left-radius.border-bottom-right-radius.box-shadow.opacity.transform.filter.backdrop-filter.object-fit.object-position`.split(`.`));
var Re = (e2) => typeof e2 == `object` && !!e2 && `nodeType` in e2 && e2.nodeType === Node.ELEMENT_NODE;
var h = (e2) => Re(e2) && e2.namespaceURI === `http://www.w3.org/1999/xhtml`;
var g = (e2) => h(e2) && e2.tagName === `IFRAME`;
var ze = /* @__PURE__ */ new WeakMap();
var _ = (e2) => {
  let t2 = Number.parseFloat(e2);
  return Number.isFinite(t2) ? t2 : 0;
};
var Be = (e2) => {
  let t2 = performance.now(), n2 = ze.get(e2);
  if (n2 && t2 - n2.timestamp < 16) return n2.metrics;
  let r2 = e2.ownerDocument.defaultView?.getComputedStyle(e2), i2;
  if (!r2) i2 = { contentOffsetX: e2.clientLeft, contentOffsetY: e2.clientTop, height: e2.offsetHeight, width: e2.offsetWidth };
  else {
    let t3 = _(r2.borderLeftWidth), n3 = _(r2.borderRightWidth), a = _(r2.borderTopWidth), o = _(r2.borderBottomWidth), s = _(r2.paddingLeft), c = _(r2.paddingRight), l = _(r2.paddingTop), u2 = _(r2.paddingBottom), d2 = _(r2.width), f2 = _(r2.height), p2 = t3 + n3 + s + c, ee2 = a + o + l + u2, m = r2.boxSizing === `border-box` ? d2 : d2 + p2, te = r2.boxSizing === `border-box` ? f2 : f2 + ee2;
    i2 = { contentOffsetX: t3 + s, contentOffsetY: a + l, height: te > 0 ? te : e2.offsetHeight, width: m > 0 ? m : e2.offsetWidth };
  }
  return ze.set(e2, { metrics: i2, timestamp: t2 }), i2;
};
var Ve = (e2, t2) => t2 > 0 ? e2 / t2 : 1;
var He = (e2) => {
  if (!e2) return null;
  try {
    return e2.frameElement;
  } catch {
    return null;
  }
};
var Ue = (e2, t2, n2) => {
  let r2 = t2, i2 = n2, a = 1, o = 1, s = e2;
  for (; s && s !== window; ) {
    let e3 = He(s);
    if (!e3 || !g(e3)) break;
    let t3 = e3.getBoundingClientRect(), n3 = Be(e3), c = Ve(t3.width, n3.width), l = Ve(t3.height, n3.height);
    r2 = t3.left + (n3.contentOffsetX + r2) * c, i2 = t3.top + (n3.contentOffsetY + i2) * l, a *= c, o *= l, s = e3.ownerDocument.defaultView;
  }
  return { x: r2, y: i2, scaleX: a, scaleY: o };
};
var We = (e2) => {
  let t2 = e2.ownerDocument.defaultView;
  return t2 ? t2.getComputedStyle(e2) : window.getComputedStyle(e2);
};
var Ge = (e2, t2) => e2.replace(/([\d.]+)px/g, (e3, n2) => {
  let r2 = Number(n2) * Math.abs(t2);
  return `${Number(r2.toFixed(3))}px`;
});
var Ke = (e2, t2, n2) => {
  let [r2, i2] = e2.split(`/`).map((e3) => e3.trim()), a = Ge(r2, t2), o = Ge(i2 ?? r2, n2);
  return i2 === void 0 && a === o ? a : `${a} / ${o}`;
};
var qe = (e2) => Object.assign(e2, { [Symbol.dispose]: e2 });
var Je = `bippy-0.6.1`;
var Ye = Object.defineProperty;
var Xe = Object.prototype.hasOwnProperty;
var Ze = () => {
};
var Qe = (e2) => {
  try {
    Function.prototype.toString.call(e2).indexOf(`^_^`) > -1 && setTimeout(() => {
      throw Error(`React is running in production mode, but dead code elimination has not been applied. Read how to correctly configure React for production: https://reactjs.org/link/perf-use-production-build`);
    });
  } catch {
  }
};
var $e = (e2 = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) => !!(e2 && `getFiberRoots` in e2);
var et = false;
var tt;
var nt = (e2 = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) => et ? true : (e2 && typeof e2.inject == `function` && (tt = e2.inject.toString()), !!tt?.includes(`(injected)`));
var v = /* @__PURE__ */ new Set();
var rt = /* @__PURE__ */ new Set();
var it = (e2) => {
  e2 && v.add(e2);
  let t2 = /* @__PURE__ */ new Map(), n2 = 0, r2 = { _instrumentationIsActive: false, _instrumentationSource: Je, checkDCE: Qe, hasUnsupportedRendererAttached: false, inject(e3) {
    let i2 = ++n2;
    return t2.set(i2, e3), rt.add(e3), r2._instrumentationIsActive || (r2._instrumentationIsActive = true, v.forEach((e4) => e4())), i2;
  }, on: Ze, onCommitFiberRoot: Ze, onCommitFiberUnmount: Ze, onPostCommitFiberRoot: Ze, renderers: t2, supportsFiber: true, supportsFlight: true };
  try {
    Ye(globalThis, `__REACT_DEVTOOLS_GLOBAL_HOOK__`, { configurable: true, enumerable: true, get() {
      return r2;
    }, set(t4) {
      if (t4 && typeof t4 == `object`) {
        let n4 = r2.renderers;
        r2 = t4, n4.size > 0 && (n4.forEach((e3, n5) => {
          rt.add(e3), t4.renderers.set(n5, e3);
        }), at(e2));
      }
    } });
    let t3 = window.hasOwnProperty, n3 = false;
    Ye(window, `hasOwnProperty`, { configurable: true, value: function(...e3) {
      try {
        if (!n3 && e3[0] === `__REACT_DEVTOOLS_GLOBAL_HOOK__`) return globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__ = void 0, n3 = true, -0;
      } catch {
      }
      return t3.apply(this, e3);
    }, writable: true });
  } catch {
    at(e2);
  }
  return r2;
};
var at = (e2) => {
  e2 && v.add(e2);
  try {
    let t2 = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (!t2) return;
    if (!t2._instrumentationSource) {
      t2.checkDCE = Qe, t2.supportsFiber = true, t2.supportsFlight = true, t2.hasUnsupportedRendererAttached = false, t2._instrumentationSource = Je, t2._instrumentationIsActive = false;
      let e3 = $e(t2);
      if (e3 || (t2.on = Ze), t2.renderers.size) {
        t2._instrumentationIsActive = true, v.forEach((e4) => e4());
        return;
      }
      let n2 = t2.inject, r2 = nt(t2);
      r2 && !e3 && (et = true, t2.inject({ scheduleRefresh() {
      } }) && (t2._instrumentationIsActive = true)), t2.inject = (e4) => {
        let i2 = n2(e4);
        return rt.add(e4), r2 && t2.renderers.set(i2, e4), t2._instrumentationIsActive = true, v.forEach((e5) => e5()), i2;
      };
    }
    (t2.renderers.size || t2._instrumentationIsActive || nt()) && e2?.();
  } catch {
  }
};
var ot = () => Xe.call(globalThis, `__REACT_DEVTOOLS_GLOBAL_HOOK__`);
var y = (e2) => ot() ? (at(e2), globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__) : it(e2);
var st = () => !!(typeof window < `u` && (window.document?.createElement || window.navigator?.product === `ReactNative`));
(() => {
  try {
    st() && y();
  } catch {
  }
})();
var ut = (e2) => !e2 || typeof e2 != `object` ? false : `pendingProps` in e2 && !(`containerInfo` in e2);
function mt(e2, t2, n2 = false) {
  if (!e2) return null;
  let r2 = t2(e2);
  if (r2 instanceof Promise) return (async () => {
    if (await r2 === true) return e2;
    let i3 = n2 ? e2.return : e2.child;
    for (; i3; ) {
      let e3 = await gt(i3, t2, n2);
      if (e3) return e3;
      i3 = n2 ? null : i3.sibling;
    }
    return null;
  })();
  if (r2 === true) return e2;
  let i2 = n2 ? e2.return : e2.child;
  for (; i2; ) {
    let e3 = ht(i2, t2, n2);
    if (e3) return e3;
    i2 = n2 ? null : i2.sibling;
  }
  return null;
}
var ht = (e2, t2, n2 = false) => {
  if (!e2) return null;
  if (t2(e2) === true) return e2;
  let r2 = n2 ? e2.return : e2.child;
  for (; r2; ) {
    let e3 = ht(r2, t2, n2);
    if (e3) return e3;
    r2 = n2 ? null : r2.sibling;
  }
  return null;
};
var gt = async (e2, t2, n2 = false) => {
  if (!e2) return null;
  if (await t2(e2) === true) return e2;
  let r2 = n2 ? e2.return : e2.child;
  for (; r2; ) {
    let e3 = await gt(r2, t2, n2);
    if (e3) return e3;
    r2 = n2 ? null : r2.sibling;
  }
  return null;
};
var bt = /* @__PURE__ */ new Set();
var xt = (e2) => {
  let t2 = e2.alternate;
  if (!t2) return e2;
  if (t2.actualStartTime && e2.actualStartTime) return t2.actualStartTime > e2.actualStartTime ? t2 : e2;
  for (let t3 of bt) {
    let n2 = mt(t3.current, (t4) => {
      if (t4 === e2) return true;
    });
    if (n2) return n2;
  }
  return e2;
};
var Ot = (e2) => {
  if (!ot()) return null;
  let t2 = e2;
  for (; t2.return; ) t2 = t2.return;
  let n2 = Ft.get(t2.stateNode);
  return n2 === void 0 ? null : y().renderers?.get(n2) ?? null;
};
var jt = /* @__PURE__ */ new Set();
var Mt = /* @__PURE__ */ new Set();
var Nt = /* @__PURE__ */ new Set();
var Pt = /* @__PURE__ */ new Set();
var S = /* @__PURE__ */ new WeakMap();
var Ft = /* @__PURE__ */ new WeakMap();
var It = (e2) => {
  let t2 = S.get(e2) ?? {};
  if (S.set(e2, t2), !t2.onCommitFiberRoot || e2.onCommitFiberRoot !== t2.onCommitFiberRoot) {
    let n2 = e2.onCommitFiberRoot, r2 = (t3, i2, a) => {
      if (n2?.(t3, i2, a), S.get(e2)?.onCommitFiberRoot === r2) {
        bt.add(i2), Ft.set(i2, t3);
        for (let e3 of jt) e3(t3, i2, a);
      }
    };
    t2.onCommitFiberRoot = r2, e2.onCommitFiberRoot = r2;
  }
  if (!t2.onCommitFiberUnmount || e2.onCommitFiberUnmount !== t2.onCommitFiberUnmount) {
    let n2 = e2.onCommitFiberUnmount, r2 = (t3, i2) => {
      if (n2?.(t3, i2), S.get(e2)?.onCommitFiberUnmount === r2) for (let e3 of Mt) e3(t3, i2);
    };
    t2.onCommitFiberUnmount = r2, e2.onCommitFiberUnmount = r2;
  }
  if (!t2.onPostCommitFiberRoot || e2.onPostCommitFiberRoot !== t2.onPostCommitFiberRoot) {
    let n2 = e2.onPostCommitFiberRoot, r2 = (t3, i2) => {
      if (n2?.(t3, i2), S.get(e2)?.onPostCommitFiberRoot === r2) for (let e3 of Nt) e3(t3, i2);
    };
    t2.onPostCommitFiberRoot = r2, e2.onPostCommitFiberRoot = r2;
  }
  if (!t2.onScheduleFiberRoot || e2.onScheduleFiberRoot !== t2.onScheduleFiberRoot) {
    let n2 = e2.onScheduleFiberRoot, r2 = (t3, i2, a) => {
      if (n2?.(t3, i2, a), S.get(e2)?.onScheduleFiberRoot === r2) for (let e3 of Pt) e3(t3, i2, a);
    };
    t2.onScheduleFiberRoot = r2, e2.onScheduleFiberRoot = r2;
  }
};
var Lt = (e2) => {
  let t2 = y(e2.onActive);
  t2._instrumentationSource = e2.name ?? Je, It(t2);
  let { onActive: n2, onCommitFiberRoot: r2, onCommitFiberUnmount: i2, onPostCommitFiberRoot: a, onScheduleFiberRoot: o } = e2;
  return r2 && jt.add(r2), i2 && Mt.add(i2), a && Nt.add(a), o && Pt.add(o), qe(() => {
    n2 && v.delete(n2), r2 && jt.delete(r2), i2 && Mt.delete(i2), a && Nt.delete(a), o && Pt.delete(o);
  });
};
var Rt = /* @__PURE__ */ new Set();
var zt = (e2) => e2.startsWith(`__reactContainer$`) || e2.startsWith(`__reactInternalInstance$`) || e2.startsWith(`__reactFiber`);
var Bt = (e2) => {
  let t2 = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (t2?.renderers) for (let n2 of t2.renderers.values()) try {
    let t3 = n2.findFiberByHostInstance?.(e2);
    if (t3) return t3;
  } catch {
  }
  if (typeof e2 == `object` && e2) {
    if (`_reactRootContainer` in e2) return e2._reactRootContainer?._internalRoot?.current?.child;
    let t3 = e2.__internalInstanceHandle ?? e2._internalInstanceHandle;
    if (ut(t3)) return t3;
    let n2 = e2;
    for (let e3 of Rt) {
      let t4 = n2[e3];
      if (t4) return t4;
    }
    for (let e3 of Object.keys(n2)) if (zt(e3)) return Rt.add(e3), n2[e3] || null;
    for (let t4 of bt) {
      if (Ot(t4.current)?.findFiberByHostInstance) continue;
      let n3 = mt(t4.current, (t5) => t5.stateNode === e2);
      if (n3) return n3;
    }
  }
  return null;
};
var Vt = /* @__PURE__ */ new WeakMap();
var Ht = (e2, t2) => {
  Vt.set(e2, t2);
};
var C = (e2) => Vt.get(e2) ?? null;
var Wt = /* @__PURE__ */ new WeakMap();
var Gt = /* @__PURE__ */ new WeakMap();
var qt = (e2, t2, n2) => {
  let r2 = Gt.get(e2);
  if (r2 && n2 - r2.timestamp < 200) return r2.borderRadius;
  let i2 = (t2 ?? We(e2)).borderRadius || `0px`;
  return Gt.set(e2, { borderRadius: i2, timestamp: n2 }), i2;
};
var Jt = (e2) => {
  let t2 = performance.now(), n2 = Wt.get(e2);
  if (n2 && t2 - n2.timestamp < 16) return n2.bounds;
  let r2 = C(e2);
  if (r2) {
    let n3 = r2.getBounds();
    return Wt.set(e2, { bounds: n3, timestamp: t2 }), n3;
  }
  let i2 = e2.getBoundingClientRect(), a = Ue(e2.ownerDocument.defaultView, i2.left, i2.top), o = { borderRadius: Ke(qt(e2, null, t2), a.scaleX, a.scaleY), height: i2.height * a.scaleY, width: i2.width * a.scaleX, x: a.x, y: a.y };
  return Wt.set(e2, { bounds: o, timestamp: t2 }), o;
};
var Yt = (e2) => {
  let t2 = e2.ownerDocument?.defaultView;
  return !!(t2 && e2 instanceof t2.ShadowRoot);
};
var cn = (e2) => C(e2)?.getTagName() ?? (e2.tagName || ``).toLowerCase();
var pn = (e2) => typeof e2 == `object` && !!e2 && `nodeType` in e2 && e2.nodeType === 9;
var E = (e2) => {
  if (e2.assignedSlot) return e2.assignedSlot;
  if (e2.parentElement) return e2.parentElement;
  let t2 = e2.getRootNode();
  return Yt(t2) ? t2.host : pn(t2) ? He(t2.defaultView) : null;
};
var mn = (e2, t2) => {
  let n2 = C(e2)?.hostElement ?? e2;
  for (; n2; ) {
    if (n2 === t2) return true;
    n2 = E(n2);
  }
  return false;
};
var yn = typeof window < `u`;
var bn = (e2) => 0;
var xn = (e2) => {
};
var Sn = yn ? (Object.getOwnPropertyDescriptor(Window.prototype, `requestAnimationFrame`)?.value ?? window.requestAnimationFrame).bind(window) : bn;
var Cn = yn ? (Object.getOwnPropertyDescriptor(Window.prototype, `cancelAnimationFrame`)?.value ?? window.cancelAnimationFrame).bind(window) : xn;
var O = (e2) => {
  try {
    return e2.contentDocument;
  } catch {
    return null;
  }
};
var Tn = (e2, t2, n2) => {
  let r2 = e2.getBoundingClientRect(), i2 = Be(e2), a = Ve(r2.width, i2.width), o = Ve(r2.height, i2.height);
  return { x: (t2 - r2.left) / a - i2.contentOffsetX, y: (n2 - r2.top) / o - i2.contentOffsetY };
};
var On = (e2) => {
  let t2 = e2;
  for (; t2; ) {
    if (t2.hasAttribute(`data-react-grab-ignore`)) return true;
    t2 = E(t2);
  }
  return false;
};
var kn = typeof Element < `u` && typeof Element.prototype.checkVisibility == `function`;
var An = { checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true };
var jn = { checkVisibilityCSS: true, visibilityProperty: true };
var Mn = (e2, t2) => {
  if (kn && !t2) return e2.checkVisibility(An) ? true : e2.checkVisibility(jn) ? We(e2).opacity !== `0` : false;
  let n2 = t2 ?? We(e2);
  return n2.display !== `none` && n2.visibility !== `hidden` && n2.opacity !== `0`;
};
var Nn = (e2) => {
  let t2 = cn(e2);
  return t2 === `html` || t2 === `body`;
};
var Pn = [`data-react-grab`, `data-react-grab-demo`];
var Fn = (e2) => Pn.some((t2) => e2.hasAttribute(t2));
var In = (e2) => {
  if (Fn(e2)) return true;
  let t2 = e2.getRootNode();
  return Yt(t2) && Fn(t2.host);
};
var Ln = (e2) => {
  let t2 = parseInt(e2.zIndex, 10);
  return e2.pointerEvents === `none` && e2.position === `fixed` && !isNaN(t2) && t2 >= 2147483600;
};
var Rn = (e2) => {
  let t2 = e2.backgroundColor;
  return t2 === `transparent` || t2 === `rgba(0, 0, 0, 0)`;
};
var zn = (e2) => {
  let t2 = e2.position;
  if (t2 !== `fixed` && t2 !== `absolute`) return false;
  if (Rn(e2) || parseFloat(e2.opacity) < 0.1) return true;
  let n2 = parseInt(e2.zIndex, 10);
  return !isNaN(n2) && n2 > 1e3;
};
var Bn = /* @__PURE__ */ new WeakMap();
var Hn = (e2) => {
  let t2 = C(e2);
  if (t2) return t2.isConnected();
  if (Nn(e2) || In(e2) || On(e2)) return false;
  let n2 = performance.now(), r2 = Bn.get(e2);
  if (r2 && n2 - r2.timestamp < 50) return r2.isVisible;
  if (!Mn(e2)) return Bn.set(e2, { isVisible: false, timestamp: n2 }), false;
  if (e2.clientWidth / (e2.ownerDocument.defaultView?.innerWidth ?? window.innerWidth) >= 0.9 && e2.clientHeight / (e2.ownerDocument.defaultView?.innerHeight ?? window.innerHeight) >= 0.9) {
    let t3 = We(e2);
    if (Ln(t3) || zn(t3)) return false;
  }
  return Bn.set(e2, { isVisible: true, timestamp: n2 }), true;
};
var qn = new Set(`A.ABBR.B.BDI.BDO.BR.CITE.CODE.DATA.DEL.DFN.EM.I.INS.KBD.MARK.Q.S.SAMP.SMALL.SPAN.STRONG.SUB.SUP.TIME.U.VAR.WBR`.split(`.`));
var nr = (e2, t2, n2, r2) => {
  let i2 = e2.elementsFromPoint(t2, n2), a = true;
  for (let o of i2) {
    if (On(o) && (a = false), a && o.shadowRoot && o.shadowRoot !== e2 && nr(o.shadowRoot, t2, n2, r2), a && g(o)) {
      let e3 = O(o);
      if (e3) {
        let i3 = Tn(o, t2, n2);
        nr(e3, i3.x, i3.y, r2);
      }
    }
    r2.add(o);
  }
};
var rr = (e2, t2) => {
  let n2 = /* @__PURE__ */ new Set();
  return nr(document, e2, t2, n2), [...n2];
};
var dr = `html { pointer-events: none !important; }
iframe[${ye}] { pointer-events: auto !important; }`;
var A = /* @__PURE__ */ new Map();
var j = false;
var yr = () => {
  if (j) for (let e2 of A.values()) e2.pointerEventsStyle.disabled || (e2.pointerEventsStyle.disabled = true), e2.hitTestOverrideStyle.disabled && (e2.hitTestOverrideStyle.disabled = false);
};
var br = () => {
  if (j) for (let e2 of A.values()) e2.pointerEventsStyle.disabled && (e2.pointerEventsStyle.disabled = false), e2.hitTestOverrideStyle.disabled || (e2.hitTestOverrideStyle.disabled = true);
};
var M = (e2, t2) => {
  if (e2.length !== 0) throw e2.length === 1 ? e2[0] : AggregateError(e2, t2);
};
var xr = /* @__PURE__ */ new Set();
var N = /* @__PURE__ */ new Set();
var P = false;
var Sr = (e2, t2) => {
  if (N.has(e2)) try {
    e2.unfreeze();
  } catch (e3) {
    t2.push(e3);
  } finally {
    N.delete(e2);
  }
};
var Cr = (e2) => {
  xr.add(e2);
  try {
    P && e2.isConnected() && (e2.freeze(), N.add(e2));
  } catch (t2) {
    throw xr.delete(e2), t2;
  }
  return () => {
    let t2 = [];
    Sr(e2, t2), xr.delete(e2), M(t2, `Unregistering renderer freeze failed`);
  };
};
var Er = /* @__PURE__ */ new WeakMap();
var Dr = /* @__PURE__ */ new WeakMap();
var F = /* @__PURE__ */ new WeakMap();
var Or = /* @__PURE__ */ new WeakMap();
var kr = /* @__PURE__ */ new WeakMap();
var Ar = [`name`, `position`, `rotation`, `scale`, `color`, `visible`, `args`];
var I = (e2) => typeof e2 == `object` && !!e2;
var jr = (e2) => typeof e2 == `object` && !!e2 || typeof e2 == `function`;
var L = (e2, t2) => typeof e2[t2] == `function`;
var R = (e2) => I(e2) && typeof e2.x == `number` && typeof e2.y == `number` && typeof e2.z == `number` && L(e2, `set`) && L(e2, `clone`) && L(e2, `applyMatrix4`) && L(e2, `project`);
var Mr = (e2) => I(e2) && L(e2, `clone`) && L(e2, `premultiply`);
var Nr = (e2) => I(e2) && `boundingBox` in e2 && L(e2, `computeBoundingBox`);
var Pr = (e2) => I(e2) && typeof e2.type == `string` && I(e2.props) && Fr(e2.object);
var Fr = (e2) => I(e2) && e2.isObject3D === true && typeof e2.uuid == `string` && typeof e2.name == `string` && typeof e2.type == `string` && typeof e2.visible == `boolean` && Mr(e2.matrixWorld) && L(e2, `updateWorldMatrix`);
var Ir = (e2) => I(e2) && e2.isCamera === true;
var Lr = (e2) => Fr(e2) && e2.isScene === true && Array.isArray(e2.children);
var Rr = (e2) => I(e2) && typeof e2.tagName == `string` && e2.tagName.toLowerCase() === `canvas` && L(e2, `getContext`);
var zr = (e2) => I(e2) && Rr(e2.domElement);
var Br = (e2) => I(e2) && L(e2, `set`);
var Vr = (e2) => I(e2) && L(e2, `setFromCamera`) && L(e2, `intersectObjects`);
var Hr = (e2) => I(e2) && zr(e2.gl) && Lr(e2.scene) && Ir(e2.camera) && Vr(e2.raycaster) && Br(e2.pointer);
var Ur = (e2) => e2 === `always` || e2 === `demand` || e2 === `never`;
var Wr = (e2) => I(e2) && typeof e2.elapsedTime == `number`;
var Gr = (e2, t2) => {
  let n2 = e2.getState();
  if (typeof n2.setFrameloop != `function`) return;
  let r2 = Wr(n2.clock) ? n2.clock.elapsedTime : null;
  n2.setFrameloop(t2);
  let i2 = e2.getState().clock;
  r2 !== null && Wr(i2) && (i2.elapsedTime = r2);
};
var Kr = (e2) => {
  if (Or.has(e2)) return;
  let t2 = null, n2 = Cr({ freeze: () => {
    let n3 = F.get(e2);
    if (!n3) return;
    let r2 = n3.getState();
    if (Ur(r2.frameloop) && typeof r2.setFrameloop == `function`) {
      let e3 = r2.frameloop;
      Gr(n3, `never`), t2 = () => Gr(n3, e3);
    }
  }, isConnected: () => e2.isConnected, unfreeze: () => {
    t2?.(), t2 = null;
  } });
  Or.set(e2, n2);
};
var qr = (e2) => {
  let t2 = Or.get(e2);
  t2 && (Or.delete(e2), t2());
};
var Jr = (e2) => Pr(e2.__r3f) ? e2.__r3f : null;
var Yr = (e2) => {
  let t2 = e2.current.stateNode;
  if (!I(t2) || !jr(t2.containerInfo)) return null;
  let n2 = t2.containerInfo, r2 = Reflect.get(n2, `getState`);
  if (typeof r2 != `function`) return null;
  let i2 = Reflect.apply(r2, n2, []);
  return Hr(i2) ? () => {
    let e3 = Reflect.apply(r2, n2, []);
    return Hr(e3) ? e3 : i2;
  } : null;
};
var Xr = (e2) => {
  let t2 = kr.get(e2);
  t2 && (kr.delete(e2), F.get(t2.canvas) === t2.root && (F.delete(t2.canvas), qr(t2.canvas)));
};
var Zr = (e2) => {
  let t2 = Yr(e2);
  if (!t2) {
    Xr(e2);
    return;
  }
  let n2 = t2().gl.domElement;
  if (!n2.isConnected || !e2.current.child) {
    Xr(e2);
    return;
  }
  let r2 = kr.get(e2);
  r2 && r2.canvas !== n2 && (Xr(e2), r2 = void 0), r2 ? (r2.root.getState = t2, r2.root.selectableObjects = null) : (r2 = { canvas: n2, root: { getState: t2, selectableObjects: null } }, kr.set(e2, r2)), F.set(n2, r2.root), Kr(n2);
};
Lt({ name: `react-grab-three-selection`, onCommitFiberRoot: (e2, t2) => Zr(t2) });
var Qr = (e2) => {
  let t2 = e2;
  for (; t2; ) {
    if (Jr(t2)) return t2;
    t2 = t2.parent;
  }
  return null;
};
var $r = (e2) => {
  let t2 = e2;
  for (; t2; ) {
    let e3 = Jr(t2);
    if (e3 && typeof e3.eventCount == `number` && e3.eventCount > 0) return true;
    t2 = t2.parent;
  }
  return false;
};
var ei = (e2, t2) => {
  let n2 = e2;
  for (; n2; ) {
    if (n2 === t2) return true;
    n2 = n2.parent;
  }
  return false;
};
var ai = (e2, t2, n2) => {
  let r2 = typeof n2.instanceId == `number` && Number.isInteger(n2.instanceId) ? n2.instanceId : null, i2 = Er.get(t2);
  i2 || (i2 = /* @__PURE__ */ new Map(), Er.set(t2, i2));
  let a = i2.get(r2);
  if (a) return a.canvas = e2.gl.domElement, a.intersectionPoint = R(n2.point) ? n2.point : null, a.object = t2, a.rootState = e2, a.element;
  let o = Jr(t2), s = o ? Bt(o) : null;
  if (o && !s) return null;
  let c = (o?.type || t2.type || `object-3d`).toLowerCase(), l = e2.gl.domElement.ownerDocument.createElement(c), u2 = { canvas: e2.gl.domElement, element: l, fiber: s, instance: o, instanceId: r2, intersectionPoint: R(n2.point) ? n2.point : null, object: t2, rootState: e2, tagName: c }, d2 = l.getBoundingClientRect.bind(l);
  return l.getBoundingClientRect = () => {
    let e3 = gi(u2), t3 = l.ownerDocument.defaultView?.DOMRect;
    return t3 ? new t3(e3.x, e3.y, e3.width, e3.height) : d2();
  }, Ht(l, { hostElement: u2.canvas, supportsDomEditing: false, getBounds: () => gi(u2), getFiber: () => u2.fiber ? xt(u2.fiber) : null, getPreview: () => li(u2), getSelector: () => ui(u2), getTagName: () => u2.tagName, isConnected: () => u2.canvas.isConnected && ei(u2.object, u2.rootState.scene) }), i2.set(r2, u2), Dr.set(l, u2), l;
};
var oi = (e2, t2, n2) => {
  if (!Rr(e2)) return e2;
  let r2 = F.get(e2);
  if (!r2) return e2;
  try {
    let i2 = r2.getState(), a = Jt(e2);
    if (a.width <= 0 || a.height <= 0) return e2;
    let o = (t2 - a.x) / a.width * 2 - 1, s = -((n2 - a.y) / a.height) * 2 + 1;
    if (o < -1 || o > 1 || s < -1 || s > 1) return e2;
    i2.pointer.set(o, s), i2.raycaster.setFromCamera(i2.pointer, i2.camera);
    let c = i2.raycaster.intersectObjects(i2.scene.children, true);
    for (let e3 of c) {
      if (!$r(e3.object)) continue;
      let t3 = Qr(e3.object);
      if (!t3 || t3.visible === false) continue;
      let n3 = ai(i2, t3, e3);
      if (n3) return n3;
    }
    for (let e3 of c) {
      let t3 = Qr(e3.object);
      if (!t3 || t3.visible === false) continue;
      let n3 = ai(i2, t3, e3);
      if (n3) return n3;
    }
  } catch {
  }
  return e2;
};
var ci = (e2) => typeof e2 == `string` ? JSON.stringify(e2) : typeof e2 == `number` || typeof e2 == `boolean` ? `{${String(e2)}}` : Array.isArray(e2) && e2.length <= 4 && e2.every((e3) => typeof e3 == `number` || typeof e3 == `string`) ? `{${JSON.stringify(e2)}}` : null;
var li = (e2) => {
  let t2 = e2.instance?.props ?? {}, n2 = [];
  for (let r2 of Ar) {
    let i2 = t2[r2];
    r2 === `name` && i2 === void 0 && e2.object.name && (i2 = e2.object.name);
    let a = ci(i2);
    a && n2.push(`${r2}=${a}`);
  }
  return e2.instanceId !== null && n2.push(`instanceId={${e2.instanceId}}`), `<${e2.tagName}${n2.length > 0 ? ` ${n2.join(` `)}` : ``} />`;
};
var ui = (e2) => {
  if (e2.object.name) return `${e2.tagName}[name=${JSON.stringify(e2.object.name)}]`;
  let t2 = e2.instanceId === null ? `` : `:${e2.instanceId}`;
  return `${e2.tagName}[uuid=${JSON.stringify(`${e2.object.uuid}${t2}`)}]`;
};
var di = (e2) => {
  e2.object.updateWorldMatrix(true, false);
  let t2 = e2.object.matrixWorld.clone();
  if (e2.instanceId === null || !e2.object.getMatrixAt) return t2;
  let n2 = e2.object.matrixWorld.clone();
  return e2.object.getMatrixAt(e2.instanceId, n2), n2.premultiply(t2);
};
var fi = (e2) => {
  if (!Nr(e2.geometry)) return null;
  if (!e2.geometry.boundingBox) try {
    e2.geometry.computeBoundingBox();
  } catch {
    return null;
  }
  let t2 = e2.geometry.boundingBox;
  return !t2 || !R(t2.min) || !R(t2.max) ? null : t2;
};
var pi = (e2) => {
  if (e2.isInstancedMesh !== true || typeof e2.computeBoundingBox != `function`) return null;
  if (!e2.boundingBox) try {
    e2.computeBoundingBox();
  } catch {
    return null;
  }
  let t2 = e2.boundingBox;
  return !t2 || !R(t2.min) || !R(t2.max) ? null : t2;
};
var mi = (e2) => e2.instanceId === null ? pi(e2.object) ?? fi(e2.object) : fi(e2.object);
var hi = (e2, t2) => {
  let n2 = t2.x + t2.width / 2, r2 = t2.y + t2.height / 2;
  try {
    let i2 = e2.intersectionPoint ? e2.intersectionPoint.clone() : R(e2.object.position) ? e2.object.position.clone().set(0, 0, 0).applyMatrix4(di(e2)) : null;
    i2 && (i2.project(e2.rootState.camera), Number.isFinite(i2.x) && Number.isFinite(i2.y) && (n2 = t2.x + (i2.x + 1) / 2 * t2.width, r2 = t2.y + (1 - i2.y) / 2 * t2.height));
  } catch {
  }
  return { x: n2 - 16 / 2, y: r2 - 16 / 2, width: 16, height: 16, borderRadius: `0px` };
};
var gi = (e2) => {
  let t2 = Jt(e2.canvas);
  try {
    let n2 = mi(e2);
    if (!n2) return hi(e2, t2);
    let r2 = di(e2), i2 = [n2.min.x, n2.max.x], a = [n2.min.y, n2.max.y], o = [n2.min.z, n2.max.z], s = 1 / 0, c = 1 / 0, l = -1 / 0, u2 = -1 / 0, d2 = n2.min.clone();
    for (let n3 of i2) for (let i3 of a) for (let a2 of o) {
      if (d2.set(n3, i3, a2).applyMatrix4(r2).project(e2.rootState.camera), !Number.isFinite(d2.x) || !Number.isFinite(d2.y)) continue;
      let o2 = t2.x + (d2.x + 1) / 2 * t2.width, f3 = t2.y + (1 - d2.y) / 2 * t2.height;
      s = Math.min(s, o2), c = Math.min(c, f3), l = Math.max(l, o2), u2 = Math.max(u2, f3);
    }
    if (!Number.isFinite(s) || !Number.isFinite(c) || !Number.isFinite(l) || !Number.isFinite(u2)) return hi(e2, t2);
    let f2 = Math.max(t2.x, s), p2 = Math.max(t2.y, c), ee2 = Math.min(t2.x + t2.width, l), m = Math.min(t2.y + t2.height, u2);
    return ee2 <= f2 || m <= p2 ? hi(e2, t2) : { x: f2, y: p2, width: ee2 - f2, height: m - p2, borderRadius: `0px` };
  } catch {
    return hi(e2, t2);
  }
};
var U = false;
var W = null;
var G = false;
var K = /* @__PURE__ */ new Map();
var Ti = -1;
var Ei = /* @__PURE__ */ new WeakSet();
var Di = /* @__PURE__ */ new WeakSet();
var Oi = /* @__PURE__ */ new WeakMap();
var ki = /* @__PURE__ */ new Map();
var q = /* @__PURE__ */ new Map();
var Ai = (e2) => {
  if (W === e2 && (G = true), Ei.has(e2)) return true;
  if (!U && W === e2) {
    let t2 = (Oi.get(e2) ?? 0) + 1;
    return Oi.set(e2, t2), t2 < 4 ? false : (Ei.add(e2), true);
  }
  return !U || !(`gsapVersions` in window) || !(Error().stack ?? ``).includes(`_tick`) ? false : (Ei.add(e2), Di.add(e2), true);
};
typeof window < `u` && (window.requestAnimationFrame = (e2) => {
  let t2 = Ai(e2);
  if (U && t2) {
    let t3 = Ti--;
    return K.set(t3, e2), t3;
  }
  let n2 = Sn((t3) => {
    if (U && Ai(e2)) {
      let t4 = Ti--;
      K.set(t4, e2), ki.set(n2, t4);
      return;
    }
    let r2 = W, i2 = G;
    W = e2, G = false;
    try {
      e2(t3);
    } finally {
      let t4 = G;
      W = r2, G = i2, !t4 && !Di.has(e2) && (Ei.delete(e2), Oi.delete(e2));
    }
  });
  return n2;
}, window.cancelAnimationFrame = (e2) => {
  if (K.has(e2)) {
    K.delete(e2);
    return;
  }
  let t2 = q.get(e2);
  if (t2 !== void 0) {
    Cn(t2.nativeId), q.delete(e2);
    return;
  }
  let n2 = ki.get(e2);
  if (n2 !== void 0) {
    K.delete(n2), ki.delete(e2);
    return;
  }
  Cn(e2);
});
var Ni = `
[${ve}],
[${ve}] * {
  animation-play-state: paused !important;
  transition: none !important;
}
`;
var Wa = /* @__PURE__ */ new WeakMap();
Lt({ name: `react-grab-freeze-updates`, onCommitFiberRoot: (e2, t2) => {
  let n2 = y().renderers.get(e2);
  n2 && Wa.set(t2, n2);
} });

// node_modules/react-grab/dist/open-file-BYqKjxo7.js
var Ae = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`;
var je = new Uint8Array(64);
var Me = new Uint8Array(128);
for (let e2 = 0; e2 < Ae.length; e2++) {
  let t2 = Ae.charCodeAt(e2);
  je[e2] = t2, Me[t2] = e2;
}
var Et = Symbol.for(`react.context`);
var Dt = [];
var Ot2 = null;
var kt = Error("Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render.");
var M2 = () => {
  let e2 = Ot2;
  return e2 !== null && (Ot2 = e2.next), e2;
};
var N2 = (e2) => e2._currentValue;
var P2 = (e2, t2, n2, r2 = null) => {
  Dt.push({ displayName: r2, primitive: e2, stackError: Error(), value: t2, dispatcherHookName: n2 });
};
var At = (e2) => {
  if (typeof e2 == `object` && e2) {
    let t2 = e2;
    if (typeof t2.then == `function`) {
      let e3 = t2;
      switch (e3.status) {
        case `fulfilled`:
          return P2(`Promise`, e3.value, `Use`), e3.value;
        case `rejected`:
          throw e3.reason;
      }
      throw P2(`Unresolved`, e3, `Use`), kt;
    }
    if (t2.$$typeof === Et && `_currentValue` in t2) {
      let e3 = t2, n2 = N2(e3);
      return P2(`Context (use)`, n2, `Use`, e3.displayName || `Context`), n2;
    }
  }
  throw Error(`An unsupported type was passed to use(): ` + String(e2));
};
var jt2 = (e2) => {
  let t2 = N2(e2);
  return P2(`Context`, t2, `Context`, e2.displayName || null), t2;
};
var Mt2 = (e2) => {
  let t2 = M2(), n2 = t2 === null ? typeof e2 == `function` ? e2() : e2 : t2.memoizedState;
  return P2(`State`, n2, `State`), [n2, () => {
  }];
};
var Nt2 = (e2, t2, n2) => {
  let r2 = M2(), i2 = r2 === null ? n2 === void 0 ? t2 : n2(t2) : r2.memoizedState;
  return P2(`Reducer`, i2, `Reducer`), [i2, () => {
  }];
};
var Pt2 = (e2) => {
  let t2 = M2(), n2 = t2 === null ? { current: e2 } : t2.memoizedState;
  return P2(`Ref`, n2.current, `Ref`), n2;
};
var Ft2 = () => {
  let e2 = M2();
  return P2(`CacheRefresh`, e2 === null ? () => {
  } : e2.memoizedState, `CacheRefresh`), () => {
  };
};
var It2 = (e2) => {
  M2(), P2(`LayoutEffect`, e2, `LayoutEffect`);
};
var Lt2 = (e2) => {
  M2(), P2(`InsertionEffect`, e2, `InsertionEffect`);
};
var Rt2 = (e2) => {
  M2(), P2(`Effect`, e2, `Effect`);
};
var zt2 = (e2) => {
  M2();
  let t2;
  typeof e2 == `object` && e2 && `current` in e2 && (t2 = e2.current), P2(`ImperativeHandle`, t2, `ImperativeHandle`);
};
var Bt2 = (e2, t2) => {
  P2(`DebugValue`, typeof t2 == `function` ? t2(e2) : e2, `DebugValue`);
};
var Vt2 = (e2) => {
  let t2 = M2();
  return P2(`Callback`, t2 === null ? e2 : t2.memoizedState[0], `Callback`), e2;
};
var Ht2 = (e2) => {
  let t2 = M2(), n2 = t2 === null ? e2() : t2.memoizedState[0];
  return P2(`Memo`, n2, `Memo`), n2;
};
var Ut2 = (e2, t2) => {
  let n2 = M2();
  M2();
  let r2 = n2 === null ? t2() : n2.memoizedState;
  return P2(`SyncExternalStore`, r2, `SyncExternalStore`), r2;
};
var Wt2 = () => {
  let e2 = M2();
  M2();
  let t2 = e2 === null ? false : e2.memoizedState;
  return P2(`Transition`, t2, `Transition`), [t2, () => {
  }];
};
var Gt2 = (e2) => {
  let t2 = M2(), n2 = t2 === null ? e2 : t2.memoizedState;
  return P2(`DeferredValue`, n2, `DeferredValue`), n2;
};
var Kt = () => {
  let e2 = M2(), t2 = e2 === null ? `` : e2.memoizedState;
  return P2(`Id`, t2, `Id`), t2;
};
var qt2 = (e2) => [];
var Jt2 = (e2) => {
  let t2 = M2(), n2 = t2 === null ? e2 : t2.memoizedState;
  return P2(`Optimistic`, n2, `Optimistic`), [n2, () => {
  }];
};
var Yt2 = (e2, t2) => {
  let n2, r2 = null;
  if (e2 !== null) {
    let t3 = e2.memoizedState;
    if (typeof t3 == `object` && t3 && `then` in t3 && typeof t3.then == `function`) {
      let e3 = t3;
      switch (e3.status) {
        case `fulfilled`:
          n2 = e3.value;
          break;
        case `rejected`:
          r2 = e3.reason;
          break;
        default:
          r2 = kt, n2 = e3;
      }
    } else n2 = t3;
  } else n2 = t2;
  return { value: n2, error: r2 };
};
var Xt = (e2) => (t2, n2) => {
  let r2 = M2();
  M2(), M2();
  let i2 = Error(), { value: a, error: o } = Yt2(r2, n2);
  if (Dt.push({ displayName: null, primitive: e2, stackError: i2, value: a, dispatcherHookName: e2 }), o !== null) throw o;
  return [a, () => {
  }, false];
};
var Zt2 = Xt(`ActionState`);
var Qt = { readContext: N2, use: At, useCallback: Vt2, useContext: jt2, useEffect: Rt2, useImperativeHandle: zt2, useLayoutEffect: It2, useInsertionEffect: Lt2, useMemo: Ht2, useReducer: Nt2, useRef: Pt2, useState: Mt2, useDebugValue: Bt2, useDeferredValue: Gt2, useTransition: Wt2, useSyncExternalStore: Ut2, useId: Kt, useHostTransitionStatus: () => {
  let e2 = N2({ _currentValue: null });
  return P2(`HostTransitionStatus`, e2, `HostTransitionStatus`), e2;
}, useFormState: Xt(`FormState`), useActionState: Zt2, useOptimistic: Jt2, useMemoCache: qt2, useCacheRefresh: Ft2, useEffectEvent: (e2) => (M2(), P2(`EffectEvent`, e2, `EffectEvent`), e2) };
typeof Proxy > `u` || new Proxy(Qt, { get(e2, t2) {
  if (Object.prototype.hasOwnProperty.call(e2, t2)) return e2[t2];
  let n2 = Error(`Missing method in Dispatcher: ` + t2);
  throw n2.name = `ReactDebugToolsUnsupportedHookError`, n2;
} });
var Un = /* @__PURE__ */ new Set([`data-testid`, `data-test-id`, `data-test`, `data-cy`, `data-qa`, `aria-label`, `href`, `src`, `role`, `name`, `title`, `alt`]);
var Wn = /* @__PURE__ */ new Set([`button`, `link`, `checkbox`, `radio`, `switch`, `tab`, `menuitem`, `option`, `textbox`, `combobox`, `slider`, `spinbutton`]);
var $n = [...Array.from(Un).filter((e2) => e2 !== `role`).map((e2) => `[${e2}]`), ...Array.from(Wn).map((e2) => `[role~="${e2}"]`)].join(`,`);
var er = [`button`, `input`, `select`, `textarea`].join(`,`);
var Vr2 = new Set(`AppRouter.AppRouterAnnouncer.AppDevOverlay.AppDevOverlayErrorBoundary.ClientPageRoot.ClientSegmentRoot.DevRootHTTPAccessFallbackBoundary.ErrorBoundary.ErrorBoundaryHandler.GracefulDegradeBoundary.HTTPAccessErrorFallback.HTTPAccessFallbackBoundary.HTTPAccessFallbackErrorBoundary.HandleRedirect.Head.HistoryUpdater.HotReload.InnerLayoutRouter.InnerScrollAndFocusHandler.InnerScrollAndFocusHandlerOld.InnerScrollAndMaybeFocusHandler.InnerScrollHandlerNew.LinkComponent.LoadableComponent.LoadingBoundary.LoadingBoundaryProvider.NotAllowedRootHTTPFallbackError.OfflineProvider.OuterLayoutRouter.RedirectBoundary.RedirectErrorBoundary.RenderFromTemplateContext.RenderValidationBoundaryAtThisLevel.ReplaySsrOnlyErrors.RootErrorBoundary.RootLevelDevOverlayElement.Router.ScrollAndFocusHandler.ScrollAndMaybeFocusHandler.SegmentBoundaryTrigger.SegmentBoundaryTriggerNode.SegmentStateProvider.SegmentTrieNode.SegmentViewNode.SegmentViewStateNode.ServerRoot.body.html`.split(`.`));

// node_modules/react-grab/dist/primitives.js
var C2 = new Map([`top`, `right`, `bottom`, `left`].flatMap((e2) => [[`border-${e2}-style`, e2], [`border-${e2}-color`, e2]]));
var j2 = (e2, t2) => {
  if (!Number.isFinite(e2) || !Number.isFinite(t2)) return [];
  yr();
  try {
    return rr(e2, t2);
  } finally {
    br();
  }
};
var M3 = (t2, r2) => r2?.container && !mn(t2, r2.container) ? false : (r2?.filter ?? Hn)(t2);
var N3 = (t2) => Hn(t2);
var L2 = (e2, t2, n2) => {
  let r2 = j2(e2, t2);
  for (let i2 of r2) {
    let r3 = oi(i2, e2, t2);
    if (M3(r3, n2)) return r3;
    if (r3 !== i2 && M3(i2, n2)) return i2;
  }
  return null;
};

// src/page-interaction/reference.ts
var PAGE_INTERACTION = "dsh-page-interaction-v1";
var REFERENCE_TEXT_LIMIT = 6e3;

// src/page-interaction/quote.ts
function quotePage(value, signal) {
  return window.dshPageInteraction?.quote(value, signal) ?? Promise.reject(Error("\u8BF7\u5148\u5173\u8054\u5F53\u524D\u9875\u9762\u7684\u771F\u5B9E\u5BF9\u8BDD\uFF0C\u518D\u8F6C\u5165\u8349\u7A3F\u3002"));
}

// src/page-interaction/picker.ts
var clean = (value) => (value ?? "").replace(/\s+/g, " ").trim();
var BLOCKS = "[data-page-block],article,section,fieldset,figure,[role=region],.arco-card";
function selectionTarget(element, kind = "row") {
  if (!element || element.closest("[data-react-grab-ignore]")) return null;
  if (kind === "table")
    return element.closest("table,[role=table],[role=grid]");
  if (kind === "row") {
    const row = element.closest("tbody tr,[role=row]");
    if (row) return row;
    if (element.closest("thead") || element.matches("table,tbody"))
      return element.closest("table");
  }
  const block = element.closest(BLOCKS);
  if (block) return block;
  for (let node = element; node && !node.matches("body,html,main"); node = node.parentElement) {
    const box = node.getBoundingClientRect();
    const display = getComputedStyle(node).display;
    if (box.width >= 120 && box.height >= 48 && /^(block|flex|grid|inline-block)$/.test(display) && clean(node.textContent))
      return node;
  }
  return null;
}
var isRendered = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
function visibleText(element) {
  if (!isRendered(element) || element.closest("[data-gea-ignore]")) return "";
  if (element.matches("select"))
    return Array.from(element.selectedOptions).map((option) => clean(option.textContent)).join(" ");
  if (element.matches("input,textarea")) {
    const input = element;
    return ["checkbox", "radio", "hidden", "password"].includes(input.type) ? "" : input.value;
  }
  return clean(
    Array.from(element.childNodes).map(
      (node) => node.nodeType === 3 ? node.textContent : node.nodeType === 1 ? visibleText(node) : ""
    ).join(" ")
  );
}
var cellText = visibleText;
function rowText(row) {
  const headers = row.closest("table")?.querySelectorAll("thead th");
  return Array.from(row.children).map((cell, index) => {
    const value = cellText(cell);
    return value ? `${(headers?.[index] ? visibleText(headers[index]) : "") || `\u7B2C ${index + 1} \u5217`}\uFF1A${value}` : "";
  }).filter(Boolean).join("\n");
}
function describeElement(element, page) {
  const pageState = element.closest("[data-page-reference-ready]");
  if (pageState && pageState.getAttribute("data-page-reference-ready") !== "true")
    throw Error("\u9875\u9762\u6570\u636E\u6B63\u5728\u66F4\u65B0\uFF0C\u8BF7\u5B8C\u6210\u67E5\u8BE2\u540E\u91CD\u65B0\u9009\u62E9\u3002");
  const kind = element.matches("tr,[role=row]") ? "row" : element.matches("table,[role=table],[role=grid]") ? "table" : "block";
  const rowCell = element.querySelector("td:not(:has(input[type=checkbox]))");
  const rowLabel = clean(
    element.getAttribute("data-page-label") || (rowCell ? visibleText(rowCell) : "")
  );
  const targets = /* @__PURE__ */ new Set();
  const ownTarget = element.getAttribute("data-page-target");
  const targetElements = ownTarget ? [element] : [
    element,
    ...Array.from(
      element.querySelectorAll("[data-page-target],[data-gea-el]")
    )
  ];
  for (const target of targetElements) {
    if (!isRendered(target)) continue;
    for (const id of (target.getAttribute("data-page-target") || target.getAttribute("data-gea-el") || "").split("\n").filter(Boolean))
      targets.add(id);
  }
  const rows = kind === "table" ? Array.from(element.querySelectorAll("tbody tr")).filter(
    (row) => row.closest("table") === element && isRendered(row)
  ) : [];
  const body = kind === "row" ? rowText(element) : kind === "table" ? rows.map((row, index) => `\u7B2C ${index + 1} \u884C
${rowText(row)}`).join("\n\n") || visibleText(element) : cellText(element);
  const headingElement = element.querySelector("caption,h1,h2,h3,h4,[role=heading]");
  const heading = clean(
    element.getAttribute("aria-label") || (headingElement ? visibleText(headingElement) : "")
  );
  const label = kind === "row" ? `${rowLabel || "\u5F53\u524D"} \xB7 \u6574\u884C` : kind === "table" ? `${heading || "\u8868\u683C"} \xB7 ${rows.length} \u884C` : heading || visibleText(element).slice(0, 32) || "\u5185\u5BB9\u5757";
  return {
    page,
    kind,
    label,
    text: body.slice(0, REFERENCE_TEXT_LIMIT),
    row: kind === "row" ? rowLabel : "",
    targets: [...targets],
    capturedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...pageState?.getAttribute("data-page-reference-scope") ? { scope: pageState.getAttribute("data-page-reference-scope") } : {},
    truncated: body.length > REFERENCE_TEXT_LIMIT
  };
}
function mountPicker(options = {}) {
  const ui2 = document.createElement("div");
  ui2.className = "dspi";
  ui2.setAttribute("data-react-grab-ignore", "");
  ui2.setAttribute("data-gea-ignore", "");
  const style = document.createElement("style");
  style.textContent = `
.dspi{position:fixed;right:16px;bottom:64px;z-index:2147483646}.dspi[hidden],.dspi button[hidden]{display:none}
.dspi-pointer{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid #dfe4eb;border-radius:7px;background:white;color:#606977;cursor:pointer}.dspi-pointer:hover,.dspi-pointer[aria-pressed=true]{color:#df1d28;background:#fff1f1}.dspi-pointer:focus-visible{outline:2px solid #d0132c;outline-offset:2px}
.dspi-status{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
.dspi-outline{position:fixed;pointer-events:none;border:2px solid #d92d34;background:rgba(217,45,52,.06);z-index:2147483645;box-sizing:border-box}`;
  const outline = document.createElement("div");
  outline.className = "dspi-outline";
  outline.hidden = true;
  outline.setAttribute("data-react-grab-ignore", "");
  outline.setAttribute("data-gea-ignore", "");
  const status = document.createElement("div");
  status.className = "dspi-status";
  status.setAttribute("role", "status");
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "dspi-pointer";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "20");
  icon.setAttribute("height", "20");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(icon.namespaceURI, "path");
  path.setAttribute("d", "M3.5 3.5 21 11.5l-7.5 2-2 7.5L3.5 3.5Z");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");
  icon.append(path);
  toggle.append(icon);
  ui2.append(toggle, status);
  ui2.hidden = true;
  document.head.append(style);
  document.body.append(outline, ui2);
  let pinned = false, altHeld = false, altSuppressed = false;
  let active = false, hover = null, channel = "", page = document.title;
  let pending;
  let quoteEnabled = false;
  let timer;
  let lastSelection;
  const repeatClick = (event) => Boolean(
    lastSelection && performance.now() - lastSelection.at < 800 && event.target === lastSelection.target && event.detail > 1
  );
  const send = (message2) => window.parent.postMessage(
    { protocol: PAGE_INTERACTION, channel, ...message2 },
    "*"
  );
  const paint = (target) => {
    outline.hidden = !target?.isConnected;
    if (!target?.isConnected) return;
    const box = target.getBoundingClientRect();
    Object.assign(outline.style, {
      left: `${box.left}px`,
      top: `${box.top}px`,
      width: `${box.width}px`,
      height: `${box.height}px`
    });
  };
  const clearPending = () => {
    clearTimeout(timer);
    pending?.cleanup?.();
    pending = void 0;
  };
  const cancelPending = (error = Error("\u9875\u9762\u6216\u5BF9\u8BDD\u5DF2\u5207\u6362\uFF0C\u8BF7\u91CD\u65B0\u8F6C\u5165\u8349\u7A3F\u3002")) => {
    const task = pending;
    if (task) send({ type: "cancel-reference", requestId: task.id });
    clearPending();
    task?.reject?.(error);
  };
  const mode = (next, cancel = true) => {
    active = next;
    toggle.setAttribute("aria-pressed", String(active));
    toggle.setAttribute("aria-label", active ? "\u9000\u51FA\u9009\u62E9" : "\u9009\u62E9\u5185\u5BB9");
    toggle.title = active ? "\u9000\u51FA\u9009\u62E9\uFF08Esc\uFF09" : "\u9009\u62E9\u5185\u5BB9";
    if (!active) {
      if (cancel) cancelPending();
      hover = null;
      paint(null);
    }
    if (channel) send({ type: "selection-state", active });
  };
  const syncMode = () => mode(pinned || altHeld && !altSuppressed, false);
  const holdAlt = (held) => {
    if (!channel || held === altHeld && (held || !altSuppressed)) return;
    altHeld = held;
    if (!held) altSuppressed = false;
    syncMode();
  };
  const stopSelection = (holdingAlt = altHeld) => {
    pinned = false;
    altHeld = holdingAlt;
    altSuppressed = holdingAlt;
    mode(false);
  };
  const toggleSelection = () => {
    if (active) stopSelection();
    else {
      pinned = true;
      mode(true, false);
    }
  };
  const pointerAlt = (event) => {
    if (typeof event.altKey === "boolean")
      holdAlt(event.altKey && !event.ctrlKey && !event.metaKey);
  };
  toggle.addEventListener("click", toggleSelection);
  const own = (event) => event.composedPath().includes(ui2);
  const hit = (event) => selectionTarget(
    L2(event.clientX, event.clientY, {
      container: document.body,
      filter: (candidate) => N3(candidate) && !ui2.contains(candidate)
    })
  );
  const move = (event) => {
    if (!event.isTrusted) return;
    pointerAlt(event);
    if (!active || pending || own(event)) return;
    hover = hit(event);
    paint(hover);
  };
  const suppress = (event) => {
    if (!event.isTrusted && !repeatClick(event)) return;
    pointerAlt(event);
    if (active && !own(event) || repeatClick(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  const click = (event) => {
    pointerAlt(event);
    if (repeatClick(event)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (!event.isTrusted || !active || own(event)) return;
    suppress(event);
    if (event.button !== 0 || pending) return;
    const target = hit(event);
    if (!target) return;
    let original;
    try {
      original = describeElement(target, page);
    } catch (error) {
      send({ type: "selection-error", error: error instanceof Error ? error.message : "\u9875\u9762\u5F15\u7528\u6682\u4E0D\u53EF\u7528" });
      return;
    }
    const reference = options.describe?.(target, original) ?? original;
    if (!reference.text) return;
    lastSelection = { target: event.target, at: performance.now() };
    hover = target;
    paint(target);
    pending = { id: crypto.randomUUID() };
    status.textContent = "\u6B63\u5728\u52A0\u5165\u5BF9\u8BDD\u2026";
    send({ type: "reference", requestId: pending.id, reference });
    timer = setTimeout(() => {
      cancelPending(Error("\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002"));
      status.textContent = "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002";
      send({ type: "selection-error", error: status.textContent });
    }, 5e3);
  };
  const key = (event) => {
    if (event.isComposing) return;
    if (event.key === "Alt" && !event.ctrlKey && !event.metaKey && channel) {
      event.preventDefault();
      holdAlt(true);
    }
    if ((active || pending) && event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      stopSelection(event.altKey);
    }
  };
  const keyup = (event) => {
    if (event.key === "Alt") {
      if (altHeld) event.preventDefault();
      holdAlt(false);
    }
  };
  const releaseAlt = () => {
    altHeld = false;
    syncMode();
  };
  const visibility = () => {
    if (document.hidden) releaseAlt();
  };
  const scroll = () => paint(hover);
  const message = (event) => {
    if (event.source !== window.parent || event.data?.protocol !== PAGE_INTERACTION)
      return;
    const data = event.data;
    if (data.type === "configure" && typeof data.channel === "string") {
      cancelPending();
      clearPending();
      channel = data.channel;
      quoteEnabled = data.quote === true;
      page = typeof data.page === "string" ? data.page : document.title;
      toggle.hidden = data.externalTrigger === true;
      pinned = false;
      altHeld = false;
      altSuppressed = false;
      mode(false);
      ui2.hidden = false;
      return;
    }
    if (data.channel !== channel) return;
    if (data.type === "toggle-selection") toggleSelection();
    if (data.type === "hold-selection") holdAlt(data.held === true);
    if (data.type === "suspend-selection") releaseAlt();
    if (data.type === "stop-selection")
      stopSelection(typeof data.altHeld === "boolean" ? data.altHeld : altHeld);
    if (data.type === "disconnect") {
      pinned = false;
      altHeld = false;
      altSuppressed = false;
      mode(false);
      cancelPending();
      channel = "";
      quoteEnabled = false;
      ui2.hidden = true;
    }
    if (data.type === "result" && data.requestId === pending?.id) {
      const task = pending;
      clearPending();
      if (data.ok) {
        hover = null;
        paint(null);
        syncMode();
        status.textContent = "\u5DF2\u52A0\u5165\u8F93\u5165\u6846\uFF0C\u5199\u4E0B\u95EE\u9898\u5373\u53EF\u3002";
        task?.resolve?.();
      } else {
        status.textContent = data.error || "\u5F15\u7528\u672A\u52A0\u5165\uFF0C\u8BF7\u91CD\u8BD5\u3002";
        task?.reject?.(Error(status.textContent));
        send({ type: "selection-error", error: status.textContent });
      }
    }
  };
  const api = { available: () => !!channel && quoteEnabled, quote: (value, signal) => new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Error("\u8F6C\u5165\u5DF2\u53D6\u6D88\u3002"));
      return;
    }
    if (!channel || !quoteEnabled) {
      reject(Error("\u8BF7\u5148\u5173\u8054\u5F53\u524D\u9875\u9762\u7684\u771F\u5B9E\u5BF9\u8BDD\uFF0C\u518D\u8F6C\u5165\u8349\u7A3F\u3002"));
      return;
    }
    if (pending) {
      reject(Error("\u8BF7\u7B49\u5F85\u5F53\u524D\u5F15\u7528\u5B8C\u6210\uFF0C\u518D\u8F6C\u5165\u8349\u7A3F\u3002"));
      return;
    }
    if (!value.text.trim()) {
      reject(Error("\u6CA1\u6709\u53EF\u8F6C\u5165\u7684\u6587\u5B57\u3002"));
      return;
    }
    if (value.text.trim().length > REFERENCE_TEXT_LIMIT) {
      reject(Error(`\u6587\u5B57\u8D85\u8FC7\u5355\u6B21\u5F15\u7528\u957F\u5EA6\u4E0A\u9650\uFF08${REFERENCE_TEXT_LIMIT}\u5B57\u7B26\uFF09\uFF0C\u8BF7\u5728\u771F\u5B9E\u8F93\u5165\u6846\u5206\u6BB5\u7C98\u8D34\uFF1B\u4FDD\u7559\u6587\u5B57\u672A\u5220\u9664\u3002`));
      return;
    }
    stopSelection();
    const id = crypto.randomUUID();
    const abort = () => cancelPending(Error("\u8F6C\u5165\u5DF2\u53D6\u6D88\u3002"));
    pending = { id, resolve, reject, cleanup: () => signal?.removeEventListener("abort", abort) };
    signal?.addEventListener("abort", abort, { once: true });
    send({ type: "quote", requestId: id, reference: { page, kind: "block", label: value.label, text: value.text, targets: [], capturedAt: (/* @__PURE__ */ new Date()).toISOString() } });
    timer = setTimeout(() => cancelPending(Error("\u8F6C\u5165\u672A\u5B8C\u6210\uFF0C\u8BF7\u91CD\u8BD5\u3002")), 5e3);
  }) };
  window.dshPageInteraction = api;
  window.addEventListener("message", message);
  window.addEventListener("pointermove", move, true);
  const suppressed = [
    "pointerdown",
    "pointerup",
    "mousedown",
    "mouseup",
    "dblclick",
    "contextmenu"
  ];
  for (const type of suppressed) window.addEventListener(type, suppress, true);
  window.addEventListener("click", click, true);
  window.addEventListener("keydown", key, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", releaseAlt);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("scroll", scroll, true);
  window.addEventListener("resize", scroll);
  send({ type: "ready" });
  return () => {
    cancelPending();
    clearPending();
    window.removeEventListener("message", message);
    window.removeEventListener("pointermove", move, true);
    for (const type of suppressed)
      window.removeEventListener(type, suppress, true);
    window.removeEventListener("click", click, true);
    window.removeEventListener("keydown", key, true);
    window.removeEventListener("keyup", keyup, true);
    window.removeEventListener("blur", releaseAlt);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("scroll", scroll, true);
    window.removeEventListener("resize", scroll);
    ui2.remove();
    outline.remove();
    style.remove();
    if (window.dshPageInteraction === api) delete window.dshPageInteraction;
  };
}
export {
  describeElement,
  mountPicker,
  quotePage,
  selectionTarget
};
/*! Bundled license information:

react-grab/dist/freeze-updates-dBIOHHh-.js:
react-grab/dist/primitives.js:
  (**
   * @license MIT
   *
   * Copyright (c) 2025 Aiden Bai
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)

react-grab/dist/freeze-updates-dBIOHHh-.js:
  (**
  * @license bippy
  *
  * Copyright (c) Aiden Bai
  *
  * This source code is licensed under the MIT license found in the
  * LICENSE file in the root directory of this source tree.
  *)

react-grab/dist/open-file-BYqKjxo7.js:
  (**
   * @license MIT
   *
   * Copyright (c) 2025 Aiden Bai
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
  (**
  * @license bippy
  *
  * Copyright (c) Aiden Bai
  *
  * This source code is licensed under the MIT license found in the
  * LICENSE file in the root directory of this source tree.
  *)
*/
