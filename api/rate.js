const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const VALID_CAMPUS_IDS = ["sba", "ba", "catoosa", "midtown", "stulsa"];

function isValidScore(n) {
  return Number.isInteger(n) && n >= 1 && n <= 6;
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { campusId, overall, immersion, theme } = req.body || {};

  if (!VALID_CAMPUS_IDS.includes(campusId)) {
    res.status(400).json({ error: "Invalid campusId" });
    return;
  }
  if (![overall, immersion, theme].every(isValidScore)) {
    res.status(400).json({ error: "Ratings must be integers 1-6" });
    return;
  }

  try {
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: {
        Name: { title: [{ text: { content: `${campusId}-${Date.now()}` } }] },
        "Campus ID": { select: { name: campusId } },
        Overall: { number: overall },
        Immersion: { number: immersion },
        "Theme Score": { number: theme }
      }
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Failed to save rating:", err);
    res.status(500).json({ error: "Failed to save rating" });
  }
};
