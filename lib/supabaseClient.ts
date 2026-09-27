import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://iejyusqakqrcavzbscqz.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_S-67t9DUNS4cm30K4Ao1Xw_eTxKwXr2";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
