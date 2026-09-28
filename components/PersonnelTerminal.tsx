"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { fetchDiscordGuildRoles, fetchDiscordProfile, mapRolesToPangkatDivisi } from "@/lib/discord";

/* ------------------------------------------------------------------ */
/* Data — default/fallback (dipakai kalau belum login Discord)         */
/* ------------------------------------------------------------------ */
export type PersonnelData = {
  name: string;
  rank: string;
  badge: string;
  unit: string;
  avatarUrl: string;
  attendedWeekdays: number[];
  discordLinked: boolean;
};

const DEFAULT_PERSONNEL: PersonnelData = {
  name: "Ian Syah",
  rank: "ABRIGPOL",
  badge: "08111",
  unit: "SABHARA",
  avatarUrl: "", // isi URL foto profil; kosong = tampil inisial
  // Hari yang sudah absen minggu ini (0 = Senin ... 6 = Minggu). Ganti dengan data asli.
  attendedWeekdays: [0, 1, 3],
  discordLinked: false,
};

// eslint-disable-next-line prefer-const
let personnel: PersonnelData = { ...DEFAULT_PERSONNEL };

/** Mengisi data personil (nama, pangkat, devisi, foto) dari sesi Discord. */
function setPersonnelData(data?: Partial<PersonnelData>) {
  if (!data) return;
  personnel = { ...personnel, ...data };
}

/** Kembali ke data default (dipakai saat logout Discord). */
function resetPersonnelData() {
  personnel = { ...DEFAULT_PERSONNEL };
}

/* ------------------------------------------------------------------ */
/* Cache profil Discord                                                */
/* Supabase hanya memberi provider_token (token Discord) sesaat setelah */
/* login. Setelah refresh halaman token itu hilang, jadi nama/pangkat/ */
/* devisi hasil login disimpan di sini supaya tidak kembali ke default. */
/* ------------------------------------------------------------------ */
type DiscordProfileCache = {
  userId: string;
  name: string;
  avatarUrl: string;
  rank: string;
  unit: string;
  refreshToken?: string; // dipakai untuk menyegarkan data dari Discord tanpa login ulang
};
const DISCORD_PROFILE_KEY = "pt-discord-profile-v1";

function loadDiscordProfile(userId: string): DiscordProfileCache | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISCORD_PROFILE_KEY) ?? "null");
    if (parsed && parsed.userId === userId && typeof parsed.name === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}
function saveDiscordProfile(profile: DiscordProfileCache) {
  try {
    window.localStorage.setItem(DISCORD_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    /* penyimpanan penuh / dinonaktifkan */
  }
}
function clearDiscordProfile() {
  try {
    window.localStorage.removeItem(DISCORD_PROFILE_KEY);
  } catch {
    /* abaikan */
  }
}

/**
 * Kunci sederhana lintas-tab: sebelum menghubungi Discord untuk menyegarkan data,
 * tiap tab mengecek dulu apakah tab LAIN baru saja mencoba (lewat localStorage,
 * yang dibagikan semua tab di origin yang sama). Kalau iya, tab ini mengalah dan
 * tidak ikut mencoba - mencegah dua tab memakai kunci sekali-pakai yang sama.
 */
const DISCORD_REFRESH_LOCK_KEY = "pt-discord-refresh-lock-v2";
const REFRESH_LOCK_WINDOW_MS = 15000;

function tryAcquireRefreshLock(): boolean {
  try {
    const now = Date.now();
    const last = Number(window.localStorage.getItem(DISCORD_REFRESH_LOCK_KEY) ?? "0");
    if (Number.isFinite(last) && now - last < REFRESH_LOCK_WINDOW_MS) return false;
    window.localStorage.setItem(DISCORD_REFRESH_LOCK_KEY, String(now));
    return true;
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Ikon (inline SVG, tanpa dependency tambahan)                        */
/* ------------------------------------------------------------------ */
type IconProps = { size?: number; stroke?: number; className?: string };

const Svg = ({
  size = 24,
  stroke = 2,
  className,
  children,
}: IconProps & { children: ReactNode }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={stroke}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {children}
  </svg>
);

const HomeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
  </Svg>
);
const HistoryIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const ClipboardCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="m9 14 2 2 4-4" />
  </Svg>
);
const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);
const ClipboardListIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="8" y="2" width="8" height="4" rx="1" />
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <path d="M12 11h4M12 16h4M8 11h.01M8 16h.01" />
  </Svg>
);
const CalendarCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
    <path d="m9 16 2 2 4-4" />
  </Svg>
);

const CameraIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
    <circle cx="12" cy="13.5" r="3.5" />
  </Svg>
);
const XIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Svg>
);
const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
);
const MenuDotsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);
const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5" />
    <path d="M21 12H9" />
  </Svg>
);
const ArrowLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m12 19-7-7 7-7" />
    <path d="M19 12H5" />
  </Svg>
);
const BookIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 19.5V6a2 2 0 0 1 2-2h13v15.5" />
    <path d="M6 21.5h13" />
    <path d="M6 21.5a2 2 0 0 1 0-4h13" />
    <path d="M9 7h6" />
  </Svg>
);
const ShieldCheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="m9 12 2 2 4-4" />
  </Svg>
);
const ShieldAlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
    <path d="M12 8v4" />
    <path d="M12 16h.01" />
  </Svg>
);
const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </Svg>
);
const TicketIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
    <path d="M13 5v2M13 11v2M13 17v2" />
  </Svg>
);
const TruckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />
    <path d="M15 18H9" />
    <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14" />
    <circle cx="17" cy="18" r="2" />
    <circle cx="7" cy="18" r="2" />
  </Svg>
);
const FileTextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
    <path d="M14 3v5h5" />
    <path d="M9 13h6M9 17h6M9 9h1" />
  </Svg>
);
/* Dekorasi besar di background kartu */
const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);
const CalendarDeco = () => (
  <svg viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth={13} strokeLinecap="round" aria-hidden="true">
    <rect x="22" y="38" width="156" height="142" rx="30" />
    <path d="M22 86h156M68 16v34M132 16v34" />
    <path d="M62 122h.01M100 122h.01M138 122h.01M62 154h.01M100 154h.01" strokeWidth={16} />
  </svg>
);

/* ------------------------------------------------------------------ */
/* Komponen                                                            */
/* ------------------------------------------------------------------ */
type Tab = "home";
/** "absensi" = layar REQUEST JOIN, "laporan" = layar REQUEST OUT. */
type Screen = Tab | "absensi" | "laporan";

const tabs: { id: Tab; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { id: "home", label: "Home", Icon: HomeIcon },
];

const screenTitle: Record<Screen, string> = {
  home: "REQUEST JOIN & OUT",
  absensi: "Request Join",
  laporan: "Request Out",
};

/** Layar induk (parent) untuk tombol kembali pada layar turunan. */
const parentScreen = (_s: Screen): Screen => "home";

const ChevronLeft = (p: IconProps) => (
  <Svg {...p}>
    <path d="m15 18-6-6 6-6" />
  </Svg>
);

const DAY_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_LONG = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const MONTH_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

type DayStatus = "hadir" | "absen" | "belum" | "nanti";

/** Tanggal Senin–Minggu untuk minggu berjalan, lengkap dengan status absennya. */
function getWeek(attended: number[], now = new Date()) {
  const todayIdx = (now.getDay() + 6) % 7; // Senin = 0
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - todayIdx);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    const status: DayStatus =
      i > todayIdx ? "nanti" : attended.includes(i) ? "hadir" : i === todayIdx ? "belum" : "absen";
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      date: d.getDate(),
      month: d.getMonth(),
      year: d.getFullYear(),
      short: DAY_SHORT[i],
      today: i === todayIdx,
      status,
      label: `${DAY_LONG[i]}, ${d.getDate()} ${MONTH_LONG[d.getMonth()]}`,
    };
  });
}
/**
 * Foto profil dengan fallback otomatis: kalau URL foto gagal dimuat (link rusak,
 * diblokir, foto sudah dihapus, dsb), otomatis diganti inisial nama, bukan ikon
 * "gambar rusak" bawaan browser.
 */
function Avatar({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <>{initials(name)}</>;
  return <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** Angka naik dari 0 ke target (dilewati jika pengguna memilih reduced motion). */
function useCountUp(target: number, duration = 1000) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setValue(target * (1 - Math.pow(1 - t, 3))); // easeOutCubic
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/** Urutan kemunculan kartu: makin besar i, makin lambat muncul. */
const rise = (i: number): CSSProperties => ({ "--i": i } as CSSProperties);

function HomeScreen({
  onNavigate,
  stagger,
}: {
  onNavigate: (s: Screen) => void;
  stagger: boolean;
}) {
  const p = personnel;
  const r = (base: string, i: number) => ({
    className: stagger ? `${base} pt-rise` : base,
    style: stagger ? rise(i) : undefined,
  });

  return (
    <div className="pt-stack">
      {/* Profil: hanya foto & nama */}
      <section {...r("pt-card pt-profile", 0)}>
        <div className="pt-avatar" aria-label={`Foto profil ${p.name}`}>
          <Avatar url={p.avatarUrl} name={p.name} />
        </div>
        <div className="pt-pf">
          <span>Nama</span>
          <strong>{p.name}</strong>
        </div>
      </section>

      {/* Menu */}
      <div className="pt-grid">
        <button type="button" {...r("pt-card pt-stat pt-link", 1)} onClick={() => onNavigate("absensi")}>
          <div className="pt-deco pt-deco-stat">
            <ClipboardCheckIcon size={84} stroke={1.6} />
          </div>
          <div className="pt-icon-circle pt-icon-blue">
            <ClipboardCheckIcon size={22} />
          </div>
          <p className="pt-stat-title">REQUEST JOIN</p>
        </button>

        <button type="button" {...r("pt-card pt-stat pt-link", 2)} onClick={() => onNavigate("laporan")}>
          <div className="pt-deco pt-deco-stat">
            <ClipboardListIcon size={84} stroke={1.6} />
          </div>
          <div className="pt-icon-circle pt-icon-green">
            <ClockIcon size={22} />
          </div>
          <p className="pt-stat-title">REQUEST OUT</p>
        </button>
      </div>
    </div>
  );
}


/* ------------------------------------------------------------------ */
/* Komponen form bersama (dipakai Absensi, Evidence, Cell Management)  */
/* ------------------------------------------------------------------ */
type Pic = { file: File; url: string };

/** Susun teks laporan dengan titik dua yang sejajar. Nilai multi-baris dimulai di baris berikutnya. */
function formatReport(title: string, rows: [label: string, value: string][]) {
  const w = Math.max(...rows.map(([label]) => label.length));
  return [
    title,
    ...rows.map(([label, value]) =>
      value.includes("\n") ? `${label.padEnd(w)} :\n${value}` : `${label.padEnd(w)} : ${value}`
    ),
  ].join("\n");
}

/** Ubah teks laporan (hasil formatReport) kembali jadi baris label + nilai untuk tampilan "Format". */
function parseReportRows(report: string): { label: string; value: string }[] {
  const lines = report.split("\n");
  const rows: { label: string; value: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const idx = line.indexOf(" : ");
    if (idx !== -1) {
      rows.push({ label: line.slice(0, idx).trim(), value: line.slice(idx + 3).trim() });
    } else if (/:\s*$/.test(line)) {
      rows.push({ label: line.replace(/:\s*$/, "").trim(), value: "" });
    } else if (rows.length) {
      rows[rows.length - 1].value = rows[rows.length - 1].value ? `${rows[rows.length - 1].value}\n${line}` : line;
    }
  }
  return rows;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="pt-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function SubmitBar({
  label,
  valid,
  hint,
  onSubmit,
  onInvalid,
}: {
  label: string;
  valid: boolean;
  hint: string;
  onSubmit: () => void;
  onInvalid?: () => void;
}) {
  return (
    <>
      <button
        type="button"
        className="pt-submit"
        onClick={() => (valid ? onSubmit() : onInvalid?.())}
      >
        {label}
      </button>
      {!valid && <p className="pt-hint">{hint}</p>}
    </>
  );
}

/** Layar hasil: teks laporan siap salin + pratinjau foto + tombol ubah / buat baru. */
function ReportResult({
  heading,
  hint,
  report,
  images,
  copyLabel,
  editLabel,
  newLabel,
  onEdit,
  onNew,
}: {
  heading: string;
  hint: string;
  report: string;
  images: { url: string; alt: string }[];
  copyLabel: string;
  editLabel: string;
  newLabel: string;
  onEdit: () => void;
  onNew: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia — pengguna bisa menyalin manual dari kotak teks */
    }
  };
  return (
    <div className="pt-stack">
      <section className="pt-card pt-form-card">
        <div className="pt-done-icon">
          <CheckIcon size={30} stroke={2.6} />
        </div>
        <h2 className="pt-form-title">{heading}</h2>
        <p className="pt-muted" style={{ marginTop: 8 }}>
          {hint}
        </p>
        <pre className="pt-report">{report}</pre>
        {images.length > 0 && (
          <div className="pt-thumbs">
            {images.map((im) => (
              <img key={im.url} src={im.url} alt={im.alt} />
            ))}
          </div>
        )}
      </section>

      <button type="button" className="pt-submit" onClick={copy}>
        {copied ? "Tersalin ✓" : copyLabel}
      </button>
      <button type="button" className="pt-secondary" onClick={onEdit}>
        {editLabel}
      </button>
      <button type="button" className="pt-secondary" onClick={onNew}>
        {newLabel}
      </button>
    </div>
  );
}

