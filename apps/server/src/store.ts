import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  AppError,
  DAY,
  MINUTE,
  type Fix,
  type Menu,
  type Session,
} from "./domain.js";

export interface Store {
  create(s: Session): Promise<void>;
  claim(
    codeHash: string,
    writeHash: string,
    now: number,
    shareExpires: number,
  ): Promise<boolean>;
  read(readHash: string): Promise<Session | null>;
  upload(writeHash: string, fix: Fix, now: number): Promise<boolean>;
  stop(writeHash: string): Promise<boolean>;
  purge(now: number): Promise<void>;
  getMenu(id: string): Promise<Menu | null>;
  putMenu(menu: Menu): Promise<void>;
  reserve(
    workflow: string,
    amount: number,
    now: number,
    workflowCap: number,
    dailyCap: number,
  ): Promise<string>;
  finishReservation(
    id: string,
    state: "settled" | "uncertain" | "released",
  ): Promise<void>;
  close(): Promise<void>;
}
export class MemoryStore implements Store {
  private sessions = new Map<string, Session>();
  private menus = new Map<string, Menu>();
  private reservations: {
    id: string;
    workflow: string;
    amount: number;
    at: number;
    state: string;
  }[] = [];
  async create(s: Session) {
    if ([...this.sessions.values()].some((x) => x.codeHash === s.codeHash))
      throw new AppError("code_collision", "Retry pairing.");
    this.sessions.set(s.id, structuredClone(s));
  }
  async claim(
    codeHash: string,
    writeHash: string,
    now: number,
    shareExpires: number,
  ) {
    const s = [...this.sessions.values()].find(
      (x) =>
        x.codeHash === codeHash && x.state === "pending" && x.pairExpires > now,
    );
    if (!s) return false;
    Object.assign(s, { writeHash, state: "sharing", shareExpires });
    return true;
  }
  async read(hash: string) {
    return structuredClone(
      [...this.sessions.values()].find((s) => s.readHash === hash) ?? null,
    );
  }
  async upload(hash: string, fix: Fix, now: number) {
    const s = [...this.sessions.values()].find(
      (s) =>
        s.writeHash === hash && s.state === "sharing" && s.shareExpires! > now,
    );
    if (!s) return false;
    if (!s.fix || fix.observedAt > s.fix.observedAt)
      s.fix = structuredClone(fix);
    return true;
  }
  async stop(hash: string) {
    const s = [...this.sessions.values()].find((s) => s.writeHash === hash);
    if (!s) return false;
    Object.assign(s, { state: "stopped", fix: null, writeHash: null });
    return true;
  }
  async purge(now: number) {
    for (const [id, s] of this.sessions) {
      if (s.fix && s.fix.receivedAt <= now - 15 * MINUTE) s.fix = null;
      if (
        (s.state === "pending" && s.pairExpires <= now) ||
        (s.state === "sharing" && s.shareExpires! <= now)
      )
        Object.assign(s, { state: "expired", writeHash: null, fix: null });
      if (s.createdAt <= now - DAY) this.sessions.delete(id);
    }
  }
  async getMenu(id: string) {
    return structuredClone(this.menus.get(id) ?? null);
  }
  async putMenu(m: Menu) {
    this.menus.set(m.id, structuredClone(m));
  }
  async reserve(
    workflow: string,
    amount: number,
    now: number,
    workflowCap: number,
    dailyCap: number,
  ) {
    const active = this.reservations.filter((x) => x.state !== "released");
    const sum = (xs: typeof active) => xs.reduce((n, x) => n + x.amount, 0);
    if (
      sum(active.filter((x) => x.workflow === workflow)) + amount >
        workflowCap + 1e-8 ||
      sum(active.filter((x) => x.at >= Math.floor(now / DAY) * DAY)) + amount >
        dailyCap + 1e-8
    )
      throw new AppError(
        "budget_exceeded",
        "Lookup budget reached. Use a cached menu or try later.",
        429,
      );
    const id = randomUUID();
    this.reservations.push({
      id,
      workflow,
      amount,
      at: now,
      state: "reserved",
    });
    return id;
  }
  async finishReservation(id: string, state: string) {
    const r = this.reservations.find((x) => x.id === id);
    if (r) r.state = state;
  }
  async close() {}
}

