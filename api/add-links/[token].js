import { getSupabaseAdmin } from "../_lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const token = String(req.query?.token || "").trim();
  if (!token) {
    res.status(400).json({ error: "Missing token." });
    return;
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("bowl_add_links")
      .select("id, bowl_id, max_adds, adds_used, revoked_at, default_contributor_name, bowls(name)")
      .eq("token", token)
      .single();

    if (error || !data) {
      res.status(404).json({
        status: "not_found",
        bowlName: null,
        remainingAdds: 0,
      });
      return;
    }

    const remainingAdds = Math.max(0, Number(data.max_adds || 0) - Number(data.adds_used || 0));
    const status = data.revoked_at
      ? "revoked"
      : remainingAdds <= 0
        ? "exhausted"
        : "active";

    res.status(200).json({
      status,
      bowlId: data.bowl_id,
      bowlName: data.bowls?.name || "Movie Bowl",
      remainingAdds,
      defaultContributorName: data.default_contributor_name || "",
      revokedAt: data.revoked_at || null,
    });
  } catch (error) {
    console.error("[api/add-links/[token]] Unexpected error", error);
    res.status(500).json({ error: error?.message || "Failed to load add link." });
  }
}
