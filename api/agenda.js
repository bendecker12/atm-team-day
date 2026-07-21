const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const AGENDA_PAGE_ID = "396f1f2d1b9280a8935aff7fa56b5f3d";

// Street number is the stable link between an agenda row and its existing vote
// history in the Ratings database — immune to time/theme/name edits, and to
// incidental punctuation differences elsewhere in the address.
const STREET_NUMBER_TO_CAMPUS_ID = {
  "5801": "sba",
  "2420": "ba",
  "19603": "catoosa",
  "7015": "midtown",
  "7071": "stulsa"
};

function plainText(richTextArr) {
  return (richTextArr || []).map((t) => t.plain_text).join("").trim();
}

function stripItalicMarkers(text) {
  return text.replace(/^\*+|\*+$/g, "").trim();
}

function parseLocation(raw) {
  const match = raw.match(/^(.*?)\s*\(([^)]+)\)\s*-\s*(.+)$/);
  if (match) {
    return { address: match[3].trim(), sublabel: match[2].trim() };
  }
  return { address: raw, sublabel: null };
}

async function findTableBlock(pageId) {
  let cursor;
  do {
    const resp = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor });
    const table = resp.results.find((b) => b.type === "table");
    if (table) return table;
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return null;
}

module.exports = async (req, res) => {
  try {
    const table = await findTableBlock(AGENDA_PAGE_ID);
    if (!table) {
      res.status(500).json({ error: "Agenda table not found on Notion page" });
      return;
    }

    const rowsResp = await notion.blocks.children.list({ block_id: table.id, page_size: 100 });
    const rows = rowsResp.results.filter((b) => b.type === "table_row");

    const stops = [];
    rows.forEach((row) => {
      const cells = row.table_row.cells || [];
      const time = plainText(cells[0]);
      const campusRaw = plainText(cells[1]);
      const location = plainText(cells[2]);
      const theme = plainText(cells[3]);

      if (time.toLowerCase() === "time" && campusRaw.toLowerCase() === "campus") return;
      if (!time && !campusRaw && !location && !theme) return;

      const isDriveRow = !time && !location && !theme && campusRaw;
      if (isDriveRow) {
        stops.push({ type: "drive", label: stripItalicMarkers(campusRaw) });
        return;
      }

      const stop = { type: "point", time, label: campusRaw, theme: theme || null, address: null };
      if (location) {
        const { address, sublabel } = parseLocation(location);
        stop.address = address;
        if (sublabel) stop.sublabel = sublabel;
      }

      // Only rows with a build theme represent a campus visit to rate.
      if (theme) {
        const streetNumber = (stop.address || "").match(/^(\d+)/);
        const campusId = streetNumber && STREET_NUMBER_TO_CAMPUS_ID[streetNumber[1]];
        if (campusId) {
          stop.campusId = campusId;
        } else {
          console.warn(`Agenda row "${campusRaw}" has a theme but no matching known campus address`);
        }
      }

      stops.push(stop);
    });

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ stops });
  } catch (err) {
    console.error("Failed to load agenda:", err);
    res.status(500).json({ error: "Failed to load agenda" });
  }
};
