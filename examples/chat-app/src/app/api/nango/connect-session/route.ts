import { Nango } from '@nangohq/node';
import { NextResponse } from 'next/server';

const nango = new Nango({
  host: process.env.NANGO_HOST ?? 'https://api.nango.dev',
  secretKey: process.env.NANGO_SECRET_KEY!,
});

export async function POST(req: Request) {
  const { providerConfigKey, endUserId } = await req.json();

  if (!providerConfigKey || !endUserId) {
    return NextResponse.json(
      { error: 'providerConfigKey and endUserId are required' },
      { status: 400 },
    );
  }

  if (!process.env.NANGO_SECRET_KEY) {
    return NextResponse.json(
      { error: 'NANGO_SECRET_KEY is not configured' },
      { status: 500 },
    );
  }

  try {
    // providerConfigKey is the Nango provider key (resolved from AvailableIntegration)
    const res = await nango.createConnectSession({
      end_user: {
        id: endUserId,
        email: `${endUserId}@placeholder.local`,
        display_name: endUserId,
      },
      allowed_integrations: [providerConfigKey],
    } as any);

    return NextResponse.json({ connectSession: res.data.token });
  } catch (err: any) {
    const detail = err?.response?.data || err?.message || String(err);
    console.error('Nango createConnectSession error:', JSON.stringify(detail));
    return NextResponse.json(
      { error: 'Failed to create connect session', detail },
      { status: 500 },
    );
  }
}
