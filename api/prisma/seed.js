import '../src/env.js';
import { createDb } from '../src/db.js';

export async function seedMoods(db) {
  const moods = [
    { code: 'VERY_SAD', name: 'Rất buồn', emoji: '😢', score: 1 },
    { code: 'SAD', name: 'Buồn', emoji: '😔', score: 2 },
    { code: 'NEUTRAL', name: 'Bình thường', emoji: '😐', score: 3 },
    { code: 'HAPPY', name: 'Vui', emoji: '😊', score: 4 },
    { code: 'VERY_HAPPY', name: 'Rất vui', emoji: '😄', score: 5 },
  ];
  for (const mood of moods) await db.mood.upsert({ where: { code: mood.code }, create: mood, update: mood });
}

if (import.meta.main) {
  const db = createDb(process.env.DATABASE_URL);
  try { await seedMoods(db); console.log('Seeded 5 system moods.'); }
  catch { console.error('Mood seed failed; check database connectivity/migrations.'); process.exitCode = 1; }
  finally { await db.$disconnect(); }
}
