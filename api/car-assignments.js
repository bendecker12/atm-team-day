const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const AGENDA_PAGE_ID = "396f1f2d1b9280a8935aff7fa56b5f3d";

// Van image is assigned by column position (1st column = Van 1, 2nd = Van 2)
// rather than by matching the car's name text, so it stays correct even if
// the name in Notion is retyped or has a typo.
const VAN_IMAGES = ["/red-minivan.png", "/blue-minivan.png"];

function plainText(richTextArr) {
  return (richTextArr || []).map((t) => t.plain_text).join("");
}

function getRichText(block) {
  const data = block[block.type];
  return (data && data.rich_text) || [];
}

async function getBlockChildren(blockId) {
  let results = [];
  let cursor;
  do {
    const resp = await notion.blocks.children.list({ block_id: blockId, start_cursor: cursor, page_size: 100 });
    results = results.concat(resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return results;
}

function directionFromText(text) {
  const normalized = text.toUpperCase().replace(/\s+/g, "");
  const cenIdx = normalized.indexOf("CEN");
  const tulIdx = normalized.indexOf("TUL");
  if (cenIdx === -1 || tulIdx === -1) return null;
  return cenIdx < tulIdx ? "toTulsa" : "home";
}

function extractPassengers(text) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const rosterText = lines.length > 1 ? lines.slice(1).join(" ") : lines[0].replace(/^[^:]*:?\s*/, "");
  return rosterText.split(",").map((p) => p.trim()).filter(Boolean);
}

async function parseCarColumn(columnBlockId) {
  const children = await getBlockChildren(columnBlockId);
  let name = null;
  let driver = null;
  const rosters = {};

  for (const block of children) {
    const text = plainText(getRichText(block)).trim();
    if (!text) continue;

    if (name === null) {
      name = text;
      continue;
    }
    if (/driver/i.test(text)) {
      driver = text.replace(/driver:?/i, "").trim();
      continue;
    }
    const direction = directionFromText(text);
    if (direction) {
      rosters[direction] = extractPassengers(text);
    }
  }

  return { name, driver, toTulsa: rosters.toTulsa || [], home: rosters.home || [] };
}

module.exports = async (req, res) => {
  try {
    const pageBlocks = await getBlockChildren(AGENDA_PAGE_ID);
    const headingIdx = pageBlocks.findIndex(
      (b) => b.type && b.type.startsWith("heading_") && plainText(getRichText(b)).trim().toLowerCase() === "car assignments"
    );
    if (headingIdx === -1) {
      res.status(500).json({ error: "Car Assignments section not found on Notion page" });
      return;
    }
    const columnList = pageBlocks.slice(headingIdx + 1).find((b) => b.type === "column_list");
    if (!columnList) {
      res.status(500).json({ error: "Car Assignments columns not found" });
      return;
    }
    const columns = await getBlockChildren(columnList.id);
    const cars = [];
    for (const column of columns) {
      if (column.type !== "column") continue;
      const parsed = await parseCarColumn(column.id);
      cars.push({
        ...parsed,
        van: `Van ${cars.length + 1}`,
        image: VAN_IMAGES[cars.length] || VAN_IMAGES[VAN_IMAGES.length - 1]
      });
    }

    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ cars });
  } catch (err) {
    console.error("Failed to load car assignments:", err);
    res.status(500).json({ error: "Failed to load car assignments" });
  }
};
