// AI講座 アンケートとワークのページの共通部品（2026-10-30）。質問を描いて、書きかけを残し、全部答えてあるかを確かめて、受け口へ送る
// 答えは送信先（池本さんのGoogle）にだけ送る。このページには受講生の情報を入れない
// 使い方: 各ページが AIFORM.start({ form, title, chip, msg, use, sections, ... }) を呼ぶ
(function () {
  var ENDPOINT = "https://script.google.com/macros/s/AKfycbzHl-0plUqnlLYwCqqWNoXRzbBwHgZnzwpY9AOCmANaQ8-0xdLVr7OB_B0sIRPedJfr/exec";

  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in (attrs || {})) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "cls") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }

  // ?kai= の回（1〜8・追加の回は 9・10）と、顧客管理が送るURLの &c=（その人の印）
  function kaiInfo(max) {
    var m = /[?&]kai=(\d{1,2})(?:&|$)/.exec(location.search);
    var n = m ? Number(m[1]) : 0;
    if (!(n >= 1 && n <= (max || 10))) return null;
    var c = /[?&]c=([A-Za-z0-9_-]{8,40})(?:&|$)/.exec(location.search);
    return {n: n, label: n <= 8 ? "第" + n + "回" : "追加" + (n - 8), mark: c ? c[1] : ""};
  }

  function store(key, val) {
    try {
      if (val === undefined) {
        var v = JSON.parse(localStorage.getItem(key) || "null");
        if (v && v._t && Date.now() - v._t > 3 * 86400000) { localStorage.removeItem(key); return null; }
        return v;
      }
      val._t = Date.now(); localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }
  function clearDrafts(prefix) {
    try { Object.keys(localStorage).forEach(function (k) { if (k.indexOf(prefix) === 0) localStorage.removeItem(k); }); } catch (e) {}
  }
  function newSid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  // 金額: 「40000」「40,000」「４万」「4.5万円」「4万5千」「4万5000円」「¥40,000」→ 数。読めなければ NaN
  function yenOf(s) {
    var t = String(s || "").normalize("NFKC").replace(/[,\s円¥\\]/g, "");
    var m = /^(\d+(?:\.\d+)?)万(?:(\d+)千|(\d{1,4}))?$/.exec(t);
    if (m) return Math.round(Number(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0) + (m[3] ? Number(m[3]) : 0));
    m = /^(\d+)千$/.exec(t);
    if (m) return Number(m[1]) * 1000;
    return /^\d+$/.test(t) ? Number(t) : NaN;
  }
  function yenText(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "円"; }

  function start(spec) {
    var app = document.getElementById("app");
    var info = kaiInfo(spec.maxKai);
    app.innerHTML = "";
    if (!info) {
      document.getElementById("ttl").innerHTML = "";
      document.getElementById("ttl").appendChild(document.createTextNode(spec.title));
      var sel = el("select", {id: "pick", "aria-label": "何回目か"});
      sel.appendChild(el("option", {value: "", text: "選んでください"}));
      for (var i = 1; i <= (spec.maxKai || 10); i++) sel.appendChild(el("option", {value: i, text: i <= 8 ? "第" + i + "回" : "追加" + (i - 8)}));
      sel.addEventListener("change", function () { if (sel.value) location.search = "?kai=" + sel.value; });
      app.appendChild(el("div", {cls: "card"}, [el("p", {text: "何回目の講座ですか？"}), sel]));
      return;
    }
    var K = spec.kinds ? spec.kinds(info.n) : spec;
    var ttl = document.getElementById("ttl");
    ttl.innerHTML = "";
    ttl.appendChild(el("span", {cls: "hl", text: info.label}));
    ttl.appendChild(document.createTextNode(spec.title));
    document.title = "AI講座 " + info.label + spec.title + "｜STUDIO PATTI";
    var draftKey = spec.draft + info.n;
    var draft = store(draftKey) || {};
    var sid = draft._sid || newSid();  // 1回の送信の番号（押し直しても二重にしない）

    if (K.use && K.use.length) {
      app.appendChild(el("div", {cls: "card use"}, [el("h2", {text: spec.useTitle || "いただいた答えの使い道"}), el("ul", {}, K.use.map(function (t) { return el("li", {text: "・" + t}); }))]));
    }

    var form = el("form", {id: "f", novalidate: "novalidate", cls: "stack"});
    var nameCard = el("div", {cls: "card q", id: "c_name"}, [
      el("p", {cls: "qt"}, [el("span", {cls: "grow", text: "お名前"}), el("span", {cls: "req", text: "必須"})]),
      el("input", {type: "text", id: "name", autocomplete: "nickname", placeholder: "ニックネームでOK", maxlength: "40", enterkeyhint: "done", "aria-label": "お名前", "aria-describedby": "e_name"}),
      el("p", {cls: "err", id: "e_name", text: "お名前を入れてください"})
    ]);
    nameCard.setAttribute("tabindex", "-1");
    form.appendChild(nameCard);

    var all = [], no = 0;
    K.sections.forEach(function (sec) {
      if (sec.t) form.appendChild(el("h2", {cls: "guide", text: sec.t}));
      if (sec.note) form.appendChild(el("p", {cls: "secnote", text: sec.note}));
      sec.q.forEach(function (q) {
        no += 1; q.no = "Q" + no; all.push(q);
        if (q.lead) form.appendChild(el("p", {cls: "secnote", text: q.lead}));
        var card = el("div", {cls: "card q" + (q.type === "long" ? " work" : ""), id: "c_" + q.id, role: "group", "aria-labelledby": "t_" + q.id, "aria-describedby": "e_" + q.id, tabindex: "-1"});
        var qt = el("p", {cls: "qt"}, [el("span", {cls: "no", text: q.no}), el("span", {cls: "grow", id: "t_" + q.id, text: q.t})]);
        if (!q.optional) qt.appendChild(el("span", {cls: "req", text: "必須"}));
        card.appendChild(qt);
        if (q.hint) card.appendChild(el("p", {cls: "hint", text: q.hint}));
        if (q.ex) card.appendChild(el("p", {cls: "ex"}, [el("b", {text: "池本の例"}), q.ex]));
        if (q.how) card.appendChild(el("details", {cls: "how"}, [el("summary", {text: "考え方"}), el("ul", {}, q.how.map(function (t) { return el("li", {text: "・" + t}); }))]));
        if (q.type === "text" || q.type === "long") {
          var ta = el("textarea", {id: q.id, maxlength: q.type === "long" ? "3000" : "1500", "aria-label": q.t});
          if (q.ph) ta.setAttribute("placeholder", q.ph);
          if (q.small) ta.style.minHeight = "64px";
          card.appendChild(ta);
        } else if (q.type === "yen") {
          card.appendChild(el("div", {cls: "yen"}, [el("input", {type: "text", id: q.id, inputmode: "numeric", placeholder: "数字だけ", maxlength: "12", enterkeyhint: "done", "aria-label": q.t}), el("span", {text: "円"})]));
        } else {
          var box = el("div", {cls: "opts" + (q.col ? " col" : "")});
          q.o.forEach(function (o, i) {
            var inp = el("input", {type: q.type === "one" ? "radio" : "checkbox", name: q.id, value: o, id: q.id + "_" + i});
            box.appendChild(el("label", {cls: "opt", "for": q.id + "_" + i}, [inp, el("span", {text: o})]));
          });
          card.appendChild(box);
          if (q.other) {
            var ot = el("input", {type: "text", id: q.id + "_other", cls: "other", placeholder: q.otherLabel || "ひとことで", maxlength: "300", enterkeyhint: "done", "aria-label": q.otherLabel || "その他の中身"});
            card.appendChild(ot);
            box.addEventListener("change", function () { ot.classList.toggle("show", !!box.querySelector('input[value="' + q.other + '"]:checked')); });
          }
        }
        card.appendChild(el("p", {cls: "err", id: "e_" + q.id}));
        form.appendChild(card);
      });
    });
    form.appendChild(el("input", {type: "text", name: "x_hp", id: "x_hp", cls: "hp", tabindex: "-1", autocomplete: "off", "aria-hidden": "true"}));
    // 最後の質問の下のひとこと（2026-10-30 夕 池本さん「Q17の下に、「ありがとうございました！（改行）第2回もよろしくお願いします♪」」）
    var endNote = typeof spec.endNote === "function" ? spec.endNote(info.n) : spec.endNote;
    if (endNote) form.appendChild(el("p", {cls: "endnote", text: endNote}));
    var btn = el("button", {type: "submit", cls: "btn", text: "送信"});
    form.appendChild(el("div", {}, [btn, el("p", {cls: "small", text: "送ると、池本にだけ届きます。"}), el("p", {cls: "small", text: "書きかけはこの端末にだけ残り、送ると消えます。"})]));
    app.appendChild(form);

    // 書きかけを、この端末にだけ残す（閉じても消えないように。名前は残さない・3日で消える）
    restore(form, draft);
    var save = function () { var s = snapshot(form); s._sid = sid; store(draftKey, s); };
    form.addEventListener("input", function (ev) {
      save();
      var c = ev.target.closest && ev.target.closest(".card.bad");
      if (c) check(c.id === "c_name" ? null : qOf(c.id), c);
      all.forEach(function (q) {
        var dc = document.getElementById("c_" + q.id);
        if (q.after && q.after === ev.target.id && dc.classList.contains("bad")) check(q, dc);
      });
    });
    form.addEventListener("change", function (ev) {
      save();
      var c = ev.target.closest && ev.target.closest(".card.bad");
      if (c) check(qOf(c.id), c);
    });
    form.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" && ev.target.tagName === "INPUT" && ev.target.type === "text" && !ev.isComposing && ev.keyCode !== 229) {
        ev.preventDefault(); ev.target.blur();
      }
    });
    Array.prototype.forEach.call(form.querySelectorAll("input[type=radio]"), function (x) {
      var lab = x.closest("label");  // 見えている丸ボタンは label の方なので、押す前の状態は label で覚える
      (lab || x).addEventListener("pointerdown", function () { x.dataset.was = x.checked ? "1" : ""; });
      x.addEventListener("click", function () {
        if (x.dataset.was === "1") { x.checked = false; x.dataset.was = ""; x.dispatchEvent(new Event("change", {bubbles: true})); }
      });
    });
    function qOf(cid) { for (var i = 0; i < all.length; i++) if ("c_" + all[i].id === cid) return all[i]; return null; }

    // 1問の答え（文字）。空なら ""
    function answerOf(q) {
      if (q.type === "text" || q.type === "long") return document.getElementById(q.id).value.trim();
      if (q.type === "yen") { var n = yenOf(document.getElementById(q.id).value); return isNaN(n) ? "" : yenText(n); }
      var a = Array.prototype.map.call(form.querySelectorAll('input[name="' + q.id + '"]:checked'), function (x) { return x.value; }).join("、");
      var ot = document.getElementById(q.id + "_other");
      if (ot && ot.classList.contains("show") && ot.value.trim()) a += "（" + ot.value.trim() + "）";
      return a;
    }
    // 答えてあるか。足りなければ、その窓に赤い印と理由を出す
    function problem(q) {
      if (!q) return document.getElementById("name").value.trim() ? "" : "お名前を入れてください";
      if (q.optional) return "";
      if (q.type === "text" || q.type === "long") return document.getElementById(q.id).value.trim() ? "" : (q.empty || "ひとこと書いてください");
      if (q.type === "yen") {
        var v = document.getElementById(q.id).value.trim();
        if (!v) return "金額を入れてください";
        var n = yenOf(v);
        if (isNaN(n)) return "円の金額を、数字で入れてください";
        if (n < 100) return "円の金額で入れてください（万円ではなく円で）";
        var prev = q.after ? yenOf(document.getElementById(q.after).value) : NaN;
        if (!isNaN(prev) && n < prev) return "ひとつ上の答えと同じか、それより大きい金額にしてください";
        return "";
      }
      if (!form.querySelector('input[name="' + q.id + '"]:checked')) return "選んでください";
      var ot = document.getElementById(q.id + "_other");
      if (ot && ot.classList.contains("show") && !ot.value.trim()) return "「" + q.other + "」の中身を、ひとこと書いてください";
      return "";
    }
    function check(q, card) {
      var why = problem(q);
      card.classList.toggle("bad", !!why);
      card.querySelector(".err").textContent = why;
      if (why) card.setAttribute("aria-invalid", "true"); else card.removeAttribute("aria-invalid");
      return !why;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var bad = null;
      if (!check(null, nameCard)) bad = nameCard;
      all.forEach(function (q) { var c = document.getElementById("c_" + q.id); if (!check(q, c) && !bad) bad = c; });
      if (bad) { bad.scrollIntoView({behavior: "smooth", block: "center"}); bad.focus({preventScroll: true}); return; }  // 窓に印を移す（読み上げで、どこが足りないか分かる。キーボードは開かない）
      var items = all.map(function (q) { return {q: q.no + " " + q.t, a: answerOf(q)}; });
      var name = document.getElementById("name").value.trim();
      var body = {form: spec.form, kai: info.label + (spec.kaiSuffix || ""), name: name, items: items, sid: sid, c: info.mark, x_hp: form.querySelector(".hp").value};
      btn.disabled = true; btn.textContent = "送っています…";
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 30000);
      fetch(ENDPOINT, {method: "POST", headers: {"Content-Type": "text/plain;charset=utf-8"}, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined})
        .then(function (r) { clearTimeout(timer); return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error(j && j.error);
          clearDrafts(spec.draft);
          done(items);
        })
        .catch(function () {
          clearTimeout(timer);
          btn.disabled = false; btn.textContent = "送信";
          alert("送れませんでした。少し時間をおいて、もう一度「送信」を押してください。書いた内容は残っています。");
        });
    });

    function done(items) {
      app.innerHTML = "";
      var kids = [el("h2", {text: "送信しました"}), el("p", {text: typeof spec.doneText === "function" ? spec.doneText(info.n) : spec.doneText})];
      if (spec.keepCopy) {
        // エクセルなら手元に残ったので、送った内容を自分用にコピーできるようにする（この画面を閉じると消える）
        var text = items.map(function (x) { return "■ " + x.q.replace(/^Q\d+ /, "") + "\n" + x.a; }).join("\n\n");
        var pre = el("pre", {cls: "mine", text: text});
        var cp = el("button", {type: "button", cls: "btn ghost", text: "自分用にコピーする"});
        cp.addEventListener("click", function () {
          var ok = function () { cp.textContent = "コピーしました"; };
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, function () { selectPre(pre); });
          else selectPre(pre);
        });
        kids.push(el("p", {cls: "hint", text: "送った内容です。メモなどに貼って残せます。"}), pre, cp);
      }
      app.appendChild(el("div", {cls: "card done"}, kids));
      window.scrollTo(0, 0);
    }
  }

  function selectPre(pre) {
    var r = document.createRange(); r.selectNodeContents(pre);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function snapshot(form) {
    var s = {};
    Array.prototype.forEach.call(form.querySelectorAll("input,textarea"), function (x) {
      if (x.classList.contains("hp") || x.id === "name") return;
      if (x.type === "radio" || x.type === "checkbox") { if (x.checked) s[x.id] = true; }
      else if (x.id) s[x.id] = x.value;
    });
    return s;
  }
  function restore(form, s) {
    Object.keys(s || {}).forEach(function (id) {
      if (id.charAt(0) === "_") return;
      var x = document.getElementById(id);
      if (!x) return;
      if (x.type === "radio" || x.type === "checkbox") x.checked = !!s[id];
      else x.value = s[id];
    });
    Array.prototype.forEach.call(form.querySelectorAll(".opts"), function (b) { b.dispatchEvent(new Event("change", {bubbles: true})); });
  }

  window.AIFORM = {start: start};
})();
