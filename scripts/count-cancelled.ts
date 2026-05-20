import { neon } from "@neondatabase/serverless";

async function main() {
  const sql = neon(process.env.DATABASE_URL!);
  const [row] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE status = 'active') AS active,
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'stuck') AS stuck
    FROM journeys
  `;
  console.log(JSON.stringify(row));
}

main();
