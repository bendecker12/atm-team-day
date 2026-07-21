const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

module.exports = async (req, res) => {
  try {
    const totals = {};
    let cursor;
    let hasMore = true;

    while (hasMore) {
      const resp = await notion.databases.query({
        database_id: DATABASE_ID,
        start_cursor: cursor,
        page_size: 100
      });

      for (const page of resp.results) {
        const props = page.properties;
        const campusId = props["Campus ID"]?.select?.name;
        if (!campusId) continue;

        const overall = props.Overall?.number || 0;
        const immersion = props.Immersion?.number || 0;
        const themeScore = props["Theme Score"]?.number || 0;

        if (!totals[campusId]) totals[campusId] = { total: 0, count: 0 };
        totals[campusId].total += overall + immersion + themeScore;
        totals[campusId].count += 1;
      }

      hasMore = resp.has_more;
      cursor = resp.next_cursor || undefined;
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ totals });
  } catch (err) {
    console.error("Failed to load leaderboard:", err);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
};
