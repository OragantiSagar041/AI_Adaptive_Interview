"use strict";
var MediapipeTasksVision = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined") return require.apply(this, arguments);
    throw Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // node_modules/@mediapipe/tasks-vision/vision_bundle.cjs
  var require_vision_bundle = __commonJS({
    "node_modules/@mediapipe/tasks-vision/vision_bundle.cjs"(exports) {
      function t(t2) {
        if (t2 && t2.__esModule) return t2;
        var e2 = /* @__PURE__ */ Object.create(null);
        return t2 && Object.keys(t2).forEach((function(n2) {
          if ("default" !== n2) {
            var r2 = Object.getOwnPropertyDescriptor(t2, n2);
            Object.defineProperty(e2, n2, r2.get ? r2 : { enumerable: true, get: function() {
              return t2[n2];
            } });
          }
        })), e2.default = t2, Object.freeze(e2);
      }
      Object.defineProperty(exports, "__esModule", { value: true });
      var e = "undefined" != typeof self ? self : {};
      function n(t2, n2) {
        t: {
          for (var r2 = ["CLOSURE_FLAGS"], i2 = e, s2 = 0; s2 < r2.length; s2++) if (null == (i2 = i2[r2[s2]])) {
            r2 = null;
            break t;
          }
          r2 = i2;
        }
        return null != (t2 = r2 && r2[t2]) ? t2 : n2;
      }
      function r() {
        throw Error("Invalid UTF8");
      }
      function i(t2, e2) {
        return e2 = String.fromCharCode.apply(null, e2), null == t2 ? e2 : t2 + e2;
      }
      var s;
      var o;
      var a = "undefined" != typeof TextDecoder;
      var c;
      var h = "undefined" != typeof TextEncoder;
      function u(t2) {
        if (h) t2 = (c ||= new TextEncoder()).encode(t2);
        else {
          let n2 = 0;
          const r2 = new Uint8Array(3 * t2.length);
          for (let i2 = 0; i2 < t2.length; i2++) {
            var e2 = t2.charCodeAt(i2);
            if (e2 < 128) r2[n2++] = e2;
            else {
              if (e2 < 2048) r2[n2++] = e2 >> 6 | 192;
              else {
                if (e2 >= 55296 && e2 <= 57343) {
                  if (e2 <= 56319 && i2 < t2.length) {
                    const s2 = t2.charCodeAt(++i2);
                    if (s2 >= 56320 && s2 <= 57343) {
                      e2 = 1024 * (e2 - 55296) + s2 - 56320 + 65536, r2[n2++] = e2 >> 18 | 240, r2[n2++] = e2 >> 12 & 63 | 128, r2[n2++] = e2 >> 6 & 63 | 128, r2[n2++] = 63 & e2 | 128;
                      continue;
                    }
                    i2--;
                  }
                  e2 = 65533;
                }
                r2[n2++] = e2 >> 12 | 224, r2[n2++] = e2 >> 6 & 63 | 128;
              }
              r2[n2++] = 63 & e2 | 128;
            }
          }
          t2 = n2 === r2.length ? r2 : r2.subarray(0, n2);
        }
        return t2;
      }
      function l(t2) {
        e.setTimeout((() => {
          throw t2;
        }), 0);
      }
      var f;
      var d = n(610401301, false);
      var p = n(748402147, true);
      function g() {
        var t2 = e.navigator;
        return t2 && (t2 = t2.userAgent) ? t2 : "";
      }
      var m = e.navigator;
      function y(t2) {
        return y[" "](t2), t2;
      }
      f = m && m.userAgentData || null, y[" "] = function() {
      };
      var _ = {};
      var v = null;
      function E(t2) {
        const e2 = t2.length;
        let n2 = 3 * e2 / 4;
        n2 % 3 ? n2 = Math.floor(n2) : -1 != "=.".indexOf(t2[e2 - 1]) && (n2 = -1 != "=.".indexOf(t2[e2 - 2]) ? n2 - 2 : n2 - 1);
        const r2 = new Uint8Array(n2);
        let i2 = 0;
        return (function(t3, e3) {
          function n3(e4) {
            for (; r3 < t3.length; ) {
              const e5 = t3.charAt(r3++), n4 = v[e5];
              if (null != n4) return n4;
              if (!/^[\s\xa0]*$/.test(e5)) throw Error("Unknown base64 encoding at char: " + e5);
            }
            return e4;
          }
          w();
          let r3 = 0;
          for (; ; ) {
            const t4 = n3(-1), r4 = n3(0), i3 = n3(64), s2 = n3(64);
            if (64 === s2 && -1 === t4) break;
            e3(t4 << 2 | r4 >> 4), 64 != i3 && (e3(r4 << 4 & 240 | i3 >> 2), 64 != s2 && e3(i3 << 6 & 192 | s2));
          }
        })(t2, (function(t3) {
          r2[i2++] = t3;
        })), i2 !== n2 ? r2.subarray(0, i2) : r2;
      }
      function w() {
        if (!v) {
          v = {};
          var t2 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split(""), e2 = ["+/=", "+/", "-_=", "-_.", "-_"];
          for (let n2 = 0; n2 < 5; n2++) {
            const r2 = t2.concat(e2[n2].split(""));
            _[n2] = r2;
            for (let t3 = 0; t3 < r2.length; t3++) {
              const e3 = r2[t3];
              void 0 === v[e3] && (v[e3] = t3);
            }
          }
        }
      }
      var T = "undefined" != typeof Uint8Array;
      var A = !(!(d && f && f.brands.length > 0) && (-1 != g().indexOf("Trident") || -1 != g().indexOf("MSIE"))) && "function" == typeof btoa;
      var b = /[-_.]/g;
      var k = { "-": "+", _: "/", ".": "=" };
      function x(t2) {
        return k[t2] || "";
      }
      function S(t2) {
        if (!A) return E(t2);
        t2 = b.test(t2) ? t2.replace(b, x) : t2, t2 = atob(t2);
        const e2 = new Uint8Array(t2.length);
        for (let n2 = 0; n2 < t2.length; n2++) e2[n2] = t2.charCodeAt(n2);
        return e2;
      }
      function L(t2) {
        return T && null != t2 && t2 instanceof Uint8Array;
      }
      var R = {};
      function I() {
        return M ||= new P(null, R);
      }
      function F(t2) {
        C(R);
        var e2 = t2.g;
        return null == (e2 = null == e2 || L(e2) ? e2 : "string" == typeof e2 ? S(e2) : null) ? e2 : t2.g = e2;
      }
      var P = class {
        h() {
          return new Uint8Array(F(this) || 0);
        }
        constructor(t2, e2) {
          if (C(e2), this.g = t2, null != t2 && 0 === t2.length) throw Error("ByteString should be constructed with non-empty values");
        }
      };
      var M;
      var O;
      function C(t2) {
        if (t2 !== R) throw Error("illegal external caller");
      }
      function N(t2, e2) {
        t2.__closure__error__context__984382 || (t2.__closure__error__context__984382 = {}), t2.__closure__error__context__984382.severity = e2;
      }
      function U(t2) {
        return N(t2 = Error(t2), "warning"), t2;
      }
      function D(t2, e2) {
        if (null != t2) {
          var n2 = O ??= {}, r2 = n2[t2] || 0;
          r2 >= e2 || (n2[t2] = r2 + 1, N(t2 = Error(), "incident"), l(t2));
        }
      }
      function B() {
        return "function" == typeof BigInt;
      }
      var G = "function" == typeof Symbol && "symbol" == typeof /* @__PURE__ */ Symbol();
      function j(t2, e2, n2 = false) {
        return "function" == typeof Symbol && "symbol" == typeof /* @__PURE__ */ Symbol() ? n2 && Symbol.for && t2 ? Symbol.for(t2) : null != t2 ? Symbol(t2) : /* @__PURE__ */ Symbol() : e2;
      }
      var V = j("jas", void 0, true);
      var X = j(void 0, "0di");
      var H = j(void 0, "1oa");
      var W = j(void 0, /* @__PURE__ */ Symbol());
      var z = j(void 0, "0ub");
      var K = j(void 0, "0ubs");
      var Y = j(void 0, "0ubsb");
      var q = j(void 0, "0actk");
      var $ = j("m_m", "Pa", true);
      var J = j();
      var Z = { Ga: { value: 0, configurable: true, writable: true, enumerable: false } };
      var Q = Object.defineProperties;
      var tt = G ? V : "Ga";
      var et;
      var nt = [];
      function rt(t2, e2) {
        G || tt in t2 || Q(t2, Z), t2[tt] |= e2;
      }
      function it(t2, e2) {
        G || tt in t2 || Q(t2, Z), t2[tt] = e2;
      }
      function st(t2) {
        return rt(t2, 34), t2;
      }
      function ot(t2) {
        return rt(t2, 8192), t2;
      }
      it(nt, 7), et = Object.freeze(nt);
      var at = {};
      function ct(t2, e2) {
        return void 0 === e2 ? t2.h !== ht && !!(2 & (0 | t2.v[tt])) : !!(2 & e2) && t2.h !== ht;
      }
      var ht = {};
      function ut(t2, e2) {
        if (null != t2) {
          if ("string" == typeof t2) t2 = t2 ? new P(t2, R) : I();
          else if (t2.constructor !== P) if (L(t2)) t2 = t2.length ? new P(new Uint8Array(t2), R) : I();
          else {
            if (!e2) throw Error();
            t2 = void 0;
          }
        }
        return t2;
      }
      var lt = class {
        constructor(t2, e2, n2) {
          this.g = t2, this.h = e2, this.l = n2;
        }
        next() {
          const t2 = this.g.next();
          return t2.done || (t2.value = this.h.call(this.l, t2.value)), t2;
        }
        [Symbol.iterator]() {
          return this;
        }
      };
      var ft = Object.freeze({});
      function dt(t2, e2, n2) {
        const r2 = 128 & e2 ? 0 : -1, i2 = t2.length;
        var s2;
        (s2 = !!i2) && (s2 = null != (s2 = t2[i2 - 1]) && "object" == typeof s2 && s2.constructor === Object);
        const o2 = i2 + (s2 ? -1 : 0);
        for (e2 = 128 & e2 ? 1 : 0; e2 < o2; e2++) n2(e2 - r2, t2[e2]);
        if (s2) {
          t2 = t2[i2 - 1];
          for (const e3 in t2) !isNaN(e3) && n2(+e3, t2[e3]);
        }
      }
      var pt = {};
      function gt(t2) {
        return 128 & t2 ? pt : void 0;
      }
      function mt(t2) {
        return t2.Na = true, t2;
      }
      var yt = mt(((t2) => "number" == typeof t2));
      var _t = mt(((t2) => "string" == typeof t2));
      var vt = mt(((t2) => "boolean" == typeof t2));
      var Et = "function" == typeof e.BigInt && "bigint" == typeof e.BigInt(0);
      function wt(t2) {
        var e2 = t2;
        if (_t(e2)) {
          if (!/^\s*(?:-?[1-9]\d*|0)?\s*$/.test(e2)) throw Error(String(e2));
        } else if (yt(e2) && !Number.isSafeInteger(e2)) throw Error(String(e2));
        return Et ? BigInt(t2) : t2 = vt(t2) ? t2 ? "1" : "0" : _t(t2) ? t2.trim() || "0" : String(t2);
      }
      var Tt = mt(((t2) => Et ? t2 >= bt && t2 <= xt : "-" === t2[0] ? St(t2, At) : St(t2, kt)));
      var At = Number.MIN_SAFE_INTEGER.toString();
      var bt = Et ? BigInt(Number.MIN_SAFE_INTEGER) : void 0;
      var kt = Number.MAX_SAFE_INTEGER.toString();
      var xt = Et ? BigInt(Number.MAX_SAFE_INTEGER) : void 0;
      function St(t2, e2) {
        if (t2.length > e2.length) return false;
        if (t2.length < e2.length || t2 === e2) return true;
        for (let n2 = 0; n2 < t2.length; n2++) {
          const r2 = t2[n2], i2 = e2[n2];
          if (r2 > i2) return false;
          if (r2 < i2) return true;
        }
      }
      var Lt = "function" == typeof Uint8Array.prototype.slice;
      var Rt;
      var It = 0;
      var Ft = 0;
      function Pt(t2) {
        const e2 = t2 >>> 0;
        It = e2, Ft = (t2 - e2) / 4294967296 >>> 0;
      }
      function Mt(t2) {
        if (t2 < 0) {
          Pt(-t2);
          const [e2, n2] = Vt(It, Ft);
          It = e2 >>> 0, Ft = n2 >>> 0;
        } else Pt(t2);
      }
      function Ot(t2) {
        const e2 = Rt ||= new DataView(new ArrayBuffer(8));
        e2.setFloat32(0, +t2, true), Ft = 0, It = e2.getUint32(0, true);
      }
      function Ct(t2, e2) {
        const n2 = 4294967296 * e2 + (t2 >>> 0);
        return Number.isSafeInteger(n2) ? n2 : Dt(t2, e2);
      }
      function Nt(t2, e2) {
        return wt(B() ? BigInt.asUintN(64, (BigInt(e2 >>> 0) << BigInt(32)) + BigInt(t2 >>> 0)) : Dt(t2, e2));
      }
      function Ut(t2, e2) {
        return B() ? wt(BigInt.asIntN(64, (BigInt.asUintN(32, BigInt(e2)) << BigInt(32)) + BigInt.asUintN(32, BigInt(t2)))) : wt(Gt(t2, e2));
      }
      function Dt(t2, e2) {
        if (t2 >>>= 0, (e2 >>>= 0) <= 2097151) var n2 = "" + (4294967296 * e2 + t2);
        else B() ? n2 = "" + (BigInt(e2) << BigInt(32) | BigInt(t2)) : (t2 = (16777215 & t2) + 6777216 * (n2 = 16777215 & (t2 >>> 24 | e2 << 8)) + 6710656 * (e2 = e2 >> 16 & 65535), n2 += 8147497 * e2, e2 *= 2, t2 >= 1e7 && (n2 += t2 / 1e7 >>> 0, t2 %= 1e7), n2 >= 1e7 && (e2 += n2 / 1e7 >>> 0, n2 %= 1e7), n2 = e2 + Bt(n2) + Bt(t2));
        return n2;
      }
      function Bt(t2) {
        return t2 = String(t2), "0000000".slice(t2.length) + t2;
      }
      function Gt(t2, e2) {
        if (2147483648 & e2) if (B()) t2 = "" + (BigInt(0 | e2) << BigInt(32) | BigInt(t2 >>> 0));
        else {
          const [n2, r2] = Vt(t2, e2);
          t2 = "-" + Dt(n2, r2);
        }
        else t2 = Dt(t2, e2);
        return t2;
      }
      function jt(t2) {
        if (t2.length < 16) Mt(Number(t2));
        else if (B()) t2 = BigInt(t2), It = Number(t2 & BigInt(4294967295)) >>> 0, Ft = Number(t2 >> BigInt(32) & BigInt(4294967295));
        else {
          const e2 = +("-" === t2[0]);
          Ft = It = 0;
          const n2 = t2.length;
          for (let r2 = e2, i2 = (n2 - e2) % 6 + e2; i2 <= n2; r2 = i2, i2 += 6) {
            const e3 = Number(t2.slice(r2, i2));
            Ft *= 1e6, It = 1e6 * It + e3, It >= 4294967296 && (Ft += Math.trunc(It / 4294967296), Ft >>>= 0, It >>>= 0);
          }
          if (e2) {
            const [t3, e3] = Vt(It, Ft);
            It = t3, Ft = e3;
          }
        }
      }
      function Vt(t2, e2) {
        return e2 = ~e2, t2 ? t2 = 1 + ~t2 : e2 += 1, [t2, e2];
      }
      function Xt(t2) {
        return Array.prototype.slice.call(t2);
      }
      var Ht = "function" == typeof BigInt ? BigInt.asIntN : void 0;
      var Wt = "function" == typeof BigInt ? BigInt.asUintN : void 0;
      var zt = Number.isSafeInteger;
      var Kt = Number.isFinite;
      var Yt = Math.trunc;
      var qt = wt(0);
      function $t(t2) {
        if (null != t2 && "number" != typeof t2) throw Error(`Value of float/double field must be a number, found ${typeof t2}: ${t2}`);
        return t2;
      }
      function Jt(t2) {
        return null == t2 || "number" == typeof t2 ? t2 : "NaN" === t2 || "Infinity" === t2 || "-Infinity" === t2 ? Number(t2) : void 0;
      }
      function Zt(t2) {
        if (null != t2 && "boolean" != typeof t2) {
          var e2 = typeof t2;
          throw Error(`Expected boolean but got ${"object" != e2 ? e2 : t2 ? Array.isArray(t2) ? "array" : e2 : "null"}: ${t2}`);
        }
        return t2;
      }
      function Qt(t2) {
        return null == t2 || "boolean" == typeof t2 ? t2 : "number" == typeof t2 ? !!t2 : void 0;
      }
      var te = /^-?([1-9][0-9]*|0)(\.[0-9]+)?$/;
      function ee(t2) {
        switch (typeof t2) {
          case "bigint":
            return true;
          case "number":
            return Kt(t2);
          case "string":
            return te.test(t2);
          default:
            return false;
        }
      }
      function ne(t2) {
        if (null == t2) return t2;
        if ("string" == typeof t2 && t2) t2 = +t2;
        else if ("number" != typeof t2) return;
        return Kt(t2) ? 0 | t2 : void 0;
      }
      function re(t2) {
        if (null == t2) return t2;
        if ("string" == typeof t2 && t2) t2 = +t2;
        else if ("number" != typeof t2) return;
        return Kt(t2) ? t2 >>> 0 : void 0;
      }
      function ie(t2) {
        const e2 = t2.length;
        return ("-" === t2[0] ? e2 < 20 || 20 === e2 && t2 <= "-9223372036854775808" : e2 < 19 || 19 === e2 && t2 <= "9223372036854775807") ? t2 : (jt(t2), Gt(It, Ft));
      }
      function se(t2) {
        if (t2 = Yt(t2), !zt(t2)) {
          Mt(t2);
          var e2 = It, n2 = Ft;
          (t2 = 2147483648 & n2) && (n2 = ~n2 >>> 0, 0 == (e2 = 1 + ~e2 >>> 0) && (n2 = n2 + 1 >>> 0)), t2 = "number" == typeof (e2 = Ct(e2, n2)) ? t2 ? -e2 : e2 : t2 ? "-" + e2 : e2;
        }
        return t2;
      }
      function oe(t2) {
        var e2 = Yt(Number(t2));
        return zt(e2) ? String(e2) : (-1 !== (e2 = t2.indexOf(".")) && (t2 = t2.substring(0, e2)), ie(t2));
      }
      function ae(t2) {
        var e2 = Yt(Number(t2));
        return zt(e2) ? wt(e2) : (-1 !== (e2 = t2.indexOf(".")) && (t2 = t2.substring(0, e2)), B() ? wt(Ht(64, BigInt(t2))) : wt(ie(t2)));
      }
      function ce(t2) {
        return zt(t2) ? t2 = wt(se(t2)) : (t2 = Yt(t2), zt(t2) ? t2 = String(t2) : (Mt(t2), t2 = Gt(It, Ft)), t2 = wt(t2)), t2;
      }
      function he(t2) {
        const e2 = typeof t2;
        return null == t2 ? t2 : "bigint" === e2 ? wt(Ht(64, t2)) : ee(t2) ? "string" === e2 ? ae(t2) : ce(t2) : void 0;
      }
      function ue(t2) {
        if ("string" != typeof t2) throw Error();
        return t2;
      }
      function le(t2) {
        if (null != t2 && "string" != typeof t2) throw Error();
        return t2;
      }
      function fe(t2) {
        return null == t2 || "string" == typeof t2 ? t2 : void 0;
      }
      function de(t2, e2, n2, r2) {
        return null != t2 && t2[$] === at ? t2 : Array.isArray(t2) ? ((r2 = (n2 = 0 | t2[tt]) | 32 & r2 | 2 & r2) !== n2 && it(t2, r2), new e2(t2)) : (n2 ? 2 & r2 ? ((t2 = e2[X]) || (st((t2 = new e2()).v), t2 = e2[X] = t2), e2 = t2) : e2 = new e2() : e2 = void 0, e2);
      }
      function pe(t2, e2, n2) {
        if (e2) t: {
          if (!ee(e2 = t2)) throw U("int64");
          switch (typeof e2) {
            case "string":
              e2 = ae(e2);
              break t;
            case "bigint":
              e2 = wt(Ht(64, e2));
              break t;
            default:
              e2 = ce(e2);
          }
        }
        else e2 = he(t2);
        return null == (t2 = e2) ? n2 ? qt : void 0 : t2;
      }
      var ge = {};
      var me = (function() {
        try {
          return y(new class extends Map {
            constructor() {
              super();
            }
          }()), false;
        } catch {
          return true;
        }
      })();
      var ye = class {
        constructor() {
          this.g = /* @__PURE__ */ new Map();
        }
        get(t2) {
          return this.g.get(t2);
        }
        set(t2, e2) {
          return this.g.set(t2, e2), this.size = this.g.size, this;
        }
        delete(t2) {
          return t2 = this.g.delete(t2), this.size = this.g.size, t2;
        }
        clear() {
          this.g.clear(), this.size = this.g.size;
        }
        has(t2) {
          return this.g.has(t2);
        }
        entries() {
          return this.g.entries();
        }
        keys() {
          return this.g.keys();
        }
        values() {
          return this.g.values();
        }
        forEach(t2, e2) {
          return this.g.forEach(t2, e2);
        }
        [Symbol.iterator]() {
          return this.entries();
        }
      };
      var _e = me ? (Object.setPrototypeOf(ye.prototype, Map.prototype), Object.defineProperties(ye.prototype, { size: { value: 0, configurable: true, enumerable: true, writable: true } }), ye) : class extends Map {
        constructor() {
          super();
        }
      };
      function ve(t2) {
        return t2;
      }
      function Ee(t2) {
        if (2 & t2.J) throw Error("Cannot mutate an immutable Map");
      }
      var we = class extends _e {
        constructor(t2, e2, n2 = ve, r2 = ve) {
          super(), this.J = 0 | t2[tt], this.K = e2, this.S = n2, this.fa = this.K ? Te : r2;
          for (let i2 = 0; i2 < t2.length; i2++) {
            const s2 = t2[i2], o2 = n2(s2[0], false, true);
            let a2 = s2[1];
            e2 ? void 0 === a2 && (a2 = null) : a2 = r2(s2[1], false, true, void 0, void 0, this.J), super.set(o2, a2);
          }
        }
        V(t2) {
          return ot(Array.from(super.entries(), t2));
        }
        clear() {
          Ee(this), super.clear();
        }
        delete(t2) {
          return Ee(this), super.delete(this.S(t2, true, false));
        }
        entries() {
          if (this.K) {
            var t2 = super.keys();
            t2 = new lt(t2, Ae, this);
          } else t2 = super.entries();
          return t2;
        }
        values() {
          if (this.K) {
            var t2 = super.keys();
            t2 = new lt(t2, we.prototype.get, this);
          } else t2 = super.values();
          return t2;
        }
        forEach(t2, e2) {
          this.K ? super.forEach(((n2, r2, i2) => {
            t2.call(e2, i2.get(r2), r2, i2);
          })) : super.forEach(t2, e2);
        }
        set(t2, e2) {
          return Ee(this), null == (t2 = this.S(t2, true, false)) ? this : null == e2 ? (super.delete(t2), this) : super.set(t2, this.fa(e2, true, true, this.K, false, this.J));
        }
        Ma(t2) {
          const e2 = this.S(t2[0], false, true);
          t2 = t2[1], t2 = this.K ? void 0 === t2 ? null : t2 : this.fa(t2, false, true, void 0, false, this.J), super.set(e2, t2);
        }
        has(t2) {
          return super.has(this.S(t2, false, false));
        }
        get(t2) {
          t2 = this.S(t2, false, false);
          const e2 = super.get(t2);
          if (void 0 !== e2) {
            var n2 = this.K;
            return n2 ? ((n2 = this.fa(e2, false, true, n2, this.ra, this.J)) !== e2 && super.set(t2, n2), n2) : e2;
          }
        }
        [Symbol.iterator]() {
          return this.entries();
        }
      };
      function Te(t2, e2, n2, r2, i2, s2) {
        return t2 = de(t2, r2, n2, s2), i2 && (t2 = He(t2)), t2;
      }
      function Ae(t2) {
        return [t2, this.get(t2)];
      }
      var be;
      function ke() {
        return be ||= new we(st([]), void 0, void 0, void 0, ge);
      }
      function xe(t2) {
        return W ? t2[W] : void 0;
      }
      function Se(t2, e2) {
        for (const n2 in t2) !isNaN(n2) && e2(t2, +n2, t2[n2]);
      }
      we.prototype.toJSON = void 0;
      var Le = class {
      };
      var Re = { Ka: true };
      function Ie(t2, e2) {
        e2 < 100 || D(K, 1);
      }
      function Fe(t2, e2, n2, r2) {
        const i2 = void 0 !== r2;
        r2 = !!r2;
        var s2, o2 = W;
        !i2 && G && o2 && (s2 = t2[o2]) && Se(s2, Ie), o2 = [];
        var a2 = t2.length;
        let c2;
        s2 = 4294967295;
        let h2 = false;
        const u2 = !!(64 & e2), l2 = u2 ? 128 & e2 ? 0 : -1 : void 0;
        1 & e2 || (c2 = a2 && t2[a2 - 1], null != c2 && "object" == typeof c2 && c2.constructor === Object ? s2 = --a2 : c2 = void 0, !u2 || 128 & e2 || i2 || (h2 = true, s2 = s2 - l2 + l2)), e2 = void 0;
        for (var f2 = 0; f2 < a2; f2++) {
          let i3 = t2[f2];
          if (null != i3 && null != (i3 = n2(i3, r2))) if (u2 && f2 >= s2) {
            const t3 = f2 - l2;
            (e2 ??= {})[t3] = i3;
          } else o2[f2] = i3;
        }
        if (c2) for (let t3 in c2) {
          if (null == (a2 = c2[t3]) || null == (a2 = n2(a2, r2))) continue;
          let i3;
          f2 = +t3, u2 && !Number.isNaN(f2) && (i3 = f2 + l2) < s2 ? o2[i3] = a2 : (e2 ??= {})[t3] = a2;
        }
        return e2 && (h2 ? o2.push(e2) : o2[s2] = e2), i2 && W && (t2 = xe(t2)) && t2 instanceof Le && (o2[W] = (function(t3) {
          const e3 = new Le();
          return Se(t3, ((t4, n3, r3) => {
            e3[n3] = Xt(r3);
          })), e3.da = t3.da, e3;
        })(t2)), o2;
      }
      function Pe(t2) {
        return t2[0] = Me(t2[0]), t2[1] = Me(t2[1]), t2;
      }
      function Me(t2) {
        switch (typeof t2) {
          case "number":
            return Number.isFinite(t2) ? t2 : "" + t2;
          case "bigint":
            return Tt(t2) ? Number(t2) : "" + t2;
          case "boolean":
            return t2 ? 1 : 0;
          case "object":
            if (Array.isArray(t2)) {
              var e2 = 0 | t2[tt];
              return 0 === t2.length && 1 & e2 ? void 0 : Fe(t2, e2, Me);
            }
            if (null != t2 && t2[$] === at) return Ne(t2);
            if (t2 instanceof P) {
              if (null == (e2 = t2.g)) t2 = "";
              else if ("string" == typeof e2) t2 = e2;
              else {
                if (A) {
                  for (var n2 = "", r2 = 0, i2 = e2.length - 10240; r2 < i2; ) n2 += String.fromCharCode.apply(null, e2.subarray(r2, r2 += 10240));
                  n2 += String.fromCharCode.apply(null, r2 ? e2.subarray(r2) : e2), e2 = btoa(n2);
                } else {
                  void 0 === n2 && (n2 = 0), w(), n2 = _[n2], r2 = Array(Math.floor(e2.length / 3)), i2 = n2[64] || "";
                  let t3 = 0, h2 = 0;
                  for (; t3 < e2.length - 2; t3 += 3) {
                    var s2 = e2[t3], o2 = e2[t3 + 1], a2 = e2[t3 + 2], c2 = n2[s2 >> 2];
                    s2 = n2[(3 & s2) << 4 | o2 >> 4], o2 = n2[(15 & o2) << 2 | a2 >> 6], a2 = n2[63 & a2], r2[h2++] = c2 + s2 + o2 + a2;
                  }
                  switch (c2 = 0, a2 = i2, e2.length - t3) {
                    case 2:
                      a2 = n2[(15 & (c2 = e2[t3 + 1])) << 2] || i2;
                    case 1:
                      e2 = e2[t3], r2[h2] = n2[e2 >> 2] + n2[(3 & e2) << 4 | c2 >> 4] + a2 + i2;
                  }
                  e2 = r2.join("");
                }
                t2 = t2.g = e2;
              }
              return t2;
            }
            return t2 instanceof we ? t2 = 0 !== t2.size ? t2.V(Pe) : void 0 : void 0;
        }
        return t2;
      }
      var Oe;
      var Ce;
      function Ne(t2) {
        return Fe(t2 = t2.v, 0 | t2[tt], Me);
      }
      function Ue(t2, e2) {
        return De(t2, e2[0], e2[1]);
      }
      function De(t2, e2, n2, r2 = 0) {
        if (null == t2) {
          var i2 = 32;
          n2 ? (t2 = [n2], i2 |= 128) : t2 = [], e2 && (i2 = -16760833 & i2 | (1023 & e2) << 14);
        } else {
          if (!Array.isArray(t2)) throw Error("narr");
          if (i2 = 0 | t2[tt], p && 1 & i2) throw Error("rfarr");
          if (2048 & i2 && !(2 & i2) && (function() {
            if (p) throw Error("carr");
            D(q, 5);
          })(), 256 & i2) throw Error("farr");
          if (64 & i2) return (i2 | r2) !== i2 && it(t2, i2 | r2), t2;
          if (n2 && (i2 |= 128, n2 !== t2[0])) throw Error("mid");
          t: {
            i2 |= 64;
            var s2 = (n2 = t2).length;
            if (s2) {
              var o2 = s2 - 1;
              const t3 = n2[o2];
              if (null != t3 && "object" == typeof t3 && t3.constructor === Object) {
                if ((o2 -= e2 = 128 & i2 ? 0 : -1) >= 1024) throw Error("pvtlmt");
                for (var a2 in t3) (s2 = +a2) < o2 && (n2[s2 + e2] = t3[a2], delete t3[a2]);
                i2 = -16760833 & i2 | (1023 & o2) << 14;
                break t;
              }
            }
            if (e2) {
              if ((a2 = Math.max(e2, s2 - (128 & i2 ? 0 : -1))) > 1024) throw Error("spvt");
              i2 = -16760833 & i2 | (1023 & a2) << 14;
            }
          }
        }
        return it(t2, 64 | i2 | r2), t2;
      }
      function Be(t2, e2) {
        if ("object" != typeof t2) return t2;
        if (Array.isArray(t2)) {
          var n2 = 0 | t2[tt];
          return 0 === t2.length && 1 & n2 ? void 0 : Ge(t2, n2, e2);
        }
        if (null != t2 && t2[$] === at) return Ve(t2);
        if (t2 instanceof we) {
          if (2 & (e2 = t2.J)) return t2;
          if (!t2.size) return;
          if (n2 = st(t2.V()), t2.K) for (t2 = 0; t2 < n2.length; t2++) {
            const r2 = n2[t2];
            let i2 = r2[1];
            i2 = null == i2 || "object" != typeof i2 ? void 0 : null != i2 && i2[$] === at ? Ve(i2) : Array.isArray(i2) ? Ge(i2, 0 | i2[tt], !!(32 & e2)) : void 0, r2[1] = i2;
          }
          return n2;
        }
        return t2 instanceof P ? t2 : void 0;
      }
      function Ge(t2, e2, n2) {
        return 2 & e2 || (!n2 || 4096 & e2 || 16 & e2 ? t2 = Xe(t2, e2, false, n2 && !(16 & e2)) : (rt(t2, 34), 4 & e2 && Object.freeze(t2))), t2;
      }
      function je(t2, e2, n2) {
        return t2 = new t2.constructor(e2), n2 && (t2.h = ht), t2.m = ht, t2;
      }
      function Ve(t2) {
        const e2 = t2.v, n2 = 0 | e2[tt];
        return ct(t2, n2) ? t2 : Ye(t2, e2, n2) ? je(t2, e2) : Xe(e2, n2);
      }
      function Xe(t2, e2, n2, r2) {
        return r2 ??= !!(34 & e2), t2 = Fe(t2, e2, Be, r2), r2 = 32, n2 && (r2 |= 2), it(t2, e2 = 16769217 & e2 | r2), t2;
      }
      function He(t2) {
        const e2 = t2.v, n2 = 0 | e2[tt];
        return ct(t2, n2) ? Ye(t2, e2, n2) ? je(t2, e2, true) : new t2.constructor(Xe(e2, n2, false)) : t2;
      }
      function We(t2) {
        if (t2.h !== ht) return false;
        var e2 = t2.v;
        return rt(e2 = Xe(e2, 0 | e2[tt]), 2048), t2.v = e2, t2.h = void 0, t2.m = void 0, true;
      }
      function ze(t2) {
        if (!We(t2) && ct(t2, 0 | t2.v[tt])) throw Error();
      }
      function Ke(t2, e2) {
        void 0 === e2 && (e2 = 0 | t2[tt]), 32 & e2 && !(4096 & e2) && it(t2, 4096 | e2);
      }
      function Ye(t2, e2, n2) {
        return !!(2 & n2) || !(!(32 & n2) || 4096 & n2) && (it(e2, 2 | n2), t2.h = ht, true);
      }
      var qe = wt(0);
      var $e = {};
      function Je(t2, e2, n2, r2, i2) {
        if (null !== (e2 = Ze(t2.v, e2, n2, i2)) || r2 && t2.m !== ht) return e2;
      }
      function Ze(t2, e2, n2, r2) {
        if (-1 === e2) return null;
        const i2 = e2 + (n2 ? 0 : -1), s2 = t2.length - 1;
        let o2, a2;
        if (!(s2 < 1 + (n2 ? 0 : -1))) {
          if (i2 >= s2) if (o2 = t2[s2], null != o2 && "object" == typeof o2 && o2.constructor === Object) n2 = o2[e2], a2 = true;
          else {
            if (i2 !== s2) return;
            n2 = o2;
          }
          else n2 = t2[i2];
          if (r2 && null != n2) {
            if (null == (r2 = r2(n2))) return r2;
            if (!Object.is(r2, n2)) return a2 ? o2[e2] = r2 : t2[i2] = r2, r2;
          }
          return n2;
        }
      }
      function Qe(t2, e2, n2, r2) {
        ze(t2), tn(t2 = t2.v, 0 | t2[tt], e2, n2, r2);
      }
      function tn(t2, e2, n2, r2, i2) {
        const s2 = n2 + (i2 ? 0 : -1);
        var o2 = t2.length - 1;
        if (o2 >= 1 + (i2 ? 0 : -1) && s2 >= o2) {
          const i3 = t2[o2];
          if (null != i3 && "object" == typeof i3 && i3.constructor === Object) return i3[n2] = r2, e2;
        }
        return s2 <= o2 ? (t2[s2] = r2, e2) : (void 0 !== r2 && (n2 >= (o2 = (e2 ??= 0 | t2[tt]) >> 14 & 1023 || 536870912) ? null != r2 && (t2[o2 + (i2 ? 0 : -1)] = { [n2]: r2 }) : t2[s2] = r2), e2);
      }
      function en() {
        return void 0 === ft ? 2 : 4;
      }
      function nn(t2, e2, n2, r2, i2) {
        let s2 = t2.v, o2 = 0 | s2[tt];
        r2 = ct(t2, o2) ? 1 : r2, i2 = !!i2 || 3 === r2, 2 === r2 && We(t2) && (s2 = t2.v, o2 = 0 | s2[tt]);
        let a2 = (t2 = sn(s2, e2)) === et ? 7 : 0 | t2[tt], c2 = on(a2, o2);
        var h2 = !(4 & c2);
        if (h2) {
          4 & c2 && (t2 = Xt(t2), a2 = 0, c2 = bn(c2, o2), o2 = tn(s2, o2, e2, t2));
          let r3 = 0, i3 = 0;
          for (; r3 < t2.length; r3++) {
            const e3 = n2(t2[r3]);
            null != e3 && (t2[i3++] = e3);
          }
          i3 < r3 && (t2.length = i3), n2 = -513 & (4 | c2), c2 = n2 &= -1025, c2 &= -4097;
        }
        return c2 !== a2 && (it(t2, c2), 2 & c2 && Object.freeze(t2)), rn(t2, c2, s2, o2, e2, r2, h2, i2);
      }
      function rn(t2, e2, n2, r2, i2, s2, o2, a2) {
        let c2 = e2;
        return 1 === s2 || 4 === s2 && (2 & e2 || !(16 & e2) && 32 & r2) ? an(e2) || ((e2 |= !t2.length || o2 && !(4096 & e2) || 32 & r2 && !(4096 & e2 || 16 & e2) ? 2 : 256) !== c2 && it(t2, e2), Object.freeze(t2)) : (2 === s2 && an(e2) && (t2 = Xt(t2), c2 = 0, e2 = bn(e2, r2), r2 = tn(n2, r2, i2, t2)), an(e2) || (a2 || (e2 |= 16), e2 !== c2 && it(t2, e2))), 2 & e2 || !(4096 & e2 || 16 & e2) || Ke(n2, r2), t2;
      }
      function sn(t2, e2, n2) {
        return t2 = Ze(t2, e2, n2), Array.isArray(t2) ? t2 : et;
      }
      function on(t2, e2) {
        return 2 & e2 && (t2 |= 2), 1 | t2;
      }
      function an(t2) {
        return !!(2 & t2) && !!(4 & t2) || !!(256 & t2);
      }
      function cn(t2) {
        return ut(t2, true);
      }
      function hn(t2) {
        t2 = Xt(t2);
        for (let e2 = 0; e2 < t2.length; e2++) {
          const n2 = t2[e2] = Xt(t2[e2]);
          Array.isArray(n2[1]) && (n2[1] = st(n2[1]));
        }
        return ot(t2);
      }
      function un(t2, e2, n2, r2) {
        ze(t2), tn(t2 = t2.v, 0 | t2[tt], e2, ("0" === r2 ? 0 === Number(n2) : n2 === r2) ? void 0 : n2);
      }
      function ln(t2, e2, n2) {
        if (2 & e2) throw Error();
        const r2 = gt(e2);
        let i2 = sn(t2, n2, r2), s2 = i2 === et ? 7 : 0 | i2[tt], o2 = on(s2, e2);
        return (2 & o2 || an(o2) || 16 & o2) && (o2 === s2 || an(o2) || it(i2, o2), i2 = Xt(i2), s2 = 0, o2 = bn(o2, e2), tn(t2, e2, n2, i2, r2)), o2 &= -13, o2 !== s2 && it(i2, o2), i2;
      }
      function fn(t2, e2) {
        var n2 = Cs;
        return gn(dn(t2 = t2.v), t2, void 0, n2) === e2 ? e2 : -1;
      }
      function dn(t2) {
        if (G) return t2[H] ?? (t2[H] = /* @__PURE__ */ new Map());
        if (H in t2) return t2[H];
        const e2 = /* @__PURE__ */ new Map();
        return Object.defineProperty(t2, H, { value: e2 }), e2;
      }
      function pn(t2, e2, n2, r2, i2) {
        const s2 = dn(t2), o2 = gn(s2, t2, e2, n2, i2);
        return o2 !== r2 && (o2 && (e2 = tn(t2, e2, o2, void 0, i2)), s2.set(n2, r2)), e2;
      }
      function gn(t2, e2, n2, r2, i2) {
        let s2 = t2.get(r2);
        if (null != s2) return s2;
        s2 = 0;
        for (let t3 = 0; t3 < r2.length; t3++) {
          const o2 = r2[t3];
          null != Ze(e2, o2, i2) && (0 !== s2 && (n2 = tn(e2, n2, s2, void 0, i2)), s2 = o2);
        }
        return t2.set(r2, s2), s2;
      }
      function mn(t2, e2, n2) {
        let r2 = 0 | t2[tt];
        const i2 = gt(r2), s2 = Ze(t2, n2, i2);
        let o2;
        if (null != s2 && s2[$] === at) {
          if (!ct(s2)) return We(s2), s2.v;
          o2 = s2.v;
        } else Array.isArray(s2) && (o2 = s2);
        if (o2) {
          const t3 = 0 | o2[tt];
          2 & t3 && (o2 = Xe(o2, t3));
        }
        return o2 = Ue(o2, e2), o2 !== s2 && tn(t2, r2, n2, o2, i2), o2;
      }
      function yn(t2, e2, n2, r2, i2) {
        let s2 = false;
        if (null != (r2 = Ze(t2, r2, i2, ((t3) => {
          const r3 = de(t3, n2, false, e2);
          return s2 = r3 !== t3 && null != r3, r3;
        })))) return s2 && !ct(r2) && Ke(t2, e2), r2;
      }
      function _n(t2, e2, n2, r2) {
        let i2 = t2.v, s2 = 0 | i2[tt];
        if (null == (e2 = yn(i2, s2, e2, n2, r2))) return e2;
        if (s2 = 0 | i2[tt], !ct(t2, s2)) {
          const o2 = He(e2);
          o2 !== e2 && (We(t2) && (i2 = t2.v, s2 = 0 | i2[tt]), s2 = tn(i2, s2, n2, e2 = o2, r2), Ke(i2, s2));
        }
        return e2;
      }
      function vn(t2, e2, n2, r2, i2, s2, o2, a2) {
        var c2 = ct(t2, n2);
        s2 = c2 ? 1 : s2, o2 = !!o2 || 3 === s2, c2 = a2 && !c2, (2 === s2 || c2) && We(t2) && (n2 = 0 | (e2 = t2.v)[tt]);
        var h2 = (t2 = sn(e2, i2)) === et ? 7 : 0 | t2[tt], u2 = on(h2, n2);
        if (a2 = !(4 & u2)) {
          var l2 = t2, f2 = n2;
          const e3 = !!(2 & u2);
          e3 && (f2 |= 2);
          let i3 = !e3, s3 = true, o3 = 0, a3 = 0;
          for (; o3 < l2.length; o3++) {
            const t3 = de(l2[o3], r2, false, f2);
            if (t3 instanceof r2) {
              if (!e3) {
                const e4 = ct(t3);
                i3 &&= !e4, s3 &&= e4;
              }
              l2[a3++] = t3;
            }
          }
          a3 < o3 && (l2.length = a3), u2 |= 4, u2 = s3 ? -4097 & u2 : 4096 | u2, u2 = i3 ? 8 | u2 : -9 & u2;
        }
        if (u2 !== h2 && (it(t2, u2), 2 & u2 && Object.freeze(t2)), c2 && !(8 & u2 || !t2.length && (1 === s2 || 4 === s2 && (2 & u2 || !(16 & u2) && 32 & n2)))) {
          for (an(u2) && (t2 = Xt(t2), u2 = bn(u2, n2), n2 = tn(e2, n2, i2, t2)), r2 = t2, c2 = u2, h2 = 0; h2 < r2.length; h2++) (l2 = r2[h2]) !== (u2 = He(l2)) && (r2[h2] = u2);
          c2 |= 8, it(t2, u2 = c2 = r2.length ? 4096 | c2 : -4097 & c2);
        }
        return rn(t2, u2, e2, n2, i2, s2, a2, o2);
      }
      function En(t2, e2, n2) {
        const r2 = t2.v;
        return vn(t2, r2, 0 | r2[tt], e2, n2, en(), false, true);
      }
      function wn(t2) {
        return null == t2 && (t2 = void 0), t2;
      }
      function Tn(t2, e2, n2, r2, i2) {
        return Qe(t2, n2, r2 = wn(r2), i2), r2 && !ct(r2) && Ke(t2.v), t2;
      }
      function An(t2, e2, n2, r2) {
        t: {
          var i2 = r2 = wn(r2);
          ze(t2);
          const s2 = t2.v;
          let o2 = 0 | s2[tt];
          if (null == i2) {
            const t3 = dn(s2);
            if (gn(t3, s2, o2, n2) !== e2) break t;
            t3.set(n2, 0);
          } else o2 = pn(s2, o2, n2, e2);
          tn(s2, o2, e2, i2);
        }
        r2 && !ct(r2) && Ke(t2.v);
      }
      function bn(t2, e2) {
        return -273 & (2 & e2 ? 2 | t2 : -3 & t2);
      }
      function kn(t2, e2, n2, r2) {
        var i2 = r2;
        ze(t2), t2 = vn(t2, r2 = t2.v, 0 | r2[tt], n2, e2, 2, true), i2 = null != i2 ? i2 : new n2(), t2.push(i2), e2 = n2 = t2 === et ? 7 : 0 | t2[tt], (i2 = ct(i2)) ? (n2 &= -9, 1 === t2.length && (n2 &= -4097)) : n2 |= 4096, n2 !== e2 && it(t2, n2), i2 || Ke(r2);
      }
      function xn(t2, e2, n2) {
        return ne(Je(t2, e2, void 0, n2));
      }
      function Sn(t2, e2) {
        return Je(t2, e2, void 0, void 0, Jt) ?? 0;
      }
      function Ln(t2, e2, n2) {
        if (null != n2) {
          if ("number" != typeof n2) throw U("int32");
          if (!Kt(n2)) throw U("int32");
          n2 |= 0;
        }
        Qe(t2, e2, n2);
      }
      function Rn(t2, e2, n2) {
        Qe(t2, e2, $t(n2));
      }
      function In(t2, e2, n2) {
        un(t2, e2, le(n2), "");
      }
      function Fn(t2, e2, n2) {
        {
          ze(t2);
          const o2 = t2.v;
          let a2 = 0 | o2[tt];
          if (null == n2) tn(o2, a2, e2);
          else {
            var r2 = t2 = n2 === et ? 7 : 0 | n2[tt], i2 = an(t2), s2 = i2 || Object.isFrozen(n2);
            for (i2 || (t2 = 0), s2 || (n2 = Xt(n2), r2 = 0, t2 = bn(t2, a2), s2 = false), t2 |= 5, t2 |= (4 & t2 ? 512 & t2 ? 512 : 1024 & t2 ? 1024 : 0 : void 0) ?? 1024, i2 = 0; i2 < n2.length; i2++) {
              const e3 = n2[i2], o3 = ue(e3);
              Object.is(e3, o3) || (s2 && (n2 = Xt(n2), r2 = 0, t2 = bn(t2, a2), s2 = false), n2[i2] = o3);
            }
            t2 !== r2 && (s2 && (n2 = Xt(n2), t2 = bn(t2, a2)), it(n2, t2)), tn(o2, a2, e2, n2);
          }
        }
      }
      function Pn(t2, e2, n2) {
        ze(t2), nn(t2, e2, fe, 2, true).push(ue(n2));
      }
      var Mn = class {
        constructor(t2, e2, n2) {
          if (this.buffer = t2, n2 && !e2) throw Error();
          this.g = e2;
        }
      };
      function On(t2, e2) {
        if ("string" == typeof t2) return new Mn(S(t2), e2);
        if (Array.isArray(t2)) return new Mn(new Uint8Array(t2), e2);
        if (t2.constructor === Uint8Array) return new Mn(t2, false);
        if (t2.constructor === ArrayBuffer) return t2 = new Uint8Array(t2), new Mn(t2, false);
        if (t2.constructor === P) return e2 = F(t2) || new Uint8Array(0), new Mn(e2, true, t2);
        if (t2 instanceof Uint8Array) return t2 = t2.constructor === Uint8Array ? t2 : new Uint8Array(t2.buffer, t2.byteOffset, t2.byteLength), new Mn(t2, false);
        throw Error();
      }
      function Cn(t2, e2) {
        let n2, r2 = 0, i2 = 0, s2 = 0;
        const o2 = t2.h;
        let a2 = t2.g;
        do {
          n2 = o2[a2++], r2 |= (127 & n2) << s2, s2 += 7;
        } while (s2 < 32 && 128 & n2);
        if (s2 > 32) for (i2 |= (127 & n2) >> 4, s2 = 3; s2 < 32 && 128 & n2; s2 += 7) n2 = o2[a2++], i2 |= (127 & n2) << s2;
        if (jn(t2, a2), !(128 & n2)) return e2(r2 >>> 0, i2 >>> 0);
        throw Error();
      }
      function Nn(t2) {
        let e2 = 0, n2 = t2.g;
        const r2 = n2 + 10, i2 = t2.h;
        for (; n2 < r2; ) {
          const r3 = i2[n2++];
          if (e2 |= r3, 0 == (128 & r3)) return jn(t2, n2), !!(127 & e2);
        }
        throw Error();
      }
      function Un(t2) {
        const e2 = t2.h;
        let n2 = t2.g, r2 = e2[n2++], i2 = 127 & r2;
        if (128 & r2 && (r2 = e2[n2++], i2 |= (127 & r2) << 7, 128 & r2 && (r2 = e2[n2++], i2 |= (127 & r2) << 14, 128 & r2 && (r2 = e2[n2++], i2 |= (127 & r2) << 21, 128 & r2 && (r2 = e2[n2++], i2 |= r2 << 28, 128 & r2 && 128 & e2[n2++] && 128 & e2[n2++] && 128 & e2[n2++] && 128 & e2[n2++] && 128 & e2[n2++]))))) throw Error();
        return jn(t2, n2), i2;
      }
      function Dn(t2) {
        return Un(t2) >>> 0;
      }
      function Bn(t2) {
        var e2 = t2.h;
        const n2 = t2.g;
        var r2 = e2[n2], i2 = e2[n2 + 1];
        const s2 = e2[n2 + 2];
        return e2 = e2[n2 + 3], jn(t2, t2.g + 4), t2 = 2 * ((i2 = (r2 << 0 | i2 << 8 | s2 << 16 | e2 << 24) >>> 0) >> 31) + 1, r2 = i2 >>> 23 & 255, i2 &= 8388607, 255 == r2 ? i2 ? NaN : t2 * (1 / 0) : 0 == r2 ? 1401298464324817e-60 * t2 * i2 : t2 * Math.pow(2, r2 - 150) * (i2 + 8388608);
      }
      function Gn(t2) {
        return Un(t2);
      }
      function jn(t2, e2) {
        if (t2.g = e2, e2 > t2.l) throw Error();
      }
      function Vn(t2, e2) {
        if (e2 < 0) throw Error();
        const n2 = t2.g;
        if ((e2 = n2 + e2) > t2.l) throw Error();
        return t2.g = e2, n2;
      }
      function Xn(t2, e2) {
        if (0 == e2) return I();
        var n2 = Vn(t2, e2);
        return t2.Y && t2.j ? n2 = t2.h.subarray(n2, n2 + e2) : (t2 = t2.h, n2 = n2 === (e2 = n2 + e2) ? new Uint8Array(0) : Lt ? t2.slice(n2, e2) : new Uint8Array(t2.subarray(n2, e2))), 0 == n2.length ? I() : new P(n2, R);
      }
      var Hn = [];
      function Wn(t2, e2, n2, r2) {
        if (tr.length) {
          const i2 = tr.pop();
          return i2.o(r2), i2.g.init(t2, e2, n2, r2), i2;
        }
        return new Qn(t2, e2, n2, r2);
      }
      function zn(t2) {
        t2.g.clear(), t2.l = -1, t2.h = -1, tr.length < 100 && tr.push(t2);
      }
      function Kn(t2) {
        var e2 = t2.g;
        if (e2.g == e2.l) return false;
        t2.m = t2.g.g;
        var n2 = Dn(t2.g);
        if (e2 = n2 >>> 3, !((n2 &= 7) >= 0 && n2 <= 5)) throw Error();
        if (e2 < 1) throw Error();
        return t2.l = e2, t2.h = n2, true;
      }
      function Yn(t2) {
        switch (t2.h) {
          case 0:
            0 != t2.h ? Yn(t2) : Nn(t2.g);
            break;
          case 1:
            jn(t2 = t2.g, t2.g + 8);
            break;
          case 2:
            if (2 != t2.h) Yn(t2);
            else {
              var e2 = Dn(t2.g);
              jn(t2 = t2.g, t2.g + e2);
            }
            break;
          case 5:
            jn(t2 = t2.g, t2.g + 4);
            break;
          case 3:
            for (e2 = t2.l; ; ) {
              if (!Kn(t2)) throw Error();
              if (4 == t2.h) {
                if (t2.l != e2) throw Error();
                break;
              }
              Yn(t2);
            }
            break;
          default:
            throw Error();
        }
      }
      function qn(t2, e2, n2) {
        const r2 = t2.g.l;
        var i2 = Dn(t2.g);
        let s2 = (i2 = t2.g.g + i2) - r2;
        if (s2 <= 0 && (t2.g.l = i2, n2(e2, t2, void 0, void 0, void 0), s2 = i2 - t2.g.g), s2) throw Error();
        return t2.g.g = i2, t2.g.l = r2, e2;
      }
      function $n(t2) {
        var e2 = Dn(t2.g), n2 = Vn(t2 = t2.g, e2);
        if (t2 = t2.h, a) {
          var c2, h2 = t2;
          (c2 = o) || (c2 = o = new TextDecoder("utf-8", { fatal: true })), e2 = n2 + e2, h2 = 0 === n2 && e2 === h2.length ? h2 : h2.subarray(n2, e2);
          try {
            var u2 = c2.decode(h2);
          } catch (t3) {
            if (void 0 === s) {
              try {
                c2.decode(new Uint8Array([128]));
              } catch (t4) {
              }
              try {
                c2.decode(new Uint8Array([97])), s = true;
              } catch (t4) {
                s = false;
              }
            }
            throw !s && (o = void 0), t3;
          }
        } else {
          e2 = (u2 = n2) + e2, n2 = [];
          let s2, o2 = null;
          for (; u2 < e2; ) {
            var l2 = t2[u2++];
            l2 < 128 ? n2.push(l2) : l2 < 224 ? u2 >= e2 ? r() : (s2 = t2[u2++], l2 < 194 || 128 != (192 & s2) ? (u2--, r()) : n2.push((31 & l2) << 6 | 63 & s2)) : l2 < 240 ? u2 >= e2 - 1 ? r() : (s2 = t2[u2++], 128 != (192 & s2) || 224 === l2 && s2 < 160 || 237 === l2 && s2 >= 160 || 128 != (192 & (c2 = t2[u2++])) ? (u2--, r()) : n2.push((15 & l2) << 12 | (63 & s2) << 6 | 63 & c2)) : l2 <= 244 ? u2 >= e2 - 2 ? r() : (s2 = t2[u2++], 128 != (192 & s2) || s2 - 144 + (l2 << 28) >> 30 != 0 || 128 != (192 & (c2 = t2[u2++])) || 128 != (192 & (h2 = t2[u2++])) ? (u2--, r()) : (l2 = (7 & l2) << 18 | (63 & s2) << 12 | (63 & c2) << 6 | 63 & h2, l2 -= 65536, n2.push(55296 + (l2 >> 10 & 1023), 56320 + (1023 & l2)))) : r(), n2.length >= 8192 && (o2 = i(o2, n2), n2.length = 0);
          }
          u2 = i(o2, n2);
        }
        return u2;
      }
      function Jn(t2) {
        const e2 = Dn(t2.g);
        return Xn(t2.g, e2);
      }
      function Zn(t2, e2, n2) {
        var r2 = Dn(t2.g);
        for (r2 = t2.g.g + r2; t2.g.g < r2; ) n2.push(e2(t2.g));
      }
      var Qn = class {
        constructor(t2, e2, n2, r2) {
          if (Hn.length) {
            const i2 = Hn.pop();
            i2.init(t2, e2, n2, r2), t2 = i2;
          } else t2 = new class {
            constructor(t3, e3, n3, r3) {
              this.h = null, this.j = false, this.g = this.l = this.m = 0, this.init(t3, e3, n3, r3);
            }
            init(t3, e3, n3, { Y: r3 = false, ea: i2 = false } = {}) {
              this.Y = r3, this.ea = i2, t3 && (t3 = On(t3, this.ea), this.h = t3.buffer, this.j = t3.g, this.m = e3 || 0, this.l = void 0 !== n3 ? this.m + n3 : this.h.length, this.g = this.m);
            }
            clear() {
              this.h = null, this.j = false, this.g = this.l = this.m = 0, this.Y = false;
            }
          }(t2, e2, n2, r2);
          this.g = t2, this.m = this.g.g, this.h = this.l = -1, this.o(r2);
        }
        o({ ha: t2 = false } = {}) {
          this.ha = t2;
        }
      };
      var tr = [];
      function er(t2) {
        return t2 ? /^\d+$/.test(t2) ? (jt(t2), new nr(It, Ft)) : null : rr ||= new nr(0, 0);
      }
      var nr = class {
        constructor(t2, e2) {
          this.h = t2 >>> 0, this.g = e2 >>> 0;
        }
      };
      var rr;
      function ir(t2) {
        return t2 ? /^-?\d+$/.test(t2) ? (jt(t2), new sr(It, Ft)) : null : or ||= new sr(0, 0);
      }
      var sr = class {
        constructor(t2, e2) {
          this.h = t2 >>> 0, this.g = e2 >>> 0;
        }
      };
      var or;
      function ar(t2, e2, n2) {
        for (; n2 > 0 || e2 > 127; ) t2.g.push(127 & e2 | 128), e2 = (e2 >>> 7 | n2 << 25) >>> 0, n2 >>>= 7;
        t2.g.push(e2);
      }
      function cr(t2, e2) {
        for (; e2 > 127; ) t2.g.push(127 & e2 | 128), e2 >>>= 7;
        t2.g.push(e2);
      }
      function hr(t2, e2) {
        if (e2 >= 0) cr(t2, e2);
        else {
          for (let n2 = 0; n2 < 9; n2++) t2.g.push(127 & e2 | 128), e2 >>= 7;
          t2.g.push(1);
        }
      }
      function ur(t2) {
        var e2 = It;
        t2.g.push(e2 >>> 0 & 255), t2.g.push(e2 >>> 8 & 255), t2.g.push(e2 >>> 16 & 255), t2.g.push(e2 >>> 24 & 255);
      }
      function lr(t2, e2) {
        0 !== e2.length && (t2.l.push(e2), t2.h += e2.length);
      }
      function fr(t2, e2, n2) {
        cr(t2.g, 8 * e2 + n2);
      }
      function dr(t2, e2) {
        return fr(t2, e2, 2), e2 = t2.g.end(), lr(t2, e2), e2.push(t2.h), e2;
      }
      function pr(t2, e2) {
        var n2 = e2.pop();
        for (n2 = t2.h + t2.g.length() - n2; n2 > 127; ) e2.push(127 & n2 | 128), n2 >>>= 7, t2.h++;
        e2.push(n2), t2.h++;
      }
      function gr(t2, e2, n2) {
        fr(t2, e2, 2), cr(t2.g, n2.length), lr(t2, t2.g.end()), lr(t2, n2);
      }
      function mr(t2, e2, n2, r2) {
        null != n2 && (e2 = dr(t2, e2), r2(n2, t2), pr(t2, e2));
      }
      function yr() {
        const t2 = class {
          constructor() {
            throw Error();
          }
        };
        return Object.setPrototypeOf(t2, t2.prototype), t2;
      }
      var _r = yr();
      var vr = yr();
      var Er = yr();
      var wr = yr();
      var Tr = yr();
      var Ar = yr();
      var br = yr();
      var kr = yr();
      var xr = yr();
      var Sr = yr();
      function Lr(t2, e2, n2) {
        var r2 = t2.v;
        W && W in r2 && (r2 = r2[W]) && delete r2[e2.g], e2.h ? e2.j(t2, e2.h, e2.g, n2, e2.l) : e2.j(t2, e2.g, n2, e2.l);
      }
      var Rr = class {
        constructor(t2, e2) {
          this.v = De(t2, e2, void 0, 2048);
        }
        toJSON() {
          return Ne(this);
        }
        j() {
          var t2 = Lo, e2 = this.v, n2 = t2.g, r2 = W;
          if (G && r2 && null != e2[r2]?.[n2] && D(z, 3), e2 = t2.g, J && W && void 0 === J && (r2 = (n2 = this.v)[W]) && (r2 = r2.da)) try {
            r2(n2, e2, Re);
          } catch (t3) {
            l(t3);
          }
          return t2.h ? t2.m(this, t2.h, t2.g, t2.l) : t2.m(this, t2.g, t2.defaultValue, t2.l);
        }
        clone() {
          const t2 = this.v, e2 = 0 | t2[tt];
          return Ye(this, t2, e2) ? je(this, t2, true) : new this.constructor(Xe(t2, e2, false));
        }
      };
      Rr.prototype[$] = at, Rr.prototype.toString = function() {
        return this.v.toString();
      };
      var Ir = class {
        constructor(t2, e2, n2) {
          this.g = t2, this.h = e2, t2 = _r, this.l = !!t2 && n2 === t2 || false;
        }
      };
      function Fr(t2, e2) {
        return new Ir(t2, e2, _r);
      }
      function Pr(t2, e2, n2, r2, i2) {
        mr(t2, n2, Hr(e2, r2), i2);
      }
      var Mr = Fr((function(t2, e2, n2, r2, i2) {
        return 2 === t2.h && (qn(t2, mn(e2, r2, n2), i2), true);
      }), Pr);
      var Or = Fr((function(t2, e2, n2, r2, i2) {
        return 2 === t2.h && (qn(t2, mn(e2, r2, n2), i2), true);
      }), Pr);
      var Cr = /* @__PURE__ */ Symbol();
      var Nr = /* @__PURE__ */ Symbol();
      var Ur = /* @__PURE__ */ Symbol();
      var Dr = /* @__PURE__ */ Symbol();
      var Br = /* @__PURE__ */ Symbol();
      var Gr;
      var jr;
      function Vr(t2, e2, n2, r2) {
        var i2 = r2[t2];
        if (i2) return i2;
        (i2 = {}).qa = r2, i2.T = (function(t3) {
          switch (typeof t3) {
            case "boolean":
              return Oe ||= [0, void 0, true];
            case "number":
              return t3 > 0 ? void 0 : 0 === t3 ? Ce ||= [0, void 0] : [-t3, void 0];
            case "string":
              return [0, t3];
            case "object":
              return t3;
          }
        })(r2[0]);
        var s2 = r2[1];
        let o2 = 1;
        s2 && s2.constructor === Object && (i2.ba = s2, "function" == typeof (s2 = r2[++o2]) && (i2.ma = true, Gr ??= s2, jr ??= r2[o2 + 1], s2 = r2[o2 += 2]));
        const a2 = {};
        for (; s2 && Array.isArray(s2) && s2.length && "number" == typeof s2[0] && s2[0] > 0; ) {
          for (var c2 = 0; c2 < s2.length; c2++) a2[s2[c2]] = s2;
          s2 = r2[++o2];
        }
        for (c2 = 1; void 0 !== s2; ) {
          let t3;
          "number" == typeof s2 && (c2 += s2, s2 = r2[++o2]);
          var h2 = void 0;
          if (s2 instanceof Ir ? t3 = s2 : (t3 = Mr, o2--), t3?.l) {
            s2 = r2[++o2], h2 = r2;
            var u2 = o2;
            "function" == typeof s2 && (s2 = s2(), h2[u2] = s2), h2 = s2;
          }
          for (u2 = c2 + 1, "number" == typeof (s2 = r2[++o2]) && s2 < 0 && (u2 -= s2, s2 = r2[++o2]); c2 < u2; c2++) {
            const r3 = a2[c2];
            h2 ? n2(i2, c2, t3, h2, r3) : e2(i2, c2, t3, r3);
          }
        }
        return r2[t2] = i2;
      }
      function Xr(t2) {
        return Array.isArray(t2) ? t2[0] instanceof Ir ? t2 : [Or, t2] : [t2, void 0];
      }
      function Hr(t2, e2) {
        return t2 instanceof Rr ? t2.v : Array.isArray(t2) ? Ue(t2, e2) : void 0;
      }
      function Wr(t2, e2, n2, r2) {
        const i2 = n2.g;
        t2[e2] = r2 ? (t3, e3, n3) => i2(t3, e3, n3, r2) : i2;
      }
      function zr(t2, e2, n2, r2, i2) {
        const s2 = n2.g;
        let o2, a2;
        t2[e2] = (t3, e3, n3) => s2(t3, e3, n3, a2 ||= Vr(Nr, Wr, zr, r2).T, o2 ||= Kr(r2), i2);
      }
      function Kr(t2) {
        let e2 = t2[Ur];
        if (null != e2) return e2;
        const n2 = Vr(Nr, Wr, zr, t2);
        return e2 = n2.ma ? (t3, e3) => Gr(t3, e3, n2) : (t3, e3) => {
          for (; Kn(e3) && 4 != e3.h; ) {
            var r2 = e3.l, i2 = n2[r2];
            if (null == i2) {
              var s2 = n2.ba;
              s2 && (s2 = s2[r2]) && (null != (s2 = qr(s2)) && (i2 = n2[r2] = s2));
            }
            if (null == i2 || !i2(e3, t3, r2)) {
              if (i2 = (s2 = e3).m, Yn(s2), s2.ha) var o2 = void 0;
              else o2 = s2.g.g - i2, s2.g.g = i2, o2 = Xn(s2.g, o2);
              i2 = void 0, s2 = t3, o2 && ((i2 = s2[W] ?? (s2[W] = new Le()))[r2] ?? (i2[r2] = [])).push(o2);
            }
          }
          return (t3 = xe(t3)) && (t3.da = n2.qa[Br]), true;
        }, t2[Ur] = e2, t2[Br] = Yr.bind(t2), e2;
      }
      function Yr(t2, e2, n2, r2) {
        var i2 = this[Nr];
        const s2 = this[Ur], o2 = Ue(void 0, i2.T), a2 = xe(t2);
        if (a2) {
          var c2 = false, h2 = i2.ba;
          if (h2) {
            if (i2 = (e3, n3, i3) => {
              if (0 !== i3.length) if (h2[n3]) for (const t3 of i3) {
                e3 = Wn(t3);
                try {
                  c2 = true, s2(o2, e3);
                } finally {
                  zn(e3);
                }
              }
              else r2?.(t2, n3, i3);
            }, null == e2) Se(a2, i2);
            else if (null != a2) {
              const t3 = a2[e2];
              t3 && i2(a2, e2, t3);
            }
            if (c2) {
              let r3 = 0 | t2[tt];
              if (2 & r3 && 2048 & r3 && !n2?.Ka) throw Error();
              const i3 = gt(r3), s3 = (e3, s4) => {
                if (null != Ze(t2, e3, i3)) {
                  if (1 === n2?.Qa) return;
                  throw Error();
                }
                null != s4 && (r3 = tn(t2, r3, e3, s4, i3)), delete a2[e3];
              };
              null == e2 ? dt(o2, 0 | o2[tt], ((t3, e3) => {
                s3(t3, e3);
              })) : s3(e2, Ze(o2, e2, i3));
            }
          }
        }
      }
      function qr(t2) {
        const e2 = (t2 = Xr(t2))[0].g;
        if (t2 = t2[1]) {
          const n2 = Kr(t2), r2 = Vr(Nr, Wr, zr, t2).T;
          return (t3, i2, s2) => e2(t3, i2, s2, r2, n2);
        }
        return e2;
      }
      function $r(t2, e2, n2) {
        t2[e2] = n2.h;
      }
      function Jr(t2, e2, n2, r2) {
        let i2, s2;
        const o2 = n2.h;
        t2[e2] = (t3, e3, n3) => o2(t3, e3, n3, s2 ||= Vr(Cr, $r, Jr, r2).T, i2 ||= Zr(r2));
      }
      function Zr(t2) {
        let e2 = t2[Dr];
        if (!e2) {
          const n2 = Vr(Cr, $r, Jr, t2);
          e2 = (t3, e3) => Qr(t3, e3, n2), t2[Dr] = e2;
        }
        return e2;
      }
      function Qr(t2, e2, n2) {
        dt(t2, 0 | t2[tt], ((t3, r2) => {
          if (null != r2) {
            var i2 = (function(t4, e3) {
              var n3 = t4[e3];
              if (n3) return n3;
              if ((n3 = t4.ba) && (n3 = n3[e3])) {
                var r3 = (n3 = Xr(n3))[0].h;
                if (n3 = n3[1]) {
                  const e4 = Zr(n3), i3 = Vr(Cr, $r, Jr, n3).T;
                  n3 = t4.ma ? jr(i3, e4) : (t5, n4, s2) => r3(t5, n4, s2, i3, e4);
                } else n3 = r3;
                return t4[e3] = n3;
              }
            })(n2, t3);
            i2 ? i2(e2, r2, t3) : t3 < 500 || D(Y, 3);
          }
        })), (t2 = xe(t2)) && Se(t2, ((t3, n3, r2) => {
          for (lr(e2, e2.g.end()), t3 = 0; t3 < r2.length; t3++) lr(e2, F(r2[t3]) || new Uint8Array(0));
        }));
      }
      var ti = wt(0);
      function ei(t2, e2) {
        if (Array.isArray(e2)) {
          var n2 = 0 | e2[tt];
          if (4 & n2) return e2;
          for (var r2 = 0, i2 = 0; r2 < e2.length; r2++) {
            const n3 = t2(e2[r2]);
            null != n3 && (e2[i2++] = n3);
          }
          return i2 < r2 && (e2.length = i2), (t2 = -1537 & (5 | n2)) !== n2 && it(e2, t2), 2 & t2 && Object.freeze(e2), e2;
        }
      }
      function ni(t2, e2, n2) {
        return new Ir(t2, e2, n2);
      }
      function ri(t2, e2, n2) {
        return new Ir(t2, e2, n2);
      }
      function ii(t2, e2, n2) {
        tn(t2, 0 | t2[tt], e2, n2, gt(0 | t2[tt]));
      }
      var si = Fr((function(t2, e2, n2, r2, i2) {
        if (2 !== t2.h) return false;
        if (t2 = Xt(t2 = qn(t2, Ue([void 0, void 0], r2), i2)), i2 = gt(r2 = 0 | e2[tt]), 2 & r2) throw Error();
        let s2 = Ze(e2, n2, i2);
        if (s2 instanceof we) 0 != (2 & s2.J) ? (s2 = s2.V(), s2.push(t2), tn(e2, r2, n2, s2, i2)) : s2.Ma(t2);
        else if (Array.isArray(s2)) {
          var o2 = 0 | s2[tt];
          8192 & o2 || it(s2, o2 |= 8192), 2 & o2 && (s2 = hn(s2), tn(e2, r2, n2, s2, i2)), s2.push(t2);
        } else tn(e2, r2, n2, ot([t2]), i2);
        return true;
      }), (function(t2, e2, n2, r2, i2) {
        if (e2 instanceof we) e2.forEach(((e3, s2) => {
          mr(t2, n2, Ue([s2, e3], r2), i2);
        }));
        else if (Array.isArray(e2)) {
          for (let s2 = 0; s2 < e2.length; s2++) {
            const o2 = e2[s2];
            Array.isArray(o2) && mr(t2, n2, Ue(o2, r2), i2);
          }
          ot(e2);
        }
      }));
      function oi(t2, e2, n2) {
        null != (e2 = Jt(e2)) && (fr(t2, n2, 5), t2 = t2.g, Ot(e2), ur(t2));
      }
      function ai(t2, e2, n2) {
        if (e2 = (function(t3) {
          if (null == t3) return t3;
          const e3 = typeof t3;
          if ("bigint" === e3) return String(Ht(64, t3));
          if (ee(t3)) {
            if ("string" === e3) return oe(t3);
            if ("number" === e3) return se(t3);
          }
        })(e2), null != e2) {
          if ("string" == typeof e2) ir(e2);
          if (null != e2) switch (fr(t2, n2, 0), typeof e2) {
            case "number":
              t2 = t2.g, Mt(e2), ar(t2, It, Ft);
              break;
            case "bigint":
              n2 = BigInt.asUintN(64, e2), n2 = new sr(Number(n2 & BigInt(4294967295)), Number(n2 >> BigInt(32))), ar(t2.g, n2.h, n2.g);
              break;
            default:
              n2 = ir(e2), ar(t2.g, n2.h, n2.g);
          }
        }
      }
      function ci(t2, e2, n2) {
        null != (e2 = ne(e2)) && null != e2 && (fr(t2, n2, 0), hr(t2.g, e2));
      }
      function hi(t2, e2, n2) {
        null != (e2 = Qt(e2)) && (fr(t2, n2, 0), t2.g.g.push(e2 ? 1 : 0));
      }
      function ui(t2, e2, n2) {
        null != (e2 = fe(e2)) && gr(t2, n2, u(e2));
      }
      function li(t2, e2, n2, r2, i2) {
        mr(t2, n2, Hr(e2, r2), i2);
      }
      function fi(t2, e2, n2) {
        null != (e2 = null == e2 || "string" == typeof e2 || e2 instanceof P ? e2 : void 0) && gr(t2, n2, On(e2, true).buffer);
      }
      function di(t2, e2, n2) {
        null != (e2 = re(e2)) && null != e2 && (fr(t2, n2, 0), cr(t2.g, e2));
      }
      function pi(t2, e2, n2) {
        return (5 === t2.h || 2 === t2.h) && (e2 = ln(e2, 0 | e2[tt], n2), 2 == t2.h ? Zn(t2, Bn, e2) : e2.push(Bn(t2.g)), true);
      }
      var gi = ni((function(t2, e2, n2) {
        return 5 === t2.h && (ii(e2, n2, Bn(t2.g)), true);
      }), oi, kr);
      var mi = ri(pi, (function(t2, e2, n2) {
        if (null != (e2 = ei(Jt, e2))) for (let o2 = 0; o2 < e2.length; o2++) {
          var r2 = t2, i2 = n2, s2 = e2[o2];
          null != s2 && (fr(r2, i2, 5), r2 = r2.g, Ot(s2), ur(r2));
        }
      }), kr);
      var yi = ri(pi, (function(t2, e2, n2) {
        if (null != (e2 = ei(Jt, e2)) && e2.length) {
          fr(t2, n2, 2), cr(t2.g, 4 * e2.length);
          for (let r2 = 0; r2 < e2.length; r2++) n2 = t2.g, Ot(e2[r2]), ur(n2);
        }
      }), kr);
      var _i = ni((function(t2, e2, n2) {
        return 5 === t2.h && (ii(e2, n2, 0 === (t2 = Bn(t2.g)) ? void 0 : t2), true);
      }), oi, kr);
      var vi = ni((function(t2, e2, n2) {
        return 0 !== t2.h ? t2 = false : (ii(e2, n2, Cn(t2.g, Ut)), t2 = true), t2;
      }), ai, Ar);
      var Ei = ni((function(t2, e2, n2) {
        return 0 !== t2.h ? e2 = false : (ii(e2, n2, (t2 = Cn(t2.g, Ut)) === ti ? void 0 : t2), e2 = true), e2;
      }), ai, Ar);
      var wi = ni((function(t2, e2, n2) {
        return 0 !== t2.h ? t2 = false : (ii(e2, n2, Cn(t2.g, Nt)), t2 = true), t2;
      }), (function(t2, e2, n2) {
        if (e2 = (function(t3) {
          if (null == t3) return t3;
          var e3 = typeof t3;
          if ("bigint" === e3) return String(Wt(64, t3));
          if (ee(t3)) {
            if ("string" === e3) return e3 = Yt(Number(t3)), zt(e3) && e3 >= 0 ? t3 = String(e3) : (-1 !== (e3 = t3.indexOf(".")) && (t3 = t3.substring(0, e3)), (e3 = "-" !== t3[0] && ((e3 = t3.length) < 20 || 20 === e3 && t3 <= "18446744073709551615")) || (jt(t3), t3 = Dt(It, Ft))), t3;
            if ("number" === e3) return (t3 = Yt(t3)) >= 0 && zt(t3) || (Mt(t3), t3 = Ct(It, Ft)), t3;
          }
        })(e2), null != e2) {
          if ("string" == typeof e2) er(e2);
          if (null != e2) switch (fr(t2, n2, 0), typeof e2) {
            case "number":
              t2 = t2.g, Mt(e2), ar(t2, It, Ft);
              break;
            case "bigint":
              n2 = BigInt.asUintN(64, e2), n2 = new nr(Number(n2 & BigInt(4294967295)), Number(n2 >> BigInt(32))), ar(t2.g, n2.h, n2.g);
              break;
            default:
              n2 = er(e2), ar(t2.g, n2.h, n2.g);
          }
        }
      }), br);
      var Ti = ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, Un(t2.g)), true);
      }), ci, wr);
      var Ai = ri((function(t2, e2, n2) {
        return (0 === t2.h || 2 === t2.h) && (e2 = ln(e2, 0 | e2[tt], n2), 2 == t2.h ? Zn(t2, Un, e2) : e2.push(Un(t2.g)), true);
      }), (function(t2, e2, n2) {
        if (null != (e2 = ei(ne, e2)) && e2.length) {
          n2 = dr(t2, n2);
          for (let n3 = 0; n3 < e2.length; n3++) hr(t2.g, e2[n3]);
          pr(t2, n2);
        }
      }), wr);
      var bi = ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, 0 === (t2 = Un(t2.g)) ? void 0 : t2), true);
      }), ci, wr);
      var ki = ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, Nn(t2.g)), true);
      }), hi, vr);
      var xi = ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, false === (t2 = Nn(t2.g)) ? void 0 : t2), true);
      }), hi, vr);
      var Si = ri((function(t2, e2, n2) {
        return 2 === t2.h && (t2 = $n(t2), ln(e2, 0 | e2[tt], n2).push(t2), true);
      }), (function(t2, e2, n2) {
        if (null != (e2 = ei(fe, e2))) for (let o2 = 0; o2 < e2.length; o2++) {
          var r2 = t2, i2 = n2, s2 = e2[o2];
          null != s2 && gr(r2, i2, u(s2));
        }
      }), Er);
      var Li = ni((function(t2, e2, n2) {
        return 2 === t2.h && (ii(e2, n2, "" === (t2 = $n(t2)) ? void 0 : t2), true);
      }), ui, Er);
      var Ri = ni((function(t2, e2, n2) {
        return 2 === t2.h && (ii(e2, n2, $n(t2)), true);
      }), ui, Er);
      var Ii = (function(t2, e2, n2 = _r) {
        return new Ir(t2, e2, n2);
      })((function(t2, e2, n2, r2, i2) {
        return 2 === t2.h && (r2 = Ue(void 0, r2), ln(e2, 0 | e2[tt], n2).push(r2), qn(t2, r2, i2), true);
      }), (function(t2, e2, n2, r2, i2) {
        if (Array.isArray(e2)) {
          for (let s2 = 0; s2 < e2.length; s2++) li(t2, e2[s2], n2, r2, i2);
          1 & (t2 = 0 | e2[tt]) || it(e2, 1 | t2);
        }
      }));
      var Fi = Fr((function(t2, e2, n2, r2, i2, s2) {
        if (2 !== t2.h) return false;
        let o2 = 0 | e2[tt];
        return pn(e2, o2, s2, n2, gt(o2)), qn(t2, e2 = mn(e2, r2, n2), i2), true;
      }), li);
      var Pi = ni((function(t2, e2, n2) {
        return 2 === t2.h && (ii(e2, n2, Jn(t2)), true);
      }), fi, xr);
      var Mi = ri((function(t2, e2, n2) {
        return (0 === t2.h || 2 === t2.h) && (e2 = ln(e2, 0 | e2[tt], n2), 2 == t2.h ? Zn(t2, Dn, e2) : e2.push(Dn(t2.g)), true);
      }), (function(t2, e2, n2) {
        if (null != (e2 = ei(re, e2))) for (let o2 = 0; o2 < e2.length; o2++) {
          var r2 = t2, i2 = n2, s2 = e2[o2];
          null != s2 && (fr(r2, i2, 0), cr(r2.g, s2));
        }
      }), Tr);
      var Oi = ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, 0 === (t2 = Dn(t2.g)) ? void 0 : t2), true);
      }), di, Tr);
      var Ci = ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, Un(t2.g)), true);
      }), (function(t2, e2, n2) {
        null != (e2 = ne(e2)) && (e2 = parseInt(e2, 10), fr(t2, n2, 0), hr(t2.g, e2));
      }), Sr);
      var Ni = class {
        constructor(t2, e2) {
          var n2 = ts;
          this.g = t2, this.h = e2, this.m = _n, this.j = Tn, this.defaultValue = void 0, this.l = null != n2.Oa ? pt : void 0;
        }
        register() {
          y(this);
        }
      };
      function Ui(t2, e2) {
        return new Ni(t2, e2);
      }
      function Di(t2, e2) {
        return (n2, r2) => {
          {
            const s2 = { ea: true };
            r2 && Object.assign(s2, r2), n2 = Wn(n2, void 0, void 0, s2);
            try {
              const r3 = new t2(), s3 = r3.v;
              Kr(e2)(s3, n2);
              var i2 = r3;
            } finally {
              zn(n2);
            }
          }
          return i2;
        };
      }
      function Bi(t2) {
        return function() {
          const e2 = new class {
            constructor() {
              this.l = [], this.h = 0, this.g = new class {
                constructor() {
                  this.g = [];
                }
                length() {
                  return this.g.length;
                }
                end() {
                  const t3 = this.g;
                  return this.g = [], t3;
                }
              }();
            }
          }();
          Qr(this.v, e2, Vr(Cr, $r, Jr, t2)), lr(e2, e2.g.end());
          const n2 = new Uint8Array(e2.h), r2 = e2.l, i2 = r2.length;
          let s2 = 0;
          for (let t3 = 0; t3 < i2; t3++) {
            const e3 = r2[t3];
            n2.set(e3, s2), s2 += e3.length;
          }
          return e2.l = [n2], n2;
        };
      }
      var Gi = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var ji = [0, Li, ni((function(t2, e2, n2) {
        return 2 === t2.h && (ii(e2, n2, (t2 = Jn(t2)) === I() ? void 0 : t2), true);
      }), (function(t2, e2, n2) {
        if (null != e2) {
          if (e2 instanceof Rr) {
            const r2 = e2.Ra;
            return void (r2 ? (e2 = r2(e2), null != e2 && gr(t2, n2, On(e2, true).buffer)) : D(Y, 3));
          }
          if (Array.isArray(e2)) return void D(Y, 3);
        }
        fi(t2, e2, n2);
      }), xr)];
      var Vi;
      var Xi = globalThis.trustedTypes;
      function Hi(t2) {
        var e2;
        return void 0 === Vi && (Vi = (function() {
          let t3 = null;
          if (!Xi) return t3;
          try {
            const e3 = (t4) => t4;
            t3 = Xi.createPolicy("goog#html", { createHTML: e3, createScript: e3, createScriptURL: e3 });
          } catch (t4) {
          }
          return t3;
        })()), t2 = (e2 = Vi) ? e2.createScriptURL(t2) : t2, new class {
          constructor(t3) {
            this.g = t3;
          }
          toString() {
            return this.g + "";
          }
        }(t2);
      }
      function Wi(t2, ...e2) {
        if (0 === e2.length) return Hi(t2[0]);
        let n2 = t2[0];
        for (let r2 = 0; r2 < e2.length; r2++) n2 += encodeURIComponent(e2[r2]) + t2[r2 + 1];
        return Hi(n2);
      }
      var zi = [0, Ti, Ci, ki, -1, Ai, Ci, -1, ki];
      var Ki = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Yi = [0, ki, Ri, ki, Ci, -1, ri((function(t2, e2, n2) {
        return (0 === t2.h || 2 === t2.h) && (e2 = ln(e2, 0 | e2[tt], n2), 2 == t2.h ? Zn(t2, Gn, e2) : e2.push(Un(t2.g)), true);
      }), (function(t2, e2, n2) {
        if (null != (e2 = ei(ne, e2)) && e2.length) {
          n2 = dr(t2, n2);
          for (let n3 = 0; n3 < e2.length; n3++) hr(t2.g, e2[n3]);
          pr(t2, n2);
        }
      }), Sr), Ri, -1, [0, ki, -1], Ci, ki, -1];
      var qi = [0, 3, ki, -1, 2, [0, [2], Ti, Fi, [0, ni((function(t2, e2, n2) {
        return 0 === t2.h && (ii(e2, n2, Dn(t2.g)), true);
      }), di, Tr)]], [0, Ci, ki, Ci, ki, Ci, ki, Ri, -1], [0, [3, 4], Ri, -1, Fi, [0, Ti], Fi, [0, Ci]], [0]];
      var $i = [0, Ri, -2];
      var Ji = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Zi = [0];
      var Qi = [0, Ti, ki, 1, ki, -4];
      var ts = class extends Rr {
        constructor(t2) {
          super(t2, 2);
        }
      };
      var es = {};
      es[336783863] = [0, Ri, ki, -1, Ti, [0, [1, 2, 3, 4, 5, 6, 7, 8, 9], Fi, Zi, Fi, Yi, Fi, $i, Fi, Qi, Fi, zi, Fi, [0, Ri, -2], Fi, [0, Ri, Ci], Fi, qi, Fi, [0, Ci, -1, ki]], [0, Ri], ki, [0, [1, 3], [2, 4], Fi, [0, Ai], -1, Fi, [0, Si], -1, Ii, [0, Ri, -1]], Ri];
      var ns = [0, Ei, -1, xi, -3, Ei, Ai, Li, bi, Ei, -1, xi, bi, xi, -2, Li];
      function rs(t2, e2) {
        Pn(t2, 3, e2);
      }
      function is(t2, e2) {
        Pn(t2, 4, e2);
      }
      var ss = class extends Rr {
        constructor(t2) {
          super(t2, 500);
        }
        o(t2) {
          return Tn(this, 0, 7, t2);
        }
      };
      var os = [-1, {}];
      var as = [0, Ri, 1, os];
      var cs = [0, Ri, Si, os];
      function hs(t2, e2) {
        kn(t2, 1, ss, e2);
      }
      function us(t2, e2) {
        Pn(t2, 10, e2);
      }
      function ls(t2, e2) {
        Pn(t2, 15, e2);
      }
      var fs = class extends Rr {
        constructor(t2) {
          super(t2, 500);
        }
        o(t2) {
          return Tn(this, 0, 1001, t2);
        }
      };
      var ds = [-500, Ii, [-500, Li, -1, Si, -3, [-2, es, ki], Ii, ji, bi, -1, as, cs, Ii, [0, Li, xi], Li, ns, bi, Si, 987, Si], 4, Ii, [-500, Ri, -1, [-1, {}], 998, Ri], Ii, [-500, Ri, Si, -1, [-2, {}, ki], 997, Si, -1], bi, Ii, [-500, Ri, Si, os, 998, Si], Si, bi, as, cs, Ii, [0, Li, -1, os], Si, -2, ns, Li, -1, xi, [0, xi, Oi], 978, os, Ii, ji];
      fs.prototype.g = Bi(ds);
      var ps = Di(fs, ds);
      var gs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var ms = class extends Rr {
        constructor(t2) {
          super(t2);
        }
        g() {
          return En(this, gs, 1);
        }
      };
      var ys = [0, Ii, [0, Ti, gi, Ri, -1]];
      var _s = Di(ms, ys);
      var vs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Es = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var ws = class extends Rr {
        constructor(t2) {
          super(t2);
        }
        l() {
          return _n(this, vs, 2);
        }
        g() {
          return En(this, Es, 5);
        }
      };
      var Ts = Di(class extends Rr {
        constructor(t2) {
          super(t2);
        }
      }, [0, Si, Ai, yi, [0, Ci, [0, Ti, -3], [0, gi, -3], [0, Ti, -1, [0, Ii, [0, Ti, -2]]], Ii, [0, gi, -1, Ri, gi]], Ri, -1, vi, Ii, [0, Ti, gi], Si, vi]);
      var As = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var bs = Di(class extends Rr {
        constructor(t2) {
          super(t2);
        }
      }, [0, Ii, [0, gi, -4]]);
      var ks = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var xs = Di(class extends Rr {
        constructor(t2) {
          super(t2);
        }
      }, [0, Ii, [0, gi, -4]]);
      var Ss = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Ls = [0, Ti, -1, yi, Ci];
      var Rs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      Rs.prototype.g = Bi([0, gi, -4, vi]);
      var Is = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Fs = Di(class extends Rr {
        constructor(t2) {
          super(t2);
        }
      }, [0, Ii, [0, 1, Ti, Ri, ys], vi]);
      var Ps = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Ms = class extends Rr {
        constructor(t2) {
          super(t2);
        }
        na() {
          const t2 = Je(this, 1, void 0, void 0, cn);
          return null == t2 ? I() : t2;
        }
      };
      var Os = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Cs = [1, 2];
      var Ns = Di(class extends Rr {
        constructor(t2) {
          super(t2);
        }
      }, [0, Ii, [0, Cs, Fi, [0, yi], Fi, [0, Pi], Ti, Ri], vi]);
      var Us = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Ds = [0, Ri, Ti, gi, Si, -1];
      var Bs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Gs = [0, ki, -1];
      var js = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Vs = [1, 2, 3, 4, 5, 6];
      var Xs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
        g() {
          return null != Je(this, 1, void 0, void 0, cn);
        }
        l() {
          return null != fe(Je(this, 2));
        }
      };
      var Hs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
        g() {
          return Qt(Je(this, 2)) ?? false;
        }
      };
      var Ws = [0, Pi, Ri, [0, Ti, vi, -1], [0, wi, vi]];
      var zs = [0, Ws, ki, [0, Vs, Fi, Qi, Fi, Yi, Fi, zi, Fi, Zi, Fi, $i, Fi, qi], Ci];
      var Ks = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Ys = [0, zs, gi, -1, Ti];
      var qs = Ui(502141897, Ks);
      es[502141897] = Ys;
      var $s = Di(class extends Rr {
        constructor(t2) {
          super(t2);
        }
      }, [0, [0, Ci, -1, mi, Mi], Ls]);
      var Js = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Zs = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Qs = [0, zs, gi, [0, zs], ki];
      var to = Ui(508968150, Zs);
      es[508968150] = [0, zs, Ys, Qs, gi, [0, [0, Ws]]], es[508968149] = Qs;
      var eo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
        l() {
          return _n(this, Us, 2);
        }
        g() {
          Qe(this, 2);
        }
      };
      var no = [0, zs, Ds];
      es[478825465] = no;
      var ro = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var io = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var so = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var oo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var ao = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var co = [0, zs, [0, zs], no, -1];
      var ho = [0, zs, gi, Ti];
      var uo = [0, zs, gi];
      var lo = [0, zs, ho, uo, gi];
      var fo = Ui(479097054, ao);
      es[479097054] = [0, zs, lo, co], es[463370452] = co, es[464864288] = ho;
      var po = Ui(462713202, oo);
      es[462713202] = lo, es[474472470] = uo;
      var go = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var mo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var yo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var _o = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var vo = [0, zs, gi, -1, Ti];
      var Eo = [0, zs, gi, ki];
      _o.prototype.g = Bi([0, zs, uo, [0, zs], Ys, Qs, vo, Eo]);
      var wo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var To = Ui(456383383, wo);
      es[456383383] = [0, zs, Ds];
      var Ao = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var bo = Ui(476348187, Ao);
      es[476348187] = [0, zs, Gs];
      var ko = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var xo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var So = [0, Ci, -1];
      var Lo = Ui(458105876, class extends Rr {
        constructor(t2) {
          super(t2);
        }
        g() {
          let t2;
          var e2 = this.v;
          const n2 = 0 | e2[tt];
          return t2 = ct(this, n2), e2 = (function(t3, e3, n3, r2) {
            var i2 = xo;
            !r2 && We(t3) && (n3 = 0 | (e3 = t3.v)[tt]);
            var s2 = Ze(e3, 2);
            if (t3 = false, null == s2) {
              if (r2) return ke();
              s2 = [];
            } else if (s2.constructor === we) {
              if (!(2 & s2.J) || r2) return s2;
              s2 = s2.V();
            } else Array.isArray(s2) ? t3 = !!(2 & (0 | s2[tt])) : s2 = [];
            if (r2) {
              if (!s2.length) return ke();
              t3 || (t3 = true, st(s2));
            } else t3 && (t3 = false, ot(s2), s2 = hn(s2));
            return !t3 && 32 & n3 && rt(s2, 32), n3 = tn(e3, n3, 2, r2 = new we(s2, i2, pe, void 0)), t3 || Ke(e3, n3), r2;
          })(this, e2, n2, t2), !t2 && xo && (e2.ra = true), e2;
        }
      });
      es[458105876] = [0, So, si, [true, vi, [0, Ri, -1, Si]], [0, Ai, ki, Ci]];
      var Ro = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Io = Ui(458105758, Ro);
      es[458105758] = [0, zs, Ri, So];
      var Fo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Po = [0, _i, -1, xi];
      var Mo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Oo = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Co = [1, 2];
      Oo.prototype.g = Bi([0, Co, Fi, Po, Fi, [0, Ii, Po]]);
      var No = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Uo = Ui(443442058, No);
      es[443442058] = [0, zs, Ri, Ti, gi, Si, -1, ki, gi], es[514774813] = vo;
      var Do = class extends Rr {
        constructor(t2) {
          super(t2);
        }
      };
      var Bo = Ui(516587230, Do);
      function Go(t2, e2) {
        return e2 = e2 ? e2.clone() : new Us(), void 0 !== t2.displayNamesLocale ? Qe(e2, 1, le(t2.displayNamesLocale)) : void 0 === t2.displayNamesLocale && Qe(e2, 1), void 0 !== t2.maxResults ? Ln(e2, 2, t2.maxResults) : "maxResults" in t2 && Qe(e2, 2), void 0 !== t2.scoreThreshold ? Rn(e2, 3, t2.scoreThreshold) : "scoreThreshold" in t2 && Qe(e2, 3), void 0 !== t2.categoryAllowlist ? Fn(e2, 4, t2.categoryAllowlist) : "categoryAllowlist" in t2 && Qe(e2, 4), void 0 !== t2.categoryDenylist ? Fn(e2, 5, t2.categoryDenylist) : "categoryDenylist" in t2 && Qe(e2, 5), e2;
      }
      function jo(t2) {
        const e2 = Number(t2);
        return Number.isSafeInteger(e2) ? e2 : String(t2);
      }
      function Vo(t2, e2 = -1, n2 = "") {
        return { categories: t2.map(((t3) => ({ index: xn(t3, 1) ?? 0 ?? -1, score: Sn(t3, 2) ?? 0, categoryName: fe(Je(t3, 3)) ?? "" ?? "", displayName: fe(Je(t3, 4)) ?? "" ?? "" }))), headIndex: e2, headName: n2 };
      }
      function Xo(t2) {
        const e2 = { classifications: En(t2, Is, 1).map(((t3) => Vo(_n(t3, ms, 4)?.g() ?? [], xn(t3, 2) ?? 0, fe(Je(t3, 3)) ?? ""))) };
        return null != (function(t3) {
          return null == t3 ? t3 : "bigint" == typeof t3 ? (Tt(t3) ? t3 = Number(t3) : (t3 = Ht(64, t3), t3 = Tt(t3) ? Number(t3) : String(t3)), t3) : ee(t3) ? "number" == typeof t3 ? se(t3) : oe(t3) : void 0;
        })(Je(t2, 2, void 0, void 0, he)) && (e2.timestampMs = jo(Je(t2, 2, void 0, void 0, he) ?? qe)), e2;
      }
      function Ho(t2) {
        var e2 = nn(t2, 3, Jt, en()), n2 = nn(t2, 2, ne, en()), r2 = nn(t2, 1, fe, en()), i2 = nn(t2, 9, fe, en());
        const s2 = { categories: [], keypoints: [] };
        for (let t3 = 0; t3 < e2.length; t3++) s2.categories.push({ score: e2[t3], index: n2[t3] ?? -1, categoryName: r2[t3] ?? "", displayName: i2[t3] ?? "" });
        if ((e2 = _n(t2, ws, 4)?.l()) && (s2.boundingBox = { originX: xn(e2, 1, $e) ?? 0, originY: xn(e2, 2, $e) ?? 0, width: xn(e2, 3, $e) ?? 0, height: xn(e2, 4, $e) ?? 0, angle: 0 }), _n(t2, ws, 4)?.g().length) for (const e3 of _n(t2, ws, 4).g()) s2.keypoints.push({ x: Je(e3, 1, void 0, $e, Jt) ?? 0, y: Je(e3, 2, void 0, $e, Jt) ?? 0, score: Je(e3, 4, void 0, $e, Jt) ?? 0, label: fe(Je(e3, 3, void 0, $e)) ?? "" });
        return s2;
      }
      function Wo(t2) {
        const e2 = [];
        for (const n2 of En(t2, ks, 1)) e2.push({ x: Sn(n2, 1) ?? 0, y: Sn(n2, 2) ?? 0, z: Sn(n2, 3) ?? 0, visibility: Sn(n2, 4) ?? 0 });
        return e2;
      }
      function zo(t2) {
        const e2 = [];
        for (const n2 of En(t2, As, 1)) e2.push({ x: Sn(n2, 1) ?? 0, y: Sn(n2, 2) ?? 0, z: Sn(n2, 3) ?? 0, visibility: Sn(n2, 4) ?? 0 });
        return e2;
      }
      function Ko(t2) {
        return Array.from(t2, ((t3) => t3 > 127 ? t3 - 256 : t3));
      }
      function Yo(t2, e2) {
        if (t2.length !== e2.length) throw Error(`Cannot compute cosine similarity between embeddings of different sizes (${t2.length} vs. ${e2.length}).`);
        let n2 = 0, r2 = 0, i2 = 0;
        for (let s2 = 0; s2 < t2.length; s2++) n2 += t2[s2] * e2[s2], r2 += t2[s2] * t2[s2], i2 += e2[s2] * e2[s2];
        if (r2 <= 0 || i2 <= 0) throw Error("Cannot compute cosine similarity on embedding with 0 norm.");
        return n2 / Math.sqrt(r2 * i2);
      }
      var qo;
      es[516587230] = [0, zs, vo, Eo, gi], es[518928384] = Eo;
      var $o = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
      async function Jo(t2) {
        if (t2) return true;
        if (void 0 === qo) try {
          await WebAssembly.instantiate($o), qo = true;
        } catch {
          qo = false;
        }
        return qo;
      }
      async function Zo(t2, e2, n2) {
        return { wasmLoaderPath: `${e2}/${t2}_${n2 = `wasm${n2 ? "_module" : ""}${await Jo(n2) ? "" : "_nosimd"}_internal`}.js`, wasmBinaryPath: `${e2}/${t2}_${n2}.wasm` };
      }
      var Qo = class {
      };
      function ta() {
        var t2 = navigator;
        return "undefined" != typeof OffscreenCanvas && (!(function(t3 = navigator) {
          return (t3 = t3.userAgent).includes("Safari") && !t3.includes("Chrome");
        })(t2) || !!((t2 = t2.userAgent.match(/Version\/([\d]+).*Safari/)) && t2.length >= 1 && Number(t2[1]) >= 17));
      }
      async function ea(e2) {
        if ("function" != typeof importScripts) {
          const t2 = document.createElement("script");
          return t2.src = e2.toString(), t2.crossOrigin = "anonymous", new Promise(((e3, n2) => {
            t2.addEventListener("load", (() => {
              e3();
            }), false), t2.addEventListener("error", ((t3) => {
              n2(t3);
            }), false), document.body.appendChild(t2);
          }));
        }
        try {
          importScripts(e2.toString());
        } catch (n2) {
          if (!(n2 instanceof TypeError)) throw n2;
          {
            const n3 = self.import;
            n3 ? await n3(e2.toString()) : await (function(e3) {
              return Promise.resolve().then((function() {
                return t(__require(e3));
              }));
            })(e2.toString());
          }
        }
      }
      function na(t2) {
        return void 0 !== t2.videoWidth ? [t2.videoWidth, t2.videoHeight] : void 0 !== t2.naturalWidth ? [t2.naturalWidth, t2.naturalHeight] : void 0 !== t2.displayWidth ? [t2.displayWidth, t2.displayHeight] : [t2.width, t2.height];
      }
      function ra(t2, e2, n2) {
        t2.m || console.error("No wasm multistream support detected: ensure dependency inclusion of :gl_graph_runner_internal_multi_input target"), n2(e2 = t2.i.stringToNewUTF8(e2)), t2.i._free(e2);
      }
      function ia(t2, e2, n2) {
        if (!t2.i.canvas) throw Error("No OpenGL canvas configured.");
        if (n2 ? t2.i._bindTextureToStream(n2) : t2.i._bindTextureToCanvas(), !(n2 = t2.i.canvas.getContext("webgl2") || t2.i.canvas.getContext("webgl"))) throw Error("Failed to obtain WebGL context from the provided canvas. `getContext()` should only be invoked with `webgl` or `webgl2`.");
        t2.i.gpuOriginForWebTexturesIsBottomLeft && n2.pixelStorei(n2.UNPACK_FLIP_Y_WEBGL, true), n2.texImage2D(n2.TEXTURE_2D, 0, n2.RGBA, n2.RGBA, n2.UNSIGNED_BYTE, e2), t2.i.gpuOriginForWebTexturesIsBottomLeft && n2.pixelStorei(n2.UNPACK_FLIP_Y_WEBGL, false);
        const [r2, i2] = na(e2);
        return !t2.l || r2 === t2.i.canvas.width && i2 === t2.i.canvas.height || (t2.i.canvas.width = r2, t2.i.canvas.height = i2), [r2, i2];
      }
      function sa(t2, e2, n2) {
        t2.m || console.error("No wasm multistream support detected: ensure dependency inclusion of :gl_graph_runner_internal_multi_input target");
        const r2 = new Uint32Array(e2.length);
        for (let n3 = 0; n3 < e2.length; n3++) r2[n3] = t2.i.stringToNewUTF8(e2[n3]);
        e2 = t2.i._malloc(4 * r2.length), t2.i.HEAPU32.set(r2, e2 >> 2), n2(e2);
        for (const e3 of r2) t2.i._free(e3);
        t2.i._free(e2);
      }
      function oa(t2, e2, n2) {
        t2.i.simpleListeners = t2.i.simpleListeners || {}, t2.i.simpleListeners[e2] = n2;
      }
      function aa(t2, e2, n2) {
        let r2 = [];
        t2.i.simpleListeners = t2.i.simpleListeners || {}, t2.i.simpleListeners[e2] = (t3, e3, i2) => {
          e3 ? (n2(r2, i2), r2 = []) : r2.push(t3);
        };
      }
      Qo.forVisionTasks = function(t2, e2 = false) {
        return Zo("vision", t2 ?? Wi``, e2);
      }, Qo.forTextTasks = function(t2, e2 = false) {
        return Zo("text", t2 ?? Wi``, e2);
      }, Qo.forGenAiTasks = function(t2, e2 = false) {
        return Zo("genai", t2 ?? Wi``, e2);
      }, Qo.forAudioTasks = function(t2, e2 = false) {
        return Zo("audio", t2 ?? Wi``, e2);
      }, Qo.isSimdSupported = function(t2 = false) {
        return Jo(t2);
      };
      async function ca(t2, e2, n2, r2) {
        return t2 = await (async (t3, e3, n3, r3, i2) => {
          if (e3 && await ea(e3), !self.ModuleFactory) throw Error("ModuleFactory not set.");
          if (n3 && (await ea(n3), !self.ModuleFactory)) throw Error("ModuleFactory not set.");
          return self.Module && i2 && ((e3 = self.Module).locateFile = i2.locateFile, i2.mainScriptUrlOrBlob && (e3.mainScriptUrlOrBlob = i2.mainScriptUrlOrBlob)), i2 = await self.ModuleFactory(self.Module || i2), self.ModuleFactory = self.Module = void 0, new t3(i2, r3);
        })(t2, n2.wasmLoaderPath, n2.assetLoaderPath, e2, { locateFile: (t3) => t3.endsWith(".wasm") ? n2.wasmBinaryPath.toString() : n2.assetBinaryPath && t3.endsWith(".data") ? n2.assetBinaryPath.toString() : t3 }), await t2.o(r2), t2;
      }
      function ha(t2, e2) {
        const n2 = _n(t2.baseOptions, Xs, 1) || new Xs();
        "string" == typeof e2 ? (Qe(n2, 2, le(e2)), Qe(n2, 1)) : e2 instanceof Uint8Array && (Qe(n2, 1, ut(e2, false)), Qe(n2, 2)), Tn(t2.baseOptions, 0, 1, n2);
      }
      function ua(t2) {
        try {
          const e2 = t2.H.length;
          if (1 === e2) throw Error(t2.H[0].message);
          if (e2 > 1) throw Error("Encountered multiple errors: " + t2.H.map(((t3) => t3.message)).join(", "));
        } finally {
          t2.H = [];
        }
      }
      function la(t2, e2) {
        t2.C = Math.max(t2.C, e2);
      }
      function fa(t2, e2) {
        t2.B = new ss(), In(t2.B, 2, "PassThroughCalculator"), rs(t2.B, "free_memory"), is(t2.B, "free_memory_unused_out"), us(e2, "free_memory"), hs(e2, t2.B);
      }
      function da(t2, e2) {
        rs(t2.B, e2), is(t2.B, e2 + "_unused_out");
      }
      function pa(t2) {
        t2.g.addBoolToStream(true, "free_memory", t2.C);
      }
      var ga = class {
        constructor(t2) {
          this.g = t2, this.H = [], this.C = 0, this.g.setAutoRenderToScreen(false);
        }
        l(t2, e2 = true) {
          if (e2) {
            const e3 = t2.baseOptions || {};
            if (t2.baseOptions?.modelAssetBuffer && t2.baseOptions?.modelAssetPath) throw Error("Cannot set both baseOptions.modelAssetPath and baseOptions.modelAssetBuffer");
            if (!(_n(this.baseOptions, Xs, 1)?.g() || _n(this.baseOptions, Xs, 1)?.l() || t2.baseOptions?.modelAssetBuffer || t2.baseOptions?.modelAssetPath)) throw Error("Either baseOptions.modelAssetPath or baseOptions.modelAssetBuffer must be set");
            if ((function(t3, e4) {
              let n2 = _n(t3.baseOptions, js, 3);
              if (!n2) {
                var r2 = n2 = new js(), i2 = new Ji();
                An(r2, 4, Vs, i2);
              }
              "delegate" in e4 && ("GPU" === e4.delegate ? (e4 = n2, r2 = new Ki(), An(e4, 2, Vs, r2)) : (e4 = n2, r2 = new Ji(), An(e4, 4, Vs, r2))), Tn(t3.baseOptions, 0, 3, n2);
            })(this, e3), e3.modelAssetPath) return fetch(e3.modelAssetPath.toString()).then(((t3) => {
              if (t3.ok) return t3.arrayBuffer();
              throw Error(`Failed to fetch model: ${e3.modelAssetPath} (${t3.status})`);
            })).then(((t3) => {
              try {
                this.g.i.FS_unlink("/model.dat");
              } catch {
              }
              this.g.i.FS_createDataFile("/", "model.dat", new Uint8Array(t3), true, false, false), ha(this, "/model.dat"), this.m(), this.L();
            }));
            if (e3.modelAssetBuffer instanceof Uint8Array) ha(this, e3.modelAssetBuffer);
            else if (e3.modelAssetBuffer) return (async function(t3) {
              const e4 = [];
              for (var n2 = 0; ; ) {
                const { done: r2, value: i2 } = await t3.read();
                if (r2) break;
                e4.push(i2), n2 += i2.length;
              }
              if (0 === e4.length) return new Uint8Array(0);
              if (1 === e4.length) return e4[0];
              t3 = new Uint8Array(n2), n2 = 0;
              for (const r2 of e4) t3.set(r2, n2), n2 += r2.length;
              return t3;
            })(e3.modelAssetBuffer).then(((t3) => {
              ha(this, t3), this.m(), this.L();
            }));
          }
          return this.m(), this.L(), Promise.resolve();
        }
        L() {
        }
        ca() {
          let t2;
          if (this.g.ca(((e2) => {
            t2 = ps(e2);
          })), !t2) throw Error("Failed to retrieve CalculatorGraphConfig");
          return t2;
        }
        setGraph(t2, e2) {
          this.g.attachErrorListener(((t3, e3) => {
            this.H.push(Error(e3));
          })), this.g.Ja(), this.g.setGraph(t2, e2), this.B = void 0, ua(this);
        }
        finishProcessing() {
          this.g.finishProcessing(), ua(this);
        }
        close() {
          this.B = void 0, this.g.closeGraph();
        }
      };
      function ma(t2, e2) {
        if (!t2) throw Error(`Unable to obtain required WebGL resource: ${e2}`);
        return t2;
      }
      ga.prototype.close = ga.prototype.close;
      var ya = class {
        constructor(t2, e2, n2, r2) {
          this.g = t2, this.h = e2, this.m = n2, this.l = r2;
        }
        bind() {
          this.g.bindVertexArray(this.h);
        }
        close() {
          this.g.deleteVertexArray(this.h), this.g.deleteBuffer(this.m), this.g.deleteBuffer(this.l);
        }
      };
      function _a(t2, e2, n2) {
        const r2 = t2.g;
        if (n2 = ma(r2.createShader(n2), "Failed to create WebGL shader"), r2.shaderSource(n2, e2), r2.compileShader(n2), !r2.getShaderParameter(n2, r2.COMPILE_STATUS)) throw Error(`Could not compile WebGL shader: ${r2.getShaderInfoLog(n2)}`);
        return r2.attachShader(t2.h, n2), n2;
      }
      function va(t2, e2) {
        const n2 = t2.g, r2 = ma(n2.createVertexArray(), "Failed to create vertex array");
        n2.bindVertexArray(r2);
        const i2 = ma(n2.createBuffer(), "Failed to create buffer");
        n2.bindBuffer(n2.ARRAY_BUFFER, i2), n2.enableVertexAttribArray(t2.O), n2.vertexAttribPointer(t2.O, 2, n2.FLOAT, false, 0, 0), n2.bufferData(n2.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), n2.STATIC_DRAW);
        const s2 = ma(n2.createBuffer(), "Failed to create buffer");
        return n2.bindBuffer(n2.ARRAY_BUFFER, s2), n2.enableVertexAttribArray(t2.L), n2.vertexAttribPointer(t2.L, 2, n2.FLOAT, false, 0, 0), n2.bufferData(n2.ARRAY_BUFFER, new Float32Array(e2 ? [0, 1, 0, 0, 1, 0, 1, 1] : [0, 0, 0, 1, 1, 1, 1, 0]), n2.STATIC_DRAW), n2.bindBuffer(n2.ARRAY_BUFFER, null), n2.bindVertexArray(null), new ya(n2, r2, i2, s2);
      }
      function Ea(t2, e2) {
        if (t2.g) {
          if (e2 !== t2.g) throw Error("Cannot change GL context once initialized");
        } else t2.g = e2;
      }
      function wa(t2, e2, n2, r2) {
        return Ea(t2, e2), t2.h || (t2.m(), t2.D()), n2 ? (t2.u || (t2.u = va(t2, true)), n2 = t2.u) : (t2.A || (t2.A = va(t2, false)), n2 = t2.A), e2.useProgram(t2.h), n2.bind(), t2.l(), t2 = r2(), n2.g.bindVertexArray(null), t2;
      }
      function Ta(t2, e2, n2) {
        return Ea(t2, e2), t2 = ma(e2.createTexture(), "Failed to create texture"), e2.bindTexture(e2.TEXTURE_2D, t2), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_S, e2.CLAMP_TO_EDGE), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_WRAP_T, e2.CLAMP_TO_EDGE), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MIN_FILTER, n2 ?? e2.LINEAR), e2.texParameteri(e2.TEXTURE_2D, e2.TEXTURE_MAG_FILTER, n2 ?? e2.LINEAR), e2.bindTexture(e2.TEXTURE_2D, null), t2;
      }
      function Aa(t2, e2, n2) {
        Ea(t2, e2), t2.B || (t2.B = ma(e2.createFramebuffer(), "Failed to create framebuffe.")), e2.bindFramebuffer(e2.FRAMEBUFFER, t2.B), e2.framebufferTexture2D(e2.FRAMEBUFFER, e2.COLOR_ATTACHMENT0, e2.TEXTURE_2D, n2, 0);
      }
      function ba(t2) {
        t2.g?.bindFramebuffer(t2.g.FRAMEBUFFER, null);
      }
      var ka = class {
        H() {
          return "\n  precision mediump float;\n  varying vec2 vTex;\n  uniform sampler2D inputTexture;\n  void main() {\n    gl_FragColor = texture2D(inputTexture, vTex);\n  }\n ";
        }
        m() {
          const t2 = this.g;
          if (this.h = ma(t2.createProgram(), "Failed to create WebGL program"), this.X = _a(this, "\n  attribute vec2 aVertex;\n  attribute vec2 aTex;\n  varying vec2 vTex;\n  void main(void) {\n    gl_Position = vec4(aVertex, 0.0, 1.0);\n    vTex = aTex;\n  }", t2.VERTEX_SHADER), this.W = _a(this, this.H(), t2.FRAGMENT_SHADER), t2.linkProgram(this.h), !t2.getProgramParameter(this.h, t2.LINK_STATUS)) throw Error(`Error during program linking: ${t2.getProgramInfoLog(this.h)}`);
          this.O = t2.getAttribLocation(this.h, "aVertex"), this.L = t2.getAttribLocation(this.h, "aTex");
        }
        D() {
        }
        l() {
        }
        close() {
          if (this.h) {
            const t2 = this.g;
            t2.deleteProgram(this.h), t2.deleteShader(this.X), t2.deleteShader(this.W);
          }
          this.B && this.g.deleteFramebuffer(this.B), this.A && this.A.close(), this.u && this.u.close();
        }
      };
      var xa = class extends ka {
        H() {
          return "\n  precision mediump float;\n  uniform sampler2D backgroundTexture;\n  uniform sampler2D maskTexture;\n  uniform sampler2D colorMappingTexture;\n  varying vec2 vTex;\n  void main() {\n    vec4 backgroundColor = texture2D(backgroundTexture, vTex);\n    float category = texture2D(maskTexture, vTex).r;\n    vec4 categoryColor = texture2D(colorMappingTexture, vec2(category, 0.0));\n    gl_FragColor = mix(backgroundColor, categoryColor, categoryColor.a);\n  }\n ";
        }
        D() {
          const t2 = this.g;
          t2.activeTexture(t2.TEXTURE1), this.C = Ta(this, t2, t2.LINEAR), t2.activeTexture(t2.TEXTURE2), this.j = Ta(this, t2, t2.NEAREST);
        }
        m() {
          super.m();
          const t2 = this.g;
          this.P = ma(t2.getUniformLocation(this.h, "backgroundTexture"), "Uniform location"), this.U = ma(t2.getUniformLocation(this.h, "colorMappingTexture"), "Uniform location"), this.M = ma(t2.getUniformLocation(this.h, "maskTexture"), "Uniform location");
        }
        l() {
          super.l();
          const t2 = this.g;
          t2.uniform1i(this.M, 0), t2.uniform1i(this.P, 1), t2.uniform1i(this.U, 2);
        }
        close() {
          this.C && this.g.deleteTexture(this.C), this.j && this.g.deleteTexture(this.j), super.close();
        }
      };
      var Sa = class extends ka {
        H() {
          return "\n  precision mediump float;\n  uniform sampler2D maskTexture;\n  uniform sampler2D defaultTexture;\n  uniform sampler2D overlayTexture;\n  varying vec2 vTex;\n  void main() {\n    float confidence = texture2D(maskTexture, vTex).r;\n    vec4 defaultColor = texture2D(defaultTexture, vTex);\n    vec4 overlayColor = texture2D(overlayTexture, vTex);\n    // Apply the alpha from the overlay and merge in the default color\n    overlayColor = mix(defaultColor, overlayColor, overlayColor.a);\n    gl_FragColor = mix(defaultColor, overlayColor, confidence);\n  }\n ";
        }
        D() {
          const t2 = this.g;
          t2.activeTexture(t2.TEXTURE1), this.j = Ta(this, t2), t2.activeTexture(t2.TEXTURE2), this.C = Ta(this, t2);
        }
        m() {
          super.m();
          const t2 = this.g;
          this.M = ma(t2.getUniformLocation(this.h, "defaultTexture"), "Uniform location"), this.P = ma(t2.getUniformLocation(this.h, "overlayTexture"), "Uniform location"), this.I = ma(t2.getUniformLocation(this.h, "maskTexture"), "Uniform location");
        }
        l() {
          super.l();
          const t2 = this.g;
          t2.uniform1i(this.I, 0), t2.uniform1i(this.M, 1), t2.uniform1i(this.P, 2);
        }
        close() {
          this.j && this.g.deleteTexture(this.j), this.C && this.g.deleteTexture(this.C), super.close();
        }
      };
      function La(t2, e2) {
        switch (e2) {
          case 0:
            return t2.g.find(((t3) => t3 instanceof Uint8Array));
          case 1:
            return t2.g.find(((t3) => t3 instanceof Float32Array));
          case 2:
            return t2.g.find(((t3) => "undefined" != typeof WebGLTexture && t3 instanceof WebGLTexture));
          default:
            throw Error(`Type is not supported: ${e2}`);
        }
      }
      function Ra(t2) {
        var e2 = La(t2, 1);
        if (!e2) {
          if (e2 = La(t2, 0)) e2 = new Float32Array(e2).map(((t3) => t3 / 255));
          else {
            e2 = new Float32Array(t2.width * t2.height);
            const r2 = Fa(t2);
            var n2 = Ma(t2);
            if (Aa(n2, r2, Ia(t2)), "iPad Simulator;iPhone Simulator;iPod Simulator;iPad;iPhone;iPod".split(";").includes(navigator.platform) || navigator.userAgent.includes("Mac") && "document" in self && "ontouchend" in self.document) {
              n2 = new Float32Array(t2.width * t2.height * 4), r2.readPixels(0, 0, t2.width, t2.height, r2.RGBA, r2.FLOAT, n2);
              for (let t3 = 0, r3 = 0; t3 < e2.length; ++t3, r3 += 4) e2[t3] = n2[r3];
            } else r2.readPixels(0, 0, t2.width, t2.height, r2.RED, r2.FLOAT, e2);
          }
          t2.g.push(e2);
        }
        return e2;
      }
      function Ia(t2) {
        let e2 = La(t2, 2);
        if (!e2) {
          const n2 = Fa(t2);
          e2 = Oa(t2);
          const r2 = Ra(t2), i2 = Pa(t2);
          n2.texImage2D(n2.TEXTURE_2D, 0, i2, t2.width, t2.height, 0, n2.RED, n2.FLOAT, r2), Ca(t2);
        }
        return e2;
      }
      function Fa(t2) {
        if (!t2.canvas) throw Error("Conversion to different image formats require that a canvas is passed when initializing the image.");
        return t2.h || (t2.h = ma(t2.canvas.getContext("webgl2"), "You cannot use a canvas that is already bound to a different type of rendering context.")), t2.h;
      }
      function Pa(t2) {
        if (t2 = Fa(t2), !Na) if (t2.getExtension("EXT_color_buffer_float") && t2.getExtension("OES_texture_float_linear") && t2.getExtension("EXT_float_blend")) Na = t2.R32F;
        else {
          if (!t2.getExtension("EXT_color_buffer_half_float")) throw Error("GPU does not fully support 4-channel float32 or float16 formats");
          Na = t2.R16F;
        }
        return Na;
      }
      function Ma(t2) {
        return t2.l || (t2.l = new ka()), t2.l;
      }
      function Oa(t2) {
        const e2 = Fa(t2);
        e2.viewport(0, 0, t2.width, t2.height), e2.activeTexture(e2.TEXTURE0);
        let n2 = La(t2, 2);
        return n2 || (n2 = Ta(Ma(t2), e2, t2.m ? e2.LINEAR : e2.NEAREST), t2.g.push(n2), t2.j = true), e2.bindTexture(e2.TEXTURE_2D, n2), n2;
      }
      function Ca(t2) {
        t2.h.bindTexture(t2.h.TEXTURE_2D, null);
      }
      var Na;
      var Ua = class {
        constructor(t2, e2, n2, r2, i2, s2, o2) {
          this.g = t2, this.m = e2, this.j = n2, this.canvas = r2, this.l = i2, this.width = s2, this.height = o2, this.j && (0 === --Da && console.error("You seem to be creating MPMask instances without invoking .close(). This leaks resources."));
        }
        Fa() {
          return !!La(this, 0);
        }
        ka() {
          return !!La(this, 1);
        }
        R() {
          return !!La(this, 2);
        }
        ja() {
          return (e2 = La(t2 = this, 0)) || (e2 = Ra(t2), e2 = new Uint8Array(e2.map(((t3) => Math.round(255 * t3)))), t2.g.push(e2)), e2;
          var t2, e2;
        }
        ia() {
          return Ra(this);
        }
        N() {
          return Ia(this);
        }
        clone() {
          const t2 = [];
          for (const e2 of this.g) {
            let n2;
            if (e2 instanceof Uint8Array) n2 = new Uint8Array(e2);
            else if (e2 instanceof Float32Array) n2 = new Float32Array(e2);
            else {
              if (!(e2 instanceof WebGLTexture)) throw Error(`Type is not supported: ${e2}`);
              {
                const t3 = Fa(this), e3 = Ma(this);
                t3.activeTexture(t3.TEXTURE1), n2 = Ta(e3, t3, this.m ? t3.LINEAR : t3.NEAREST), t3.bindTexture(t3.TEXTURE_2D, n2);
                const r2 = Pa(this);
                t3.texImage2D(t3.TEXTURE_2D, 0, r2, this.width, this.height, 0, t3.RED, t3.FLOAT, null), t3.bindTexture(t3.TEXTURE_2D, null), Aa(e3, t3, n2), wa(e3, t3, false, (() => {
                  Oa(this), t3.clearColor(0, 0, 0, 0), t3.clear(t3.COLOR_BUFFER_BIT), t3.drawArrays(t3.TRIANGLE_FAN, 0, 4), Ca(this);
                })), ba(e3), Ca(this);
              }
            }
            t2.push(n2);
          }
          return new Ua(t2, this.m, this.R(), this.canvas, this.l, this.width, this.height);
        }
        close() {
          this.j && Fa(this).deleteTexture(La(this, 2)), Da = -1;
        }
      };
      Ua.prototype.close = Ua.prototype.close, Ua.prototype.clone = Ua.prototype.clone, Ua.prototype.getAsWebGLTexture = Ua.prototype.N, Ua.prototype.getAsFloat32Array = Ua.prototype.ia, Ua.prototype.getAsUint8Array = Ua.prototype.ja, Ua.prototype.hasWebGLTexture = Ua.prototype.R, Ua.prototype.hasFloat32Array = Ua.prototype.ka, Ua.prototype.hasUint8Array = Ua.prototype.Fa;
      var Da = 250;
      var Ba = { color: "white", lineWidth: 4, radius: 6 };
      function Ga(t2) {
        return { ...Ba, fillColor: (t2 = t2 || {}).color, ...t2 };
      }
      function ja(t2, e2) {
        return t2 instanceof Function ? t2(e2) : t2;
      }
      function Va(t2, e2, n2) {
        return Math.max(Math.min(e2, n2), Math.min(Math.max(e2, n2), t2));
      }
      function Xa(t2) {
        if (!t2.l) throw Error("CPU rendering requested but CanvasRenderingContext2D not provided.");
        return t2.l;
      }
      function Ha(t2) {
        if (!t2.j) throw Error("GPU rendering requested but WebGL2RenderingContext not provided.");
        return t2.j;
      }
      function Wa(t2, e2, n2) {
        if (e2.R()) n2(e2.N());
        else {
          const r2 = e2.ka() ? e2.ia() : e2.ja();
          t2.m = t2.m ?? new ka();
          const i2 = Ha(t2);
          n2((t2 = new Ua([r2], e2.m, false, i2.canvas, t2.m, e2.width, e2.height)).N()), t2.close();
        }
      }
      function za(t2, e2, n2, r2) {
        const i2 = (function(t3) {
          return t3.g || (t3.g = new xa()), t3.g;
        })(t2), s2 = Ha(t2), o2 = Array.isArray(n2) ? new ImageData(new Uint8ClampedArray(n2), 1, 1) : n2;
        wa(i2, s2, true, (() => {
          !(function(t4, e3, n3, r3) {
            const i3 = t4.g;
            if (i3.activeTexture(i3.TEXTURE0), i3.bindTexture(i3.TEXTURE_2D, e3), i3.activeTexture(i3.TEXTURE1), i3.bindTexture(i3.TEXTURE_2D, t4.C), i3.texImage2D(i3.TEXTURE_2D, 0, i3.RGBA, i3.RGBA, i3.UNSIGNED_BYTE, n3), t4.I && (function(t5, e4) {
              if (t5 !== e4) return false;
              t5 = t5.entries(), e4 = e4.entries();
              for (const [n4, r4] of t5) {
                t5 = n4;
                const i4 = r4, s3 = e4.next();
                if (s3.done) return false;
                const [o3, a2] = s3.value;
                if (t5 !== o3 || i4[0] !== a2[0] || i4[1] !== a2[1] || i4[2] !== a2[2] || i4[3] !== a2[3]) return false;
              }
              return !!e4.next().done;
            })(t4.I, r3)) i3.activeTexture(i3.TEXTURE2), i3.bindTexture(i3.TEXTURE_2D, t4.j);
            else {
              t4.I = r3;
              const e4 = Array(1024).fill(0);
              r3.forEach(((t5, n4) => {
                if (4 !== t5.length) throw Error(`Color at index ${n4} is not a four-channel value.`);
                e4[4 * n4] = t5[0], e4[4 * n4 + 1] = t5[1], e4[4 * n4 + 2] = t5[2], e4[4 * n4 + 3] = t5[3];
              })), i3.activeTexture(i3.TEXTURE2), i3.bindTexture(i3.TEXTURE_2D, t4.j), i3.texImage2D(i3.TEXTURE_2D, 0, i3.RGBA, 256, 1, 0, i3.RGBA, i3.UNSIGNED_BYTE, new Uint8Array(e4));
            }
          })(i2, e2, o2, r2), s2.clearColor(0, 0, 0, 0), s2.clear(s2.COLOR_BUFFER_BIT), s2.drawArrays(s2.TRIANGLE_FAN, 0, 4);
          const t3 = i2.g;
          t3.activeTexture(t3.TEXTURE0), t3.bindTexture(t3.TEXTURE_2D, null), t3.activeTexture(t3.TEXTURE1), t3.bindTexture(t3.TEXTURE_2D, null), t3.activeTexture(t3.TEXTURE2), t3.bindTexture(t3.TEXTURE_2D, null);
        }));
      }
      function Ka(t2, e2, n2, r2) {
        const i2 = Ha(t2), s2 = (function(t3) {
          return t3.h || (t3.h = new Sa()), t3.h;
        })(t2), o2 = Array.isArray(n2) ? new ImageData(new Uint8ClampedArray(n2), 1, 1) : n2, a2 = Array.isArray(r2) ? new ImageData(new Uint8ClampedArray(r2), 1, 1) : r2;
        wa(s2, i2, true, (() => {
          var t3 = s2.g;
          t3.activeTexture(t3.TEXTURE0), t3.bindTexture(t3.TEXTURE_2D, e2), t3.activeTexture(t3.TEXTURE1), t3.bindTexture(t3.TEXTURE_2D, s2.j), t3.texImage2D(t3.TEXTURE_2D, 0, t3.RGBA, t3.RGBA, t3.UNSIGNED_BYTE, o2), t3.activeTexture(t3.TEXTURE2), t3.bindTexture(t3.TEXTURE_2D, s2.C), t3.texImage2D(t3.TEXTURE_2D, 0, t3.RGBA, t3.RGBA, t3.UNSIGNED_BYTE, a2), i2.clearColor(0, 0, 0, 0), i2.clear(i2.COLOR_BUFFER_BIT), i2.drawArrays(i2.TRIANGLE_FAN, 0, 4), i2.bindTexture(i2.TEXTURE_2D, null), (t3 = s2.g).activeTexture(t3.TEXTURE0), t3.bindTexture(t3.TEXTURE_2D, null), t3.activeTexture(t3.TEXTURE1), t3.bindTexture(t3.TEXTURE_2D, null), t3.activeTexture(t3.TEXTURE2), t3.bindTexture(t3.TEXTURE_2D, null);
        }));
      }
      var Ya = class {
        constructor(t2, e2) {
          "undefined" != typeof CanvasRenderingContext2D && t2 instanceof CanvasRenderingContext2D || t2 instanceof OffscreenCanvasRenderingContext2D ? (this.l = t2, this.j = e2) : this.j = t2;
        }
        ya(t2, e2) {
          if (t2) {
            var n2 = Xa(this);
            e2 = Ga(e2), n2.save();
            var r2 = n2.canvas, i2 = 0;
            for (const s2 of t2) n2.fillStyle = ja(e2.fillColor, { index: i2, from: s2 }), n2.strokeStyle = ja(e2.color, { index: i2, from: s2 }), n2.lineWidth = ja(e2.lineWidth, { index: i2, from: s2 }), (t2 = new Path2D()).arc(s2.x * r2.width, s2.y * r2.height, ja(e2.radius, { index: i2, from: s2 }), 0, 2 * Math.PI), n2.fill(t2), n2.stroke(t2), ++i2;
            n2.restore();
          }
        }
        xa(t2, e2, n2) {
          if (t2 && e2) {
            var r2 = Xa(this);
            n2 = Ga(n2), r2.save();
            var i2 = r2.canvas, s2 = 0;
            for (const o2 of e2) {
              r2.beginPath(), e2 = t2[o2.start];
              const a2 = t2[o2.end];
              e2 && a2 && (r2.strokeStyle = ja(n2.color, { index: s2, from: e2, to: a2 }), r2.lineWidth = ja(n2.lineWidth, { index: s2, from: e2, to: a2 }), r2.moveTo(e2.x * i2.width, e2.y * i2.height), r2.lineTo(a2.x * i2.width, a2.y * i2.height)), ++s2, r2.stroke();
            }
            r2.restore();
          }
        }
        ua(t2, e2) {
          const n2 = Xa(this);
          e2 = Ga(e2), n2.save(), n2.beginPath(), n2.lineWidth = ja(e2.lineWidth, {}), n2.strokeStyle = ja(e2.color, {}), n2.fillStyle = ja(e2.fillColor, {}), n2.moveTo(t2.originX, t2.originY), n2.lineTo(t2.originX + t2.width, t2.originY), n2.lineTo(t2.originX + t2.width, t2.originY + t2.height), n2.lineTo(t2.originX, t2.originY + t2.height), n2.lineTo(t2.originX, t2.originY), n2.stroke(), n2.fill(), n2.restore();
        }
        va(t2, e2, n2 = [0, 0, 0, 255]) {
          this.l ? (function(t3, e3, n3, r2) {
            const i2 = Ha(t3);
            Wa(t3, e3, ((e4) => {
              za(t3, e4, n3, r2), (e4 = Xa(t3)).drawImage(i2.canvas, 0, 0, e4.canvas.width, e4.canvas.height);
            }));
          })(this, t2, n2, e2) : za(this, t2.N(), n2, e2);
        }
        wa(t2, e2, n2) {
          this.l ? (function(t3, e3, n3, r2) {
            const i2 = Ha(t3);
            Wa(t3, e3, ((e4) => {
              Ka(t3, e4, n3, r2), (e4 = Xa(t3)).drawImage(i2.canvas, 0, 0, e4.canvas.width, e4.canvas.height);
            }));
          })(this, t2, e2, n2) : Ka(this, t2.N(), e2, n2);
        }
        close() {
          this.g?.close(), this.g = void 0, this.h?.close(), this.h = void 0, this.m?.close(), this.m = void 0;
        }
      };
      function qa(t2, e2) {
        switch (e2) {
          case 0:
            return t2.g.find(((t3) => t3 instanceof ImageData));
          case 1:
            return t2.g.find(((t3) => "undefined" != typeof ImageBitmap && t3 instanceof ImageBitmap));
          case 2:
            return t2.g.find(((t3) => "undefined" != typeof WebGLTexture && t3 instanceof WebGLTexture));
          default:
            throw Error(`Type is not supported: ${e2}`);
        }
      }
      function $a(t2) {
        var e2 = qa(t2, 0);
        if (!e2) {
          e2 = Za(t2);
          const n2 = Qa(t2), r2 = new Uint8Array(t2.width * t2.height * 4);
          Aa(n2, e2, Ja(t2)), e2.readPixels(0, 0, t2.width, t2.height, e2.RGBA, e2.UNSIGNED_BYTE, r2), ba(n2), e2 = new ImageData(new Uint8ClampedArray(r2.buffer), t2.width, t2.height), t2.g.push(e2);
        }
        return e2;
      }
      function Ja(t2) {
        let e2 = qa(t2, 2);
        if (!e2) {
          const n2 = Za(t2);
          e2 = tc(t2);
          const r2 = qa(t2, 1) || $a(t2);
          n2.texImage2D(n2.TEXTURE_2D, 0, n2.RGBA, n2.RGBA, n2.UNSIGNED_BYTE, r2), ec(t2);
        }
        return e2;
      }
      function Za(t2) {
        if (!t2.canvas) throw Error("Conversion to different image formats require that a canvas is passed when initializing the image.");
        return t2.h || (t2.h = ma(t2.canvas.getContext("webgl2"), "You cannot use a canvas that is already bound to a different type of rendering context.")), t2.h;
      }
      function Qa(t2) {
        return t2.l || (t2.l = new ka()), t2.l;
      }
      function tc(t2) {
        const e2 = Za(t2);
        e2.viewport(0, 0, t2.width, t2.height), e2.activeTexture(e2.TEXTURE0);
        let n2 = qa(t2, 2);
        return n2 || (n2 = Ta(Qa(t2), e2), t2.g.push(n2), t2.m = true), e2.bindTexture(e2.TEXTURE_2D, n2), n2;
      }
      function ec(t2) {
        t2.h.bindTexture(t2.h.TEXTURE_2D, null);
      }
      function nc(t2) {
        const e2 = Za(t2);
        return wa(Qa(t2), e2, true, (() => (function(t3, e3) {
          const n2 = t3.canvas;
          if (n2.width === t3.width && n2.height === t3.height) return e3();
          const r2 = n2.width, i2 = n2.height;
          return n2.width = t3.width, n2.height = t3.height, t3 = e3(), n2.width = r2, n2.height = i2, t3;
        })(t2, (() => {
          if (e2.bindFramebuffer(e2.FRAMEBUFFER, null), e2.clearColor(0, 0, 0, 0), e2.clear(e2.COLOR_BUFFER_BIT), e2.drawArrays(e2.TRIANGLE_FAN, 0, 4), !(t2.canvas instanceof OffscreenCanvas)) throw Error("Conversion to ImageBitmap requires that the MediaPipe Tasks is initialized with an OffscreenCanvas");
          return t2.canvas.transferToImageBitmap();
        }))));
      }
      Ya.prototype.close = Ya.prototype.close, Ya.prototype.drawConfidenceMask = Ya.prototype.wa, Ya.prototype.drawCategoryMask = Ya.prototype.va, Ya.prototype.drawBoundingBox = Ya.prototype.ua, Ya.prototype.drawConnectors = Ya.prototype.xa, Ya.prototype.drawLandmarks = Ya.prototype.ya, Ya.lerp = function(t2, e2, n2, r2, i2) {
        return Va(r2 * (1 - (t2 - e2) / (n2 - e2)) + i2 * (1 - (n2 - t2) / (n2 - e2)), r2, i2);
      }, Ya.clamp = Va;
      var rc = class {
        constructor(t2, e2, n2, r2, i2, s2, o2) {
          this.g = t2, this.j = e2, this.m = n2, this.canvas = r2, this.l = i2, this.width = s2, this.height = o2, (this.j || this.m) && (0 === --ic && console.error("You seem to be creating MPImage instances without invoking .close(). This leaks resources."));
        }
        Ea() {
          return !!qa(this, 0);
        }
        la() {
          return !!qa(this, 1);
        }
        R() {
          return !!qa(this, 2);
        }
        Ca() {
          return $a(this);
        }
        Ba() {
          var t2 = qa(this, 1);
          return t2 || (Ja(this), tc(this), t2 = nc(this), ec(this), this.g.push(t2), this.j = true), t2;
        }
        N() {
          return Ja(this);
        }
        clone() {
          const t2 = [];
          for (const e2 of this.g) {
            let n2;
            if (e2 instanceof ImageData) n2 = new ImageData(e2.data, this.width, this.height);
            else if (e2 instanceof WebGLTexture) {
              const t3 = Za(this), e3 = Qa(this);
              t3.activeTexture(t3.TEXTURE1), n2 = Ta(e3, t3), t3.bindTexture(t3.TEXTURE_2D, n2), t3.texImage2D(t3.TEXTURE_2D, 0, t3.RGBA, this.width, this.height, 0, t3.RGBA, t3.UNSIGNED_BYTE, null), t3.bindTexture(t3.TEXTURE_2D, null), Aa(e3, t3, n2), wa(e3, t3, false, (() => {
                tc(this), t3.clearColor(0, 0, 0, 0), t3.clear(t3.COLOR_BUFFER_BIT), t3.drawArrays(t3.TRIANGLE_FAN, 0, 4), ec(this);
              })), ba(e3), ec(this);
            } else {
              if (!(e2 instanceof ImageBitmap)) throw Error(`Type is not supported: ${e2}`);
              Ja(this), tc(this), n2 = nc(this), ec(this);
            }
            t2.push(n2);
          }
          return new rc(t2, this.la(), this.R(), this.canvas, this.l, this.width, this.height);
        }
        close() {
          this.j && qa(this, 1).close(), this.m && Za(this).deleteTexture(qa(this, 2)), ic = -1;
        }
      };
      rc.prototype.close = rc.prototype.close, rc.prototype.clone = rc.prototype.clone, rc.prototype.getAsWebGLTexture = rc.prototype.N, rc.prototype.getAsImageBitmap = rc.prototype.Ba, rc.prototype.getAsImageData = rc.prototype.Ca, rc.prototype.hasWebGLTexture = rc.prototype.R, rc.prototype.hasImageBitmap = rc.prototype.la, rc.prototype.hasImageData = rc.prototype.Ea;
      var ic = 250;
      function sc(...t2) {
        return t2.map((([t3, e2]) => ({ start: t3, end: e2 })));
      }
      var oc = /* @__PURE__ */ (function(t2) {
        return class extends t2 {
          Ja() {
            this.i._registerModelResourcesGraphService();
          }
        };
      })((ac = class {
        constructor(t2, e2) {
          this.l = true, this.i = t2, this.g = null, this.h = 0, this.m = "function" == typeof this.i._addIntToInputStream, void 0 !== e2 ? this.i.canvas = e2 : ta() ? this.i.canvas = new OffscreenCanvas(1, 1) : (console.warn("OffscreenCanvas not supported and GraphRunner constructor glCanvas parameter is undefined. Creating backup canvas."), this.i.canvas = document.createElement("canvas"));
        }
        async initializeGraph(t2) {
          const e2 = await (await fetch(t2)).arrayBuffer();
          t2 = !(t2.endsWith(".pbtxt") || t2.endsWith(".textproto")), this.setGraph(new Uint8Array(e2), t2);
        }
        setGraphFromString(t2) {
          this.setGraph(new TextEncoder().encode(t2), false);
        }
        setGraph(t2, e2) {
          const n2 = t2.length, r2 = this.i._malloc(n2);
          this.i.HEAPU8.set(t2, r2), e2 ? this.i._changeBinaryGraph(n2, r2) : this.i._changeTextGraph(n2, r2), this.i._free(r2);
        }
        configureAudio(t2, e2, n2, r2, i2) {
          this.i._configureAudio || console.warn('Attempting to use configureAudio without support for input audio. Is build dep ":gl_graph_runner_audio" missing?'), ra(this, r2 || "input_audio", ((r3) => {
            ra(this, i2 = i2 || "audio_header", ((i3) => {
              this.i._configureAudio(r3, i3, t2, e2 ?? 0, n2);
            }));
          }));
        }
        setAutoResizeCanvas(t2) {
          this.l = t2;
        }
        setAutoRenderToScreen(t2) {
          this.i._setAutoRenderToScreen(t2);
        }
        setGpuBufferVerticalFlip(t2) {
          this.i.gpuOriginForWebTexturesIsBottomLeft = t2;
        }
        ca(t2) {
          oa(this, "__graph_config__", ((e2) => {
            t2(e2);
          })), ra(this, "__graph_config__", ((t3) => {
            this.i._getGraphConfig(t3, void 0);
          })), delete this.i.simpleListeners.__graph_config__;
        }
        attachErrorListener(t2) {
          this.i.errorListener = t2;
        }
        attachEmptyPacketListener(t2, e2) {
          this.i.emptyPacketListeners = this.i.emptyPacketListeners || {}, this.i.emptyPacketListeners[t2] = e2;
        }
        addAudioToStream(t2, e2, n2) {
          this.addAudioToStreamWithShape(t2, 0, 0, e2, n2);
        }
        addAudioToStreamWithShape(t2, e2, n2, r2, i2) {
          const s2 = 4 * t2.length;
          this.h !== s2 && (this.g && this.i._free(this.g), this.g = this.i._malloc(s2), this.h = s2), this.i.HEAPF32.set(t2, this.g / 4), ra(this, r2, ((t3) => {
            this.i._addAudioToInputStream(this.g, e2, n2, t3, i2);
          }));
        }
        addGpuBufferToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const [r2, i2] = ia(this, t2, e3);
            this.i._addBoundTextureToStream(e3, r2, i2, n2);
          }));
        }
        addBoolToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            this.i._addBoolToInputStream(t2, e3, n2);
          }));
        }
        addDoubleToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            this.i._addDoubleToInputStream(t2, e3, n2);
          }));
        }
        addFloatToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            this.i._addFloatToInputStream(t2, e3, n2);
          }));
        }
        addIntToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            this.i._addIntToInputStream(t2, e3, n2);
          }));
        }
        addUintToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            this.i._addUintToInputStream(t2, e3, n2);
          }));
        }
        addStringToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            ra(this, t2, ((t3) => {
              this.i._addStringToInputStream(t3, e3, n2);
            }));
          }));
        }
        addStringRecordToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            sa(this, Object.keys(t2), ((r2) => {
              sa(this, Object.values(t2), ((i2) => {
                this.i._addFlatHashMapToInputStream(r2, i2, Object.keys(t2).length, e3, n2);
              }));
            }));
          }));
        }
        addProtoToStream(t2, e2, n2, r2) {
          ra(this, n2, ((n3) => {
            ra(this, e2, ((e3) => {
              const i2 = this.i._malloc(t2.length);
              this.i.HEAPU8.set(t2, i2), this.i._addProtoToInputStream(i2, t2.length, e3, n3, r2), this.i._free(i2);
            }));
          }));
        }
        addEmptyPacketToStream(t2, e2) {
          ra(this, t2, ((t3) => {
            this.i._addEmptyPacketToInputStream(t3, e2);
          }));
        }
        addBoolVectorToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const r2 = this.i._allocateBoolVector(t2.length);
            if (!r2) throw Error("Unable to allocate new bool vector on heap.");
            for (const e4 of t2) this.i._addBoolVectorEntry(r2, e4);
            this.i._addBoolVectorToInputStream(r2, e3, n2);
          }));
        }
        addDoubleVectorToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const r2 = this.i._allocateDoubleVector(t2.length);
            if (!r2) throw Error("Unable to allocate new double vector on heap.");
            for (const e4 of t2) this.i._addDoubleVectorEntry(r2, e4);
            this.i._addDoubleVectorToInputStream(r2, e3, n2);
          }));
        }
        addFloatVectorToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const r2 = this.i._allocateFloatVector(t2.length);
            if (!r2) throw Error("Unable to allocate new float vector on heap.");
            for (const e4 of t2) this.i._addFloatVectorEntry(r2, e4);
            this.i._addFloatVectorToInputStream(r2, e3, n2);
          }));
        }
        addIntVectorToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const r2 = this.i._allocateIntVector(t2.length);
            if (!r2) throw Error("Unable to allocate new int vector on heap.");
            for (const e4 of t2) this.i._addIntVectorEntry(r2, e4);
            this.i._addIntVectorToInputStream(r2, e3, n2);
          }));
        }
        addUintVectorToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const r2 = this.i._allocateUintVector(t2.length);
            if (!r2) throw Error("Unable to allocate new unsigned int vector on heap.");
            for (const e4 of t2) this.i._addUintVectorEntry(r2, e4);
            this.i._addUintVectorToInputStream(r2, e3, n2);
          }));
        }
        addStringVectorToStream(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const r2 = this.i._allocateStringVector(t2.length);
            if (!r2) throw Error("Unable to allocate new string vector on heap.");
            for (const e4 of t2) ra(this, e4, ((t3) => {
              this.i._addStringVectorEntry(r2, t3);
            }));
            this.i._addStringVectorToInputStream(r2, e3, n2);
          }));
        }
        addBoolToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            this.i._addBoolToInputSidePacket(t2, e3);
          }));
        }
        addDoubleToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            this.i._addDoubleToInputSidePacket(t2, e3);
          }));
        }
        addFloatToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            this.i._addFloatToInputSidePacket(t2, e3);
          }));
        }
        addIntToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            this.i._addIntToInputSidePacket(t2, e3);
          }));
        }
        addUintToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            this.i._addUintToInputSidePacket(t2, e3);
          }));
        }
        addStringToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            ra(this, t2, ((t3) => {
              this.i._addStringToInputSidePacket(t3, e3);
            }));
          }));
        }
        addProtoToInputSidePacket(t2, e2, n2) {
          ra(this, n2, ((n3) => {
            ra(this, e2, ((e3) => {
              const r2 = this.i._malloc(t2.length);
              this.i.HEAPU8.set(t2, r2), this.i._addProtoToInputSidePacket(r2, t2.length, e3, n3), this.i._free(r2);
            }));
          }));
        }
        addBoolVectorToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            const n2 = this.i._allocateBoolVector(t2.length);
            if (!n2) throw Error("Unable to allocate new bool vector on heap.");
            for (const e4 of t2) this.i._addBoolVectorEntry(n2, e4);
            this.i._addBoolVectorToInputSidePacket(n2, e3);
          }));
        }
        addDoubleVectorToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            const n2 = this.i._allocateDoubleVector(t2.length);
            if (!n2) throw Error("Unable to allocate new double vector on heap.");
            for (const e4 of t2) this.i._addDoubleVectorEntry(n2, e4);
            this.i._addDoubleVectorToInputSidePacket(n2, e3);
          }));
        }
        addFloatVectorToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            const n2 = this.i._allocateFloatVector(t2.length);
            if (!n2) throw Error("Unable to allocate new float vector on heap.");
            for (const e4 of t2) this.i._addFloatVectorEntry(n2, e4);
            this.i._addFloatVectorToInputSidePacket(n2, e3);
          }));
        }
        addIntVectorToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            const n2 = this.i._allocateIntVector(t2.length);
            if (!n2) throw Error("Unable to allocate new int vector on heap.");
            for (const e4 of t2) this.i._addIntVectorEntry(n2, e4);
            this.i._addIntVectorToInputSidePacket(n2, e3);
          }));
        }
        addUintVectorToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            const n2 = this.i._allocateUintVector(t2.length);
            if (!n2) throw Error("Unable to allocate new unsigned int vector on heap.");
            for (const e4 of t2) this.i._addUintVectorEntry(n2, e4);
            this.i._addUintVectorToInputSidePacket(n2, e3);
          }));
        }
        addStringVectorToInputSidePacket(t2, e2) {
          ra(this, e2, ((e3) => {
            const n2 = this.i._allocateStringVector(t2.length);
            if (!n2) throw Error("Unable to allocate new string vector on heap.");
            for (const e4 of t2) ra(this, e4, ((t3) => {
              this.i._addStringVectorEntry(n2, t3);
            }));
            this.i._addStringVectorToInputSidePacket(n2, e3);
          }));
        }
        attachBoolListener(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachBoolListener(t3);
          }));
        }
        attachBoolVectorListener(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachBoolVectorListener(t3);
          }));
        }
        attachIntListener(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachIntListener(t3);
          }));
        }
        attachIntVectorListener(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachIntVectorListener(t3);
          }));
        }
        attachUintListener(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachUintListener(t3);
          }));
        }
        attachUintVectorListener(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachUintVectorListener(t3);
          }));
        }
        attachDoubleListener(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachDoubleListener(t3);
          }));
        }
        attachDoubleVectorListener(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachDoubleVectorListener(t3);
          }));
        }
        attachFloatListener(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachFloatListener(t3);
          }));
        }
        attachFloatVectorListener(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachFloatVectorListener(t3);
          }));
        }
        attachStringListener(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachStringListener(t3);
          }));
        }
        attachStringVectorListener(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachStringVectorListener(t3);
          }));
        }
        attachProtoListener(t2, e2, n2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachProtoListener(t3, n2 || false);
          }));
        }
        attachProtoVectorListener(t2, e2, n2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.i._attachProtoVectorListener(t3, n2 || false);
          }));
        }
        attachAudioListener(t2, e2, n2) {
          this.i._attachAudioListener || console.warn('Attempting to use attachAudioListener without support for output audio. Is build dep ":gl_graph_runner_audio_out" missing?'), oa(this, t2, ((t3, n3) => {
            t3 = new Float32Array(t3.buffer, t3.byteOffset, t3.length / 4), e2(t3, n3);
          })), ra(this, t2, ((t3) => {
            this.i._attachAudioListener(t3, n2 || false);
          }));
        }
        finishProcessing() {
          this.i._waitUntilIdle();
        }
        closeGraph() {
          this.i._closeGraph(), this.i.simpleListeners = void 0, this.i.emptyPacketListeners = void 0;
        }
      }, class extends ac {
        get ga() {
          return this.i;
        }
        pa(t2, e2, n2) {
          ra(this, e2, ((e3) => {
            const [r2, i2] = ia(this, t2, e3);
            this.ga._addBoundTextureAsImageToStream(e3, r2, i2, n2);
          }));
        }
        Z(t2, e2) {
          oa(this, t2, e2), ra(this, t2, ((t3) => {
            this.ga._attachImageListener(t3);
          }));
        }
        aa(t2, e2) {
          aa(this, t2, e2), ra(this, t2, ((t3) => {
            this.ga._attachImageVectorListener(t3);
          }));
        }
      }));
      var ac;
      var cc = class extends oc {
      };
      async function hc(t2, e2, n2) {
        return (async function(t3, e3, n3, r2) {
          return ca(t3, e3, n3, r2);
        })(t2, n2.canvas ?? (ta() ? void 0 : document.createElement("canvas")), e2, n2);
      }
      function uc(t2, e2, n2, r2) {
        if (t2.U) {
          const s2 = new Rs();
          if (n2?.regionOfInterest) {
            if (!t2.oa) throw Error("This task doesn't support region-of-interest.");
            var i2 = n2.regionOfInterest;
            if (i2.left >= i2.right || i2.top >= i2.bottom) throw Error("Expected RectF with left < right and top < bottom.");
            if (i2.left < 0 || i2.top < 0 || i2.right > 1 || i2.bottom > 1) throw Error("Expected RectF values to be in [0,1].");
            Rn(s2, 1, (i2.left + i2.right) / 2), Rn(s2, 2, (i2.top + i2.bottom) / 2), Rn(s2, 4, i2.right - i2.left), Rn(s2, 3, i2.bottom - i2.top);
          } else Rn(s2, 1, 0.5), Rn(s2, 2, 0.5), Rn(s2, 4, 1), Rn(s2, 3, 1);
          if (n2?.rotationDegrees) {
            if (n2?.rotationDegrees % 90 != 0) throw Error("Expected rotation to be a multiple of 90\xB0.");
            if (Rn(s2, 5, -Math.PI * n2.rotationDegrees / 180), n2?.rotationDegrees % 180 != 0) {
              const [t3, r3] = na(e2);
              n2 = Sn(s2, 3) * r3 / t3, i2 = Sn(s2, 4) * t3 / r3, Rn(s2, 4, n2), Rn(s2, 3, i2);
            }
          }
          t2.g.addProtoToStream(s2.g(), "mediapipe.NormalizedRect", t2.U, r2);
        }
        t2.g.pa(e2, t2.X, r2 ?? performance.now()), t2.finishProcessing();
      }
      function lc(t2, e2, n2) {
        if (t2.baseOptions?.g()) throw Error("Task is not initialized with image mode. 'runningMode' must be set to 'IMAGE'.");
        uc(t2, e2, n2, t2.C + 1);
      }
      function fc(t2, e2, n2, r2) {
        if (!t2.baseOptions?.g()) throw Error("Task is not initialized with video mode. 'runningMode' must be set to 'VIDEO'.");
        uc(t2, e2, n2, r2);
      }
      function dc(t2, e2, n2, r2) {
        var i2 = e2.data;
        const s2 = e2.width, o2 = s2 * (e2 = e2.height);
        if ((i2 instanceof Uint8Array || i2 instanceof Float32Array) && i2.length !== o2) throw Error("Unsupported channel count: " + i2.length / o2);
        return t2 = new Ua([i2], n2, false, t2.g.i.canvas, t2.P, s2, e2), r2 ? t2.clone() : t2;
      }
      var pc = class extends ga {
        constructor(t2, e2, n2, r2) {
          super(t2), this.g = t2, this.X = e2, this.U = n2, this.oa = r2, this.P = new ka();
        }
        l(t2, e2 = true) {
          if ("runningMode" in t2 && Qe(this.baseOptions, 2, Zt(!!t2.runningMode && "IMAGE" !== t2.runningMode)), void 0 !== t2.canvas && this.g.i.canvas !== t2.canvas) throw Error("You must create a new task to reset the canvas.");
          return super.l(t2, e2);
        }
        close() {
          this.P.close(), super.close();
        }
      };
      pc.prototype.close = pc.prototype.close;
      var gc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect_in", false), this.j = { detections: [] }, Tn(t2 = this.h = new Ks(), 0, 1, e2 = new Hs()), Rn(this.h, 2, 0.5), Rn(this.h, 3, 0.3);
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return "minDetectionConfidence" in t2 && Rn(this.h, 2, t2.minDetectionConfidence ?? 0.5), "minSuppressionThreshold" in t2 && Rn(this.h, 3, t2.minSuppressionThreshold ?? 0.3), this.l(t2);
        }
        F(t2, e2) {
          return this.j = { detections: [] }, lc(this, t2, e2), this.j;
        }
        G(t2, e2, n2) {
          return this.j = { detections: [] }, fc(this, t2, n2, e2), this.j;
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect_in"), ls(t2, "detections");
          const e2 = new ts();
          Lr(e2, qs, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.face_detector.FaceDetectorGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect_in"), is(n2, "DETECTIONS:detections"), n2.o(e2), hs(t2, n2), this.g.attachProtoVectorListener("detections", ((t3, e3) => {
            for (const e4 of t3) t3 = Ts(e4), this.j.detections.push(Ho(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("detections", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      gc.prototype.detectForVideo = gc.prototype.G, gc.prototype.detect = gc.prototype.F, gc.prototype.setOptions = gc.prototype.o, gc.createFromModelPath = async function(t2, e2) {
        return hc(gc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, gc.createFromModelBuffer = function(t2, e2) {
        return hc(gc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, gc.createFromOptions = function(t2, e2) {
        return hc(gc, t2, e2);
      };
      var mc = sc([61, 146], [146, 91], [91, 181], [181, 84], [84, 17], [17, 314], [314, 405], [405, 321], [321, 375], [375, 291], [61, 185], [185, 40], [40, 39], [39, 37], [37, 0], [0, 267], [267, 269], [269, 270], [270, 409], [409, 291], [78, 95], [95, 88], [88, 178], [178, 87], [87, 14], [14, 317], [317, 402], [402, 318], [318, 324], [324, 308], [78, 191], [191, 80], [80, 81], [81, 82], [82, 13], [13, 312], [312, 311], [311, 310], [310, 415], [415, 308]);
      var yc = sc([263, 249], [249, 390], [390, 373], [373, 374], [374, 380], [380, 381], [381, 382], [382, 362], [263, 466], [466, 388], [388, 387], [387, 386], [386, 385], [385, 384], [384, 398], [398, 362]);
      var _c = sc([276, 283], [283, 282], [282, 295], [295, 285], [300, 293], [293, 334], [334, 296], [296, 336]);
      var vc = sc([474, 475], [475, 476], [476, 477], [477, 474]);
      var Ec = sc([33, 7], [7, 163], [163, 144], [144, 145], [145, 153], [153, 154], [154, 155], [155, 133], [33, 246], [246, 161], [161, 160], [160, 159], [159, 158], [158, 157], [157, 173], [173, 133]);
      var wc = sc([46, 53], [53, 52], [52, 65], [65, 55], [70, 63], [63, 105], [105, 66], [66, 107]);
      var Tc = sc([469, 470], [470, 471], [471, 472], [472, 469]);
      var Ac = sc([10, 338], [338, 297], [297, 332], [332, 284], [284, 251], [251, 389], [389, 356], [356, 454], [454, 323], [323, 361], [361, 288], [288, 397], [397, 365], [365, 379], [379, 378], [378, 400], [400, 377], [377, 152], [152, 148], [148, 176], [176, 149], [149, 150], [150, 136], [136, 172], [172, 58], [58, 132], [132, 93], [93, 234], [234, 127], [127, 162], [162, 21], [21, 54], [54, 103], [103, 67], [67, 109], [109, 10]);
      var bc = [...mc, ...yc, ..._c, ...Ec, ...wc, ...Ac];
      var kc = sc([127, 34], [34, 139], [139, 127], [11, 0], [0, 37], [37, 11], [232, 231], [231, 120], [120, 232], [72, 37], [37, 39], [39, 72], [128, 121], [121, 47], [47, 128], [232, 121], [121, 128], [128, 232], [104, 69], [69, 67], [67, 104], [175, 171], [171, 148], [148, 175], [118, 50], [50, 101], [101, 118], [73, 39], [39, 40], [40, 73], [9, 151], [151, 108], [108, 9], [48, 115], [115, 131], [131, 48], [194, 204], [204, 211], [211, 194], [74, 40], [40, 185], [185, 74], [80, 42], [42, 183], [183, 80], [40, 92], [92, 186], [186, 40], [230, 229], [229, 118], [118, 230], [202, 212], [212, 214], [214, 202], [83, 18], [18, 17], [17, 83], [76, 61], [61, 146], [146, 76], [160, 29], [29, 30], [30, 160], [56, 157], [157, 173], [173, 56], [106, 204], [204, 194], [194, 106], [135, 214], [214, 192], [192, 135], [203, 165], [165, 98], [98, 203], [21, 71], [71, 68], [68, 21], [51, 45], [45, 4], [4, 51], [144, 24], [24, 23], [23, 144], [77, 146], [146, 91], [91, 77], [205, 50], [50, 187], [187, 205], [201, 200], [200, 18], [18, 201], [91, 106], [106, 182], [182, 91], [90, 91], [91, 181], [181, 90], [85, 84], [84, 17], [17, 85], [206, 203], [203, 36], [36, 206], [148, 171], [171, 140], [140, 148], [92, 40], [40, 39], [39, 92], [193, 189], [189, 244], [244, 193], [159, 158], [158, 28], [28, 159], [247, 246], [246, 161], [161, 247], [236, 3], [3, 196], [196, 236], [54, 68], [68, 104], [104, 54], [193, 168], [168, 8], [8, 193], [117, 228], [228, 31], [31, 117], [189, 193], [193, 55], [55, 189], [98, 97], [97, 99], [99, 98], [126, 47], [47, 100], [100, 126], [166, 79], [79, 218], [218, 166], [155, 154], [154, 26], [26, 155], [209, 49], [49, 131], [131, 209], [135, 136], [136, 150], [150, 135], [47, 126], [126, 217], [217, 47], [223, 52], [52, 53], [53, 223], [45, 51], [51, 134], [134, 45], [211, 170], [170, 140], [140, 211], [67, 69], [69, 108], [108, 67], [43, 106], [106, 91], [91, 43], [230, 119], [119, 120], [120, 230], [226, 130], [130, 247], [247, 226], [63, 53], [53, 52], [52, 63], [238, 20], [20, 242], [242, 238], [46, 70], [70, 156], [156, 46], [78, 62], [62, 96], [96, 78], [46, 53], [53, 63], [63, 46], [143, 34], [34, 227], [227, 143], [123, 117], [117, 111], [111, 123], [44, 125], [125, 19], [19, 44], [236, 134], [134, 51], [51, 236], [216, 206], [206, 205], [205, 216], [154, 153], [153, 22], [22, 154], [39, 37], [37, 167], [167, 39], [200, 201], [201, 208], [208, 200], [36, 142], [142, 100], [100, 36], [57, 212], [212, 202], [202, 57], [20, 60], [60, 99], [99, 20], [28, 158], [158, 157], [157, 28], [35, 226], [226, 113], [113, 35], [160, 159], [159, 27], [27, 160], [204, 202], [202, 210], [210, 204], [113, 225], [225, 46], [46, 113], [43, 202], [202, 204], [204, 43], [62, 76], [76, 77], [77, 62], [137, 123], [123, 116], [116, 137], [41, 38], [38, 72], [72, 41], [203, 129], [129, 142], [142, 203], [64, 98], [98, 240], [240, 64], [49, 102], [102, 64], [64, 49], [41, 73], [73, 74], [74, 41], [212, 216], [216, 207], [207, 212], [42, 74], [74, 184], [184, 42], [169, 170], [170, 211], [211, 169], [170, 149], [149, 176], [176, 170], [105, 66], [66, 69], [69, 105], [122, 6], [6, 168], [168, 122], [123, 147], [147, 187], [187, 123], [96, 77], [77, 90], [90, 96], [65, 55], [55, 107], [107, 65], [89, 90], [90, 180], [180, 89], [101, 100], [100, 120], [120, 101], [63, 105], [105, 104], [104, 63], [93, 137], [137, 227], [227, 93], [15, 86], [86, 85], [85, 15], [129, 102], [102, 49], [49, 129], [14, 87], [87, 86], [86, 14], [55, 8], [8, 9], [9, 55], [100, 47], [47, 121], [121, 100], [145, 23], [23, 22], [22, 145], [88, 89], [89, 179], [179, 88], [6, 122], [122, 196], [196, 6], [88, 95], [95, 96], [96, 88], [138, 172], [172, 136], [136, 138], [215, 58], [58, 172], [172, 215], [115, 48], [48, 219], [219, 115], [42, 80], [80, 81], [81, 42], [195, 3], [3, 51], [51, 195], [43, 146], [146, 61], [61, 43], [171, 175], [175, 199], [199, 171], [81, 82], [82, 38], [38, 81], [53, 46], [46, 225], [225, 53], [144, 163], [163, 110], [110, 144], [52, 65], [65, 66], [66, 52], [229, 228], [228, 117], [117, 229], [34, 127], [127, 234], [234, 34], [107, 108], [108, 69], [69, 107], [109, 108], [108, 151], [151, 109], [48, 64], [64, 235], [235, 48], [62, 78], [78, 191], [191, 62], [129, 209], [209, 126], [126, 129], [111, 35], [35, 143], [143, 111], [117, 123], [123, 50], [50, 117], [222, 65], [65, 52], [52, 222], [19, 125], [125, 141], [141, 19], [221, 55], [55, 65], [65, 221], [3, 195], [195, 197], [197, 3], [25, 7], [7, 33], [33, 25], [220, 237], [237, 44], [44, 220], [70, 71], [71, 139], [139, 70], [122, 193], [193, 245], [245, 122], [247, 130], [130, 33], [33, 247], [71, 21], [21, 162], [162, 71], [170, 169], [169, 150], [150, 170], [188, 174], [174, 196], [196, 188], [216, 186], [186, 92], [92, 216], [2, 97], [97, 167], [167, 2], [141, 125], [125, 241], [241, 141], [164, 167], [167, 37], [37, 164], [72, 38], [38, 12], [12, 72], [38, 82], [82, 13], [13, 38], [63, 68], [68, 71], [71, 63], [226, 35], [35, 111], [111, 226], [101, 50], [50, 205], [205, 101], [206, 92], [92, 165], [165, 206], [209, 198], [198, 217], [217, 209], [165, 167], [167, 97], [97, 165], [220, 115], [115, 218], [218, 220], [133, 112], [112, 243], [243, 133], [239, 238], [238, 241], [241, 239], [214, 135], [135, 169], [169, 214], [190, 173], [173, 133], [133, 190], [171, 208], [208, 32], [32, 171], [125, 44], [44, 237], [237, 125], [86, 87], [87, 178], [178, 86], [85, 86], [86, 179], [179, 85], [84, 85], [85, 180], [180, 84], [83, 84], [84, 181], [181, 83], [201, 83], [83, 182], [182, 201], [137, 93], [93, 132], [132, 137], [76, 62], [62, 183], [183, 76], [61, 76], [76, 184], [184, 61], [57, 61], [61, 185], [185, 57], [212, 57], [57, 186], [186, 212], [214, 207], [207, 187], [187, 214], [34, 143], [143, 156], [156, 34], [79, 239], [239, 237], [237, 79], [123, 137], [137, 177], [177, 123], [44, 1], [1, 4], [4, 44], [201, 194], [194, 32], [32, 201], [64, 102], [102, 129], [129, 64], [213, 215], [215, 138], [138, 213], [59, 166], [166, 219], [219, 59], [242, 99], [99, 97], [97, 242], [2, 94], [94, 141], [141, 2], [75, 59], [59, 235], [235, 75], [24, 110], [110, 228], [228, 24], [25, 130], [130, 226], [226, 25], [23, 24], [24, 229], [229, 23], [22, 23], [23, 230], [230, 22], [26, 22], [22, 231], [231, 26], [112, 26], [26, 232], [232, 112], [189, 190], [190, 243], [243, 189], [221, 56], [56, 190], [190, 221], [28, 56], [56, 221], [221, 28], [27, 28], [28, 222], [222, 27], [29, 27], [27, 223], [223, 29], [30, 29], [29, 224], [224, 30], [247, 30], [30, 225], [225, 247], [238, 79], [79, 20], [20, 238], [166, 59], [59, 75], [75, 166], [60, 75], [75, 240], [240, 60], [147, 177], [177, 215], [215, 147], [20, 79], [79, 166], [166, 20], [187, 147], [147, 213], [213, 187], [112, 233], [233, 244], [244, 112], [233, 128], [128, 245], [245, 233], [128, 114], [114, 188], [188, 128], [114, 217], [217, 174], [174, 114], [131, 115], [115, 220], [220, 131], [217, 198], [198, 236], [236, 217], [198, 131], [131, 134], [134, 198], [177, 132], [132, 58], [58, 177], [143, 35], [35, 124], [124, 143], [110, 163], [163, 7], [7, 110], [228, 110], [110, 25], [25, 228], [356, 389], [389, 368], [368, 356], [11, 302], [302, 267], [267, 11], [452, 350], [350, 349], [349, 452], [302, 303], [303, 269], [269, 302], [357, 343], [343, 277], [277, 357], [452, 453], [453, 357], [357, 452], [333, 332], [332, 297], [297, 333], [175, 152], [152, 377], [377, 175], [347, 348], [348, 330], [330, 347], [303, 304], [304, 270], [270, 303], [9, 336], [336, 337], [337, 9], [278, 279], [279, 360], [360, 278], [418, 262], [262, 431], [431, 418], [304, 408], [408, 409], [409, 304], [310, 415], [415, 407], [407, 310], [270, 409], [409, 410], [410, 270], [450, 348], [348, 347], [347, 450], [422, 430], [430, 434], [434, 422], [313, 314], [314, 17], [17, 313], [306, 307], [307, 375], [375, 306], [387, 388], [388, 260], [260, 387], [286, 414], [414, 398], [398, 286], [335, 406], [406, 418], [418, 335], [364, 367], [367, 416], [416, 364], [423, 358], [358, 327], [327, 423], [251, 284], [284, 298], [298, 251], [281, 5], [5, 4], [4, 281], [373, 374], [374, 253], [253, 373], [307, 320], [320, 321], [321, 307], [425, 427], [427, 411], [411, 425], [421, 313], [313, 18], [18, 421], [321, 405], [405, 406], [406, 321], [320, 404], [404, 405], [405, 320], [315, 16], [16, 17], [17, 315], [426, 425], [425, 266], [266, 426], [377, 400], [400, 369], [369, 377], [322, 391], [391, 269], [269, 322], [417, 465], [465, 464], [464, 417], [386, 257], [257, 258], [258, 386], [466, 260], [260, 388], [388, 466], [456, 399], [399, 419], [419, 456], [284, 332], [332, 333], [333, 284], [417, 285], [285, 8], [8, 417], [346, 340], [340, 261], [261, 346], [413, 441], [441, 285], [285, 413], [327, 460], [460, 328], [328, 327], [355, 371], [371, 329], [329, 355], [392, 439], [439, 438], [438, 392], [382, 341], [341, 256], [256, 382], [429, 420], [420, 360], [360, 429], [364, 394], [394, 379], [379, 364], [277, 343], [343, 437], [437, 277], [443, 444], [444, 283], [283, 443], [275, 440], [440, 363], [363, 275], [431, 262], [262, 369], [369, 431], [297, 338], [338, 337], [337, 297], [273, 375], [375, 321], [321, 273], [450, 451], [451, 349], [349, 450], [446, 342], [342, 467], [467, 446], [293, 334], [334, 282], [282, 293], [458, 461], [461, 462], [462, 458], [276, 353], [353, 383], [383, 276], [308, 324], [324, 325], [325, 308], [276, 300], [300, 293], [293, 276], [372, 345], [345, 447], [447, 372], [352, 345], [345, 340], [340, 352], [274, 1], [1, 19], [19, 274], [456, 248], [248, 281], [281, 456], [436, 427], [427, 425], [425, 436], [381, 256], [256, 252], [252, 381], [269, 391], [391, 393], [393, 269], [200, 199], [199, 428], [428, 200], [266, 330], [330, 329], [329, 266], [287, 273], [273, 422], [422, 287], [250, 462], [462, 328], [328, 250], [258, 286], [286, 384], [384, 258], [265, 353], [353, 342], [342, 265], [387, 259], [259, 257], [257, 387], [424, 431], [431, 430], [430, 424], [342, 353], [353, 276], [276, 342], [273, 335], [335, 424], [424, 273], [292, 325], [325, 307], [307, 292], [366, 447], [447, 345], [345, 366], [271, 303], [303, 302], [302, 271], [423, 266], [266, 371], [371, 423], [294, 455], [455, 460], [460, 294], [279, 278], [278, 294], [294, 279], [271, 272], [272, 304], [304, 271], [432, 434], [434, 427], [427, 432], [272, 407], [407, 408], [408, 272], [394, 430], [430, 431], [431, 394], [395, 369], [369, 400], [400, 395], [334, 333], [333, 299], [299, 334], [351, 417], [417, 168], [168, 351], [352, 280], [280, 411], [411, 352], [325, 319], [319, 320], [320, 325], [295, 296], [296, 336], [336, 295], [319, 403], [403, 404], [404, 319], [330, 348], [348, 349], [349, 330], [293, 298], [298, 333], [333, 293], [323, 454], [454, 447], [447, 323], [15, 16], [16, 315], [315, 15], [358, 429], [429, 279], [279, 358], [14, 15], [15, 316], [316, 14], [285, 336], [336, 9], [9, 285], [329, 349], [349, 350], [350, 329], [374, 380], [380, 252], [252, 374], [318, 402], [402, 403], [403, 318], [6, 197], [197, 419], [419, 6], [318, 319], [319, 325], [325, 318], [367, 364], [364, 365], [365, 367], [435, 367], [367, 397], [397, 435], [344, 438], [438, 439], [439, 344], [272, 271], [271, 311], [311, 272], [195, 5], [5, 281], [281, 195], [273, 287], [287, 291], [291, 273], [396, 428], [428, 199], [199, 396], [311, 271], [271, 268], [268, 311], [283, 444], [444, 445], [445, 283], [373, 254], [254, 339], [339, 373], [282, 334], [334, 296], [296, 282], [449, 347], [347, 346], [346, 449], [264, 447], [447, 454], [454, 264], [336, 296], [296, 299], [299, 336], [338, 10], [10, 151], [151, 338], [278, 439], [439, 455], [455, 278], [292, 407], [407, 415], [415, 292], [358, 371], [371, 355], [355, 358], [340, 345], [345, 372], [372, 340], [346, 347], [347, 280], [280, 346], [442, 443], [443, 282], [282, 442], [19, 94], [94, 370], [370, 19], [441, 442], [442, 295], [295, 441], [248, 419], [419, 197], [197, 248], [263, 255], [255, 359], [359, 263], [440, 275], [275, 274], [274, 440], [300, 383], [383, 368], [368, 300], [351, 412], [412, 465], [465, 351], [263, 467], [467, 466], [466, 263], [301, 368], [368, 389], [389, 301], [395, 378], [378, 379], [379, 395], [412, 351], [351, 419], [419, 412], [436, 426], [426, 322], [322, 436], [2, 164], [164, 393], [393, 2], [370, 462], [462, 461], [461, 370], [164, 0], [0, 267], [267, 164], [302, 11], [11, 12], [12, 302], [268, 12], [12, 13], [13, 268], [293, 300], [300, 301], [301, 293], [446, 261], [261, 340], [340, 446], [330, 266], [266, 425], [425, 330], [426, 423], [423, 391], [391, 426], [429, 355], [355, 437], [437, 429], [391, 327], [327, 326], [326, 391], [440, 457], [457, 438], [438, 440], [341, 382], [382, 362], [362, 341], [459, 457], [457, 461], [461, 459], [434, 430], [430, 394], [394, 434], [414, 463], [463, 362], [362, 414], [396, 369], [369, 262], [262, 396], [354, 461], [461, 457], [457, 354], [316, 403], [403, 402], [402, 316], [315, 404], [404, 403], [403, 315], [314, 405], [405, 404], [404, 314], [313, 406], [406, 405], [405, 313], [421, 418], [418, 406], [406, 421], [366, 401], [401, 361], [361, 366], [306, 408], [408, 407], [407, 306], [291, 409], [409, 408], [408, 291], [287, 410], [410, 409], [409, 287], [432, 436], [436, 410], [410, 432], [434, 416], [416, 411], [411, 434], [264, 368], [368, 383], [383, 264], [309, 438], [438, 457], [457, 309], [352, 376], [376, 401], [401, 352], [274, 275], [275, 4], [4, 274], [421, 428], [428, 262], [262, 421], [294, 327], [327, 358], [358, 294], [433, 416], [416, 367], [367, 433], [289, 455], [455, 439], [439, 289], [462, 370], [370, 326], [326, 462], [2, 326], [326, 370], [370, 2], [305, 460], [460, 455], [455, 305], [254, 449], [449, 448], [448, 254], [255, 261], [261, 446], [446, 255], [253, 450], [450, 449], [449, 253], [252, 451], [451, 450], [450, 252], [256, 452], [452, 451], [451, 256], [341, 453], [453, 452], [452, 341], [413, 464], [464, 463], [463, 413], [441, 413], [413, 414], [414, 441], [258, 442], [442, 441], [441, 258], [257, 443], [443, 442], [442, 257], [259, 444], [444, 443], [443, 259], [260, 445], [445, 444], [444, 260], [467, 342], [342, 445], [445, 467], [459, 458], [458, 250], [250, 459], [289, 392], [392, 290], [290, 289], [290, 328], [328, 460], [460, 290], [376, 433], [433, 435], [435, 376], [250, 290], [290, 392], [392, 250], [411, 416], [416, 433], [433, 411], [341, 463], [463, 464], [464, 341], [453, 464], [464, 465], [465, 453], [357, 465], [465, 412], [412, 357], [343, 412], [412, 399], [399, 343], [360, 363], [363, 440], [440, 360], [437, 399], [399, 456], [456, 437], [420, 456], [456, 363], [363, 420], [401, 435], [435, 288], [288, 401], [372, 383], [383, 353], [353, 372], [339, 255], [255, 249], [249, 339], [448, 261], [261, 255], [255, 448], [133, 243], [243, 190], [190, 133], [133, 155], [155, 112], [112, 133], [33, 246], [246, 247], [247, 33], [33, 130], [130, 25], [25, 33], [398, 384], [384, 286], [286, 398], [362, 398], [398, 414], [414, 362], [362, 463], [463, 341], [341, 362], [263, 359], [359, 467], [467, 263], [263, 249], [249, 255], [255, 263], [466, 467], [467, 260], [260, 466], [75, 60], [60, 166], [166, 75], [238, 239], [239, 79], [79, 238], [162, 127], [127, 139], [139, 162], [72, 11], [11, 37], [37, 72], [121, 232], [232, 120], [120, 121], [73, 72], [72, 39], [39, 73], [114, 128], [128, 47], [47, 114], [233, 232], [232, 128], [128, 233], [103, 104], [104, 67], [67, 103], [152, 175], [175, 148], [148, 152], [119, 118], [118, 101], [101, 119], [74, 73], [73, 40], [40, 74], [107, 9], [9, 108], [108, 107], [49, 48], [48, 131], [131, 49], [32, 194], [194, 211], [211, 32], [184, 74], [74, 185], [185, 184], [191, 80], [80, 183], [183, 191], [185, 40], [40, 186], [186, 185], [119, 230], [230, 118], [118, 119], [210, 202], [202, 214], [214, 210], [84, 83], [83, 17], [17, 84], [77, 76], [76, 146], [146, 77], [161, 160], [160, 30], [30, 161], [190, 56], [56, 173], [173, 190], [182, 106], [106, 194], [194, 182], [138, 135], [135, 192], [192, 138], [129, 203], [203, 98], [98, 129], [54, 21], [21, 68], [68, 54], [5, 51], [51, 4], [4, 5], [145, 144], [144, 23], [23, 145], [90, 77], [77, 91], [91, 90], [207, 205], [205, 187], [187, 207], [83, 201], [201, 18], [18, 83], [181, 91], [91, 182], [182, 181], [180, 90], [90, 181], [181, 180], [16, 85], [85, 17], [17, 16], [205, 206], [206, 36], [36, 205], [176, 148], [148, 140], [140, 176], [165, 92], [92, 39], [39, 165], [245, 193], [193, 244], [244, 245], [27, 159], [159, 28], [28, 27], [30, 247], [247, 161], [161, 30], [174, 236], [236, 196], [196, 174], [103, 54], [54, 104], [104, 103], [55, 193], [193, 8], [8, 55], [111, 117], [117, 31], [31, 111], [221, 189], [189, 55], [55, 221], [240, 98], [98, 99], [99, 240], [142, 126], [126, 100], [100, 142], [219, 166], [166, 218], [218, 219], [112, 155], [155, 26], [26, 112], [198, 209], [209, 131], [131, 198], [169, 135], [135, 150], [150, 169], [114, 47], [47, 217], [217, 114], [224, 223], [223, 53], [53, 224], [220, 45], [45, 134], [134, 220], [32, 211], [211, 140], [140, 32], [109, 67], [67, 108], [108, 109], [146, 43], [43, 91], [91, 146], [231, 230], [230, 120], [120, 231], [113, 226], [226, 247], [247, 113], [105, 63], [63, 52], [52, 105], [241, 238], [238, 242], [242, 241], [124, 46], [46, 156], [156, 124], [95, 78], [78, 96], [96, 95], [70, 46], [46, 63], [63, 70], [116, 143], [143, 227], [227, 116], [116, 123], [123, 111], [111, 116], [1, 44], [44, 19], [19, 1], [3, 236], [236, 51], [51, 3], [207, 216], [216, 205], [205, 207], [26, 154], [154, 22], [22, 26], [165, 39], [39, 167], [167, 165], [199, 200], [200, 208], [208, 199], [101, 36], [36, 100], [100, 101], [43, 57], [57, 202], [202, 43], [242, 20], [20, 99], [99, 242], [56, 28], [28, 157], [157, 56], [124, 35], [35, 113], [113, 124], [29, 160], [160, 27], [27, 29], [211, 204], [204, 210], [210, 211], [124, 113], [113, 46], [46, 124], [106, 43], [43, 204], [204, 106], [96, 62], [62, 77], [77, 96], [227, 137], [137, 116], [116, 227], [73, 41], [41, 72], [72, 73], [36, 203], [203, 142], [142, 36], [235, 64], [64, 240], [240, 235], [48, 49], [49, 64], [64, 48], [42, 41], [41, 74], [74, 42], [214, 212], [212, 207], [207, 214], [183, 42], [42, 184], [184, 183], [210, 169], [169, 211], [211, 210], [140, 170], [170, 176], [176, 140], [104, 105], [105, 69], [69, 104], [193, 122], [122, 168], [168, 193], [50, 123], [123, 187], [187, 50], [89, 96], [96, 90], [90, 89], [66, 65], [65, 107], [107, 66], [179, 89], [89, 180], [180, 179], [119, 101], [101, 120], [120, 119], [68, 63], [63, 104], [104, 68], [234, 93], [93, 227], [227, 234], [16, 15], [15, 85], [85, 16], [209, 129], [129, 49], [49, 209], [15, 14], [14, 86], [86, 15], [107, 55], [55, 9], [9, 107], [120, 100], [100, 121], [121, 120], [153, 145], [145, 22], [22, 153], [178, 88], [88, 179], [179, 178], [197, 6], [6, 196], [196, 197], [89, 88], [88, 96], [96, 89], [135, 138], [138, 136], [136, 135], [138, 215], [215, 172], [172, 138], [218, 115], [115, 219], [219, 218], [41, 42], [42, 81], [81, 41], [5, 195], [195, 51], [51, 5], [57, 43], [43, 61], [61, 57], [208, 171], [171, 199], [199, 208], [41, 81], [81, 38], [38, 41], [224, 53], [53, 225], [225, 224], [24, 144], [144, 110], [110, 24], [105, 52], [52, 66], [66, 105], [118, 229], [229, 117], [117, 118], [227, 34], [34, 234], [234, 227], [66, 107], [107, 69], [69, 66], [10, 109], [109, 151], [151, 10], [219, 48], [48, 235], [235, 219], [183, 62], [62, 191], [191, 183], [142, 129], [129, 126], [126, 142], [116, 111], [111, 143], [143, 116], [118, 117], [117, 50], [50, 118], [223, 222], [222, 52], [52, 223], [94, 19], [19, 141], [141, 94], [222, 221], [221, 65], [65, 222], [196, 3], [3, 197], [197, 196], [45, 220], [220, 44], [44, 45], [156, 70], [70, 139], [139, 156], [188, 122], [122, 245], [245, 188], [139, 71], [71, 162], [162, 139], [149, 170], [170, 150], [150, 149], [122, 188], [188, 196], [196, 122], [206, 216], [216, 92], [92, 206], [164, 2], [2, 167], [167, 164], [242, 141], [141, 241], [241, 242], [0, 164], [164, 37], [37, 0], [11, 72], [72, 12], [12, 11], [12, 38], [38, 13], [13, 12], [70, 63], [63, 71], [71, 70], [31, 226], [226, 111], [111, 31], [36, 101], [101, 205], [205, 36], [203, 206], [206, 165], [165, 203], [126, 209], [209, 217], [217, 126], [98, 165], [165, 97], [97, 98], [237, 220], [220, 218], [218, 237], [237, 239], [239, 241], [241, 237], [210, 214], [214, 169], [169, 210], [140, 171], [171, 32], [32, 140], [241, 125], [125, 237], [237, 241], [179, 86], [86, 178], [178, 179], [180, 85], [85, 179], [179, 180], [181, 84], [84, 180], [180, 181], [182, 83], [83, 181], [181, 182], [194, 201], [201, 182], [182, 194], [177, 137], [137, 132], [132, 177], [184, 76], [76, 183], [183, 184], [185, 61], [61, 184], [184, 185], [186, 57], [57, 185], [185, 186], [216, 212], [212, 186], [186, 216], [192, 214], [214, 187], [187, 192], [139, 34], [34, 156], [156, 139], [218, 79], [79, 237], [237, 218], [147, 123], [123, 177], [177, 147], [45, 44], [44, 4], [4, 45], [208, 201], [201, 32], [32, 208], [98, 64], [64, 129], [129, 98], [192, 213], [213, 138], [138, 192], [235, 59], [59, 219], [219, 235], [141, 242], [242, 97], [97, 141], [97, 2], [2, 141], [141, 97], [240, 75], [75, 235], [235, 240], [229, 24], [24, 228], [228, 229], [31, 25], [25, 226], [226, 31], [230, 23], [23, 229], [229, 230], [231, 22], [22, 230], [230, 231], [232, 26], [26, 231], [231, 232], [233, 112], [112, 232], [232, 233], [244, 189], [189, 243], [243, 244], [189, 221], [221, 190], [190, 189], [222, 28], [28, 221], [221, 222], [223, 27], [27, 222], [222, 223], [224, 29], [29, 223], [223, 224], [225, 30], [30, 224], [224, 225], [113, 247], [247, 225], [225, 113], [99, 60], [60, 240], [240, 99], [213, 147], [147, 215], [215, 213], [60, 20], [20, 166], [166, 60], [192, 187], [187, 213], [213, 192], [243, 112], [112, 244], [244, 243], [244, 233], [233, 245], [245, 244], [245, 128], [128, 188], [188, 245], [188, 114], [114, 174], [174, 188], [134, 131], [131, 220], [220, 134], [174, 217], [217, 236], [236, 174], [236, 198], [198, 134], [134, 236], [215, 177], [177, 58], [58, 215], [156, 143], [143, 124], [124, 156], [25, 110], [110, 7], [7, 25], [31, 228], [228, 25], [25, 31], [264, 356], [356, 368], [368, 264], [0, 11], [11, 267], [267, 0], [451, 452], [452, 349], [349, 451], [267, 302], [302, 269], [269, 267], [350, 357], [357, 277], [277, 350], [350, 452], [452, 357], [357, 350], [299, 333], [333, 297], [297, 299], [396, 175], [175, 377], [377, 396], [280, 347], [347, 330], [330, 280], [269, 303], [303, 270], [270, 269], [151, 9], [9, 337], [337, 151], [344, 278], [278, 360], [360, 344], [424, 418], [418, 431], [431, 424], [270, 304], [304, 409], [409, 270], [272, 310], [310, 407], [407, 272], [322, 270], [270, 410], [410, 322], [449, 450], [450, 347], [347, 449], [432, 422], [422, 434], [434, 432], [18, 313], [313, 17], [17, 18], [291, 306], [306, 375], [375, 291], [259, 387], [387, 260], [260, 259], [424, 335], [335, 418], [418, 424], [434, 364], [364, 416], [416, 434], [391, 423], [423, 327], [327, 391], [301, 251], [251, 298], [298, 301], [275, 281], [281, 4], [4, 275], [254, 373], [373, 253], [253, 254], [375, 307], [307, 321], [321, 375], [280, 425], [425, 411], [411, 280], [200, 421], [421, 18], [18, 200], [335, 321], [321, 406], [406, 335], [321, 320], [320, 405], [405, 321], [314, 315], [315, 17], [17, 314], [423, 426], [426, 266], [266, 423], [396, 377], [377, 369], [369, 396], [270, 322], [322, 269], [269, 270], [413, 417], [417, 464], [464, 413], [385, 386], [386, 258], [258, 385], [248, 456], [456, 419], [419, 248], [298, 284], [284, 333], [333, 298], [168, 417], [417, 8], [8, 168], [448, 346], [346, 261], [261, 448], [417, 413], [413, 285], [285, 417], [326, 327], [327, 328], [328, 326], [277, 355], [355, 329], [329, 277], [309, 392], [392, 438], [438, 309], [381, 382], [382, 256], [256, 381], [279, 429], [429, 360], [360, 279], [365, 364], [364, 379], [379, 365], [355, 277], [277, 437], [437, 355], [282, 443], [443, 283], [283, 282], [281, 275], [275, 363], [363, 281], [395, 431], [431, 369], [369, 395], [299, 297], [297, 337], [337, 299], [335, 273], [273, 321], [321, 335], [348, 450], [450, 349], [349, 348], [359, 446], [446, 467], [467, 359], [283, 293], [293, 282], [282, 283], [250, 458], [458, 462], [462, 250], [300, 276], [276, 383], [383, 300], [292, 308], [308, 325], [325, 292], [283, 276], [276, 293], [293, 283], [264, 372], [372, 447], [447, 264], [346, 352], [352, 340], [340, 346], [354, 274], [274, 19], [19, 354], [363, 456], [456, 281], [281, 363], [426, 436], [436, 425], [425, 426], [380, 381], [381, 252], [252, 380], [267, 269], [269, 393], [393, 267], [421, 200], [200, 428], [428, 421], [371, 266], [266, 329], [329, 371], [432, 287], [287, 422], [422, 432], [290, 250], [250, 328], [328, 290], [385, 258], [258, 384], [384, 385], [446, 265], [265, 342], [342, 446], [386, 387], [387, 257], [257, 386], [422, 424], [424, 430], [430, 422], [445, 342], [342, 276], [276, 445], [422, 273], [273, 424], [424, 422], [306, 292], [292, 307], [307, 306], [352, 366], [366, 345], [345, 352], [268, 271], [271, 302], [302, 268], [358, 423], [423, 371], [371, 358], [327, 294], [294, 460], [460, 327], [331, 279], [279, 294], [294, 331], [303, 271], [271, 304], [304, 303], [436, 432], [432, 427], [427, 436], [304, 272], [272, 408], [408, 304], [395, 394], [394, 431], [431, 395], [378, 395], [395, 400], [400, 378], [296, 334], [334, 299], [299, 296], [6, 351], [351, 168], [168, 6], [376, 352], [352, 411], [411, 376], [307, 325], [325, 320], [320, 307], [285, 295], [295, 336], [336, 285], [320, 319], [319, 404], [404, 320], [329, 330], [330, 349], [349, 329], [334, 293], [293, 333], [333, 334], [366, 323], [323, 447], [447, 366], [316, 15], [15, 315], [315, 316], [331, 358], [358, 279], [279, 331], [317, 14], [14, 316], [316, 317], [8, 285], [285, 9], [9, 8], [277, 329], [329, 350], [350, 277], [253, 374], [374, 252], [252, 253], [319, 318], [318, 403], [403, 319], [351, 6], [6, 419], [419, 351], [324, 318], [318, 325], [325, 324], [397, 367], [367, 365], [365, 397], [288, 435], [435, 397], [397, 288], [278, 344], [344, 439], [439, 278], [310, 272], [272, 311], [311, 310], [248, 195], [195, 281], [281, 248], [375, 273], [273, 291], [291, 375], [175, 396], [396, 199], [199, 175], [312, 311], [311, 268], [268, 312], [276, 283], [283, 445], [445, 276], [390, 373], [373, 339], [339, 390], [295, 282], [282, 296], [296, 295], [448, 449], [449, 346], [346, 448], [356, 264], [264, 454], [454, 356], [337, 336], [336, 299], [299, 337], [337, 338], [338, 151], [151, 337], [294, 278], [278, 455], [455, 294], [308, 292], [292, 415], [415, 308], [429, 358], [358, 355], [355, 429], [265, 340], [340, 372], [372, 265], [352, 346], [346, 280], [280, 352], [295, 442], [442, 282], [282, 295], [354, 19], [19, 370], [370, 354], [285, 441], [441, 295], [295, 285], [195, 248], [248, 197], [197, 195], [457, 440], [440, 274], [274, 457], [301, 300], [300, 368], [368, 301], [417, 351], [351, 465], [465, 417], [251, 301], [301, 389], [389, 251], [394, 395], [395, 379], [379, 394], [399, 412], [412, 419], [419, 399], [410, 436], [436, 322], [322, 410], [326, 2], [2, 393], [393, 326], [354, 370], [370, 461], [461, 354], [393, 164], [164, 267], [267, 393], [268, 302], [302, 12], [12, 268], [312, 268], [268, 13], [13, 312], [298, 293], [293, 301], [301, 298], [265, 446], [446, 340], [340, 265], [280, 330], [330, 425], [425, 280], [322, 426], [426, 391], [391, 322], [420, 429], [429, 437], [437, 420], [393, 391], [391, 326], [326, 393], [344, 440], [440, 438], [438, 344], [458, 459], [459, 461], [461, 458], [364, 434], [434, 394], [394, 364], [428, 396], [396, 262], [262, 428], [274, 354], [354, 457], [457, 274], [317, 316], [316, 402], [402, 317], [316, 315], [315, 403], [403, 316], [315, 314], [314, 404], [404, 315], [314, 313], [313, 405], [405, 314], [313, 421], [421, 406], [406, 313], [323, 366], [366, 361], [361, 323], [292, 306], [306, 407], [407, 292], [306, 291], [291, 408], [408, 306], [291, 287], [287, 409], [409, 291], [287, 432], [432, 410], [410, 287], [427, 434], [434, 411], [411, 427], [372, 264], [264, 383], [383, 372], [459, 309], [309, 457], [457, 459], [366, 352], [352, 401], [401, 366], [1, 274], [274, 4], [4, 1], [418, 421], [421, 262], [262, 418], [331, 294], [294, 358], [358, 331], [435, 433], [433, 367], [367, 435], [392, 289], [289, 439], [439, 392], [328, 462], [462, 326], [326, 328], [94, 2], [2, 370], [370, 94], [289, 305], [305, 455], [455, 289], [339, 254], [254, 448], [448, 339], [359, 255], [255, 446], [446, 359], [254, 253], [253, 449], [449, 254], [253, 252], [252, 450], [450, 253], [252, 256], [256, 451], [451, 252], [256, 341], [341, 452], [452, 256], [414, 413], [413, 463], [463, 414], [286, 441], [441, 414], [414, 286], [286, 258], [258, 441], [441, 286], [258, 257], [257, 442], [442, 258], [257, 259], [259, 443], [443, 257], [259, 260], [260, 444], [444, 259], [260, 467], [467, 445], [445, 260], [309, 459], [459, 250], [250, 309], [305, 289], [289, 290], [290, 305], [305, 290], [290, 460], [460, 305], [401, 376], [376, 435], [435, 401], [309, 250], [250, 392], [392, 309], [376, 411], [411, 433], [433, 376], [453, 341], [341, 464], [464, 453], [357, 453], [453, 465], [465, 357], [343, 357], [357, 412], [412, 343], [437, 343], [343, 399], [399, 437], [344, 360], [360, 440], [440, 344], [420, 437], [437, 456], [456, 420], [360, 420], [420, 363], [363, 360], [361, 401], [401, 288], [288, 361], [265, 372], [372, 353], [353, 265], [390, 339], [339, 249], [249, 390], [339, 448], [448, 255], [255, 339]);
      function xc(t2) {
        t2.j = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] };
      }
      var Sc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect", false), this.j = { faceLandmarks: [], faceBlendshapes: [], facialTransformationMatrixes: [] }, this.outputFacialTransformationMatrixes = this.outputFaceBlendshapes = false, Tn(t2 = this.h = new Zs(), 0, 1, e2 = new Hs()), this.A = new Js(), Tn(this.h, 0, 3, this.A), this.u = new Ks(), Tn(this.h, 0, 2, this.u), Ln(this.u, 4, 1), Rn(this.u, 2, 0.5), Rn(this.A, 2, 0.5), Rn(this.h, 4, 0.5);
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return "numFaces" in t2 && Ln(this.u, 4, t2.numFaces ?? 1), "minFaceDetectionConfidence" in t2 && Rn(this.u, 2, t2.minFaceDetectionConfidence ?? 0.5), "minTrackingConfidence" in t2 && Rn(this.h, 4, t2.minTrackingConfidence ?? 0.5), "minFacePresenceConfidence" in t2 && Rn(this.A, 2, t2.minFacePresenceConfidence ?? 0.5), "outputFaceBlendshapes" in t2 && (this.outputFaceBlendshapes = !!t2.outputFaceBlendshapes), "outputFacialTransformationMatrixes" in t2 && (this.outputFacialTransformationMatrixes = !!t2.outputFacialTransformationMatrixes), this.l(t2);
        }
        F(t2, e2) {
          return xc(this), lc(this, t2, e2), this.j;
        }
        G(t2, e2, n2) {
          return xc(this), fc(this, t2, n2, e2), this.j;
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect"), ls(t2, "face_landmarks");
          const e2 = new ts();
          Lr(e2, to, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.face_landmarker.FaceLandmarkerGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "NORM_LANDMARKS:face_landmarks"), n2.o(e2), hs(t2, n2), this.g.attachProtoVectorListener("face_landmarks", ((t3, e3) => {
            for (const e4 of t3) t3 = xs(e4), this.j.faceLandmarks.push(Wo(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("face_landmarks", ((t3) => {
            la(this, t3);
          })), this.outputFaceBlendshapes && (ls(t2, "blendshapes"), is(n2, "BLENDSHAPES:blendshapes"), this.g.attachProtoVectorListener("blendshapes", ((t3, e3) => {
            if (this.outputFaceBlendshapes) for (const e4 of t3) t3 = _s(e4), this.j.faceBlendshapes.push(Vo(t3.g() ?? []));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("blendshapes", ((t3) => {
            la(this, t3);
          }))), this.outputFacialTransformationMatrixes && (ls(t2, "face_geometry"), is(n2, "FACE_GEOMETRY:face_geometry"), this.g.attachProtoVectorListener("face_geometry", ((t3, e3) => {
            if (this.outputFacialTransformationMatrixes) for (const e4 of t3) (t3 = _n(t3 = $s(e4), Ss, 2)) && this.j.facialTransformationMatrixes.push({ rows: xn(t3, 1) ?? 0 ?? 0, columns: xn(t3, 2) ?? 0 ?? 0, data: nn(t3, 3, Jt, en()).slice() ?? [] });
            la(this, e3);
          })), this.g.attachEmptyPacketListener("face_geometry", ((t3) => {
            la(this, t3);
          }))), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      Sc.prototype.detectForVideo = Sc.prototype.G, Sc.prototype.detect = Sc.prototype.F, Sc.prototype.setOptions = Sc.prototype.o, Sc.createFromModelPath = function(t2, e2) {
        return hc(Sc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Sc.createFromModelBuffer = function(t2, e2) {
        return hc(Sc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Sc.createFromOptions = function(t2, e2) {
        return hc(Sc, t2, e2);
      }, Sc.FACE_LANDMARKS_LIPS = mc, Sc.FACE_LANDMARKS_LEFT_EYE = yc, Sc.FACE_LANDMARKS_LEFT_EYEBROW = _c, Sc.FACE_LANDMARKS_LEFT_IRIS = vc, Sc.FACE_LANDMARKS_RIGHT_EYE = Ec, Sc.FACE_LANDMARKS_RIGHT_EYEBROW = wc, Sc.FACE_LANDMARKS_RIGHT_IRIS = Tc, Sc.FACE_LANDMARKS_FACE_OVAL = Ac, Sc.FACE_LANDMARKS_CONTOURS = bc, Sc.FACE_LANDMARKS_TESSELATION = kc;
      var Lc = sc([0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]);
      function Rc(t2) {
        t2.gestures = [], t2.landmarks = [], t2.worldLandmarks = [], t2.handedness = [];
      }
      function Ic(t2) {
        return 0 === t2.gestures.length ? { gestures: [], landmarks: [], worldLandmarks: [], handedness: [], handednesses: [] } : { gestures: t2.gestures, landmarks: t2.landmarks, worldLandmarks: t2.worldLandmarks, handedness: t2.handedness, handednesses: t2.handedness };
      }
      function Fc(t2, e2 = true) {
        const n2 = [];
        for (const i2 of t2) {
          var r2 = _s(i2);
          t2 = [];
          for (const n3 of r2.g()) r2 = e2 && null != xn(n3, 1) ? xn(n3, 1) ?? 0 : -1, t2.push({ score: Sn(n3, 2) ?? 0, index: r2, categoryName: fe(Je(n3, 3)) ?? "" ?? "", displayName: fe(Je(n3, 4)) ?? "" ?? "" });
          n2.push(t2);
        }
        return n2;
      }
      var Pc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect", false), this.gestures = [], this.landmarks = [], this.worldLandmarks = [], this.handedness = [], Tn(t2 = this.j = new ao(), 0, 1, e2 = new Hs()), this.u = new oo(), Tn(this.j, 0, 2, this.u), this.D = new so(), Tn(this.u, 0, 3, this.D), this.A = new io(), Tn(this.u, 0, 2, this.A), this.h = new ro(), Tn(this.j, 0, 3, this.h), Rn(this.A, 2, 0.5), Rn(this.u, 4, 0.5), Rn(this.D, 2, 0.5);
        }
        get baseOptions() {
          return _n(this.j, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.j, 0, 1, t2);
        }
        o(t2) {
          if (Ln(this.A, 3, t2.numHands ?? 1), "minHandDetectionConfidence" in t2 && Rn(this.A, 2, t2.minHandDetectionConfidence ?? 0.5), "minTrackingConfidence" in t2 && Rn(this.u, 4, t2.minTrackingConfidence ?? 0.5), "minHandPresenceConfidence" in t2 && Rn(this.D, 2, t2.minHandPresenceConfidence ?? 0.5), t2.cannedGesturesClassifierOptions) {
            var e2 = new eo(), n2 = e2, r2 = Go(t2.cannedGesturesClassifierOptions, _n(this.h, eo, 3)?.l());
            Tn(n2, 0, 2, r2), Tn(this.h, 0, 3, e2);
          } else void 0 === t2.cannedGesturesClassifierOptions && _n(this.h, eo, 3)?.g();
          return t2.customGesturesClassifierOptions ? (Tn(n2 = e2 = new eo(), 0, 2, r2 = Go(t2.customGesturesClassifierOptions, _n(this.h, eo, 4)?.l())), Tn(this.h, 0, 4, e2)) : void 0 === t2.customGesturesClassifierOptions && _n(this.h, eo, 4)?.g(), this.l(t2);
        }
        Ha(t2, e2) {
          return Rc(this), lc(this, t2, e2), Ic(this);
        }
        Ia(t2, e2, n2) {
          return Rc(this), fc(this, t2, n2, e2), Ic(this);
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect"), ls(t2, "hand_gestures"), ls(t2, "hand_landmarks"), ls(t2, "world_hand_landmarks"), ls(t2, "handedness");
          const e2 = new ts();
          Lr(e2, fo, this.j);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.gesture_recognizer.GestureRecognizerGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "HAND_GESTURES:hand_gestures"), is(n2, "LANDMARKS:hand_landmarks"), is(n2, "WORLD_LANDMARKS:world_hand_landmarks"), is(n2, "HANDEDNESS:handedness"), n2.o(e2), hs(t2, n2), this.g.attachProtoVectorListener("hand_landmarks", ((t3, e3) => {
            for (const e4 of t3) {
              t3 = xs(e4);
              const n3 = [];
              for (const e5 of En(t3, ks, 1)) n3.push({ x: Sn(e5, 1) ?? 0, y: Sn(e5, 2) ?? 0, z: Sn(e5, 3) ?? 0, visibility: Sn(e5, 4) ?? 0 });
              this.landmarks.push(n3);
            }
            la(this, e3);
          })), this.g.attachEmptyPacketListener("hand_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoVectorListener("world_hand_landmarks", ((t3, e3) => {
            for (const e4 of t3) {
              t3 = bs(e4);
              const n3 = [];
              for (const e5 of En(t3, As, 1)) n3.push({ x: Sn(e5, 1) ?? 0, y: Sn(e5, 2) ?? 0, z: Sn(e5, 3) ?? 0, visibility: Sn(e5, 4) ?? 0 });
              this.worldLandmarks.push(n3);
            }
            la(this, e3);
          })), this.g.attachEmptyPacketListener("world_hand_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoVectorListener("hand_gestures", ((t3, e3) => {
            this.gestures.push(...Fc(t3, false)), la(this, e3);
          })), this.g.attachEmptyPacketListener("hand_gestures", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoVectorListener("handedness", ((t3, e3) => {
            this.handedness.push(...Fc(t3)), la(this, e3);
          })), this.g.attachEmptyPacketListener("handedness", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      function Mc(t2) {
        return { landmarks: t2.landmarks, worldLandmarks: t2.worldLandmarks, handednesses: t2.handedness, handedness: t2.handedness };
      }
      Pc.prototype.recognizeForVideo = Pc.prototype.Ia, Pc.prototype.recognize = Pc.prototype.Ha, Pc.prototype.setOptions = Pc.prototype.o, Pc.createFromModelPath = function(t2, e2) {
        return hc(Pc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Pc.createFromModelBuffer = function(t2, e2) {
        return hc(Pc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Pc.createFromOptions = function(t2, e2) {
        return hc(Pc, t2, e2);
      }, Pc.HAND_CONNECTIONS = Lc;
      var Oc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect", false), this.landmarks = [], this.worldLandmarks = [], this.handedness = [], Tn(t2 = this.h = new oo(), 0, 1, e2 = new Hs()), this.u = new so(), Tn(this.h, 0, 3, this.u), this.j = new io(), Tn(this.h, 0, 2, this.j), Ln(this.j, 3, 1), Rn(this.j, 2, 0.5), Rn(this.u, 2, 0.5), Rn(this.h, 4, 0.5);
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return "numHands" in t2 && Ln(this.j, 3, t2.numHands ?? 1), "minHandDetectionConfidence" in t2 && Rn(this.j, 2, t2.minHandDetectionConfidence ?? 0.5), "minTrackingConfidence" in t2 && Rn(this.h, 4, t2.minTrackingConfidence ?? 0.5), "minHandPresenceConfidence" in t2 && Rn(this.u, 2, t2.minHandPresenceConfidence ?? 0.5), this.l(t2);
        }
        F(t2, e2) {
          return this.landmarks = [], this.worldLandmarks = [], this.handedness = [], lc(this, t2, e2), Mc(this);
        }
        G(t2, e2, n2) {
          return this.landmarks = [], this.worldLandmarks = [], this.handedness = [], fc(this, t2, n2, e2), Mc(this);
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect"), ls(t2, "hand_landmarks"), ls(t2, "world_hand_landmarks"), ls(t2, "handedness");
          const e2 = new ts();
          Lr(e2, po, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.hand_landmarker.HandLandmarkerGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "LANDMARKS:hand_landmarks"), is(n2, "WORLD_LANDMARKS:world_hand_landmarks"), is(n2, "HANDEDNESS:handedness"), n2.o(e2), hs(t2, n2), this.g.attachProtoVectorListener("hand_landmarks", ((t3, e3) => {
            for (const e4 of t3) t3 = xs(e4), this.landmarks.push(Wo(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("hand_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoVectorListener("world_hand_landmarks", ((t3, e3) => {
            for (const e4 of t3) t3 = bs(e4), this.worldLandmarks.push(zo(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("world_hand_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoVectorListener("handedness", ((t3, e3) => {
            var n3 = this.handedness, r2 = n3.push;
            const i2 = [];
            for (const e4 of t3) {
              t3 = _s(e4);
              const n4 = [];
              for (const e5 of t3.g()) n4.push({ score: Sn(e5, 2) ?? 0, index: xn(e5, 1) ?? 0 ?? -1, categoryName: fe(Je(e5, 3)) ?? "" ?? "", displayName: fe(Je(e5, 4)) ?? "" ?? "" });
              i2.push(n4);
            }
            r2.call(n3, ...i2), la(this, e3);
          })), this.g.attachEmptyPacketListener("handedness", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      Oc.prototype.detectForVideo = Oc.prototype.G, Oc.prototype.detect = Oc.prototype.F, Oc.prototype.setOptions = Oc.prototype.o, Oc.createFromModelPath = function(t2, e2) {
        return hc(Oc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Oc.createFromModelBuffer = function(t2, e2) {
        return hc(Oc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Oc.createFromOptions = function(t2, e2) {
        return hc(Oc, t2, e2);
      }, Oc.HAND_CONNECTIONS = Lc;
      var Cc = sc([0, 1], [1, 2], [2, 3], [3, 7], [0, 4], [4, 5], [5, 6], [6, 8], [9, 10], [11, 12], [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], [17, 19], [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], [18, 20], [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28], [27, 29], [28, 30], [29, 31], [30, 32], [27, 31], [28, 32]);
      function Nc(t2) {
        t2.h = { faceLandmarks: [], faceBlendshapes: [], poseLandmarks: [], poseWorldLandmarks: [], poseSegmentationMasks: [], leftHandLandmarks: [], leftHandWorldLandmarks: [], rightHandLandmarks: [], rightHandWorldLandmarks: [] };
      }
      function Uc(t2) {
        try {
          if (!t2.D) return t2.h;
          t2.D(t2.h);
        } finally {
          pa(t2);
        }
      }
      function Dc(t2, e2) {
        t2 = xs(t2), e2.push(Wo(t2));
      }
      var Bc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "input_frames_image", null, false), this.h = { faceLandmarks: [], faceBlendshapes: [], poseLandmarks: [], poseWorldLandmarks: [], poseSegmentationMasks: [], leftHandLandmarks: [], leftHandWorldLandmarks: [], rightHandLandmarks: [], rightHandWorldLandmarks: [] }, this.outputPoseSegmentationMasks = this.outputFaceBlendshapes = false, Tn(t2 = this.j = new _o(), 0, 1, e2 = new Hs()), this.I = new so(), Tn(this.j, 0, 2, this.I), this.W = new go(), Tn(this.j, 0, 3, this.W), this.u = new Ks(), Tn(this.j, 0, 4, this.u), this.O = new Js(), Tn(this.j, 0, 5, this.O), this.A = new mo(), Tn(this.j, 0, 6, this.A), this.M = new yo(), Tn(this.j, 0, 7, this.M), Rn(this.u, 2, 0.5), Rn(this.u, 3, 0.3), Rn(this.O, 2, 0.5), Rn(this.A, 2, 0.5), Rn(this.A, 3, 0.3), Rn(this.M, 2, 0.5), Rn(this.I, 2, 0.5);
        }
        get baseOptions() {
          return _n(this.j, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.j, 0, 1, t2);
        }
        o(t2) {
          return "minFaceDetectionConfidence" in t2 && Rn(this.u, 2, t2.minFaceDetectionConfidence ?? 0.5), "minFaceSuppressionThreshold" in t2 && Rn(this.u, 3, t2.minFaceSuppressionThreshold ?? 0.3), "minFacePresenceConfidence" in t2 && Rn(this.O, 2, t2.minFacePresenceConfidence ?? 0.5), "outputFaceBlendshapes" in t2 && (this.outputFaceBlendshapes = !!t2.outputFaceBlendshapes), "minPoseDetectionConfidence" in t2 && Rn(this.A, 2, t2.minPoseDetectionConfidence ?? 0.5), "minPoseSuppressionThreshold" in t2 && Rn(this.A, 3, t2.minPoseSuppressionThreshold ?? 0.3), "minPosePresenceConfidence" in t2 && Rn(this.M, 2, t2.minPosePresenceConfidence ?? 0.5), "outputPoseSegmentationMasks" in t2 && (this.outputPoseSegmentationMasks = !!t2.outputPoseSegmentationMasks), "minHandLandmarksConfidence" in t2 && Rn(this.I, 2, t2.minHandLandmarksConfidence ?? 0.5), this.l(t2);
        }
        F(t2, e2, n2) {
          const r2 = "function" != typeof e2 ? e2 : {};
          return this.D = "function" == typeof e2 ? e2 : n2, Nc(this), lc(this, t2, r2), Uc(this);
        }
        G(t2, e2, n2, r2) {
          const i2 = "function" != typeof n2 ? n2 : {};
          return this.D = "function" == typeof n2 ? n2 : r2, Nc(this), fc(this, t2, i2, e2), Uc(this);
        }
        m() {
          var t2 = new fs();
          us(t2, "input_frames_image"), ls(t2, "pose_landmarks"), ls(t2, "pose_world_landmarks"), ls(t2, "face_landmarks"), ls(t2, "left_hand_landmarks"), ls(t2, "left_hand_world_landmarks"), ls(t2, "right_hand_landmarks"), ls(t2, "right_hand_world_landmarks");
          const e2 = new ts(), n2 = new Gi();
          In(n2, 1, "type.googleapis.com/mediapipe.tasks.vision.holistic_landmarker.proto.HolisticLandmarkerGraphOptions"), (function(t3, e3) {
            if (null != e3) if (Array.isArray(e3)) Qe(t3, 2, Fe(e3, 0, Me));
            else {
              if (!("string" == typeof e3 || e3 instanceof P || L(e3))) throw Error("invalid value in Any.value field: " + e3 + " expected a ByteString, a base64 encoded string, a Uint8Array or a jspb array");
              un(t3, 2, ut(e3, false), I());
            }
          })(n2, this.j.g());
          const r2 = new ss();
          In(r2, 2, "mediapipe.tasks.vision.holistic_landmarker.HolisticLandmarkerGraph"), kn(r2, 8, Gi, n2), rs(r2, "IMAGE:input_frames_image"), is(r2, "POSE_LANDMARKS:pose_landmarks"), is(r2, "POSE_WORLD_LANDMARKS:pose_world_landmarks"), is(r2, "FACE_LANDMARKS:face_landmarks"), is(r2, "LEFT_HAND_LANDMARKS:left_hand_landmarks"), is(r2, "LEFT_HAND_WORLD_LANDMARKS:left_hand_world_landmarks"), is(r2, "RIGHT_HAND_LANDMARKS:right_hand_landmarks"), is(r2, "RIGHT_HAND_WORLD_LANDMARKS:right_hand_world_landmarks"), r2.o(e2), hs(t2, r2), fa(this, t2), this.g.attachProtoListener("pose_landmarks", ((t3, e3) => {
            Dc(t3, this.h.poseLandmarks), la(this, e3);
          })), this.g.attachEmptyPacketListener("pose_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoListener("pose_world_landmarks", ((t3, e3) => {
            var n3 = this.h.poseWorldLandmarks;
            t3 = bs(t3), n3.push(zo(t3)), la(this, e3);
          })), this.g.attachEmptyPacketListener("pose_world_landmarks", ((t3) => {
            la(this, t3);
          })), this.outputPoseSegmentationMasks && (is(r2, "POSE_SEGMENTATION_MASK:pose_segmentation_mask"), da(this, "pose_segmentation_mask"), this.g.Z("pose_segmentation_mask", ((t3, e3) => {
            this.h.poseSegmentationMasks = [dc(this, t3, true, !this.D)], la(this, e3);
          })), this.g.attachEmptyPacketListener("pose_segmentation_mask", ((t3) => {
            this.h.poseSegmentationMasks = [], la(this, t3);
          }))), this.g.attachProtoListener("face_landmarks", ((t3, e3) => {
            Dc(t3, this.h.faceLandmarks), la(this, e3);
          })), this.g.attachEmptyPacketListener("face_landmarks", ((t3) => {
            la(this, t3);
          })), this.outputFaceBlendshapes && (ls(t2, "extra_blendshapes"), is(r2, "FACE_BLENDSHAPES:extra_blendshapes"), this.g.attachProtoListener("extra_blendshapes", ((t3, e3) => {
            var n3 = this.h.faceBlendshapes;
            this.outputFaceBlendshapes && (t3 = _s(t3), n3.push(Vo(t3.g() ?? []))), la(this, e3);
          })), this.g.attachEmptyPacketListener("extra_blendshapes", ((t3) => {
            la(this, t3);
          }))), this.g.attachProtoListener("left_hand_landmarks", ((t3, e3) => {
            Dc(t3, this.h.leftHandLandmarks), la(this, e3);
          })), this.g.attachEmptyPacketListener("left_hand_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoListener("left_hand_world_landmarks", ((t3, e3) => {
            var n3 = this.h.leftHandWorldLandmarks;
            t3 = bs(t3), n3.push(zo(t3)), la(this, e3);
          })), this.g.attachEmptyPacketListener("left_hand_world_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoListener("right_hand_landmarks", ((t3, e3) => {
            Dc(t3, this.h.rightHandLandmarks), la(this, e3);
          })), this.g.attachEmptyPacketListener("right_hand_landmarks", ((t3) => {
            la(this, t3);
          })), this.g.attachProtoListener("right_hand_world_landmarks", ((t3, e3) => {
            var n3 = this.h.rightHandWorldLandmarks;
            t3 = bs(t3), n3.push(zo(t3)), la(this, e3);
          })), this.g.attachEmptyPacketListener("right_hand_world_landmarks", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      Bc.prototype.detectForVideo = Bc.prototype.G, Bc.prototype.detect = Bc.prototype.F, Bc.prototype.setOptions = Bc.prototype.o, Bc.createFromModelPath = function(t2, e2) {
        return hc(Bc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Bc.createFromModelBuffer = function(t2, e2) {
        return hc(Bc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Bc.createFromOptions = function(t2, e2) {
        return hc(Bc, t2, e2);
      }, Bc.HAND_CONNECTIONS = Lc, Bc.POSE_CONNECTIONS = Cc, Bc.FACE_LANDMARKS_LIPS = mc, Bc.FACE_LANDMARKS_LEFT_EYE = yc, Bc.FACE_LANDMARKS_LEFT_EYEBROW = _c, Bc.FACE_LANDMARKS_LEFT_IRIS = vc, Bc.FACE_LANDMARKS_RIGHT_EYE = Ec, Bc.FACE_LANDMARKS_RIGHT_EYEBROW = wc, Bc.FACE_LANDMARKS_RIGHT_IRIS = Tc, Bc.FACE_LANDMARKS_FACE_OVAL = Ac, Bc.FACE_LANDMARKS_CONTOURS = bc, Bc.FACE_LANDMARKS_TESSELATION = kc;
      var Gc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "input_image", "norm_rect", true), this.j = { classifications: [] }, Tn(t2 = this.h = new wo(), 0, 1, e2 = new Hs());
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return Tn(this.h, 0, 2, Go(t2, _n(this.h, Us, 2))), this.l(t2);
        }
        sa(t2, e2) {
          return this.j = { classifications: [] }, lc(this, t2, e2), this.j;
        }
        ta(t2, e2, n2) {
          return this.j = { classifications: [] }, fc(this, t2, n2, e2), this.j;
        }
        m() {
          var t2 = new fs();
          us(t2, "input_image"), us(t2, "norm_rect"), ls(t2, "classifications");
          const e2 = new ts();
          Lr(e2, To, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.image_classifier.ImageClassifierGraph"), rs(n2, "IMAGE:input_image"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "CLASSIFICATIONS:classifications"), n2.o(e2), hs(t2, n2), this.g.attachProtoListener("classifications", ((t3, e3) => {
            this.j = Xo(Fs(t3)), la(this, e3);
          })), this.g.attachEmptyPacketListener("classifications", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      Gc.prototype.classifyForVideo = Gc.prototype.ta, Gc.prototype.classify = Gc.prototype.sa, Gc.prototype.setOptions = Gc.prototype.o, Gc.createFromModelPath = function(t2, e2) {
        return hc(Gc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Gc.createFromModelBuffer = function(t2, e2) {
        return hc(Gc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Gc.createFromOptions = function(t2, e2) {
        return hc(Gc, t2, e2);
      };
      var jc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect", true), this.h = new Ao(), this.embeddings = { embeddings: [] }, Tn(t2 = this.h, 0, 1, e2 = new Hs());
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          var e2 = this.h, n2 = _n(this.h, Bs, 2);
          return n2 = n2 ? n2.clone() : new Bs(), void 0 !== t2.l2Normalize ? Qe(n2, 1, Zt(t2.l2Normalize)) : "l2Normalize" in t2 && Qe(n2, 1), void 0 !== t2.quantize ? Qe(n2, 2, Zt(t2.quantize)) : "quantize" in t2 && Qe(n2, 2), Tn(e2, 0, 2, n2), this.l(t2);
        }
        za(t2, e2) {
          return lc(this, t2, e2), this.embeddings;
        }
        Aa(t2, e2, n2) {
          return fc(this, t2, n2, e2), this.embeddings;
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect"), ls(t2, "embeddings_out");
          const e2 = new ts();
          Lr(e2, bo, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.image_embedder.ImageEmbedderGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "EMBEDDINGS:embeddings_out"), n2.o(e2), hs(t2, n2), this.g.attachProtoListener("embeddings_out", ((t3, e3) => {
            t3 = Ns(t3), this.embeddings = (function(t4) {
              return { embeddings: En(t4, Os, 1).map(((t5) => {
                const e4 = { headIndex: xn(t5, 3) ?? 0 ?? -1, headName: fe(Je(t5, 4)) ?? "" ?? "" };
                var n3 = t5.v;
                return void 0 !== yn(n3, 0 | n3[tt], Ps, fn(t5, 1)) ? (t5 = nn(t5 = _n(t5, Ps, fn(t5, 1), void 0), 1, Jt, en()), e4.floatEmbedding = t5.slice()) : (n3 = new Uint8Array(0), e4.quantizedEmbedding = _n(t5, Ms, fn(t5, 2), void 0)?.na()?.h() ?? n3), e4;
              })), timestampMs: jo(Je(t4, 2, void 0, void 0, he) ?? qe) };
            })(t3), la(this, e3);
          })), this.g.attachEmptyPacketListener("embeddings_out", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      jc.cosineSimilarity = function(t2, e2) {
        if (t2.floatEmbedding && e2.floatEmbedding) t2 = Yo(t2.floatEmbedding, e2.floatEmbedding);
        else {
          if (!t2.quantizedEmbedding || !e2.quantizedEmbedding) throw Error("Cannot compute cosine similarity between quantized and float embeddings.");
          t2 = Yo(Ko(t2.quantizedEmbedding), Ko(e2.quantizedEmbedding));
        }
        return t2;
      }, jc.prototype.embedForVideo = jc.prototype.Aa, jc.prototype.embed = jc.prototype.za, jc.prototype.setOptions = jc.prototype.o, jc.createFromModelPath = function(t2, e2) {
        return hc(jc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, jc.createFromModelBuffer = function(t2, e2) {
        return hc(jc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, jc.createFromOptions = function(t2, e2) {
        return hc(jc, t2, e2);
      };
      var Vc = class {
        constructor(t2, e2, n2) {
          this.confidenceMasks = t2, this.categoryMask = e2, this.qualityScores = n2;
        }
        close() {
          this.confidenceMasks?.forEach(((t2) => {
            t2.close();
          })), this.categoryMask?.close();
        }
      };
      function Xc(t2) {
        const e2 = (function(t3) {
          return En(t3, ss, 1);
        })(t2.ca()).filter(((t3) => (fe(Je(t3, 1)) ?? "").includes("mediapipe.tasks.TensorsToSegmentationCalculator")));
        if (t2.u = [], e2.length > 1) throw Error("The graph has more than one mediapipe.tasks.TensorsToSegmentationCalculator.");
        1 === e2.length && (_n(e2[0], ts, 7)?.j()?.g() ?? /* @__PURE__ */ new Map()).forEach(((e3, n2) => {
          t2.u[Number(n2)] = fe(Je(e3, 1)) ?? "";
        }));
      }
      function Hc(t2) {
        t2.categoryMask = void 0, t2.confidenceMasks = void 0, t2.qualityScores = void 0;
      }
      function Wc(t2) {
        try {
          const e2 = new Vc(t2.confidenceMasks, t2.categoryMask, t2.qualityScores);
          if (!t2.j) return e2;
          t2.j(e2);
        } finally {
          pa(t2);
        }
      }
      Vc.prototype.close = Vc.prototype.close;
      var zc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect", false), this.u = [], this.outputCategoryMask = false, this.outputConfidenceMasks = true, this.h = new Ro(), this.A = new ko(), Tn(this.h, 0, 3, this.A), Tn(t2 = this.h, 0, 1, e2 = new Hs());
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return void 0 !== t2.displayNamesLocale ? Qe(this.h, 2, le(t2.displayNamesLocale)) : "displayNamesLocale" in t2 && Qe(this.h, 2), "outputCategoryMask" in t2 && (this.outputCategoryMask = t2.outputCategoryMask ?? false), "outputConfidenceMasks" in t2 && (this.outputConfidenceMasks = t2.outputConfidenceMasks ?? true), super.l(t2);
        }
        L() {
          Xc(this);
        }
        segment(t2, e2, n2) {
          const r2 = "function" != typeof e2 ? e2 : {};
          return this.j = "function" == typeof e2 ? e2 : n2, Hc(this), lc(this, t2, r2), Wc(this);
        }
        La(t2, e2, n2, r2) {
          const i2 = "function" != typeof n2 ? n2 : {};
          return this.j = "function" == typeof n2 ? n2 : r2, Hc(this), fc(this, t2, i2, e2), Wc(this);
        }
        Da() {
          return this.u;
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect");
          const e2 = new ts();
          Lr(e2, Io, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.image_segmenter.ImageSegmenterGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect"), n2.o(e2), hs(t2, n2), fa(this, t2), this.outputConfidenceMasks && (ls(t2, "confidence_masks"), is(n2, "CONFIDENCE_MASKS:confidence_masks"), da(this, "confidence_masks"), this.g.aa("confidence_masks", ((t3, e3) => {
            this.confidenceMasks = t3.map(((t4) => dc(this, t4, true, !this.j))), la(this, e3);
          })), this.g.attachEmptyPacketListener("confidence_masks", ((t3) => {
            this.confidenceMasks = [], la(this, t3);
          }))), this.outputCategoryMask && (ls(t2, "category_mask"), is(n2, "CATEGORY_MASK:category_mask"), da(this, "category_mask"), this.g.Z("category_mask", ((t3, e3) => {
            this.categoryMask = dc(this, t3, false, !this.j), la(this, e3);
          })), this.g.attachEmptyPacketListener("category_mask", ((t3) => {
            this.categoryMask = void 0, la(this, t3);
          }))), ls(t2, "quality_scores"), is(n2, "QUALITY_SCORES:quality_scores"), this.g.attachFloatVectorListener("quality_scores", ((t3, e3) => {
            this.qualityScores = t3, la(this, e3);
          })), this.g.attachEmptyPacketListener("quality_scores", ((t3) => {
            this.categoryMask = void 0, la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      zc.prototype.getLabels = zc.prototype.Da, zc.prototype.segmentForVideo = zc.prototype.La, zc.prototype.segment = zc.prototype.segment, zc.prototype.setOptions = zc.prototype.o, zc.createFromModelPath = function(t2, e2) {
        return hc(zc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, zc.createFromModelBuffer = function(t2, e2) {
        return hc(zc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, zc.createFromOptions = function(t2, e2) {
        return hc(zc, t2, e2);
      };
      var Kc = class {
        constructor(t2, e2, n2) {
          this.confidenceMasks = t2, this.categoryMask = e2, this.qualityScores = n2;
        }
        close() {
          this.confidenceMasks?.forEach(((t2) => {
            t2.close();
          })), this.categoryMask?.close();
        }
      };
      Kc.prototype.close = Kc.prototype.close;
      var Yc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect_in", false), this.outputCategoryMask = false, this.outputConfidenceMasks = true, this.h = new Ro(), this.u = new ko(), Tn(this.h, 0, 3, this.u), Tn(t2 = this.h, 0, 1, e2 = new Hs());
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return "outputCategoryMask" in t2 && (this.outputCategoryMask = t2.outputCategoryMask ?? false), "outputConfidenceMasks" in t2 && (this.outputConfidenceMasks = t2.outputConfidenceMasks ?? true), super.l(t2);
        }
        segment(t2, e2, n2, r2) {
          const i2 = "function" != typeof n2 ? n2 : {};
          if (this.j = "function" == typeof n2 ? n2 : r2, this.qualityScores = this.categoryMask = this.confidenceMasks = void 0, n2 = this.C + 1, r2 = new Oo(), e2.keypoint && e2.scribble) throw Error("Cannot provide both keypoint and scribble.");
          if (e2.keypoint) {
            var s2 = new Fo();
            un(s2, 3, Zt(true), false), un(s2, 1, $t(e2.keypoint.x), 0), un(s2, 2, $t(e2.keypoint.y), 0), An(r2, 1, Co, s2);
          } else {
            if (!e2.scribble) throw Error("Must provide either a keypoint or a scribble.");
            {
              const t3 = new Mo();
              for (s2 of e2.scribble) un(e2 = new Fo(), 3, Zt(true), false), un(e2, 1, $t(s2.x), 0), un(e2, 2, $t(s2.y), 0), kn(t3, 1, Fo, e2);
              An(r2, 2, Co, t3);
            }
          }
          this.g.addProtoToStream(r2.g(), "mediapipe.tasks.vision.interactive_segmenter.proto.RegionOfInterest", "roi_in", n2), lc(this, t2, i2);
          t: {
            try {
              const t3 = new Kc(this.confidenceMasks, this.categoryMask, this.qualityScores);
              if (!this.j) {
                var o2 = t3;
                break t;
              }
              this.j(t3);
            } finally {
              pa(this);
            }
            o2 = void 0;
          }
          return o2;
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "roi_in"), us(t2, "norm_rect_in");
          const e2 = new ts();
          Lr(e2, Io, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.interactive_segmenter.InteractiveSegmenterGraphV2"), rs(n2, "IMAGE:image_in"), rs(n2, "ROI:roi_in"), rs(n2, "NORM_RECT:norm_rect_in"), n2.o(e2), hs(t2, n2), fa(this, t2), this.outputConfidenceMasks && (ls(t2, "confidence_masks"), is(n2, "CONFIDENCE_MASKS:confidence_masks"), da(this, "confidence_masks"), this.g.aa("confidence_masks", ((t3, e3) => {
            this.confidenceMasks = t3.map(((t4) => dc(this, t4, true, !this.j))), la(this, e3);
          })), this.g.attachEmptyPacketListener("confidence_masks", ((t3) => {
            this.confidenceMasks = [], la(this, t3);
          }))), this.outputCategoryMask && (ls(t2, "category_mask"), is(n2, "CATEGORY_MASK:category_mask"), da(this, "category_mask"), this.g.Z("category_mask", ((t3, e3) => {
            this.categoryMask = dc(this, t3, false, !this.j), la(this, e3);
          })), this.g.attachEmptyPacketListener("category_mask", ((t3) => {
            this.categoryMask = void 0, la(this, t3);
          }))), ls(t2, "quality_scores"), is(n2, "QUALITY_SCORES:quality_scores"), this.g.attachFloatVectorListener("quality_scores", ((t3, e3) => {
            this.qualityScores = t3, la(this, e3);
          })), this.g.attachEmptyPacketListener("quality_scores", ((t3) => {
            this.categoryMask = void 0, la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      Yc.prototype.segment = Yc.prototype.segment, Yc.prototype.setOptions = Yc.prototype.o, Yc.createFromModelPath = function(t2, e2) {
        return hc(Yc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Yc.createFromModelBuffer = function(t2, e2) {
        return hc(Yc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Yc.createFromOptions = function(t2, e2) {
        return hc(Yc, t2, e2);
      };
      var qc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "input_frame_gpu", "norm_rect", false), this.j = { detections: [] }, Tn(t2 = this.h = new No(), 0, 1, e2 = new Hs());
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return void 0 !== t2.displayNamesLocale ? Qe(this.h, 2, le(t2.displayNamesLocale)) : "displayNamesLocale" in t2 && Qe(this.h, 2), void 0 !== t2.maxResults ? Ln(this.h, 3, t2.maxResults) : "maxResults" in t2 && Qe(this.h, 3), void 0 !== t2.scoreThreshold ? Rn(this.h, 4, t2.scoreThreshold) : "scoreThreshold" in t2 && Qe(this.h, 4), void 0 !== t2.categoryAllowlist ? Fn(this.h, 5, t2.categoryAllowlist) : "categoryAllowlist" in t2 && Qe(this.h, 5), void 0 !== t2.categoryDenylist ? Fn(this.h, 6, t2.categoryDenylist) : "categoryDenylist" in t2 && Qe(this.h, 6), this.l(t2);
        }
        F(t2, e2) {
          return this.j = { detections: [] }, lc(this, t2, e2), this.j;
        }
        G(t2, e2, n2) {
          return this.j = { detections: [] }, fc(this, t2, n2, e2), this.j;
        }
        m() {
          var t2 = new fs();
          us(t2, "input_frame_gpu"), us(t2, "norm_rect"), ls(t2, "detections");
          const e2 = new ts();
          Lr(e2, Uo, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.ObjectDetectorGraph"), rs(n2, "IMAGE:input_frame_gpu"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "DETECTIONS:detections"), n2.o(e2), hs(t2, n2), this.g.attachProtoVectorListener("detections", ((t3, e3) => {
            for (const e4 of t3) t3 = Ts(e4), this.j.detections.push(Ho(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("detections", ((t3) => {
            la(this, t3);
          })), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      qc.prototype.detectForVideo = qc.prototype.G, qc.prototype.detect = qc.prototype.F, qc.prototype.setOptions = qc.prototype.o, qc.createFromModelPath = async function(t2, e2) {
        return hc(qc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, qc.createFromModelBuffer = function(t2, e2) {
        return hc(qc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, qc.createFromOptions = function(t2, e2) {
        return hc(qc, t2, e2);
      };
      var $c = class {
        constructor(t2, e2, n2) {
          this.landmarks = t2, this.worldLandmarks = e2, this.segmentationMasks = n2;
        }
        close() {
          this.segmentationMasks?.forEach(((t2) => {
            t2.close();
          }));
        }
      };
      function Jc(t2) {
        t2.landmarks = [], t2.worldLandmarks = [], t2.segmentationMasks = void 0;
      }
      function Zc(t2) {
        try {
          const e2 = new $c(t2.landmarks, t2.worldLandmarks, t2.segmentationMasks);
          if (!t2.u) return e2;
          t2.u(e2);
        } finally {
          pa(t2);
        }
      }
      $c.prototype.close = $c.prototype.close;
      var Qc = class extends pc {
        constructor(t2, e2) {
          super(new cc(t2, e2), "image_in", "norm_rect", false), this.landmarks = [], this.worldLandmarks = [], this.outputSegmentationMasks = false, Tn(t2 = this.h = new Do(), 0, 1, e2 = new Hs()), this.A = new yo(), Tn(this.h, 0, 3, this.A), this.j = new mo(), Tn(this.h, 0, 2, this.j), Ln(this.j, 4, 1), Rn(this.j, 2, 0.5), Rn(this.A, 2, 0.5), Rn(this.h, 4, 0.5);
        }
        get baseOptions() {
          return _n(this.h, Hs, 1);
        }
        set baseOptions(t2) {
          Tn(this.h, 0, 1, t2);
        }
        o(t2) {
          return "numPoses" in t2 && Ln(this.j, 4, t2.numPoses ?? 1), "minPoseDetectionConfidence" in t2 && Rn(this.j, 2, t2.minPoseDetectionConfidence ?? 0.5), "minTrackingConfidence" in t2 && Rn(this.h, 4, t2.minTrackingConfidence ?? 0.5), "minPosePresenceConfidence" in t2 && Rn(this.A, 2, t2.minPosePresenceConfidence ?? 0.5), "outputSegmentationMasks" in t2 && (this.outputSegmentationMasks = t2.outputSegmentationMasks ?? false), this.l(t2);
        }
        F(t2, e2, n2) {
          const r2 = "function" != typeof e2 ? e2 : {};
          return this.u = "function" == typeof e2 ? e2 : n2, Jc(this), lc(this, t2, r2), Zc(this);
        }
        G(t2, e2, n2, r2) {
          const i2 = "function" != typeof n2 ? n2 : {};
          return this.u = "function" == typeof n2 ? n2 : r2, Jc(this), fc(this, t2, i2, e2), Zc(this);
        }
        m() {
          var t2 = new fs();
          us(t2, "image_in"), us(t2, "norm_rect"), ls(t2, "normalized_landmarks"), ls(t2, "world_landmarks"), ls(t2, "segmentation_masks");
          const e2 = new ts();
          Lr(e2, Bo, this.h);
          const n2 = new ss();
          In(n2, 2, "mediapipe.tasks.vision.pose_landmarker.PoseLandmarkerGraph"), rs(n2, "IMAGE:image_in"), rs(n2, "NORM_RECT:norm_rect"), is(n2, "NORM_LANDMARKS:normalized_landmarks"), is(n2, "WORLD_LANDMARKS:world_landmarks"), n2.o(e2), hs(t2, n2), fa(this, t2), this.g.attachProtoVectorListener("normalized_landmarks", ((t3, e3) => {
            this.landmarks = [];
            for (const e4 of t3) t3 = xs(e4), this.landmarks.push(Wo(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("normalized_landmarks", ((t3) => {
            this.landmarks = [], la(this, t3);
          })), this.g.attachProtoVectorListener("world_landmarks", ((t3, e3) => {
            this.worldLandmarks = [];
            for (const e4 of t3) t3 = bs(e4), this.worldLandmarks.push(zo(t3));
            la(this, e3);
          })), this.g.attachEmptyPacketListener("world_landmarks", ((t3) => {
            this.worldLandmarks = [], la(this, t3);
          })), this.outputSegmentationMasks && (is(n2, "SEGMENTATION_MASK:segmentation_masks"), da(this, "segmentation_masks"), this.g.aa("segmentation_masks", ((t3, e3) => {
            this.segmentationMasks = t3.map(((t4) => dc(this, t4, true, !this.u))), la(this, e3);
          })), this.g.attachEmptyPacketListener("segmentation_masks", ((t3) => {
            this.segmentationMasks = [], la(this, t3);
          }))), t2 = t2.g(), this.setGraph(new Uint8Array(t2), true);
        }
      };
      Qc.prototype.detectForVideo = Qc.prototype.G, Qc.prototype.detect = Qc.prototype.F, Qc.prototype.setOptions = Qc.prototype.o, Qc.createFromModelPath = function(t2, e2) {
        return hc(Qc, t2, { baseOptions: { modelAssetPath: e2 } });
      }, Qc.createFromModelBuffer = function(t2, e2) {
        return hc(Qc, t2, { baseOptions: { modelAssetBuffer: e2 } });
      }, Qc.createFromOptions = function(t2, e2) {
        return hc(Qc, t2, e2);
      }, Qc.POSE_CONNECTIONS = Cc, exports.DrawingUtils = Ya, exports.FaceDetector = gc, exports.FaceLandmarker = Sc, exports.FilesetResolver = Qo, exports.GestureRecognizer = Pc, exports.HandLandmarker = Oc, exports.HolisticLandmarker = Bc, exports.ImageClassifier = Gc, exports.ImageEmbedder = jc, exports.ImageSegmenter = zc, exports.ImageSegmenterResult = Vc, exports.InteractiveSegmenter = Yc, exports.InteractiveSegmenterResult = Kc, exports.MPImage = rc, exports.MPMask = Ua, exports.ObjectDetector = qc, exports.PoseLandmarker = Qc, exports.TaskRunner = ga, exports.VisionTaskRunner = pc;
    }
  });
  return require_vision_bundle();
})();
