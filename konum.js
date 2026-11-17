/* =====================================================================
   BILGE KIRTASIYE · KONUM KONTROLU (Cloudflare sunucusu ile)

   - Dukkanin koordinatlari artik telefonda degil, Cloudflare'de durur.
   - Telefon konumunu sunucuya gonderir; dukkandaysa 10 dakikalik bir bilet alir.
   - Site acik kaldigi surece konum izlenir; musteri dukkandan ayrilinca site kilitlenir.
   - Ekran kapatilip acilinca ya da baska uygulamaya gecip donulunce konum yeniden kontrol edilir.

   Personel cihazlari (GPS'i olmayan kasa bilgisayari, tezgah tableti):
       .../fiyatgor/?personel=<PERSONEL_ANAHTARI>   adresiyle bir kez acin.
   Sifirlamak icin:  .../fiyatgor/?sifirla=1
   ===================================================================== */
(function () {
  const API = String(window.FIYATGOR_API || "").replace(/\/+$/, "");
  const params = new URLSearchParams(location.search);
  const oku = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const yaz = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

  if (params.has("sifirla")) { yaz("bk_personel", null); yaz("bk_personel_anahtar", null); }
  if (params.get("personel")) yaz("bk_personel_anahtar", params.get("personel"));

  let coz;
  const KONUM = window.KONUM = {
    api: API,
    bilet: null,
    bitis: 0,
    acik: false,
    hazir: new Promise(r => (coz = r)),
  };
  window.KONUM_HAZIR = KONUM.hazir;

  if (!API) {
    console.warn("ayar.js: FIYATGOR_API (Cloudflare adresi) ayarlanmamis.");
    KONUM.acik = true; coz(); return;
  }

  // ---------------- Arayuz ----------------
  const css = `
  #konumKapi{position:fixed;inset:0;z-index:900;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:radial-gradient(circle at 50% 35%,#14152a 0,#000 70%)}
  #konumKapi .kutu{max-width:420px;width:100%;text-align:center}
  #konumKapi .ikon{font-size:64px;line-height:1;margin-bottom:10px}
  #konumKapi h2{font-size:23px;margin:0 0 10px;line-height:1.3}
  #konumKapi p{color:rgba(255,255,255,.75);font-size:16px;line-height:1.5;margin:0 0 18px}
  #konumKapi button{width:100%;font-size:19px;padding:16px;border:0;border-radius:14px;background:#bb1057;color:#fff;
    cursor:pointer;font-weight:600;box-shadow:0 0 24px rgba(187,16,87,.45)}
  #konumKapi .not{font-size:13px;color:rgba(255,255,255,.5);margin-top:14px}
  #konumKapi .marka{font-family:"Cuprum",sans-serif;font-weight:700;font-size:28px;margin-bottom:22px}
  #konumKapi .marka .b{text-shadow:0 0 12px #bb1057,0 0 2px #bb1057}
  #konumKapi .marka .k{text-shadow:0 0 12px #2432b5,0 0 2px #2432b5;font-size:21px}
  #konumKapi .marka i{font-style:italic}
  #konumKapi .serit{height:4px;border-radius:2px;margin:0 auto 22px;width:160px;
    background:linear-gradient(90deg,#2432b5 0 20%,#c28e4a 20% 40%,#d3d7d7 40% 60%,#c23a73 60% 80%,#31b142 80%)}
  #konumKapi .donen{width:44px;height:44px;border-radius:50%;margin:6px auto 16px;border:4px solid rgba(255,255,255,.2);
    border-top-color:#bb1057;animation:kkdon .9s linear infinite}
  @keyframes kkdon{to{transform:rotate(360deg)}}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function kapi() {
    let d = document.getElementById("konumKapi");
    if (!d) {
      d = document.createElement("div"); d.id = "konumKapi";
      d.innerHTML = `<div class="kutu"><div class="marka"><span class="b">b<i>i</i>lge</span> <span class="k">k<i>ı</i>rtas<i>i</i>ye</span></div>
        <div class="serit"></div><div id="kkIcerik"></div></div>`;
      (document.body || document.documentElement).appendChild(d);
    }
    return d;
  }
  function goster(html, dugme) {
    kapi(); document.getElementById("kkIcerik").innerHTML = html;
    const b = document.getElementById("kkBtn"); if (b && dugme) b.onclick = dugme;
  }
  const kapiKaldir = () => { const d = document.getElementById("konumKapi"); if (d) d.remove(); };
  const mesafeYazi = m => m >= 1000 ? (m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " km" : Math.round(m) + " m";

  const ekranKontrol = () => goster(`<div class="donen"></div><h2>Konumunuz kontrol ediliyor…</h2><p>Birkaç saniye sürebilir.</p>`);
  const ekranIlk = () => goster(`<div class="ikon">📍</div>
      <h2>Fiyat Gör yalnızca mağazamızın içinde çalışır</h2>
      <p>Mağazada olduğunuzu doğrulamak için konum izni istiyoruz. Konumunuz kaydedilmez, sadece bu kontrol için kullanılır.</p>
      <button id="kkBtn" type="button">📍 Konumumu Doğrula</button>`, baslat);
  const ekranHata = msg => goster(`<div class="ikon">⚠️</div><h2>Konum doğrulanamadı</h2><p>${msg}</p>
      <button id="kkBtn" type="button">🔄 Tekrar Dene</button>`, baslat);
  const ekranUzak = (c, ayrildi) => goster(`<div class="ikon">🏪</div>
      <h2>${ayrildi ? "Mağazadan ayrıldığınız için Fiyat Gör kapatıldı" : "Mağazamızdan yaklaşık " + mesafeYazi(c.mesafe) + " uzaktasınız"}</h2>
      <p>Fiyat Gör yalnızca Bilge Kırtasiye'nin içinde kullanılabilir. Sizi mağazamızda bekliyoruz!</p>
      <button id="kkBtn" type="button">🔄 Tekrar Dene</button>
      <div class="not">Ölçülen mesafe: ${mesafeYazi(c.mesafe)} · sınır ${Math.round(c.sinir)} m</div>`, baslat);

  // ---------------- Kilit ----------------
  function kilitle(sebep, veri) {
    const acikti = KONUM.acik;
    KONUM.acik = false; KONUM.bilet = null; KONUM.bitis = 0;
    if (acikti) window.dispatchEvent(new CustomEvent("fiyatgor-kilit", { detail: sebep }));
    if (sebep === "ayrildi" || sebep === "uzakta") { izlemeDurdur(); ekranUzak(veri || { mesafe: 0, sinir: 0 }, sebep === "ayrildi"); }
    else if (sebep === "kontrol") ekranKontrol();
    else ekranIlk();
  }
  KONUM.kilitle = sebep => {
    if (personelAnahtar()) return personelGiris();
    kilitle("kontrol"); baslat();
  };
  function ac(cevap) {
    KONUM.bilet = cevap.bilet; KONUM.bitis = cevap.bitis; KONUM.acik = true;
    kapiKaldir(); coz();
    window.dispatchEvent(new CustomEvent("fiyatgor-acik"));
  }

  async function giris(govde) {
    const r = await fetch(API + "/api/giris", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(govde) });
    const j = await r.json().catch(() => ({}));
    return { durum: r.status, ...j };
  }

  // ---------------- Personel ----------------
  const personelAnahtar = () => oku("bk_personel_anahtar");
  async function personelGiris() {
    ekranKontrol();
    try {
      const c = await giris({ personel: personelAnahtar() });
      if (c.bilet) { ac(c); setTimeout(personelGiris, Math.max(60000, c.bitis - Date.now() - 3600000)); return; }
      yaz("bk_personel_anahtar", null);   // anahtar yanlis: normal musteri gibi devam
      ekranIlk();
    } catch (e) { ekranHata("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin."); }
  }

  // ---------------- Musteri: surekli konum izleme ----------------
  let izleme = null, sonKonum = null, sonGonderim = 0, sonGonderilen = null, gonderiliyor = false;
  let ilkPencere = 0, enIyiCevap = null, pencereZamani = null, deneme = 0;

  function izlemeDurdur() { if (izleme !== null) { navigator.geolocation.clearWatch(izleme); izleme = null; } }

  function mesafeM(a, b) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const da = r(b.latitude - a.latitude), db = r(b.longitude - a.longitude);
    const h = Math.sin(da / 2) ** 2 + Math.cos(r(a.latitude)) * Math.cos(r(b.latitude)) * Math.sin(db / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  async function gonder(c) {
    if (gonderiliyor) return;
    gonderiliyor = true; sonGonderim = Date.now(); sonGonderilen = c;
    const buDeneme = deneme;
    try {
      const cevap = await giris({ enlem: c.latitude, boylam: c.longitude, dogruluk: c.accuracy });
      if (buDeneme !== deneme) return;   // bu arada yeni bir deneme baslatildi, eski cevabi yok say
      if (cevap.bilet) { ac(cevap); return; }
      if (cevap.hata === "uzakta") {
        if (KONUM.acik) return kilitle("ayrildi", cevap);              // icerdeydi, simdi disarida
        enIyiCevap = cevap;
        if (Date.now() > ilkPencere) kilitle("uzakta", cevap);        // daha net olcum icin bekleme suresi doldu
        return;
      }
      if (!KONUM.acik) ekranHata("Sunucu yanıtı: " + (cevap.hata || cevap.durum));
    } catch (e) {
      if (!KONUM.acik) ekranHata("Sunucuya bağlanılamadı. İnternet bağlantınızı kontrol edin.");
    } finally { gonderiliyor = false; }
  }

  function yeniKonum(p) {
    const c = p.coords; sonKonum = c;
    if (!KONUM.acik) {
      // Ilk dogrulama: her daha net olcumu gonder (en fazla 6 sn); sunucu "icerde" derse hemen acilir
      if (!sonGonderilen || c.accuracy < sonGonderilen.accuracy - 5 || Date.now() - sonGonderim > 2500) gonder(c);
      return;
    }
    // Acikken: dakikada bir ya da 25 m'den fazla hareket edilince sunucuya tekrar sor
    const hareket = sonGonderilen ? mesafeM(sonGonderilen, c) : 999;
    if (Date.now() - sonGonderim > 60000 || hareket > 25 || KONUM.bitis - Date.now() < 3 * 60000) gonder(c);
  }

  function baslat() {
    if (personelAnahtar()) return personelGiris();
    if (!navigator.geolocation) return ekranHata("Bu cihaz konum özelliğini desteklemiyor.");
    ekranKontrol();
    deneme++; ilkPencere = Date.now() + 6000; sonGonderilen = null; enIyiCevap = null; gonderiliyor = false;
    clearTimeout(pencereZamani);
    izlemeDurdur();
    izleme = navigator.geolocation.watchPosition(yeniKonum, err => {
      if (KONUM.acik) return;   // acikken gecici hata: bilet suresi dolunca zaten kilitlenir
      izlemeDurdur();
      if (err.code === 1) {
        ekranHata(`Konum izni verilmedi.<br><br>
          <b>iPhone:</b> Ayarlar → Gizlilik → Konum Servisleri → Safari → "Kullanırken"<br>
          <b>Android:</b> Adres çubuğundaki 🔒 simgesi → İzinler → Konum → İzin ver`);
      } else ekranHata("Konum alınamadı. Telefonunuzun konum (GPS) özelliğinin açık olduğundan emin olun.");
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });   // eski (onbellekteki) konumu kullanma
    // 6 sn icinde sonuc cikmadiysa son cevabi goster
    pencereZamani = setTimeout(() => { if (!KONUM.acik && enIyiCevap) kilitle("uzakta", enIyiCevap); }, 6500);
  }

  // Bilet suresi dolarsa (or. konum kapatildi, guncelleme gelmiyor) kilitle
  setInterval(() => { if (KONUM.acik && KONUM.bitis && Date.now() > KONUM.bitis) KONUM.kilitle("sure"); }, 15000);

  // Ekran kapatilip acilinca / baska uygulamadan donulunce: once kilitle, sonra yeniden dogrula
  let gizlendi = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { gizlendi = Date.now(); if (!personelAnahtar()) izlemeDurdur(); return; }
    if (personelAnahtar()) return;
    if (Date.now() - gizlendi > 5000 || !KONUM.acik) { kilitle("kontrol"); baslat(); }
    else if (izleme === null) baslat();
  });

  function ilkAcilis() {
    if (personelAnahtar()) return personelGiris();
    ekranIlk();
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then(s => { if (s.state === "granted") baslat(); }).catch(() => {});
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ilkAcilis); else ilkAcilis();
})();
