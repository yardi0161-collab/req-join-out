/**
 * Helper Discord untuk PersonnelTerminal.
 * Dipakai setelah login Discord lewat Supabase (provider token).
 */

const DISCORD_API = "https://discord.com/api/v10";

export type DiscordProfile = { name: string; avatarUrl: string };

/** Ambil nama & foto profil langsung dari Discord. Return null kalau gagal. */
export async function fetchDiscordProfile(providerToken: string): Promise<DiscordProfile | null> {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${providerToken}` },
  });
  if (!res.ok) return null;
  const u = (await res.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
    discriminator?: string;
  };
  const avatarUrl = u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png?size=256`
    : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(u.id) >> BigInt(22)) % BigInt(6))}.png`;
  return { name: u.username || u.global_name || "Discord", avatarUrl };
}

/**
 * Ambil role anggota di server. Pangkat/Devisi tidak lagi ditampilkan di aplikasi
 * (Pangkat diisi manual di form), jadi fungsi ini sengaja sederhana: return null.
 */
export async function fetchDiscordGuildRoles(_providerToken: string): Promise<string[] | null> {
  return null;
}

/** Petakan role -> pangkat & devisi (nilai bawaan karena tidak dipakai lagi). */
export function mapRolesToPangkatDivisi(roles: string[]): { rank: string; unit: string } {
  return { rank: roles[0] ?? "-", unit: "-" };
}
