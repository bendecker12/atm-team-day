const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const CAMPUS_ID_PATTERN = /^[a-z0-9_-]{1,50}$/;
// 3:30 PM Central Daylight Time (UTC-5), July 22, 2026 = 20:30 UTC.
// Must be an explicit UTC instant, not `new Date(2026, 6, 22, 15, 30, 0)` —
// that constructor uses the server process's local timezone, and Vercel's
// Node runtime defaults to UTC, which would lock hours too early.
const RESULTS_UNLOCK = new Date(Date.UTC(2026, 6, 22, 20, 30, 0));

function isValidScore(n) {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

function buildProperties({ campusId, overall, immersion, theme, name, sessionId }) {
  return {
    "Campus ID": { select: { name: campusId } },
    Overall: { number: overall },
    Immersion: { number: immersion },
    "Theme Score": { number: theme },
    "Voter Name": { rich_text: name ? [{ text: { content: name.slice(0, 200) } }] : [] },
    "Session ID": { rich_text: sessionId ? [{ text: { content: sessionId.slice(0, 100) } }] : [] }
  };
}

module.exports = async (req, res) => {
  if (Date.now() >= RESULTS_UNLOCK.getTime()) {
    res.status(403).json({ error: "Ratings are locked — results are in" });
    return;
  }

  const { campusId, overall, immersion, theme, name, sessionId } = req.body || {};

  if (typeof campusId !== "string" || !CAMPUS_ID_PATTERN.test(campusId)) {
    res.status(400).json({ error: "Invalid campusId" });
    return;
  }
  if (![overall, immersion, theme].every(isValidScore)) {
    res.status(400).json({ error: "Ratings must be integers 1-6" });
    return;
  }
  if (name !== undefined && name !== null && typeof name !== "string") {
    res.status(400).json({ error: "Invalid name" });
    return;
  }
  if (sessionId !== undefined && sessionId !== null && typeof sessionId !== "string") {
    res.status(400).json({ error: "Invalid sessionId" });
    return;
  }

  try {
    if (req.method === "POST") {
      const page = await notion.pages.create({
        parent: { database_id: DATABASE_ID },
        properties: {
          Name: { title: [{ text: { content: `${campusId}-${Date.now()}` } }] },
          ...buildProperties({ campusId, overall, immersion, theme, name, sessionId })
        }
      });
      res.status(200).json({ ok: true, id: page.id });
      return;
    }

    if (req.method === "PATCH") {
      const { pageId } = req.body || {};
      if (!pageId || typeof pageId !== "string") {
        res.status(400).json({ error: "Missing pageId" });
        return;
      }
      await notion.pages.update({
        page_id: pageId,
        properties: buildProperties({ campusId, overall, immersion, theme, name, sessionId })
      });
      res.status(200).json({ ok: true, id: pageId });
      return;
    }

    res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Failed to save rating:", err);
    res.status(500).json({ error: "Failed to save rating" });
  }
};
