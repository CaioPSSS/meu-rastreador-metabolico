import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedToken = process.env.ECOSYSTEM_SYNC_SECRET || process.env.CRON_SECRET || 'dev_sync_secret_metabolic';

  if (authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'connected',
    app: 'Meu Rastreador Metabólico',
    timestamp: new Date().toISOString(),
  });
}
