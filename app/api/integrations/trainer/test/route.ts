import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const allowedTokens = [
    'dev_sync_secret_metabolic',
    process.env.ECOSYSTEM_SYNC_SECRET,
    process.env.CRON_SECRET,
  ].filter(Boolean);

  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !allowedTokens.includes(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'connected',
    app: 'Meu Rastreador Metabólico',
    timestamp: new Date().toISOString(),
  });
}
