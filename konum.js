/* =====================================================================
   BILGE KIRTASIYE · KONUM KONTROLU
   Site sadece dukkanin icinde / yakininda kullanilabilsin diye.

   KURULUM:
   1) Dukkanin icindeyken siteyi su adresle acin:  .../fiyatgor/?kurulum=1
   2) Ekranda cikan enlem ve boylami asagidaki DUKKAN alanina yazin.
   3) Dosyayi GitHub'a yukleyin. Hepsi bu.

   Personel cihazlari (kasa bilgisayari, tezgah tableti gibi GPS'i olmayan
   cihazlar) icin siteyi bir kez su adresle acin:
       .../fiyatgor/?personel=<PERSONEL_ANAHTARI>
   O cihaz bir daha konum sormaz.
   ===================================================================== */

const DUKKAN = {
enlem: 40.027836,        // ornek: 41.0082   (kurulum modunda cikan deger)
  boylam:27.047282,       // ornek: 28.9784
  yaricap: 30,        // metre - dukkanin merkezinden bu mesafeye kadar "dukkanda" sayilir
};
const GPS_PAYI = 20;    // GPS sapmasi icin en fazla bu kadar metre ek pay verilir (toplam sinir: 30 + 20 = 50 m)
const PERSONEL_ANAHTARI = "bilge-personel-2026";   // istediginiz gibi degistirin
const IZIN_SURESI_DK = 0;      // 0 = site her acildiginda konumu yeniden kontrol eder

