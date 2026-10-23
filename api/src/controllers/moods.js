export function createMoodsController(db) {
  async function listMoods(_req, res) {
    const moods = await db.mood.findMany({ orderBy: [{ score: 'asc' }, { code: 'asc' }] });
    res.json({ success: true, data: moods });
  }

  return { listMoods };
}
