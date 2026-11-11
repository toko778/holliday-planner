import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export function openDatabase(filename = 'runtime-data/planner.sqlite') {
  if (filename !== ':memory:') mkdirSync(path.dirname(filename), { recursive: true })
  const database = new DatabaseSync(filename)
  database.exec('PRAGMA journal_mode = WAL')
  database.exec('CREATE TABLE IF NOT EXISTS __local_migrations (name TEXT PRIMARY KEY)')
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'))
  for (const migration of journal.entries) {
    if (database.prepare('SELECT name FROM __local_migrations WHERE name = ?').get(migration.tag)) continue
    database.exec('BEGIN')
    try {
      database.exec(readFileSync(`drizzle/${migration.tag}.sql`, 'utf8').replaceAll('--> statement-breakpoint', ''))
      database.prepare('INSERT INTO __local_migrations (name) VALUES (?)').run(migration.tag)
      database.exec('COMMIT')
    } catch (error) { database.exec('ROLLBACK'); throw error }
  }
  return {
    close: () => database.close(),
    prepare(sql) {
      const statement = database.prepare(sql)
      let values = []
      return {
        bind(...input) { values = input; return this },
        async first() { return statement.get(...values) ?? null },
        async all() { return { results: statement.all(...values) } },
        async run() { return { meta: { changes: Number(statement.run(...values).changes) } } },
      }
    },
  }
}