/** Pemilih banyak foto (grid 3 kolom) dengan pratinjau dan tombol hapus. */
function PhotoPicker({
  photos,
  max,
  label,
  onChange,
}: {
  photos: Pic[];
  max: number;
  label: string;
  onChange: (next: Pic[]) => void;
}) {
  const add = (files: FileList | null) => {
    if (!files) return;
    const room = Math.max(0, max - photos.length);
    const added: Pic[] = Array.from(files)
      .slice(0, room)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    if (added.length) onChange([...photos, ...added]);
  };
  const remove = (i: number) => {
    URL.revokeObjectURL(photos[i].url);
    onChange(photos.filter((_, idx) => idx !== i));
  };

  return (
    <div className="pt-ev-photos">
      {photos.map((ph, i) => (
        <div key={ph.url} className="pt-photo is-filled">
          <img src={ph.url} alt={`${label} ${i + 1}`} />
          <button
            type="button"
            className="pt-photo-x"
            aria-label={`Hapus ${label.toLowerCase()} ${i + 1}`}
            onClick={() => remove(i)}
          >
            <XIcon size={18} />
          </button>
        </div>
      ))}
      {photos.length < max && (
        <div className="pt-photo">
          <label className="pt-photo-empty">
            <input
              type="file"
              accept="image/*"
              multiple
              aria-label={`Tambah ${label.toLowerCase()}`}
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
            <CameraIcon size={28} />
            <span>Tambah</span>
          </label>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Log (riwayat laporan & absensi) — disimpan di localStorage          */
/* ------------------------------------------------------------------ */
type LogKind = "request-join" | "request-out";
type LogStatus = "pending" | "approved" | "rejected";
type LogEntry = {
  id: number;
  kind: LogKind;
  title: string;
  subtitle: string;
  savedAt: number; // ms sejak epoch
  report: string; // teks laporan lengkap (foto tidak disimpan)
  status: LogStatus; // status persetujuan Admin
  decidedBy?: string; // nama admin yang menyetujui/menolak
  decidedAt?: number; // ms sejak epoch saat diputuskan
  name: string; // nama anggota pengirim (dipakai Admin untuk kotak per-anggota)
  avatarUrl?: string; // foto profil pengirim saat mengirim (dipakai Admin untuk kotak per-anggota)
  photos?: string[]; // URL foto bukti yang diunggah (dipakai Admin untuk cek foto)
  dateISO?: string; // tanggal absensi, YYYY-MM-DD (kind "absensi")
  startISO?: string; // awal cuti, YYYY-MM-DD (kind "cuti")
  endISO?: string; // akhir cuti, YYYY-MM-DD (kind "cuti")
};

const MAX_LOGS = 200;

/** Baris tabel `personnel_logs` di Supabase (snake_case) -> bentuk LogEntry yang dipakai UI. */
function rowToLogEntry(row: Record<string, unknown>): LogEntry {
  return {
    id: Number(row.id),
    kind: row.kind as LogKind,
    title: String(row.title ?? ""),
    subtitle: String(row.subtitle ?? ""),
    savedAt: row.saved_at ? new Date(row.saved_at as string).getTime() : Date.now(),
    report: String(row.report ?? ""),
    status: (row.status as LogStatus) ?? "pending",
    decidedBy: (row.decided_by as string) ?? undefined,
    decidedAt: row.decided_at ? new Date(row.decided_at as string).getTime() : undefined,
    name: (row.name as string) ?? personnel.name,
    avatarUrl: (row.avatar_url as string) ?? undefined,
    photos: Array.isArray(row.photos) ? (row.photos as string[]) : undefined,
    dateISO: (row.date_iso as string) ?? undefined,
    startISO: (row.start_iso as string) ?? undefined,
    endISO: (row.end_iso as string) ?? undefined,
  };
}

/** LogEntry (dipakai UI) -> baris siap kirim ke tabel `personnel_logs`. */
function logEntryToRow(entry: LogEntry) {
  return {
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    subtitle: entry.subtitle,
    saved_at: new Date(entry.savedAt).toISOString(),
    report: entry.report,
    status: entry.status,
    decided_by: entry.decidedBy ?? null,
    decided_at: entry.decidedAt ? new Date(entry.decidedAt).toISOString() : null,
    name: entry.name,
    avatar_url: entry.avatarUrl ?? null,
    photos: entry.photos && entry.photos.length ? entry.photos : null,
    date_iso: entry.dateISO ?? null,
    start_iso: entry.startISO ?? null,
    end_iso: entry.endISO ?? null,
  };
}

/** Ambil semua log dari Supabase, terbaru dulu. Dipakai semua perangkat/anggota. */
async function fetchLogs(): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from("personnel_logs")
    .select("*")
    .order("saved_at", { ascending: false })
    .limit(MAX_LOGS);
  if (error || !data) {
    if (error) console.error("Gagal memuat log dari Supabase:", error.message);
    return [];
  }
  return data.map(rowToLogEntry);
}

/** Simpan satu entri log ke Supabase (insert baru, atau timpa kalau id sudah ada). */
async function upsertLogRow(entry: LogEntry) {
  const { error } = await supabase.from("personnel_logs").upsert(logEntryToRow(entry));
  if (error) console.error("Gagal menyimpan log ke Supabase:", error.message);
}

/** Hapus satu entri log dari Supabase. */
async function deleteLogRow(id: number) {
  const { error } = await supabase.from("personnel_logs").delete().eq("id", id);
  if (error) console.error("Gagal menghapus log dari Supabase:", error.message);
}

/** Nama bucket Supabase Storage tempat foto bukti disimpan. Buat bucket publik dengan nama ini. */
const PHOTO_BUCKET = "personnel-photos";

/**
 * Unggah foto-foto satu laporan ke Supabase Storage lalu kembalikan URL publiknya.
 * Foto yang gagal diunggah dilewati saja (tidak menggagalkan seluruh pengiriman laporan).
 */
async function uploadEntryPhotos(id: number, kind: LogKind, photos: Photo[]): Promise<string[]> {
  const files = photos.filter((p): p is NonNullable<Photo> => !!p);
  if (files.length === 0) return [];
  const urls: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const { file } = files[i];
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${kind}/${id}-${i}.${ext}`;
    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });
    if (error) {
      console.error("Gagal mengunggah foto:", error.message);
      continue;
    }
    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(path);
    if (data?.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatSavedAt = (ms: number) => {
  const d = new Date(ms);
  return `${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/* ------------------------------------------------------------------ */
/* Halaman Absensi — form REPORT DUTY SAPD                             */
/* ------------------------------------------------------------------ */
/** Identitas petugas di atas form: foto profil + nama, pangkat, devisi dari akun Discord. */
/* ------------------------------------------------------------------ */
/* Form REQUEST JOIN & REQUEST OUT                                     */
/* ------------------------------------------------------------------ */
type Photo = { file: File; url: string } | null;

type JoinDraft = {
  pangkat: string;
  photo: Photo; // SS Stats (1 foto)
  submitted: boolean;
  logId: number | null; // id entri di halaman Log (supaya kirim ulang tidak menggandakan)
};

const emptyJoinDraft = (): JoinDraft => ({
  pangkat: "",
  photo: null,
  submitted: false,
  logId: null,
});

function buildJoinReport(d: JoinDraft) {
  return formatReport("REQUEST JOIN", [
    ["Nama", personnel.name],
    ["Pangkat", d.pangkat.trim()],
  ]);
}

/** Daftar pangkat TNI AD untuk dropdown "Pilih pangkat" — sesuaikan bila daftar server berbeda. */
const PANGKAT_OPTIONS = [
  "Prajurit Dua (Prada)",
  "Prajurit Satu (Pratu)",
  "Prajurit Kepala (Praka)",
  "Kopral Dua (Kopda)",
  "Kopral Satu (Koptu)",
  "Kopral Kepala (Kopka)",
  "Sersan Dua (Serda)",
  "Sersan Satu (Sertu)",
  "Sersan Kepala (Serka)",
  "Sersan Mayor (Serma)",
  "Letnan Dua (Letda)",
  "Letnan Satu (Lettu)",
  "Kapten",
  "Mayor",
  "Letnan Kolonel (Letkol)",
  "Kolonel",
  "Brigadir Jenderal (Brigjen)",
  "Mayor Jenderal (Mayjen)",
  "Letnan Jenderal (Letjen)",
  "Jenderal",
];

/** "27 September 2026" — dipakai di surat REQUEST OUT. */
function formatLongDate(d = new Date()) {
  return `${d.getDate()} ${MONTH_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

type OutDraft = {
  pangkat: string;
  alasan: string;
  submitted: boolean;
  logId: number | null;
};

const emptyOutDraft = (): OutDraft => ({
  pangkat: "",
  alasan: "",
  submitted: false,
  logId: null,
});

function buildOutReport(d: OutDraft) {
  return formatReport("SURAT PERMOHONAN PENGUNDURAN DIRI", [
    ["Tanggal", formatLongDate()],
    ["Nama", personnel.name],
    ["Pangkat", d.pangkat],
    ["Alasan", d.alasan.trim()],
  ]);
}

/** Kartu identitas ringkas di atas form: foto profil + nama (tanpa pangkat/devisi). */
function IdentityName() {
  return (
    <div className="pt-idcard">
      <div className="pt-avatar" aria-label={`Foto profil ${personnel.name}`}>
        <Avatar url={personnel.avatarUrl} name={personnel.name} />
      </div>
      <div className="pt-id3">
        <div>
          <span>Nama</span>
          <strong>{personnel.name}</strong>
        </div>
      </div>
    </div>
  );
}

/** Satu foto SS Stats: unggah / pratinjau / hapus. */
function SingleShotField({
  label,
  photo,
  onChange,
}: {
  label: string;
  photo: Photo;
  onChange: (file: File | null) => void;
}) {
  return (
    <section className="pt-card pt-form-card">
      <div className="pt-photos-head">
        <div>
          <p className="pt-form-sub">{label}</p>
          <p className="pt-muted">Unggah 1 foto.</p>
        </div>
        <strong>{photo ? 1 : 0}/1</strong>
      </div>
      <div className="pt-photos">
        <div>
          <div className={`pt-photo ${photo ? "is-filled" : ""}`}>
            {photo ? (
              <img src={photo.url} alt={label} />
            ) : (
              <label className="pt-photo-empty">
                <input
                  type="file"
                  accept="image/*"
                  aria-label={`Unggah foto ${label}`}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onChange(f);
                    e.target.value = "";
                  }}
                />
                <CameraIcon size={30} />
                <span>Tambah foto</span>
              </label>
            )}
            {photo && (
              <button
                type="button"
                className="pt-photo-x"
                aria-label={`Hapus foto ${label}`}
                onClick={() => onChange(null)}
              >
                <XIcon size={18} />
              </button>
            )}
          </div>
          <p className="pt-photo-title">{label}</p>
        </div>
      </div>
    </section>
  );
}

function RequestJoinForm({
  draft,
  setDraft,
  onLog,
  showToast,
  onSubmitted,
}: {
  draft: JoinDraft;
  setDraft: Dispatch<SetStateAction<JoinDraft>>;
  onLog: (entry: LogEntry) => void;
  showToast: (msg: string, variant?: "ok" | "warn") => void;
  onSubmitted: () => void;
}) {
  const patch = (p: Partial<JoinDraft>) => setDraft((d) => ({ ...d, ...p }));
  const [shake, setShake] = useState(false);

  const setPhoto = (file: File | null) => {
    if (draft.photo) URL.revokeObjectURL(draft.photo.url);
    setDraft((d) => ({ ...d, photo: file ? { file, url: URL.createObjectURL(file) } : null }));
  };

  const valid = draft.pangkat.trim() !== "" && !!draft.photo;

  const reset = () => {
    if (draft.photo) URL.revokeObjectURL(draft.photo.url);
    setDraft(emptyJoinDraft());
  };

  const attemptSubmit = () => {
    if (!valid) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      showToast("Lengkapi Pangkat dan SS Stats sebelum mengirim.", "warn");
      return;
    }
    const id = draft.logId ?? Date.now();
    const entry: LogEntry = {
      id,
      kind: "request-join",
      status: "pending",
      savedAt: Date.now(),
      title: "Request Join",
      subtitle: personnel.name,
      report: buildJoinReport(draft),
      name: personnel.name,
      avatarUrl: personnel.avatarUrl,
    };
    onLog(entry);
    const photosToUpload = [draft.photo];
    uploadEntryPhotos(id, "request-join", photosToUpload).then((photos) => {
      if (photos.length) onLog({ ...entry, photos });
    });
    showToast("Request Join telah terkirim.", "ok");
    reset();
    onSubmitted();
  };

  return (
    <div className={`pt-stack ${shake ? "pt-shake" : ""}`}>
      <section className="pt-card pt-form-card">
        <p className="pt-muted">Request Join</p>
        <div className="pt-form">
          <IdentityName />
          <Field label="Pangkat">
            <input
              type="text"
              className="pt-input"
              placeholder="Ketik pangkat…"
              value={draft.pangkat}
              onChange={(e) => patch({ pangkat: e.target.value })}
            />
          </Field>
        </div>
      </section>

      <SingleShotField label="SS Stats" photo={draft.photo} onChange={setPhoto} />

      <button type="button" className="pt-submit" onClick={attemptSubmit}>
        Kirim Request Join
      </button>
      {!valid && <p className="pt-hint">Lengkapi Pangkat dan unggah 1 foto SS Stats.</p>}
    </div>
  );
}

function RequestOutForm({
  draft,
  setDraft,
  onLog,
  showToast,
  onSubmitted,
}: {
  draft: OutDraft;
  setDraft: Dispatch<SetStateAction<OutDraft>>;
  onLog: (entry: LogEntry) => void;
  showToast: (msg: string, variant?: "ok" | "warn") => void;
  onSubmitted: () => void;
}) {
  const patch = (p: Partial<OutDraft>) => setDraft((d) => ({ ...d, ...p }));
  const [shake, setShake] = useState(false);
  const today = useMemo(() => formatLongDate(), []);

  const valid = draft.pangkat.trim() !== "" && draft.alasan.trim() !== "";

  const reset = () => setDraft(emptyOutDraft());

  const attemptSubmit = () => {
    if (!valid) {
      setShake(true);
      setTimeout(() => setShake(false), 320);
      showToast("Pilih pangkat dan isi alasan sebelum mengirim.", "warn");
      return;
    }
    const id = draft.logId ?? Date.now();
    const entry: LogEntry = {
      id,
      kind: "request-out",
      status: "pending",
      savedAt: Date.now(),
      title: "Request Out",
      subtitle: personnel.name,
      report: buildOutReport(draft),
      name: personnel.name,
      avatarUrl: personnel.avatarUrl,
    };
    onLog(entry);
    showToast("Surat pengunduran diri telah terkirim.", "ok");
    reset();
    onSubmitted();
  };

  return (
    <div className={`pt-stack ${shake ? "pt-shake" : ""}`}>
      <section className="pt-letter">
        <h2 className="pt-letter-title">
          LAMPIRAN SURAT PERMOHONAN
          <br />
          PENGUNDURAN DIRI
        </h2>
        <p className="pt-letter-date">{today}</p>

        <p>Yang Terhormat,</p>
        <p>
          Jendral/Letnan Jendral Angkatan Darat
          <br />
          Di Tempat
        </p>
        <p>Dengan hormat,</p>
        <p>Saya yang bertanda tangan di bawah ini:</p>

        <div className="pt-letter-field">
          <label>Nama</label>
          <strong>{personnel.name}</strong>
          <span className="pt-letter-verified">✓ Discord</span>
        </div>
        <div className="pt-letter-field">
          <label>Pangkat</label>
          <select
            className="pt-letter-select"
            value={draft.pangkat}
            onChange={(e) => patch({ pangkat: e.target.value })}
            required
          >
            <option value="" disabled>
              Pilih pangkat
            </option>
            {PANGKAT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        <p>
          Dengan ini mengajukan permohonan pengunduran diri dari dinas aktif Tentara Angkatan Darat,
          terhitung sejak surat ini diajukan.
        </p>
        <p>Adapun alasan pengunduran diri saya adalah karena:</p>
        <textarea
          className="pt-letter-textarea"
          placeholder="Tuliskan alasan Anda di sini…"
          value={draft.alasan}
          onChange={(e) => patch({ alasan: e.target.value })}
          rows={3}
        />

        <p>
          Saya berterima kasih atas bimbingannya dan perilaku baik selama saya berdinas di TNI AD,
          serta telah memberi kesempatan kepada saya. Mohon maaf apabila saya memiliki kesalahan
          selama bertugas.
        </p>
        <p>
          Demikian surat permohonan ini saya buat dengan sebenar-benarnya, tanpa ada paksaan dari
          pihak manapun. Atas perhatian dan kebijaksanaannya saya ucapkan terima kasih 🙏
        </p>

        <div className="pt-letter-sign">
          <span>Hormat saya,</span>
          <span className="pt-letter-sign-date">{today}</span>
          <strong>{personnel.name}</strong>
        </div>
      </section>

      <button type="button" className="pt-submit" onClick={attemptSubmit}>
        Kirim Surat
      </button>
      {!valid && <p className="pt-hint">Pilih pangkat dan isi alasan pengunduran diri.</p>}
    </div>
  );
}


type Dir = "forward" | "back" | "fade";
const depth = (s: Screen) => (s === "absensi" || s === "laporan" ? 1 : 0);

type Boot = "scan" | "ok" | "out" | "done";

/** Ikon skull terminal (vektor SVG, tanpa file gambar). */
function SkullIcon() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id="dt-g1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5c842" />
          <stop offset="100%" stopColor="#b5811d" />
        </linearGradient>
      </defs>
      <path
        d="M50 8c-19 0-32 14-32 33 0 12 5 20 10 27l-3 14 12-4 4 6 9-6 9 6 4-6 12 4-3-14c5-7 10-15 10-27 0-19-13-33-32-33z"
        fill="url(#dt-g1)"
        stroke="#3a2c0a"
        strokeWidth="2"
      />
      <circle cx="37" cy="42" r="7" fill="#1a1408" />
      <circle cx="63" cy="42" r="7" fill="#1a1408" />
      <path d="M46 55h8l-4 8z" fill="#1a1408" />
      <path d="M30 30c4-3 8-4 12-2M70 30c-4-3-8-4-12-2" stroke="#1a1408" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Layar loading bertema terminal "DATA_TRANSFER.EXE": ikon skull + teks tetap
 * di tengah. Dipakai saat aplikasi pertama dibuka maupun setiap kali pindah
 * halaman / setelah kirim form.
 */
function DataTransferSplash({ phase }: { phase: Exclude<Boot, "done"> }) {
  return (
    <div
      className={`dt-splash ${phase === "out" ? "is-out" : ""}`}
      role="status"
      aria-label="Memuat"
    >
      <div className="dt-window">
        <div className="dt-titlebar">
          <span className="dt-name">By@iaann</span>
        </div>
        <div className="dt-body">
          <div className="dt-icon-box">
            <SkullIcon />
          </div>
          <div className="dt-status">
            <span>Request Join</span>
            <span>Request Out</span>
            <span>By_iaann</span>
          </div>
          <div className="dt-progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    </div>
  );
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Durasi (ms) tiap tahap layar pembuka. Ubah angka ini untuk mempercepat / memperlambat.
const TIMING = {
  // ok = bar mencapai 100%, out = mulai memudar, done = layar pembuka dilepas
  boot: { ok: 4600, out: 5000, done: 5450 }, // saat aplikasi pertama dibuka
  nav: { ok: 850, out: 1050, done: 1450 }, // saat pindah halaman
};


/** Menu akun: tiga garis di pojok kanan header, berisi profil singkat & Logout. */
function AccountMenu({ onLogout }: { onLogout: () => void }) {
  const p = personnel;
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="pt-menu" ref={boxRef}>
        <button
          ref={btnRef}
          type="button"
          className="pt-menu-btn"
          aria-label="Menu akun"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <MenuDotsIcon size={22} />
        </button>
        {open && (
          <div className="pt-menu-dd" role="menu">
            <div className="pt-menu-who">
              <div className="pt-avatar" aria-hidden="true">
                <Avatar url={p.avatarUrl} name={p.name} />
              </div>
              <div>
                <strong>{p.name}</strong>
                <span>
                  {p.rank} &middot; {p.unit}
                </span>
              </div>
            </div>
            <button
              type="button"
              role="menuitem"
              className="pt-menu-item pt-menu-danger"
              onClick={() => {
                setOpen(false);
                setConfirm(true);
              }}
            >
              <LogOutIcon size={18} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      {confirm && (
        <div className="pt-dialog-wrap" role="presentation" onClick={() => setConfirm(false)}>
          <div
            className="pt-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            aria-describedby="logout-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="logout-title">Keluar dari akun?</h2>
            <p id="logout-desc">Kamu harus login Discord lagi untuk membuka aplikasi.</p>
            <div className="pt-dialog-actions">
              <button type="button" className="pt-dialog-btn" onClick={() => setConfirm(false)}>
                Batal
              </button>
              <button
                type="button"
                className="pt-dialog-btn pt-dialog-danger"
                onClick={() => {
                  setConfirm(false);
                  onLogout();
                }}
              >
                Keluar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Layar login: aplikasi hanya terbuka setelah login Discord. */
function LoginGate({ loading, onLogin }: { loading: boolean; onLogin: () => void }) {
  const [help, setHelp] = useState(false);
  return (
    <div className="pt-shell">
      <main className="pt-main" style={{ paddingTop: "8vh" }}>
        <section className="pt-card pt-form-card" style={{ textAlign: "center" }}>
          {/* Simpan gambar di folder public/ dengan nama discord-login.jpg */}
          <img
            src="/discord-login.jpg"
            alt="Discord"
            width={96}
            height={96}
            style={{ display: "block", margin: "0 auto", borderRadius: 24 }}
          />
          <h2 className="pt-form-title" style={{ marginTop: 14 }}>
            HIGH STATE PD
          </h2>
          <p className="pt-muted" style={{ marginTop: 6 }}>
            Masuk dengan akun Discord untuk membuka Personnel Terminal.
          </p>

          <div
            role="alert"
            style={{
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid var(--red)",
              background: "rgba(239,68,68,0.12)",
              color: "#fca5a5",
              fontSize: 13,
              fontWeight: 700,
              lineHeight: 1.4,
            }}
          >
            Selain dari anggota kepolisian dilarang mengakses web ini!
          </div>

          {loading ? (
            <p className="pt-muted" style={{ marginTop: 18 }}>
              Memeriksa sesi login…
            </p>
          ) : (
            <button
              type="button"
              className="pt-submit"
              style={{ marginTop: 18, width: "100%", background: "#5865F2" }}
              onClick={onLogin}
            >
              Login dengan Discord
            </button>
          )}

          <button
            type="button"
            aria-expanded={help}
            onClick={() => setHelp((v) => !v)}
            style={{
              marginTop: 14,
              background: "none",
              border: 0,
              padding: 6,
              color: "var(--muted)",
              fontSize: 13,
              fontWeight: 600,
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            Ada kendala saat login?
          </button>

          {help && (
            <ul
              className="pt-muted"
              style={{ margin: "8px 0 0", paddingLeft: 18, textAlign: "left", lineHeight: 1.6 }}
            >
              <li>Pastikan akun Discord kamu sudah bergabung di server kepolisian.</li>
              <li>Buka web lewat Chrome atau Safari, bukan browser di dalam aplikasi lain.</li>
              <li>Saat halaman Discord muncul, ketuk Izinkan (Authorize).</li>
              <li>Tutup tab, buka lagi, lalu coba login ulang.</li>
              <li>Masih gagal? Hubungi admin atau atasan kamu.</li>
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast — notifikasi kecil pojok kiri atas (sukses kirim / peringatan)  */
/* ------------------------------------------------------------------ */
type ToastItem = { id: number; msg: string; variant: "ok" | "warn" };

function ToastStack({ items, onDone }: { items: ToastItem[]; onDone: (id: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="pt-toast-wrap" aria-live="polite">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDone={() => onDone(t.id)} />
      ))}
    </div>
  );
}

function ToastCard({ item, onDone }: { item: ToastItem; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 2600);
    const t2 = setTimeout(onDone, 2600 + 240);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className={`pt-toast pt-toast-${item.variant} ${leaving ? "is-leaving" : ""}`}>
      <span className="pt-toast-ico" aria-hidden="true">
        {item.variant === "ok" ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,13 9,18 20,6"></polyline>
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9"></circle>
            <line x1="12" y1="7.5" x2="12" y2="13"></line>
            <circle cx="12" cy="16.5" r="0.6" fill="currentColor"></circle>
          </svg>
        )}
      </span>
      <span className="pt-toast-msg">{item.msg}</span>
      <span className="pt-toast-bar" />
    </div>
  );
}

export default function PersonnelTerminal() {
  // Salinan data personil sebagai state React — perubahan di sini memicu render ulang
  // seluruh layar (nama/pangkat/devisi ikut berubah otomatis setelah login Discord).
  const [profile, setProfile] = useState<PersonnelData>(() => ({ ...personnel }));
  const syncId = useRef(0);
  const refreshTokenRef = useRef<string | undefined>(undefined);
  const refreshingRef = useRef(false); // cegah dua panggilan /api/discord-refresh bertabrakan
  // Status login: "loading" = cek sesi, "out" = belum login, "in" = sudah login Discord
  const [authState, setAuthState] = useState<"loading" | "out" | "in">("loading");

  /** Terapkan data personil ke variabel global + state supaya UI ter-update. */
  const applyPersonnel = (data: Partial<PersonnelData>) => {
    setPersonnelData(data);
    setProfile({ ...personnel });
  };

  /**
   * Ambil nama/foto/pangkat/devisi dari sesi Supabase (Discord OAuth2).
   * Dipanggil saat halaman dibuka dan setiap kali status login berubah.
   */
  const syncFromSession = async (session: Session | null) => {
    const myId = ++syncId.current; // abaikan hasil sync lama jika ada sync baru
    const user = session?.user;

    // Belum login -> kembali ke data default
    if (!user) {
      clearDiscordProfile();
      resetPersonnelData();
      setProfile({ ...personnel });
      setAuthState("out");
      return;
    }
    setAuthState("in");

    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      name?: string;
      custom_claims?: { global_name?: string };
      avatar_url?: string;
    };
    // Nilai bawaan dari Supabase (bisa berupa snapshot lama, mis. avatar_url beku
    // sejak login pertama kali) - dipakai hanya sebagai cadangan awal sebelum data
    // langsung dari Discord datang.
    let name =
      meta.custom_claims?.global_name || meta.full_name || meta.name || "Personil";
    let avatarUrl = meta.avatar_url || "";
    const providerToken = session?.provider_token;
    // Hanya ada sesaat setelah login; dipakai untuk menyegarkan data nanti tanpa login ulang
    const providerRefreshToken = (session as unknown as { provider_refresh_token?: string })
      ?.provider_refresh_token;

    // Token Discord tidak tersedia (mis. setelah refresh halaman) -> pakai cache terakhir,
    // lalu coba segarkan diam-diam dari Discord di belakang layar
    if (!providerToken) {
      const cached = loadDiscordProfile(user.id);
      applyPersonnel({
        name: cached?.name ?? name,
        avatarUrl: cached?.avatarUrl ?? avatarUrl,
        rank: cached?.rank ?? "Login ulang untuk sinkron",
        unit: cached?.unit ?? "-",
        discordLinked: true,
      });
      refreshTokenRef.current = cached?.refreshToken;
      if (cached?.refreshToken) void refreshFromDiscord(user.id, cached.refreshToken);
      return;
    }

    // Tampilkan nama & foto dulu (nilai sementara dari Supabase), lalu buru-buru
    // ganti dengan data LANGSUNG dari Discord supaya foto/nama pasti yang terbaru,
    // bukan snapshot lama Supabase.
    applyPersonnel({ name, avatarUrl, discordLinked: true });

    try {
      const live = await fetchDiscordProfile(providerToken);
      if (live) {
        name = live.name;
        avatarUrl = live.avatarUrl;
        applyPersonnel({ name, avatarUrl, discordLinked: true });
      }
    } catch {
      /* gagal ambil profil langsung -> tetap pakai nilai bawaan Supabase di atas */
    }

    let rank = "Bukan anggota server";
    let unit = "-";
    try {
      const roles = await fetchDiscordGuildRoles(providerToken);
      if (roles) ({ rank, unit } = mapRolesToPangkatDivisi(roles));
    } catch {
      /* gagal ambil role -> tetap tampil nilai bawaan di atas */
    }
    if (myId !== syncId.current) return; // sudah ada sync yang lebih baru

    applyPersonnel({ name, avatarUrl, rank, unit, discordLinked: true });

    // Jangan pernah menimpa refresh token yang masih valid dengan undefined.
    // Setelah reload, Supabase biasanya tidak mengembalikan provider_refresh_token,
    // sehingga token terakhir yang sudah dirotasi harus dipertahankan di cache.
    const cachedBeforeSave = loadDiscordProfile(user.id);
    const nextRefreshToken = providerRefreshToken ?? cachedBeforeSave?.refreshToken;
    refreshTokenRef.current = nextRefreshToken;
    saveDiscordProfile({
      userId: user.id,
      name,
      avatarUrl,
      rank,
      unit,
      ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
    });
  };

  /**
   * Minta data terbaru langsung dari Discord (nama, foto, pangkat, devisi) lewat
   * route /api/discord-refresh, tanpa perlu logout/login ulang. Gagal diam-diam:
   * kalau route belum disiapkan atau token kedaluwarsa, data cache lama tetap dipakai.
   */
  const refreshFromDiscord = async (userId: string, refreshToken: string): Promise<boolean> => {
    if (refreshingRef.current) return false;
    if (!tryAcquireRefreshLock()) {
      // Tab lain sedang/baru saja melakukan rotasi token. Ambil hasil cache setelah
      // sebentar, jangan memakai refresh token lama yang kemungkinan sudah hangus.
      window.setTimeout(() => {
        const latest = loadDiscordProfile(userId);
        if (latest?.refreshToken && latest.refreshToken !== refreshToken) {
          refreshTokenRef.current = latest.refreshToken;
          applyPersonnel({
            name: latest.name,
            avatarUrl: latest.avatarUrl,
            rank: latest.rank,
            unit: latest.unit,
            discordLinked: true,
          });
        }
      }, 1000);
      return false;
    }

    refreshingRef.current = true;
    try {
      const res = await fetch("/api/discord-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) return false;

      const data = (await res.json()) as {
        name?: string;
        avatarUrl?: string;
        rank?: string;
        unit?: string;
        refreshToken?: string;
      };
      if (!data.name) return false;

      const nextRefreshToken = data.refreshToken ?? refreshToken;
      refreshTokenRef.current = nextRefreshToken;
      applyPersonnel({
        name: data.name,
        avatarUrl: data.avatarUrl ?? "",
        rank: data.rank ?? "-",
        unit: data.unit ?? "-",
        discordLinked: true,
      });
      saveDiscordProfile({
        userId,
        name: data.name,
        avatarUrl: data.avatarUrl ?? "",
        rank: data.rank ?? "-",
        unit: data.unit ?? "-",
        refreshToken: nextRefreshToken,
      });
      return true;
    } catch {
      return false;
    } finally {
      refreshingRef.current = false;
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => syncFromSession(data.session));
    // Pakai session dari callback (bukan getSession lagi) supaya provider_token ikut terbaca
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      syncFromSession(session);
    });
    // Jangan refresh token pada setiap focus/visibilitychange. Discord dapat
    // merotasi refresh token setiap kali dipakai, sehingga refresh berulang dari
    // beberapa event/tab dapat membuat token lama menjadi invalid (HTTP 400).
    return () => {
      listener.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDiscordLogin = () => {
    supabase.auth.signInWithOAuth({
      provider: "discord",
      options: {
        scopes: "identify guilds.members.read",
        redirectTo: window.location.origin,
      },
    });
  };

  const handleDiscordLogout = async () => {
    await supabase.auth.signOut(); // onAuthStateChange akan mereset data ke default
  };


  const [nav, setNav] = useState<{ screen: Screen; dir: Dir }>({
    screen: "home",
    dir: "fade",
  });
  const screen = nav.screen;

  // Draft form REQUEST JOIN & REQUEST OUT disimpan di sini supaya isinya tidak
  // hilang saat pindah halaman.
  const [joinDraft, setJoinDraft] = useState<JoinDraft>(emptyJoinDraft);
  const joinRef = useRef(joinDraft);
  joinRef.current = joinDraft;
  const [outDraft, setOutDraft] = useState<OutDraft>(emptyOutDraft);
  const outRef = useRef(outDraft);
  outRef.current = outDraft;
  // Log: seluruh Request Join/Out anggota, disimpan di Supabase (bukan localStorage lagi).
  // Toast: notifikasi kecil pojok kiri atas (sukses kirim laporan / peringatan form belum lengkap)
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const showToast = (msg: string, variant: "ok" | "warn" = "ok") => {
    const id = ++toastSeq.current;
    setToasts((ts) => [...ts, { id, msg, variant }]);
  };
  const dismissToast = (id: number) => setToasts((ts) => ts.filter((t) => t.id !== id));

  const [logs, setLogs] = useState<LogEntry[]>([]);
  useEffect(() => {
    let active = true;
    fetchLogs().then((data) => {
      if (active) setLogs(data);
    });
    // Realtime: kalau anggota lain kirim/ubah log dari perangkat lain, muat ulang di sini juga.
    const channel = supabase
      .channel("personnel_logs_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "personnel_logs" }, () => {
        fetchLogs().then((data) => active && setLogs(data));
      })
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);
  const upsertLog = (entry: LogEntry) => {
    setLogs((ls) => [entry, ...ls.filter((l) => l.id !== entry.id)].slice(0, MAX_LOGS));
    upsertLogRow(entry); // simpan ke Supabase di latar belakang
  };

  // Saat akun Discord berganti (login akun lain / logout-login), draft form yang
  // belum dikirim di-reset supaya tidak terbawa ke akun baru.
  const prevProfileNameRef = useRef(profile.name);
  useEffect(() => {
    if (prevProfileNameRef.current === profile.name) return;
    prevProfileNameRef.current = profile.name;
    setJoinDraft(emptyJoinDraft());
    setOutDraft(emptyOutDraft());
  }, [profile.name]);

  useEffect(
    () => () => {
      if (joinRef.current.photo) URL.revokeObjectURL(joinRef.current.photo.url);
    },
    []
  );

  const commitScreen = (next: Screen) =>
    setNav((prev) => {
      if (prev.screen === next) return prev;
      const dir: Dir =
        depth(next) > depth(prev.screen)
          ? "forward"
          : depth(next) < depth(prev.screen)
          ? "back"
          : "fade";
      return { screen: next, dir };
    });

  // Layar loading: logo + bar persen + tulisan berganti-ganti.
  // Dipakai saat aplikasi dibuka DAN setiap kali pindah halaman.
  const reduced = prefersReducedMotion();
  const [phase, setPhase] = useState<Boot>(reduced ? "done" : "scan");
  const [appReady, setAppReady] = useState(reduced);
  const [run, setRun] = useState(0);
  const [fast, setFast] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  const play = (isFast: boolean, onSwap?: () => void) => {
    clearTimers();
    const t = isFast ? TIMING.nav : TIMING.boot;
    setFast(isFast);
    setRun((n) => n + 1);
    setPhase("scan");
    timers.current = [
      setTimeout(() => setPhase("ok"), t.ok),
      setTimeout(() => {
        onSwap?.(); // ganti halaman saat layar pembuka mulai memudar
        setAppReady(true);
        setPhase("out");
      }, t.out),
      setTimeout(() => setPhase("done"), t.done),
    ];
  };

  useEffect(() => {
    if (!reduced) play(false);
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (next: Screen) => {
    if (next === screen) return;
    if (phase !== "done" && phase !== "out") return; // abaikan tap saat sedang memuat
    if (prefersReducedMotion()) {
      commitScreen(next);
      return;
    }
    play(true, () => commitScreen(next));
  };
  const setScreen = (next: Screen) => goTo(next);

  const isDetail = screen === "absensi" || screen === "laporan";
  // Halaman detail dianggap bagian dari tab Home
  const activeTab: Tab | null = isDetail ? "home" : (screen as Tab);

  // Layar loading pembuka tampil dulu (juga selama sesi login masih diperiksa)
  const booting = phase !== "done" && !fast;
  if (authState === "loading" || (authState === "out" && booting)) {
    return (
      <div className="pt-root">
        <style>{css}</style>
        <DataTransferSplash phase={phase === "done" ? "out" : phase} />
      </div>
    );
  }

  // Wajib login Discord dulu sebelum bisa membuka aplikasi
  if (authState === "out") {
    return (
      <div className="pt-root">
        <style>{css}</style>
        <LoginGate loading={false} onLogin={handleDiscordLogin} />
      </div>
    );
  }

  return (
    <div className="pt-root">
      <style>{css}</style>

      <ToastStack items={toasts} onDone={dismissToast} />

      {phase !== "done" && <DataTransferSplash key={run} phase={phase} />}

      {appReady && (
        <div className="pt-shell">
          <header className="pt-header">
            <div className="pt-header-bar">
              {isDetail ? (
                <button
                  type="button"
                  className="pt-back"
                  onClick={() => setScreen(parentScreen(screen))}
                >
                  <ChevronLeft size={22} />
                  <span className="pt-title">{screenTitle[screen]}</span>
                </button>
              ) : (
                <span className="pt-title">{screenTitle[screen]}</span>
              )}
              <AccountMenu onLogout={handleDiscordLogout} />
            </div>
          </header>

          <main className="pt-main">
            <div key={screen} className={`pt-page pt-page-${nav.dir}`}>
              {screen === "home" && (
                <HomeScreen onNavigate={setScreen} stagger={nav.dir === "fade"} />
              )}
              {screen === "absensi" && (
                <RequestJoinForm
                  draft={joinDraft}
                  setDraft={setJoinDraft}
                  onLog={upsertLog}
                  showToast={showToast}
                  onSubmitted={() => goTo("home")}
                />
              )}
              {screen === "laporan" && (
                <RequestOutForm
                  draft={outDraft}
                  setDraft={setOutDraft}
                  onLog={upsertLog}
                  showToast={showToast}
                  onSubmitted={() => goTo("home")}
                />
              )}
            </div>
          </main>

          <nav className="pt-nav" aria-label="Navigasi utama">
            {tabs.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={`pt-tab ${activeTab === id ? "is-active" : ""}`}
                aria-current={activeTab === id ? "page" : undefined}
                onClick={() => setScreen(id)}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styling                                                             */
/* ------------------------------------------------------------------ */
const css = `
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap");

.pt-root {
  --bg: #100e0a;
  --card: #1b1812;
  --card-2: #262118;
  --line: #e0a526; /* warna semua garis / border */
  --line-hi: #f5c842; /* garis saat ditekan / fokus */
  --text: #fbf5e6;
  --muted: #b5a785;
  --blue: #3b82f6;
  --green: #10d9a0;
  --red: #ef4444;
  --deco: #2b2519;

  min-height: 100vh;
  min-height: 100dvh;
  background: #070603;
  color: var(--text);
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
  display: flex;
  justify-content: center;
}
.pt-root *, .pt-root *::before, .pt-root *::after { box-sizing: border-box; }
.pt-root p, .pt-root h1, .pt-root h2 { margin: 0; }

.pt-shell {
  position: relative;
  width: 100%;
  max-width: 480px;
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
}

/* Header */
.pt-header {
  position: sticky; top: 0; z-index: 5;
  padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 8px;
  background: var(--bg);
}
.pt-header-bar {
  display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 52px; padding: 0 12px 0 18px;
  border-radius: 22px; background: var(--card); border: 1px solid var(--line);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
}
.pt-title { font-size: 15px; font-weight: 700; letter-spacing: 0.06em; }
.pt-avatar {
  width: 48px; height: 48px; border-radius: 50%; flex: none;
  background: #b91c1c; border: 2px solid var(--line);
  display: grid; place-items: center; overflow: hidden;
  font-weight: 700; font-size: 16px;
}
.pt-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pt-idcard { display: flex; align-items: center; gap: 8px; }
.pt-idcard .pt-id3 { flex: 1; min-width: 0; }

.pt-back {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
  margin: 0 0 0 -10px; padding: 6px 8px; border-radius: 14px;
  color: var(--text); font: inherit;
}
.pt-back:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* Kartu yang bisa diklik */
.pt-link {
  appearance: none; width: 100%; display: block;
  text-align: left; color: inherit; font: inherit; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.15s ease, border-color 0.15s ease;
}
.pt-link:active { transform: scale(0.97); border-color: var(--line-hi); }
.pt-link:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 3px; }

/* Animasi */
.pt-main { overflow-x: clip; }

.pt-page { animation-duration: 0.35s; animation-timing-function: cubic-bezier(0.22, 1, 0.36, 1); animation-fill-mode: backwards; }
.pt-page-forward { animation-name: pt-in-right; }
.pt-page-back { animation-name: pt-in-left; }
.pt-page-fade { animation-name: pt-fade; animation-duration: 0.25s; }

@keyframes pt-in-right { from { opacity: 0; transform: translateX(32px); } to { opacity: 1; transform: none; } }
@keyframes pt-in-left { from { opacity: 0; transform: translateX(-32px); } to { opacity: 1; transform: none; } }
@keyframes pt-fade { from { opacity: 0; } to { opacity: 1; } }

.pt-rise {
  animation: pt-rise 0.6s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(var(--i, 0) * 90ms);
}
@keyframes pt-rise { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }

/* Toast — notifikasi kecil pojok kiri atas */
.pt-toast-wrap {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 14px);
  left: 14px;
  z-index: 70;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: min(86vw, 360px);
  pointer-events: none;
}
.pt-toast {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 11px;
  background: linear-gradient(155deg, var(--card-2) 0%, var(--card) 100%);
  border: 1px solid var(--green);
  color: var(--text);
  padding: 13px 16px 13px 13px;
  border-radius: 14px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5);
  animation: pt-toast-in 0.32s cubic-bezier(0.25, 1.4, 0.4, 1);
  pointer-events: auto;
}
.pt-toast.is-leaving { animation: pt-toast-out 0.22s ease-in forwards; }
.pt-toast-warn { border-color: #d4913a; }
.pt-toast-ico {
  width: 26px; height: 26px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center; flex: none;
  background: rgba(16, 217, 160, 0.15); border: 1px solid var(--green); color: var(--green);
}
.pt-toast-warn .pt-toast-ico { background: rgba(212, 145, 58, 0.15); border-color: #d4913a; color: #d4913a; }
.pt-toast-ico svg { width: 14px; height: 14px; }
.pt-toast-msg { font-size: 13px; line-height: 1.4; font-weight: 500; padding-right: 2px; }
.pt-toast-bar {
  position: absolute; left: 0; bottom: 0; height: 2.5px; width: 100%;
  background: var(--green); opacity: 0.55; transform-origin: left;
  animation: pt-toast-bar 2.6s linear forwards;
}
.pt-toast-warn .pt-toast-bar { background: #d4913a; }
@keyframes pt-toast-in {
  from { transform: translateY(-14px) scale(0.96); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes pt-toast-out {
  from { transform: translateY(0) scale(1); opacity: 1; }
  to { transform: translateY(-8px) scale(0.97); opacity: 0; }
}
@keyframes pt-toast-bar { from { transform: scaleX(1); } to { transform: scaleX(0); } }

/* Goyang kartu form saat data belum lengkap ditekan kirim */
.pt-shake { animation: pt-shake 0.32s ease; }
@keyframes pt-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-5px); }
  75% { transform: translateX(5px); }
}

/* Layar loading — tema terminal "DATA_TRANSFER.EXE" */
.dt-splash {
  position: fixed; inset: 0; z-index: 50;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  background: radial-gradient(ellipse at 50% 100%, rgba(224, 165, 38, 0.12), transparent 60%), #070603;
  font-family: "Courier New", ui-monospace, Menlo, Consolas, monospace;
  transition: opacity 0.5s ease;
}
.dt-splash.is-out { opacity: 0; pointer-events: none; }
.dt-splash.is-fast { animation: pt-fade 0.15s ease backwards; }

.dt-window {
  width: 100%; max-width: 300px;
  background: linear-gradient(180deg, var(--card-2), var(--card));
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
  animation: pt-logo-in 0.5s cubic-bezier(0.22, 1, 0.36, 1) backwards;
}
.dt-titlebar {
  display: flex; align-items: center; justify-content: center;
  padding: 12px 16px; border-bottom: 1px solid var(--line); background: rgba(255, 255, 255, 0.01);
}
.dt-name { color: var(--muted); font-size: 12px; letter-spacing: 2px; }

.dt-body { padding: 28px 20px 24px; display: flex; flex-direction: column; align-items: center; gap: 20px; }
.dt-icon-box {
  position: relative;
  width: 92px; height: 92px; border-radius: 18px;
  background: var(--bg); border: 1px solid var(--line);
  display: flex; align-items: center; justify-content: center;
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6);
}
.dt-icon-box::before {
  content: ""; position: absolute; inset: -16%; border-radius: 50%;
  background: radial-gradient(circle, rgba(245, 200, 66, 0.22) 0%, transparent 65%);
  animation: pt-glow 3s ease-in-out infinite;
}
.dt-icon-box svg { position: relative; width: 54px; height: 54px; filter: drop-shadow(0 0 10px rgba(245, 200, 66, 0.4)); }

.dt-status {
  width: 100%; background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  padding: 12px 16px; text-align: center;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; overflow: hidden;
}
.dt-status span {
  color: var(--line-hi); font-weight: 700; font-size: 11.5px; letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(245, 200, 66, 0.5); white-space: nowrap;
  animation: pt-text-in 0.3s ease backwards;
}

.dt-progress {
  width: 100%; height: 3px; border-radius: 2px; overflow: hidden;
  background: rgba(224, 165, 38, 0.15);
}
.dt-progress span {
  display: block; height: 100%; width: 40%; border-radius: 2px;
  background: var(--line-hi); box-shadow: 0 0 8px rgba(245, 200, 66, 0.6);
  animation: pt-progress-slide 0.9s ease-in-out infinite;
}

@keyframes pt-logo-in { from { opacity: 0; transform: scale(0.88); } to { opacity: 1; transform: none; } }
@keyframes pt-glow { 0%, 100% { opacity: 0.6; transform: scale(0.96); } 50% { opacity: 1; transform: scale(1.04); } }
@keyframes pt-text-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes pt-progress-slide {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(280%); }
}

/* Main */
.pt-main { flex: 1; padding: 12px 16px 110px; }
.pt-stack { display: flex; flex-direction: column; gap: 14px; }

.pt-card {
  position: relative; overflow: hidden;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 28px;
  padding: 20px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
}
.pt-deco { position: absolute; color: var(--deco); pointer-events: none; }
.pt-muted { color: var(--muted); font-size: 13px; font-weight: 500; }
.pt-blue { color: var(--blue); }

/* Profil */
.pt-profile {
  display: grid; grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: stretch; padding: 12px;
}
.pt-profile .pt-avatar { align-self: center; margin-right: 10px; }
.pt-discord-link {
  grid-column: 1 / -1; margin-top: 10px; text-align: center;
  padding: 8px; border-radius: 12px; font-size: 12.5px; font-weight: 700;
  text-decoration: none; color: #fff; background: #5865F2;
  border: 0; appearance: none; cursor: pointer; font: inherit; width: 100%;
}
.pt-discord-link:hover { filter: brightness(1.08); }
/* Setiap kolom diberi garis pemisah di kiri, tingginya sama rata */
.pt-pf {
  min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 2px;
  padding: 2px 8px; border-left: 1px solid var(--line);
}
.pt-pf:last-child { padding-right: 0; }
.pt-pf span { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.pt-pf strong { font-size: 12px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-pf em { font-style: normal; font-size: 10px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Kartu identitas ringkas Nama/Pangkat/Devisi di dalam form laporan */
.pt-id3 {
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;
  padding: 16px 18px; border-radius: 20px; background: #221e16; border: 1px solid var(--line);
}
.pt-id3 > div { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding-left: 10px; border-left: 1px solid var(--line); }
.pt-id3 > div:first-child { padding-left: 0; border-left: 0; }
.pt-id3 span { font-size: 11px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: var(--muted); }
.pt-id3 strong { font-size: 15px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Stats */
.pt-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pt-stat { padding: 16px 18px; border-radius: 26px; }
.pt-deco-stat { right: 10px; top: 10px; opacity: 0.9; }
.pt-icon-circle {
  position: relative; width: 44px; height: 44px; border-radius: 50%;
  display: grid; place-items: center; margin-bottom: 18px;
}
.pt-icon-blue { background: #172443; color: var(--blue); }
.pt-icon-green { background: #0f2b25; color: var(--green); }
.pt-stat-title { position: relative; font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
.pt-unit { margin-left: 8px; font-size: 20px; font-weight: 400; letter-spacing: 0; color: #e3d8b9; }

/* Kartu besar */
.pt-rank {
  position: relative; margin-top: 10px !important;
  font-size: 38px; font-weight: 800; letter-spacing: -1px; line-height: 1.1;
}
/* Absen minggu ini */
.pt-week { padding: 20px 16px 18px; }
.pt-deco-week { width: 110px; right: -10px; top: 8px; }
.pt-week .pt-muted { position: relative; }
.pt-week-range { font-size: 23px; }
.pt-week-range .pt-unit { font-size: 15px; margin-left: 8px; color: var(--muted); }

.pt-days {
  position: relative; list-style: none; margin: 16px 0 0; padding: 0;
  display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px;
}
.pt-day {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 10px 0 11px; border-radius: 16px;
  background: #221e16; border: 1px solid var(--line);
}
.pt-day-name { font-size: 10px; font-weight: 500; color: var(--muted); }
.pt-day-num { font-size: 15px; font-weight: 700; line-height: 1.2; }
.pt-day-dot { width: 6px; height: 6px; margin-top: 4px; border-radius: 50%; background: transparent; }
.pt-day.is-hadir { background: #0f2b25; }
.pt-day.is-hadir .pt-day-dot { background: var(--green); }
.pt-day.is-absen .pt-day-dot { background: var(--red); }
.pt-day.is-nanti { opacity: 0.45; }
.pt-day.is-today { border-color: var(--line-hi); box-shadow: inset 0 0 0 1px var(--line-hi); }
.pt-day.is-today.is-belum { background: #172443; }

.pt-week .pt-progress-foot { font-size: 12px; justify-content: flex-start; gap: 18px; flex-wrap: wrap; }
.pt-legend { display: inline-flex; align-items: center; gap: 8px; }
.pt-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.pt-dot.is-hadir { background: var(--green); }
.pt-dot.is-absen { background: var(--red); }
.pt-dot.is-today { background: transparent; border: 2px solid var(--line-hi); width: 10px; height: 10px; }

.pt-progress-block { position: relative; margin-top: 18px; padding-top: 16px; border-top: 1px solid var(--line); }
.pt-progress-head { display: flex; align-items: center; justify-content: space-between; font-size: 14px; font-weight: 500; }
.pt-progress-head span { display: inline-flex; align-items: center; gap: 10px; }
.pt-progress-head strong { font-size: 14px; font-weight: 700; }
.pt-bar {
  margin-top: 12px; height: 14px; padding: 2px;
  background: #2b2519; border: 1px solid var(--line); border-radius: 999px;
}
.pt-bar-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, #2563eb 0%, #6366f1 45%, #06b6d4 100%);
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}
.pt-progress-foot {
  margin-top: 14px; display: flex; justify-content: space-between; gap: 12px;
  color: var(--muted); font-size: 13px;
}
.pt-progress-foot b { color: var(--text); font-weight: 600; }

/* Form absensi */
.pt-form-card { padding: 28px 24px; }
.pt-form-title { overflow-wrap: anywhere; margin-top: 6px !important; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; line-height: 1.15; }
.pt-form { display: flex; flex-direction: column; gap: 26px; margin-top: 28px; }
.pt-field { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.pt-field > span {
  font-size: 12px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase;
  color: var(--muted);
}
.pt-field small { font-size: 12px; color: var(--muted); }
.pt-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.pt-input {
  width: 100%; min-width: 0; min-height: 54px; padding: 13px 16px;
  border-radius: 20px; background: #221e16; border: 1px solid var(--line);
  color: var(--text); font: inherit; font-size: 16px; color-scheme: dark;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.pt-input::placeholder { color: #857a59; }
.pt-input:focus { outline: none; border-color: var(--line-hi); box-shadow: 0 0 0 3px rgba(245, 200, 66, 0.28); }
 .pt-textarea { min-height: 130px; resize: vertical; line-height: 1.5; }
.pt-readonly { display: flex; align-items: center; gap: 10px; color: #857a59; font-size: 16px; }
.pt-readonly.has-value { color: var(--green); font-weight: 600; background: #0f2b25; font-size: 17px; }

.pt-photos-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
 .pt-form-sub { font-size: 18px; font-weight: 700; }
.pt-photos-head .pt-muted { margin-top: 6px !important; font-size: 14px; line-height: 1.45; }
.pt-photos-head strong { font-size: 18px; color: var(--blue); white-space: nowrap; }
.pt-photos { display: grid; grid-template-columns: 1fr 1fr; gap: 18px 14px; margin-top: 22px; }
.pt-photo {
  position: relative; aspect-ratio: 1; border-radius: 24px; overflow: hidden;
  background: #221e16; border: 1.5px dashed var(--line);
}
.pt-photo.is-filled { border: 1.5px solid var(--line); }
.pt-photo:focus-within { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.pt-photo-empty {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px;
  color: var(--muted); font-size: 14px; cursor: pointer;
}
.pt-photo-empty input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.pt-photo-num {
  position: absolute; top: 10px; left: 10px; width: 26px; height: 26px; border-radius: 50%;
  background: rgba(0, 0, 0, 0.6); display: grid; place-items: center;
  font-size: 13px; font-weight: 700; pointer-events: none;
}
.pt-photo-x {
  position: absolute; top: 8px; right: 8px; width: 34px; height: 34px; border-radius: 50%;
  border: 0; background: rgba(0, 0, 0, 0.65); color: #fff;
  display: grid; place-items: center; cursor: pointer;
}
.pt-photo-title { margin-top: 10px !important; font-size: 15px; font-weight: 600; }
.pt-photo-hint { margin-top: 2px !important; font-size: 13px; color: var(--muted); }

.pt-submit, .pt-secondary {
  appearance: none; width: 100%; padding: 18px; border-radius: 22px;
  font: inherit; font-size: 16px; font-weight: 700; letter-spacing: 0.03em; cursor: pointer;
  transition: transform 0.15s ease, opacity 0.2s ease;
}
.pt-submit { border: 0; background: linear-gradient(90deg, #2563eb, #6366f1); color: #fff; }
.pt-submit:disabled { background: #221e16; color: #857a59; border: 1px solid var(--line); cursor: not-allowed; }
.pt-secondary { background: transparent; border: 1px solid var(--line); color: var(--text); font-weight: 600; }
.pt-submit:active:not(:disabled), .pt-secondary:active { transform: scale(0.98); }
.pt-submit:focus-visible, .pt-secondary:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 3px; }
.pt-hint { margin-top: -10px !important; text-align: center; font-size: 14px; color: var(--muted); }

/* Surat REQUEST OUT — tampil seperti kertas resmi di atas tema gelap aplikasi */
.pt-letter {
  background: #f3ecdd; color: #2a2118; border-radius: 20px; padding: 28px 22px;
  font-family: Georgia, "Times New Roman", serif; line-height: 1.65; font-size: 15px;
}
.pt-letter p { margin: 0 0 14px !important; }
.pt-letter-title {
  margin: 0 0 20px !important; text-align: center; font-weight: 700; font-size: 17px;
  letter-spacing: 0.02em; line-height: 1.5;
}
.pt-letter-date { text-align: right; color: #8a7f68 !important; margin-bottom: 18px !important; }
.pt-letter-field {
  display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid #cfc4a8;
  padding-bottom: 6px; margin-bottom: 16px;
}
.pt-letter-field label { flex: none; width: 78px; color: #5b5140; }
.pt-letter-field strong { flex: 1; font-size: 15.5px; }
.pt-letter-verified { color: #2f9e44; font-weight: 700; font-size: 12px; white-space: nowrap; }
.pt-letter-select {
  flex: 1; appearance: none; background: transparent; border: 0; font: inherit;
  font-weight: 700; font-size: 15.5px; color: #2a2118; padding: 0;
}
.pt-letter-select:invalid { color: #8a7f68; font-weight: 400; }
.pt-letter-textarea {
  width: 100%; min-height: 70px; resize: vertical; margin-bottom: 14px;
  background: transparent; border: 0; border-bottom: 1px solid #cfc4a8;
  font: inherit; font-style: italic; font-size: 15px; color: #2a2118; padding: 4px 0 8px;
}
.pt-letter-textarea::placeholder { color: #9c9276; }
.pt-letter-textarea:focus, .pt-letter-select:focus { outline: none; }
.pt-letter-sign { display: flex; flex-direction: column; align-items: flex-end; margin-top: 18px; }
.pt-letter-sign-date { color: #8a7f68; margin: 26px 0 8px; }
.pt-letter-sign strong { border-top: 1px solid #2a2118; padding-top: 8px; min-width: 160px; text-align: right; }

.pt-done-icon {
  width: 60px; height: 60px; border-radius: 50%; margin-bottom: 18px;
  background: #0f2b25; color: var(--green); display: grid; place-items: center;
}
.pt-report {
  margin: 20px 0 0; padding: 18px; border-radius: 20px;
  background: #221e16; border: 1px solid var(--line); color: #ede3c6;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 14px; line-height: 1.6; white-space: pre-wrap; word-break: break-word;
}
.pt-thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
.pt-thumbs img { width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: 14px; }

.pt-report-detail { margin-top: 4px; }
.pt-detail-tabs { display: flex; gap: 6px; margin-bottom: 9px; }
.pt-detail-tabs button {
  flex: 1; background: var(--card); border: 1px solid var(--line); color: var(--muted);
  font: inherit; font-size: 11px; font-weight: 700; padding: 7px; border-radius: 9px; cursor: pointer;
}
.pt-detail-tabs button.is-active { border-color: var(--line-hi); color: var(--line-hi); }
.pt-format-list { display: flex; flex-direction: column; gap: 6px; }
.pt-format-row {
  display: flex; gap: 8px; font-size: 11.5px; padding: 8px 10px;
  background: var(--card); border-radius: 9px; border: 1px solid var(--line);
}
.pt-format-row b { flex: none; width: 42%; color: var(--muted); font-weight: 600; }
.pt-format-row span { flex: 1; word-break: break-word; white-space: pre-wrap; }
.pt-photo-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.pt-photo-thumb {
  display: block; aspect-ratio: 4/3; border-radius: 10px; overflow: hidden;
  border: 1px solid var(--line); background: var(--card);
}
.pt-photo-thumb img { width: 100%; height: 100%; object-fit: cover; }

/* Menu Laporan (grid kartu) */
.pt-header-ops {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;
  padding: calc(16px + env(safe-area-inset-top, 0px)) 16px 10px;
}
.pt-header-ops .pt-ops-head { flex: 1; }
.pt-back-sq {
  appearance: none; flex: none; width: 40px; height: 40px; border-radius: 13px; cursor: pointer;
  display: grid; place-items: center; color: var(--text);
  background: var(--card); border: 1px solid var(--line);
  transition: transform 0.15s ease;
}
.pt-back-sq:active { transform: scale(0.94); }
.pt-back-sq:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-ops-head { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.pt-ops-org {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 10.5px; font-weight: 700; letter-spacing: 0.14em; color: var(--muted);
}
.pt-ops-org svg { color: #ef4444; }
 .pt-ops-title { font-size: 20px; font-weight: 800; letter-spacing: -0.4px; line-height: 1.15; }

.pt-ops-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding-top: 6px; }
.pt-ops-card {
  appearance: none; display: flex; flex-direction: column; align-items: center; gap: 9px;
  padding: 16px 10px 14px; border-radius: 22px; cursor: pointer;
  background: var(--card); border: 1px solid var(--line);
  color: inherit; font: inherit; box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35);
  transition: transform 0.15s ease, border-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.pt-ops-card:active { transform: scale(0.97); border-color: var(--line-hi); }
.pt-ops-card:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 3px; }
.pt-ops-ico {
  width: 46px; height: 46px; border-radius: 15px; display: grid; place-items: center;
  background: #221e16; border: 1px solid var(--line); color: #ef3b3b;
}
.pt-ops-name { font-size: 14.5px; font-weight: 600; text-align: center; }
.pt-ops-pill {
  padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 600;
  background: rgba(239, 68, 68, 0.12); border: 1px solid var(--line); color: #ef5350;
}

/* Bukti foto Evidence */
.pt-ev-photos { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.pt-ev-photos .pt-photo { border-radius: 16px; }
.pt-ev-photos .pt-photo-x { top: 6px; right: 6px; width: 30px; height: 30px; }

/* Log */
.pt-seg {
  display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 6px;
  border-radius: 20px; background: var(--card); border: 1px solid var(--line);
}
.pt-seg-btn {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 8px; border-radius: 15px; color: var(--muted);
  font: inherit; font-size: 14px; font-weight: 600;
  transition: background 0.2s ease, color 0.2s ease;
}
.pt-seg-btn.is-active { background: #2b2519; color: var(--line-hi); }
.pt-seg-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-seg-count {
  min-width: 20px; padding: 1px 6px; border-radius: 99px; font-size: 11px;
  background: rgba(224, 165, 38, 0.16); color: var(--line-hi);
}
.pt-log-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.pt-subseg { display: flex; gap: 8px; margin: -2px 0 2px; }
.pt-subseg-btn {
  appearance: none; border: 1px solid var(--line); background: transparent; cursor: pointer;
  padding: 6px 14px; border-radius: 999px; color: var(--muted); font: inherit; font-size: 12px; font-weight: 700;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}
.pt-subseg-btn.is-active { border-color: var(--line-hi); color: var(--line-hi); background: rgba(224, 165, 38, 0.1); }
.pt-subseg-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-log-item { overflow: hidden; border-radius: 22px; background: var(--card); border: 1px solid var(--line); }
.pt-log-head {
  appearance: none; width: 100%; border: 0; background: transparent; color: inherit;
  font: inherit; text-align: left; cursor: pointer;
  display: flex; align-items: center; gap: 12px; padding: 14px;
  -webkit-tap-highlight-color: transparent;
}
.pt-log-head:focus-visible { outline: 2px solid var(--line-hi); outline-offset: -2px; border-radius: 22px; }
.pt-log-ico { flex: none; width: 42px; height: 42px; border-radius: 14px; }
.pt-log-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.pt-log-kind { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
.pt-log-title, .pt-log-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pt-log-title { font-size: 15px; font-weight: 700; }
.pt-log-sub { font-size: 13px; color: #e3d8b9; }
.pt-log-time { font-size: 11.5px; color: var(--muted); }
.pt-log-chev { flex: none; color: var(--muted); transition: transform 0.2s ease; }
.pt-log-item.is-open .pt-log-chev { transform: rotate(180deg); }
.pt-log-body { padding: 0 14px 14px; }
.pt-log-body .pt-report { margin: 0; }
.pt-log-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 12px; }
.pt-log-actions .pt-secondary { padding: 12px; font-size: 15px; border-radius: 16px; }
.pt-secondary.is-danger { color: #ef5350; }
.pt-log-empty { text-align: center; padding: 30px 20px; }
.pt-log-empty-title { font-size: 16px; font-weight: 700; }

/* Extra card */
.pt-extra { border-radius: 36px; padding: 26px 28px; }
.pt-extra-text { margin-top: 8px !important; font-size: 16px; color: #e3d8b9; }

/* Bottom nav */
.pt-nav {
  position: fixed; left: 50%; transform: translateX(-50%); z-index: 10;
  bottom: calc(12px + env(safe-area-inset-bottom, 0px));
  width: calc(100% - 32px); max-width: 448px;
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; padding: 6px;
  background: rgba(27, 24, 18, 0.94); border: 1px solid var(--line); border-radius: 26px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}
 .pt-tab {
  appearance: none; border: 0; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 8px; border-radius: 18px;
  color: #a09371; font: inherit; font-size: 13px; font-weight: 600;
  transition: background 0.2s, color 0.2s;
}
.pt-tab.is-active { background: #221e16; color: var(--red); }
.pt-tab:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* Admin */
.pt-admin-who { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 18px 20px; }
.pt-admin-who strong { font-size: 17px; }
.pt-access-add { flex: 0 0 auto; padding: 0 18px; }
.pt-access-list { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.pt-access-list li {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 10px 14px; border-radius: 16px; background: #221e16; border: 1px solid var(--line);
  font-size: 14.5px; font-weight: 600;
}
.pt-access-list .pt-photo-x { position: static; width: 26px; height: 26px; flex: none; }
.pt-status-pill {
  flex: none; padding: 3px 10px; border-radius: 8px; font-size: 11.5px; font-weight: 700;
  border: 1px solid var(--line);
}
.pt-status-pill.is-pending { background: rgba(224, 165, 38, 0.16); color: var(--line-hi); }
.pt-status-pill.is-approved { background: rgba(16, 217, 160, 0.16); color: var(--green); }
.pt-status-pill.is-rejected { background: rgba(239, 68, 68, 0.14); color: #ef5350; }

/* Admin — accordion menu (Absensi Anggota / Laporan Anggota) */
.pt-acc { padding: 0; overflow: hidden; }
.pt-acc-head {
  width: 100%; display: flex; align-items: center; gap: 10px; cursor: pointer;
  background: none; border: none; color: var(--text); padding: 16px 18px; text-align: left; font: inherit;
}
.pt-acc-head strong { flex: 1; font-size: 14.5px; }
.pt-acc-chev { flex: none; color: var(--muted); transition: transform 0.2s ease; }
.pt-acc.is-closed .pt-acc-chev { transform: rotate(-90deg); }
.pt-acc-body { padding: 0 14px 14px; display: flex; flex-direction: column; gap: 12px; }
.pt-acc-head:focus-visible { outline: 2px solid var(--line-hi); outline-offset: -2px; }

/* Admin — kotak per-anggota */
.pt-member-box { border-radius: 18px; background: var(--card-2); border: 1px solid var(--line); overflow: hidden; }
.pt-member-head {
  width: 100%; display: flex; align-items: center; gap: 10px; cursor: pointer;
  background: none; border: none; color: var(--text); padding: 12px 14px; text-align: left; font: inherit;
}
.pt-member-avatar {
  flex: none; width: 32px; height: 32px; border-radius: 999px; display: flex; align-items: center;
  justify-content: center; font-size: 11.5px; font-weight: 700; background: var(--card); border: 1px solid var(--line);
  overflow: hidden;
}
.pt-member-avatar img { width: 100%; height: 100%; object-fit: cover; }
.pt-member-name { flex: 1; min-width: 0; }
.pt-member-name strong { font-size: 13.5px; display: block; }
.pt-member-chev { flex: none; color: var(--muted); transition: transform 0.2s ease; }
.pt-member-box.is-closed .pt-member-chev { transform: rotate(-90deg); }
.pt-member-body { padding: 0 14px 14px; }
.pt-member-empty { padding: 4px 0 6px; }
.pt-member-list { gap: 8px; }
.pt-member-tabs { margin-bottom: 10px; }

.pt-status-dot { flex: none; width: 9px; height: 9px; border-radius: 999px; }
.pt-status-dot.is-hijau { background: var(--green); box-shadow: 0 0 6px rgba(16, 217, 160, 0.6); }
.pt-status-dot.is-merah { background: var(--red); box-shadow: 0 0 6px rgba(239, 68, 68, 0.6); }
.pt-status-dot.is-biru { background: var(--blue); box-shadow: 0 0 6px rgba(59, 130, 246, 0.6); }

.pt-member-today {
  display: flex; align-items: center; gap: 8px; padding: 9px 11px; border-radius: 12px;
  background: var(--card); border: 1px solid var(--line); font-size: 12.5px; font-weight: 600; margin-bottom: 10px;
}

.pt-member-cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.pt-cal-dname { text-align: center; font-size: 9.5px; font-weight: 700; color: var(--muted); padding-bottom: 2px; }
.pt-cal-day {
  aspect-ratio: 1; border-radius: 8px; display: flex; align-items: center; justify-content: center;
  font-size: 11px; background: var(--card); border: 1px solid transparent; color: var(--text);
}
.pt-cal-day.is-blank { background: none; }
.pt-cal-day.is-empty { color: var(--muted); opacity: 0.45; }
.pt-cal-day.is-hijau { border-color: var(--green); color: var(--green); }
.pt-cal-day.is-merah { border-color: var(--red); color: var(--red); opacity: 0.9; }
.pt-cal-day.is-biru { border-color: var(--blue); color: var(--blue); }
.pt-cal-day.is-today { box-shadow: 0 0 0 2px var(--line-hi) inset; }

/* Compact typography — dibuat lebih kecil agar tampilan mobile tidak terasa besar */
.pt-root { font-size: 14px; }
.pt-header-bar { min-height: 48px; padding: 0 16px; }
.pt-avatar { width: 44px; height: 44px; font-size: 14px; }
.pt-card { padding: 18px; border-radius: 24px; }
.pt-stat { padding: 14px 16px; border-radius: 22px; }
.pt-icon-circle { width: 40px; height: 40px; margin-bottom: 14px; }
.pt-deco-stat svg { width: 72px; height: 72px; }
.pt-stack { gap: 12px; }
.pt-main { padding: 10px 14px 100px; }
.pt-nav { width: calc(100% - 28px); bottom: calc(10px + env(safe-area-inset-bottom, 0px)); }

/* Compact v2 — perkecil lagi form, tombol, dan kartu laporan */
.pt-form-card { padding: 18px 16px; }
.pt-form-title { font-size: 19px; }
.pt-form { gap: 16px; margin-top: 18px; }
.pt-field { gap: 6px; }
.pt-field > span { font-size: 11px; }
.pt-field small { font-size: 11.5px; }
.pt-input {
  min-height: 46px; padding: 10px 13px;
  border-radius: 14px; font-size: 14.5px;
}
.pt-textarea { min-height: 90px; }
.pt-id3 { padding: 10px 12px; border-radius: 16px; gap: 8px; }
.pt-id3 span { font-size: 9.5px; }
.pt-id3 strong { font-size: 13px; }
.pt-row { gap: 10px; }
.pt-submit, .pt-secondary { padding: 14px; border-radius: 16px; font-size: 15px; }
.pt-photos { gap: 12px 10px; }
.pt-photo { border-radius: 16px; }
.pt-photo-title { font-size: 13px; }
.pt-photo-hint { font-size: 11.5px; }
.pt-log-head { padding: 11px; gap: 10px; }
.pt-log-ico { width: 36px; height: 36px; border-radius: 12px; }
.pt-log-title { font-size: 13.5px; }
.pt-log-sub { font-size: 12px; }
.pt-log-time { font-size: 10.5px; }
.pt-ops-card { padding: 13px 8px 11px; border-radius: 18px; }
.pt-ops-ico { width: 40px; height: 40px; border-radius: 13px; }
.pt-ops-name { font-size: 13px; }

/* Compact v3 — perkecil lagi seluruh tampilan secara global */
.pt-root { font-size: 12px; }
.pt-shell { max-width: 420px; }
.pt-header { padding: calc(8px + env(safe-area-inset-top, 0px)) 12px 6px; }
.pt-header-bar { min-height: 40px; padding: 0 12px; border-radius: 16px; }
.pt-title { font-size: 13px; }
.pt-avatar { width: 34px; height: 34px; font-size: 12px; }
.pt-card { padding: 12px; border-radius: 18px; }
.pt-form-card { padding: 14px 12px; }
.pt-form-title { font-size: 16px; }
.pt-stat { padding: 10px 11px; border-radius: 16px; }
.pt-icon-circle { width: 30px; height: 30px; margin-bottom: 8px; }
.pt-deco-stat svg { width: 54px; height: 54px; }
.pt-stack { gap: 8px; }
.pt-main { padding: 6px 10px 84px; }
.pt-nav {
  width: calc(100% - 20px); bottom: calc(8px + env(safe-area-inset-bottom, 0px));
  padding: 4px; border-radius: 20px;
}
.pt-tab { padding: 8px 6px; border-radius: 14px; font-size: 11px; gap: 5px; }

.pt-form { gap: 12px; margin-top: 14px; }
.pt-field { gap: 5px; }
.pt-field > span { font-size: 10px; }
.pt-field small { font-size: 10.5px; }
.pt-input {
  min-height: 38px; padding: 7px 10px;
  border-radius: 11px; font-size: 13px;
}
.pt-textarea { min-height: 70px; }
.pt-id3 { padding: 7px 9px; border-radius: 12px; gap: 6px; }
.pt-id3 span { font-size: 8.5px; }
.pt-id3 strong { font-size: 11.5px; }
.pt-row { gap: 8px; }
.pt-submit, .pt-secondary { padding: 11px; border-radius: 13px; font-size: 13.5px; }
.pt-photos { gap: 10px 8px; }
.pt-photo { border-radius: 13px; }
.pt-photo-title { font-size: 12px; }
.pt-photo-hint { font-size: 10.5px; }
.pt-photo-num { width: 20px; height: 20px; font-size: 11px; }
.pt-photo-x { width: 28px; height: 28px; }
.pt-log-head { padding: 9px; gap: 8px; }
.pt-log-ico { width: 30px; height: 30px; border-radius: 10px; }
.pt-log-title { font-size: 12.5px; }
.pt-log-sub { font-size: 11px; }
.pt-log-time { font-size: 10px; }
.pt-log-kind { font-size: 9px; }
.pt-ops-card { padding: 10px 7px 9px; border-radius: 15px; gap: 6px; }
.pt-ops-ico { width: 32px; height: 32px; border-radius: 11px; }
.pt-ops-name { font-size: 11.5px; }
.pt-ops-title { font-size: 16px; }
.pt-status-pill { padding: 2px 7px; font-size: 10px; }
.pt-seg-btn { padding: 8px 6px; font-size: 12px; }

@media (max-width: 380px) {
  .pt-week .pt-progress-foot { font-size: 11px; gap: 12px; }
}

/* Menu akun (tiga garis) */
.pt-menu { position: relative; flex: none; }
.pt-menu-btn {
  appearance: none; width: 40px; height: 40px; display: grid; place-items: center;
  border: 0; border-radius: 14px; background: transparent; color: var(--text); cursor: pointer;
  -webkit-tap-highlight-color: transparent; transition: background 0.15s ease, transform 0.15s ease;
}
.pt-menu-btn:hover { background: rgba(224, 165, 38, 0.1); }
.pt-menu-btn:active { transform: scale(0.92); }
.pt-menu-btn[aria-expanded="true"] { background: rgba(224, 165, 38, 0.16); }
.pt-menu-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }
.pt-menu-dd {
  position: absolute; right: 0; top: calc(100% + 8px); z-index: 20;
  width: min(280px, calc(100vw - 32px));
  background: var(--card-hi, #26211a); border: 1px solid var(--line); border-radius: 16px;
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.55); padding: 8px;
  transform-origin: top right; animation: pt-menu-pop 0.16s ease-out;
}
@keyframes pt-menu-pop { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: scale(1); } }
.pt-menu-who {
  display: flex; align-items: center; gap: 10px; padding: 8px 8px 12px;
  border-bottom: 1px solid var(--line-soft, rgba(224, 165, 38, 0.35)); margin-bottom: 6px;
}
.pt-menu-who .pt-avatar { width: 40px; height: 40px; font-size: 14px; }
.pt-menu-who strong { display: block; font-size: 14px; font-weight: 600; }
.pt-menu-who span { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }
.pt-menu-item {
  appearance: none; width: 100%; display: flex; align-items: center; gap: 12px;
  min-height: 46px; padding: 0 10px; border: 0; border-radius: 10px; background: transparent;
  color: var(--text); font: inherit; font-size: 15px; cursor: pointer; text-align: left;
}
.pt-menu-item:hover { background: rgba(255, 255, 255, 0.05); }
.pt-menu-danger { color: #fca5a5; }
.pt-menu-danger:hover { background: rgba(239, 68, 68, 0.12); }
.pt-menu-item:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }

/* Dialog konfirmasi logout */
.pt-dialog-wrap {
  position: fixed; inset: 0; z-index: 30; display: grid; place-items: center;
  padding: 20px; background: rgba(0, 0, 0, 0.6);
}
.pt-dialog {
  width: min(340px, 100%); background: var(--card-hi, #26211a); border: 1px solid var(--line);
  border-radius: 18px; padding: 20px; animation: pt-menu-pop 0.18s ease-out;
}
.pt-dialog h2 { margin: 0 0 6px; font-size: 18px; font-weight: 600; }
.pt-dialog p { margin: 0 0 18px; font-size: 14px; line-height: 1.55; color: var(--muted); }
.pt-dialog-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pt-dialog-btn {
  appearance: none; min-height: 46px; border-radius: 12px;
  border: 1px solid var(--line-soft, rgba(224, 165, 38, 0.35)); background: transparent;
  color: var(--text); font: inherit; font-size: 15px; font-weight: 500; cursor: pointer;
}
.pt-dialog-btn:hover { background: rgba(255, 255, 255, 0.05); }
.pt-dialog-danger { background: var(--red); border-color: var(--red); color: #fff; }
.pt-dialog-danger:hover { background: #dc2626; }
.pt-dialog-btn:focus-visible { outline: 2px solid var(--line-hi); outline-offset: 2px; }


@media (prefers-reduced-motion: reduce) {
  .pt-bar-fill, .pt-tab, .pt-link, .pt-input, .pt-submit, .pt-secondary, .pt-ops-card, .pt-back-sq, .pt-seg-btn, .pt-log-chev { transition: none; }
  .dt-icon-box::before, .dt-status span, .dt-progress span { animation: none; }
  .dt-window { animation: none; }
  .pt-page, .pt-rise { animation: none; }
}
`;
