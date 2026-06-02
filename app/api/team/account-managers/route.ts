// Returns the list of people in the Monday "Account Managers" team.
// Powers the dropdown on the brand editor's Account Manager field.
//
// Cached in-process for 5 minutes (see lib/monday/teams.ts).

import { NextResponse } from "next/server";
import { fetchAccountManagers } from "@/lib/monday/teams";

export async function GET() {
  try {
    const members = await fetchAccountManagers();
    return NextResponse.json({
      members: members.map((m) => ({ id: m.id, name: m.name, email: m.email })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, members: [] }, { status: 500 });
  }
}