(function () {
  const params = new URLSearchParams(location.search);
  let coz;
  window.KONUM_HAZIR = new Promise(r => (coz = r));

  const guvenliOku = (depo, k) => { try { return window[depo].getItem(k); } catch (e) { return null; } };
  const guvenliYaz = (depo, k, v) => { try { window[depo].setItem(k, v); } catch (e) {} };

  // ---- Sifirlama: ?sifirla=1 (personel izni ve kayitli onaylar silinir) ----
  if (params.has("sifirla")) {
    try { localStorage.removeItem("bk_personel"); localStorage.removeItem("bk_konum_onay"); } catch (e) {}
  }

  // ---- Personel cihazi ----
  if (params.get("personel") === PERSONEL_ANAHTARI) guvenliYaz("localStorage", "bk_personel", "1");
  const personel = guvenliOku("localStorage", "bk_personel") === "1";

  const kurulum = params.has("kurulum");
  const ayarli = typeof DUKKAN.enlem === "number" && typeof DUKKAN.boylam === "number";

  // Daha once onay alindiysa ve suresi dolmadiysa tekrar sorma
  const onayZamani = +guvenliOku("localStorage", "bk_konum_onay") || 0;
  const onayGecerli = IZIN_SURESI_DK > 0 && Date.now() - onayZamani < IZIN_SURESI_DK * 60 * 1000;

  if (!kurulum && (personel || !ayarli || onayGecerli)) {
    if (!ayarli && !personel) console.warn("konum.js: dukkan konumu henuz ayarlanmadi, kontrol kapali.");
    coz(); return;
  }

  // ---------------- Arayuz ----------------
  const css = `
  #konumKapi{position:fixed;inset:0;z-index:900;background:#000;color:#fff;display:flex;align-items:center;
    justify-content:center;padding:24px;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:radial-gradient(circle at 50% 35%,#14152a 0,#000 70%)}
  #konumKapi .kutu{max-width:420px;width:100%;text-align:center}
  #konumKapi .ikon{font-size:64px;line-height:1;margin-bottom:10px}
  #konumKapi h2{font-size:23px;margin:0 0 10px;line-height:1.3}
  #konumKapi p{color:rgba(255,255,255,.75);font-size:16px;line-height:1.5;margin:0 0 18px}
  #konumKapi button{width:100%;font-size:19px;padding:16px;border:0;border-radius:14px;background:#bb1057;color:#fff;
    cursor:pointer;font-weight:600;box-shadow:0 0 24px rgba(187,16,87,.45)}
  #konumKapi button:disabled{opacity:.6}
  #konumKapi .not{font-size:13px;color:rgba(255,255,255,.5);margin-top:14px}
  #konumKapi .marka{font-family:"Cuprum",sans-serif;font-weight:700;font-size:28px;margin-bottom:22px}
  #konumKapi .marka .b{text-shadow:0 0 12px #bb1057,0 0 2px #bb1057}
  #konumKapi .marka .k{text-shadow:0 0 12px #2432b5,0 0 2px #2432b5;font-size:21px}
  #konumKapi .marka i{font-style:italic}
  #konumKapi .koord{background:#fff;color:#111;border-radius:12px;padding:14px;font:600 18px/1.6 ui-monospace,Menlo,monospace;
    margin:10px 0 14px;user-select:all;-webkit-user-select:all}
  #konumKapi .serit{height:4px;border-radius:2px;margin:0 auto 22px;width:160px;
    background:linear-gradient(90deg,#2432b5 0 20%,#c28e4a 20% 40%,#d3d7d7 40% 60%,#c23a73 60% 80%,#31b142 80%)}`;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  function kapiKur() {
    const d = document.createElement("div");
    d.id = "konumKapi";
    d.innerHTML = `<div class="kutu">
      <div class="marka"><span class="b">b<i>i</i>lge</span> <span class="k">k<i>ı</i>rtas<i>i</i>ye</span></div>
      <div class="serit"></div>
      <div id="kkIcerik"></div></div>`;
    document.body.appendChild(d);
    return d;
  }
  const kapi = () => document.getElementById("konumKapi") || kapiKur();
  function goster(html) { kapi(); document.getElementById("kkIcerik").innerHTML = html; }

  // Iki nokta arasi mesafe (metre)
  function mesafe(a1, b1, a2, b2) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const da = r(a2 - a1), db = r(b2 - b1);
    const h = Math.sin(da / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(db / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const mesafeYazi = m => m >= 1000 ? (m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 }) + " km" : Math.round(m) + " m";

  // ---------------- Kurulum modu ----------------
  function kurulumBaslat() {
    goster(`<div class="ikon">🛠️</div><h2>Kurulum modu</h2>
      <p>Dükkânın ortasında durun ve konumun netleşmesini bekleyin (doğruluk 30 metrenin altına inmeli).</p>
      <div class="koord" id="kkKoord">Konum bekleniyor…</div>
      <p id="kkDog"></p>
      <button id="kkKapat" type="button">Siteye geç</button>
      <div class="not">Çıkan iki sayıyı konum.js dosyasındaki DUKKAN alanına yazın.</div>`);
    document.getElementById("kkKapat").onclick = () => { kapi().remove(); coz(); };
    if (!navigator.geolocation) { document.getElementById("kkKoord").textContent = "Bu cihazda konum yok."; return; }
    navigator.geolocation.watchPosition(p => {
      const { latitude: e, longitude: b, accuracy: a } = p.coords;
      document.getElementById("kkKoord").innerHTML = `enlem: ${e.toFixed(6)},<br>boylam: ${b.toFixed(6)},`;
      document.getElementById("kkDog").textContent = `Doğruluk: ±${Math.round(a)} m` + (a <= 30 ? " ✓ yeterli" : " — bekleyin…");
    }, err => {
      document.getElementById("kkKoord").textContent = "Konum alınamadı: " + err.message;
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  }

  // ---------------- Normal kontrol ----------------
  function ilkEkran() {
    goster(`<div class="ikon">📍</div>
      <h2>Fiyat Gör yalnızca mağazamızın içinde çalışır</h2>
      <p>Dükkânda olduğunuzu doğrulamak için konum izni istiyoruz. Konumunuz kaydedilmez ve hiçbir yere gönderilmez.</p>
      <button id="kkBtn" type="button">📍 Konumumu Doğrula</button>
      <div class="not">Konum izni sadece bu kontrol için kullanılır.</div>`);
    document.getElementById("kkBtn").onclick = dogrula;
  }

  function kontrolEkrani() {
    goster(`<div class="ikon">📡</div><h2>Konumunuz kontrol ediliyor…</h2>
      <p>Birkaç saniye sürebilir.</p>`);
  }

  // GPS ilk olcumde sapabilir: en fazla 5 sn boyunca en iyi (en dogru) olcumu topla
  let izleme = null;
  function dogrula() {
    if (!navigator.geolocation) return hata("Bu cihaz konum özelliğini desteklemiyor.");
    kontrolEkrani();
    let enIyi = null, bitti = false;
    const bitir = () => {
      if (bitti) return; bitti = true;
      if (izleme !== null) navigator.geolocation.clearWatch(izleme);
      clearTimeout(zaman);
      if (enIyi) karar(enIyi);
    };
    const zaman = setTimeout(bitir, 5000);
    izleme = navigator.geolocation.watchPosition(p => {
      if (!enIyi || p.coords.accuracy < enIyi.accuracy) enIyi = p.coords;
      if (enIyi.accuracy <= 25) bitir();                   // yeterince net, beklemeye gerek yok
    }, err => {
      if (bitti) return;
      if (enIyi) return bitir();
      bitti = true; clearTimeout(zaman);
      if (izleme !== null) navigator.geolocation.clearWatch(izleme);
      if (err.code === 1) {
        hata(`Konum izni verilmedi.<br><br>
          <b>iPhone:</b> Ayarlar → Gizlilik → Konum Servisleri → Safari → "Kullanırken"<br>
          <b>Android:</b> Adres çubuğundaki 🔒 simgesi → İzinler → Konum → İzin ver`);
      } else {
        hata("Konum alınamadı. Telefonunuzun konum (GPS) özelliğinin açık olduğundan emin olun.");
      }
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
  }

  function karar(c) {
    const m = mesafe(c.latitude, c.longitude, DUKKAN.enlem, DUKKAN.boylam);
    const sinir = DUKKAN.yaricap + Math.min(c.accuracy, GPS_PAYI);
    const olcum = `Ölçülen mesafe: ${mesafeYazi(m)} · doğruluk ±${Math.round(c.accuracy)} m · sınır ${Math.round(sinir)} m`;
    if (m <= sinir) {
      guvenliYaz("localStorage", "bk_konum_onay", String(Date.now()));
      kapi().remove(); coz();
    } else if (c.accuracy > 150 && m < 400) {
      hata(`Konumunuz net alınamadı. Telefonunuzun konum (GPS) özelliğinin açık ve "hassas konum" ayarının açık olduğundan emin olup tekrar deneyin.<br><small style="opacity:.6">${olcum}</small>`);
    } else {
      goster(`<div class="ikon">🏪</div>
        <h2>Mağazamızdan yaklaşık ${mesafeYazi(m)} uzaktasınız</h2>
        <p>Fiyat Gör yalnızca Bilge Kırtasiye'nin içinde kullanılabilir. Sizi mağazamızda bekliyoruz!</p>
        <button id="kkBtn" type="button">🔄 Tekrar Dene</button>
        <div class="not">${olcum}</div>`);
      document.getElementById("kkBtn").onclick = dogrula;
    }
  }

  function hata(msg) {
    goster(`<div class="ikon">⚠️</div><h2>Konum doğrulanamadı</h2><p>${msg}</p>
      <button id="kkBtn" type="button">🔄 Tekrar Dene</button>`);
    document.getElementById("kkBtn").onclick = dogrula;
  }

  function basla() {
    if (kurulum) return kurulumBaslat();
    ilkEkran();
    // Izin zaten verilmisse dugmeye basmadan kontrol et (yine de her seferinde olcer)
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" }).then(s => { if (s.state === "granted") dogrula(); }).catch(() => {});
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", basla); else basla();
})();
