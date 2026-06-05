import { NextResponse } from "next/server";
import services from "@/data/services.json";

export const dynamic = "force-dynamic";

type Service = (typeof services.services)[number];

async function probe(s: Service): Promise<"up" | "down"> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(s.url + s.healthPath, {
      signal: ctl.signal,
      cache: "no-store",
      method: "GET",
    });
    clearTimeout(t);
    return res.ok || res.status < 500 ? "up" : "down";
  } catch {
    return "down";
  }
}

export async function GET() {
  const results = await Promise.all(
    services.services.map(async (s) => ({ id: s.id, status: await probe(s) }))
  );
  return NextResponse.json({ checked: new Date().toISOString(), services: results });
}
