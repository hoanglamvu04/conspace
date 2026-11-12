import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool, closeDatabase } from './pool.js';
import { assertDedicatedDatabase } from './migrate.js';

// CONSPACE - Dac ta mo hinh web (03/09/2026), section III.2b, page 4.
// The complete thirty construction niches have NOT been approved as a list.
// No people, technical definitions, articles, summaries, or placeholder counts are seeded.
export const confirmedDesignCategories = Object.freeze([
  { slug: 'house', name: 'HOUSE' },
  { slug: 'luxury', name: 'LUXURY' },
  { slug: 'f-b', name: 'F&B' },
  { slug: 'stay', name: 'STAY' },
  { slug: 'office', name: 'OFFICE' },
  { slug: 'project', name: 'PROJECT' },
  { slug: 'factory', name: 'FACTORY' },
  { slug: 'sacred', name: 'SACRED' },
]);

const source = 'CONSPACE - Dac ta mo hinh web (03/09/2026), section III.2b, page 4';

export async function seedTaxonomy(db = pool) {
  if (!db) throw new Error('DATABASE_URL is required for taxonomy seed');
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await assertDedicatedDatabase(client);
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [19027, 4]);
    let inserted = 0;
    for (const [index, category] of confirmedDesignCategories.entries()) {
      // BEFORE INSERT capacity triggers run even when ON CONFLICT would skip a duplicate.
      // Check existing slugs first to make the documented taxonomy seed safely repeatable.
      const existing = await client.query('SELECT id FROM conspace.niches WHERE slug = $1 LIMIT 1', [category.slug]);
      if (existing.rows.length > 0) continue;
      const result = await client.query(
        'INSERT INTO conspace.niches (slug, name, group_type, template_key, source_ref, sort_order, is_active) ' +
        'VALUES ($1, $2, $3, 'TEMPLATE_B', $4, $5, true) ON CONFLICT (slug) DO NOTHING',
        [category.slug, category.name, 'design', source, index + 1]
      );
      inserted += result.rowCount;
    }
    await client.query('COMMIT');
    return { confirmed: confirmedDesignCategories.length, inserted };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  seedTaxonomy().then((result) => {
    console.log('CONSPACE documented taxonomy:', result);
  }).catch((error) => {
    console.error('CONSPACE taxonomy seed failed:', error.message);
    process.exitCode = 1;
  }).finally(() => closeDatabase());
}
