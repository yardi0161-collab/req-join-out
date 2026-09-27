"use client";

// RequestPortal.tsx
// Perlu: npm install @supabase/supabase-js
// Provider Discord harus sudah diaktifkan di Supabase Auth (lihat PANDUAN.md).

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

// ==== Ganti sesuai project kamu ====
const SUPABASE_URL = "https://iejyusqakqrcavzbscqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_S-67t9DUNS4cm30K4Ao1Xw_eTxKwXr2";
const STORAGE_BUCKET = "screenshots";
const ENDPOINT = `${SUPABASE_URL}/functions/v1/submit-request`;
const IS_CONFIGURED = !SUPABASE_URL.includes("YOUR-PROJECT-REF");

const sb = IS_CONFIGURED ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

type SessionUser = { name: string; avatar: string };
type Session = { accessToken: string; user: SessionUser };
type View = "dashboard" | "join" | "out";

export default function RequestPortal() {
  const [session, setSession] = useState<Session | null>(null);
  const [view, setView] = useState<View>("dashboard");
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const [joinRank, setJoinRank] = useState("");
  const [joinFile, setJoinFile] = useState<File | null>(null);
  const [joinPreview, setJoinPreview] = useState<string | null>(null);
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [joinTicket, setJoinTicket] = useState<number | null>(null);

  const [outRank, setOutRank] = useState("");
  const [outReason, setOutReason] = useState("");
  const [outSubmitting, setOutSubmitting] = useState(false);
  const [outError, setOutError] = useState("");
  const [outTicket, setOutTicket] = useState<number | null>(null);

  // ---------- baca ?view= dari URL ----------
  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get("view");
    if (v === "join" || v === "out") setView(v);
  }, []);

  // ---------- auth ----------
  useEffect(() => {
    function applySupabaseSession(s: any) {
      const u = s.user;
      setSession({
        accessToken: s.access_token,
        user: {
          name: u.user_metadata?.full_name || u.user_metadata?.name || "Discord User",
          avatar: u.user_metadata?.avatar_url || "",
        },
      });
    }
    if (IS_CONFIGURED && sb) {
      sb.auth.getSession().then(({ data }) => {
        if (data.session) applySupabaseSession(data.session);
      });
      const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
        if (s) applySupabaseSession(s);
      });
      return () => sub.subscription.unsubscribe();
    } else {
      const saved = localStorage.getItem("demo_session");
      if (saved) setSession(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    if (session) requestAnimationFrame(() => setReady(true));
  }, [session, view]);

  async function loginDiscord() {
    if (!IS_CONFIGURED || !sb) {
      alert("Supabase belum disambungkan. Pakai tombol demo di bawah.");
      return;
    }
    await sb.auth.signInWithOAuth({ provider: "discord", options: { redirectTo: window.location.href } });
  }

  function loginDemo() {
    const demo: Session = {
      accessToken: "demo",
      user: { name: "budi.dev", avatar: "https://api.dicebear.com/7.x/identicon/svg?seed=budi" },
    };
    localStorage.setItem("demo_session", JSON.stringify(demo));
    setSession(demo);
  }

  async function logout() {
    if (IS_CONFIGURED && sb) await sb.auth.signOut();
    localStorage.removeItem("demo_session");
    setSession(null);
    setMenuOpen(false);
  }

  function backToDashboard() {
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.location.href = url.toString();
  }

  function onJoinFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setJoinFile(file);
    setJoinPreview(URL.createObjectURL(file));
  }

  async function uploadScreenshot(file: File) {
    const ext = file.name.split(".").pop() || "png";
    const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session!.accessToken}`,
        apikey: SUPABASE_ANON_KEY,
        "Content-Type": file.type,
      },
      body: file,
    });
    if (!res.ok) throw new Error("Gagal upload screenshot.");
    return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
  }

  async function submitRequest(payload: Record<string, unknown>) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session!.accessToken}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal mengirim request.");
    return data as { id: number };
  }

  async function handleJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !joinRank || !joinFile) return;
    setJoinSubmitting(true);
    setJoinError("");
    try {
      const screenshot_url = await uploadScreenshot(joinFile);
      const data = await submitRequest({
        type: "join",
        character_name: session.user.name,
        rank_name: joinRank,
        screenshot_url,
      });
      setJoinTicket(data.id);
    } catch (ex) {
      setJoinError((ex instanceof Error ? ex.message : "Gagal mengirim request.") + (IS_CONFIGURED ? "" : " (mode pratinjau)"));
    } finally {
      setJoinSubmitting(false);
    }
  }

  async function handleOutSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !outRank || outReason.trim().length < 5) return;
    setOutSubmitting(true);
    setOutError("");
    try {
      const data = await submitRequest({
        type: "out",
        character_name: session.user.name,
        rank_name: outRank,
        reason: outReason.trim(),
      });
      setOutTicket(data.id);
    } catch (ex) {
      setOutError((ex instanceof Error ? ex.message : "Gagal mengirim request.") + (IS_CONFIGURED ? "" : " (mode pratinjau)"));
    } finally {
      setOutSubmitting(false);
    }
  }

  const joinCanSubmit = !!joinRank && !!joinFile && !joinSubmitting;
  const outCanSubmit = !!outRank && outReason.trim().length >= 5 && !outSubmitting;

  return (
    <div className="rp-root">
      <style>{css}</style>
      <div className="wrap">
        <p className="preview-note">PRATINJAU — sambungkan Supabase &amp; Discord OAuth untuk fungsi penuh</p>

        {!session && (
          <div className="panel login-card">
            <p className="login-title">Portal Request</p>
            <p className="login-sub">Login dengan Discord untuk mengajukan request.</p>
            <button className="discord-btn" onClick={loginDiscord}>Login dengan Discord</button>
            <button className="demo-btn" onClick={loginDemo}>Coba tampilan (demo, tanpa login asli)</button>
          </div>
        )}

        {session && view === "dashboard" && (
          <div className={`stagger ${ready ? "in" : ""}`} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="panel topbar">
              <span className="topbar-title">REQUEST PORTAL</span>
              <button className="menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              {menuOpen && (
                <div className="menu-dropdown">
                  <button onClick={logout}>Logout</button>
                </div>
              )}
            </div>

            <div className="panel profile-row">
              <div className="avatar-ring"><img className="avatar" src={session.user.avatar} alt="avatar" /></div>
              <div className="profile-fields">
                <div className="pf">
                  <div className="pf-label">NAMA DISCORD</div>
                  <div className="pf-value">{session.user.name}</div>
                </div>
                <div className="divider-v" />
                <div className="pf">
                  <div className="pf-label">STATUS</div>
                  <div className="pf-value" style={{ color: "var(--teal)" }}>Terverifikasi</div>
                </div>
              </div>
            </div>

            <div className="action-grid">
              <a className="action-card" href="?view=join" target="_blank" rel="noopener">
                <div className="action-icon-circle blue">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </div>
                <div className="action-label">Request<br />Join</div>
                <svg className="action-ghost" viewBox="0 0 24 24" fill="none">
                  <rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="2" />
                </svg>
              </a>
              <a className="action-card" href="?view=out" target="_blank" rel="noopener">
                <div className="action-icon-circle teal">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="action-label">Request<br />Out</div>
                <svg className="action-ghost" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                </svg>
              </a>
            </div>
          </div>
        )}

        {session && view === "join" && (
          <div className={`page-enter ${ready ? "in" : ""}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="back-row">
              <a className="back-link" href="#" onClick={(e) => { e.preventDefault(); backToDashboard(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Kembali
              </a>
            </div>
            <h1 className="page-heading">Request Join</h1>

            {joinTicket === null ? (
              <form className="panel" onSubmit={handleJoinSubmit}>
                <label className="field">
                  <span className="label">NAMA KARAKTER</span>
                  <div className="locked-field">
                    <span className="locked-field-name">{session.user.name}</span>
                    <span className="verified-chip">✓ VIA DISCORD</span>
                  </div>
                </label>

                <label className="field">
                  <span className="label">RANK</span>
                  <select value={joinRank} onChange={(e) => setJoinRank(e.target.value)}>
                    <option value="" disabled>Pilih rank</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                    <option value="Veteran">Veteran</option>
                  </select>
                </label>

                <label className="field">
                  <span className="label">SCREENSHOT</span>
                  <div className={`upload-box ${joinPreview ? "has-image" : ""}`}>
                    {joinPreview ? (
                      <>
                        <button
                          type="button"
                          className="upload-remove"
                          onClick={(e) => { e.stopPropagation(); setJoinFile(null); setJoinPreview(null); }}
                        >
                          ×
                        </button>
                        <img src={joinPreview} alt="preview" />
                      </>
                    ) : (
                      <span>Ketuk untuk upload gambar</span>
                    )}
                    <input type="file" accept="image/*" onChange={onJoinFileChange} />
                  </div>
                </label>

                {joinError && <p className="error-text">{joinError}</p>}
                <button type="submit" className="submit" disabled={!joinCanSubmit}>
                  {joinSubmitting ? "Mengirim…" : "Ajukan Request"}
                </button>
                <p className="foot-note">Request masuk ke antrean admin. Role otomatis diberikan begitu disetujui.</p>
              </form>
            ) : (
              <div className="panel">
                <div className="ticket-body">
                  <span className="ticket-check">✓</span>
                  <h2 className="ticket-title">Request terkirim</h2>
                  <p className="ticket-no">TICKET #{String(joinTicket).padStart(4, "0")}</p>
                  <p className="ticket-sub">Menunggu keputusan admin di server.</p>
                  <button
                    className="ghost-btn"
                    onClick={() => { setJoinTicket(null); setJoinRank(""); setJoinFile(null); setJoinPreview(null); }}
                  >
                    Ajukan request lain
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {session && view === "out" && (
          <div className={`page-enter ${ready ? "in" : ""}`} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="back-row">
              <a className="back-link" href="#" onClick={(e) => { e.preventDefault(); backToDashboard(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Kembali
              </a>
            </div>
            <h1 className="page-heading">Request Out</h1>

            {outTicket === null ? (
              <form className="letter" onSubmit={handleOutSubmit}>
                <p className="letter-title">LAMPIRAN SURAT PERMOHONAN<br />PENGUNDURAN DIRI</p>
                <p className="letter-date">
                  {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
                </p>

                <p>Yang Terhormat,<br />Jendral/Letnan Jendral Angkatan Darat<br />Di Tempat</p>
                <p>Dengan hormat,</p>
                <p>Saya yang bertanda tangan di bawah ini:</p>

                <div className="letter-field-row">
                  <span className="letter-field-label">Nama</span>
                  <span className="letter-field-value">{session.user.name}</span>
                  <span className="letter-verified">✓ Discord</span>
                </div>
                <div className="letter-field-row">
                  <span className="letter-field-label">Pangkat</span>
                  <select className="letter-select" value={outRank} onChange={(e) => setOutRank(e.target.value)}>
                    <option value="" disabled>Pilih pangkat</option>
                    <option value="Junior">Junior</option>
                    <option value="Senior">Senior</option>
                    <option value="Veteran">Veteran</option>
                  </select>
                </div>

                <p>
                  Dengan ini mengajukan permohonan pengunduran diri dari dinas aktif Tentara Angkatan Darat,
                  terhitung sejak surat ini diajukan.
                </p>

                <p>Adapun alasan pengunduran diri saya adalah karena:</p>
                <textarea
                  className="letter-blank"
                  rows={2}
                  placeholder="Tuliskan alasan Anda di sini..."
                  value={outReason}
                  onChange={(e) => setOutReason(e.target.value)}
                />

                <p>
                  Saya berterima kasih atas bimbingannya dan perilaku baik selama saya berdinas di TNI AD, serta
                  telah memberi kesempatan kepada saya. Mohon maaf apabila saya memiliki kesalahan selama bertugas.
                  Demikian surat permohonan ini saya buat dengan sebenar-benarnya, tanpa ada paksaan dari pihak
                  manapun. Atas perhatian dan kebijaksanaannya saya ucapkan terima kasih 🙏
                </p>

                <div className="letter-signature">
                  <div>Hormat saya,</div>
                  <div className="sig-name">{session.user.name}</div>
                </div>

                {outError && (
                  <p className="error-text" style={{ fontFamily: "'Manrope',sans-serif", marginTop: 14 }}>{outError}</p>
                )}
                <button
                  type="submit"
                  className="submit"
                  disabled={!outCanSubmit}
                  style={{ marginTop: 18, fontFamily: "'Manrope',sans-serif" }}
                >
                  {outSubmitting ? "Mengirim…" : "Ajukan Request"}
                </button>
              </form>
            ) : (
              <div className="panel">
                <div className="ticket-body">
                  <span className="ticket-check">✓</span>
                  <h2 className="ticket-title">Request terkirim</h2>
                  <p className="ticket-no">TICKET #{String(outTicket).padStart(4, "0")}</p>
                  <p className="ticket-sub">Menunggu keputusan admin di server.</p>
                  <button className="ghost-btn" onClick={() => { setOutTicket(null); setOutRank(""); setOutReason(""); }}>
                    Ajukan request lain
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const css = `
  .rp-root {
    --bg:#0a0c10; --panel:#12151b; --panel-2:#171b22; --gold:#c9a227; --gold-dim:#7a6a35;
    --text:#f3ead9; --text-muted:#9a9686; --blue:#3f8cff; --teal:#2fb38a; --coral:#e0574a;
    --paper:#f4efe3; --paper-ink:#221f17; --paper-muted:#6b6455;
    background: var(--bg); color: var(--text); font-family: 'Manrope', system-ui, sans-serif;
    display: flex; justify-content: center; padding: 20px 14px 48px; min-height: 100vh;
  }
  .rp-root * { box-sizing: border-box; }
  .rp-root .wrap { width:100%; max-width: 460px; display:flex; flex-direction:column; gap: 14px; }
  .rp-root .preview-note { color:#5c6270; font-size:11px; text-align:center; margin: 0 0 2px; letter-spacing:.02em; }

  .rp-root .panel { border: 1.5px solid var(--gold-dim); border-radius: 18px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); padding: 16px 18px; }

  .rp-root .page-enter { opacity: 0; }
  .rp-root .page-enter.in { animation: rpEnter .55s cubic-bezier(.16,1,.3,1) both; }
  @keyframes rpEnter { from { opacity: 0; transform: translateY(22px) scale(.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
  .rp-root .stagger > * { opacity: 0; }
  .rp-root .stagger.in > * { animation: rpEnter .5s cubic-bezier(.16,1,.3,1) both; }
  .rp-root .stagger.in > *:nth-child(1) { animation-delay: .04s; }
  .rp-root .stagger.in > *:nth-child(2) { animation-delay: .10s; }
  .rp-root .stagger.in > *:nth-child(3) { animation-delay: .16s; }

  .rp-root .topbar { display:flex; align-items:center; justify-content:space-between; padding: 14px 18px; position:relative; }
  .rp-root .topbar-title { font-weight:800; letter-spacing:.06em; font-size:15px; }
  .rp-root .menu-btn { background:none; border:none; color:var(--gold); cursor:pointer; padding:4px; }
  .rp-root .menu-dropdown { position:absolute; top: 46px; right: 14px; background: var(--panel-2); border:1px solid var(--gold-dim); border-radius:10px; padding:6px; min-width:120px; z-index:5; }
  .rp-root .menu-dropdown button { width:100%; text-align:left; background:none; border:none; color:var(--text); padding:8px 10px; border-radius:6px; cursor:pointer; font-family:inherit; font-size:13px; }

  .rp-root .back-row { display:flex; align-items:center; gap:8px; padding: 2px 4px; }
  .rp-root .back-link { display:inline-flex; align-items:center; gap:6px; color:var(--text-muted); text-decoration:none; font-size:13px; font-weight:600; }
  .rp-root .page-heading { font-size:20px; font-weight:800; margin: 4px 4px 0; }

  .rp-root .login-card { text-align:center; padding: 42px 24px; }
  .rp-root .login-title { font-size:19px; font-weight:800; margin: 0 0 6px; }
  .rp-root .login-sub { font-size:13px; color:var(--text-muted); margin: 0 0 24px; line-height:1.5; }
  .rp-root .discord-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:13px; border:1.5px solid var(--gold); border-radius:10px; background: rgba(201,162,39,.1); color:var(--gold); font-size:14px; font-weight:700; font-family: inherit; cursor:pointer; }
  .rp-root .demo-btn { margin-top:10px; width:100%; padding:10px; border-radius:10px; cursor:pointer; border:1px solid #2a2e37; background:transparent; color:var(--text-muted); font-family: inherit; font-size:11px; }

  .rp-root .profile-row { display:flex; align-items:center; gap:16px; }
  .rp-root .avatar-ring { width:56px; height:56px; border-radius:50%; padding:2px; background: conic-gradient(from 180deg, var(--gold), #6b5a1e, var(--gold)); flex-shrink:0; }
  .rp-root .avatar { width:100%; height:100%; border-radius:50%; object-fit:cover; display:block; background:#222; }
  .rp-root .profile-fields { display:flex; flex:1; gap:18px; }
  .rp-root .pf { flex:1; min-width:0; }
  .rp-root .pf-label { font-size:10px; letter-spacing:.1em; color:var(--gold-dim); font-weight:700; margin-bottom:3px; }
  .rp-root .pf-value { font-size:15px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .rp-root .divider-v { width:1px; align-self:stretch; background: #262b34; }

  .rp-root .action-grid { display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .rp-root .action-card { border-radius: 16px; padding: 18px; position: relative; overflow: hidden; text-align: left; cursor: pointer; min-height: 108px; background: linear-gradient(180deg, var(--panel), var(--panel-2)); border: 1.5px solid var(--gold-dim); transition: transform .15s ease; display:block; text-decoration:none; color: inherit; }
  .rp-root .action-card:active { transform: scale(.97); }
  .rp-root .action-icon-circle { width:38px; height:38px; border-radius:50%; display:flex; align-items:center; justify-content:center; margin-bottom: 30px; }
  .rp-root .action-icon-circle.blue { background: rgba(63,140,255,.15); color: var(--blue); }
  .rp-root .action-icon-circle.teal { background: rgba(47,179,138,.15); color: var(--teal); }
  .rp-root .action-label { font-size:16px; font-weight:800; }
  .rp-root .action-ghost { position:absolute; right:-6px; bottom:-10px; width:70px; height:70px; opacity:.06; }

  .rp-root label.field { display:block; margin-bottom:14px; }
  .rp-root .label { display:block; font-size:11px; letter-spacing:.06em; color:var(--gold-dim); font-weight:700; margin-bottom:6px; }
  .rp-root input, .rp-root select, .rp-root textarea { width:100%; padding:11px 12px; font-size:14px; font-family:inherit; color:var(--text); background:#0e1116; border:1px solid #262b34; border-radius:9px; outline:none; }
  .rp-root input:focus, .rp-root select:focus, .rp-root textarea:focus { border-color: var(--gold); }
  .rp-root textarea { resize: vertical; }
  .rp-root select { color-scheme: dark; }

  .rp-root .locked-field { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 12px; background:#0e1116; border:1px solid #262b34; border-radius:9px; }
  .rp-root .locked-field-name { font-weight:700; font-size:14px; }
  .rp-root .verified-chip { display:inline-flex; align-items:center; gap:4px; font-size:10px; color: var(--teal); font-weight:700; letter-spacing:.03em; white-space:nowrap; }

  .rp-root .upload-box { border: 1.5px dashed #2a2e37; border-radius: 10px; padding: 18px; text-align: center; cursor: pointer; background: #0e1116; position: relative; color: var(--text-muted); font-size: 13px; }
  .rp-root .upload-box.has-image { padding: 0; border-style: solid; border-color:#2a2e37; }
  .rp-root .upload-box img { display:block; width:100%; max-height:180px; object-fit:cover; border-radius: 8px; }
  .rp-root .upload-box input[type=file] { position:absolute; inset:0; opacity:0; cursor:pointer; }
  .rp-root .upload-remove { position:absolute; top:8px; right:8px; background:rgba(0,0,0,.6); color:#fff; border:none; border-radius:50%; width:26px; height:26px; font-size:14px; cursor:pointer; z-index:2; }

  .rp-root .error-text { color:var(--coral); font-size:13px; margin:0 0 12px; }
  .rp-root button.submit { width:100%; padding:13px; margin-top:4px; font-size:15px; font-weight:700; font-family:inherit; color:#0a0c10; background: var(--gold); border:none; border-radius:10px; cursor:pointer; }
  .rp-root button.submit:disabled { opacity:.4; cursor:not-allowed; }
  .rp-root .foot-note { font-size:12px; color:var(--text-muted); margin:14px 0 0; line-height:1.5; }

  .rp-root .ticket-body { text-align:center; padding:14px 8px 6px; }
  .rp-root .ticket-check { display:inline-flex; width:42px; height:42px; border-radius:50%; background: var(--gold); color:#0a0c10; align-items:center; justify-content:center; font-size:20px; margin-bottom:12px; font-weight:800; }
  .rp-root .ticket-title { margin:0 0 6px; font-size:19px; font-weight:800; }
  .rp-root .ticket-no { letter-spacing:.1em; color:var(--gold); font-size:13px; margin:0 0 14px; font-weight:700; }
  .rp-root .ticket-sub { font-size:13px; color:var(--text-muted); line-height:1.6; margin:0 0 20px; }
  .rp-root .ghost-btn { background:none; border:1px solid #2a2e37; color:var(--text); padding:10px 16px; border-radius:9px; font-family:inherit; font-size:13px; cursor:pointer; }

  .rp-root .letter { background: var(--paper); color: var(--paper-ink); border-radius: 6px; padding: 28px 24px; font-family: 'PT Serif', Georgia, serif; font-size: 13.5px; line-height: 1.75; box-shadow: 0 20px 44px rgba(0,0,0,.4); }
  .rp-root .letter-title { text-align:center; font-weight:700; font-size:14.5px; letter-spacing:.02em; margin: 0 0 4px; }
  .rp-root .letter-date { text-align:right; font-size:13px; margin: 0 0 18px; color: var(--paper-muted); }
  .rp-root .letter p { margin: 0 0 14px; }
  .rp-root .letter-field-row { display:flex; align-items:baseline; gap:8px; margin: 0 0 8px 14px; }
  .rp-root .letter-field-label { width:64px; flex-shrink:0; }
  .rp-root .letter-field-value { flex:1; border-bottom: 1px solid #b9b0a0; padding-bottom:2px; font-weight:700; }
  .rp-root .letter-verified { font-size:10px; color:#3f7a5f; font-weight:700; white-space:nowrap; }
  .rp-root select.letter-select { flex:1; border:none; border-bottom: 1px solid #b9b0a0; border-radius:0; background:transparent; color: var(--paper-ink); font-family:'PT Serif',serif; font-size:13.5px; font-weight:700; padding:0 0 2px; }
  .rp-root textarea.letter-blank { width:100%; margin: -6px 0 14px; border:none; border-bottom: 1px solid #b9b0a0; border-radius:0; background:transparent; color: var(--paper-ink); font-family:'PT Serif',serif; font-size:13.5px; line-height:1.75; padding: 2px 0; resize: vertical; min-height: 44px; }
  .rp-root textarea.letter-blank::placeholder { color: #a39c8a; font-style: italic; }
  .rp-root .letter-signature { text-align:right; margin-top: 22px; }
  .rp-root .letter-signature .sig-name { font-weight:700; margin-top: 46px; border-top: 1px solid var(--paper-ink); display:inline-block; padding-top: 2px; min-width: 160px; }
`;