// App-owned tables use RLS with no public grants. Only the server DB role can access them.
export class PostgresStore implements Store {
  pool: pg.Pool;
  constructor(connectionString: string) {
    this.pool = new pg.Pool({
      connectionString,
      max: 5,
      connectionTimeoutMillis: 10_000,
    });
  }
  async create(s: Session) {
    await this.pool.query(
      "insert into public.menulens_sessions(id,code_hash,read_hash,write_hash,pair_expires,share_expires,state,fix,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [
        s.id,
        s.codeHash,
        s.readHash,
        s.writeHash,
        s.pairExpires,
        s.shareExpires,
        s.state,
        s.fix,
        s.createdAt,
      ],
    );
  }
  async claim(codeHash: string, writeHash: string, now: number, until: number) {
    const r = await this.pool.query(
      "update public.menulens_sessions set write_hash=$2,state='sharing',share_expires=$4 where code_hash=$1 and state='pending' and pair_expires>$3 returning id",
      [codeHash, writeHash, now, until],
    );
    return !!r.rowCount;
  }
  async read(hash: string): Promise<Session | null> {
    const { rows } = await this.pool.query(
      "select * from public.menulens_sessions where read_hash=$1",
      [hash],
    );
    const r = rows[0];
    return r
      ? {
          id: r.id,
          codeHash: r.code_hash,
          readHash: r.read_hash,
          writeHash: r.write_hash,
          pairExpires: Number(r.pair_expires),
          shareExpires:
            r.share_expires === null ? null : Number(r.share_expires),
          state: r.state,
          fix: r.fix,
          createdAt: Number(r.created_at),
        }
      : null;
  }
  async upload(hash: string, fix: Fix, now: number) {
    const r = await this.pool.query(
      "update public.menulens_sessions set fix=case when fix is null or (fix->>'observedAt')::bigint < $4 then $2::jsonb else fix end where write_hash=$1 and state='sharing' and share_expires>$3 returning id",
      [hash, JSON.stringify(fix), now, fix.observedAt],
    );
    return !!r.rowCount;
  }
  async stop(hash: string) {
    const r = await this.pool.query(
      "update public.menulens_sessions set state='stopped',write_hash=null,fix=null where write_hash=$1 returning id",
      [hash],
    );
    return !!r.rowCount;
  }
  async purge(now: number) {
    await this.pool.query(
      "update public.menulens_sessions set fix=null where fix is not null and (fix->>'receivedAt')::bigint <= $1",
      [now - 15 * MINUTE],
    );
    await this.pool.query(
      "update public.menulens_sessions set state='expired',write_hash=null,fix=null where (state='pending' and pair_expires<=$1) or (state='sharing' and share_expires<=$1)",
      [now],
    );
    await this.pool.query(
      "delete from public.menulens_sessions where created_at <= $1",
      [now - DAY],
    );
  }
  async getMenu(id: string): Promise<Menu | null> {
    const {
      rows: [m],
    } = await this.pool.query(
      "select m.*, coalesce((select jsonb_agg(d.payload order by d.position) from public.menulens_dishes d where d.menu_id=m.id),'[]'::jsonb) as dishes from public.menulens_menus m where m.id=$1",
      [id],
    );
    return m
      ? {
          id: m.id,
          restaurant: m.restaurant,
          sourceUrl: m.source_url,
          fetchedAt: Number(m.fetched_at),
          mode: m.mode,
          dishes: m.dishes,
          ...(m.note ? { note: m.note } : {}),
        }
      : null;
  }
  async putMenu(m: Menu) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query(
        "insert into public.menulens_menus(id,restaurant,source_url,fetched_at,mode,note) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set restaurant=excluded.restaurant,source_url=excluded.source_url,fetched_at=excluded.fetched_at,mode=excluded.mode,note=excluded.note",
        [
          m.id,
          JSON.stringify(m.restaurant),
          m.sourceUrl,
          m.fetchedAt,
          m.mode,
          m.note ?? null,
        ],
      );
      await c.query("delete from public.menulens_dishes where menu_id=$1", [
        m.id,
      ]);
      await c.query(
        "insert into public.menulens_dishes(menu_id,id,position,payload) select $1,d.item->>'id',d.position::integer,d.item from jsonb_array_elements($2::jsonb) with ordinality as d(item,position)",
        [m.id, JSON.stringify(m.dishes)],
      );
      await c.query("commit");
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async reserve(
    workflow: string,
    amount: number,
    now: number,
    workflowCap: number,
    dailyCap: number,
  ) {
    const c = await this.pool.connect();
    try {
      await c.query("begin");
      await c.query("select pg_advisory_xact_lock(7710031)");
      const {
        rows: [r],
      } = await c.query(
        "select coalesce(sum(amount) filter(where workflow=$1),0) as workflow,coalesce(sum(amount) filter(where created_at >= $2),0) as daily from public.menulens_payments where state <> 'released'",
        [workflow, Math.floor(now / DAY) * DAY],
      );
      if (
        Number(r.workflow) + amount > workflowCap + 1e-8 ||
        Number(r.daily) + amount > dailyCap + 1e-8
      )
        throw new AppError(
          "budget_exceeded",
          "Lookup budget reached. Use a cached menu or try later.",
          429,
        );
      const id = randomUUID();
      await c.query(
        "insert into public.menulens_payments(id,workflow,amount,created_at,state) values($1,$2,$3,$4,'reserved')",
        [id, workflow, amount, now],
      );
      await c.query("commit");
      return id;
    } catch (e) {
      await c.query("rollback");
      throw e;
    } finally {
      c.release();
    }
  }
  async finishReservation(id: string, state: string) {
    await this.pool.query(
      "update public.menulens_payments set state=$2 where id=$1",
      [id, state],
    );
  }
  async close() {
    await this.pool.end();
  }
}
