import { Nango } from '@nangohq/node';
import { NextResponse } from 'next/server';

const nango = new Nango({
  host: process.env.NANGO_HOST ?? 'https://api.nango.dev',
  secretKey: process.env.NANGO_SECRET_KEY!,
});

export async function POST(req: Request) {
  const { integrationKey, endUserId } = await req.json();

  if (!integrationKey || !endUserId) {
    return NextResponse.json(
      { error: 'integrationKey and endUserId are required' },
      { status: 400 },
    );
  }

  if (!process.env.NANGO_SECRET_KEY) {
    return NextResponse.json(
      { error: 'NANGO_SECRET_KEY is not configured' },
      { status: 500 },
    );
  }

  const res = await nango.createConnectSession({
    end_user: { id: endUserId },
    allowed_integrations: [integrationKey],
  });

  return NextResponse.json({ connectSession: res.data.token });
}
