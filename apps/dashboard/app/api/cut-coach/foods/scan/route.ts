import { importFoodByBarcode } from '@/lib/cutCoach';
import { createSupabaseServerClient } from '@/lib/supabaseServer';
import { jsonError } from '@/lib/cutCoachRoute';

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError('Unauthorized', 401);

    const body = await req.json();
    const barcode = String(body.barcode ?? '').trim();
    if (!/^\d{6,14}$/.test(barcode)) {
      return jsonError('Barcode must be 6-14 digits.');
    }

    const result = await importFoodByBarcode(supabase, user.id, barcode);
    if (!result.food) {
      return jsonError('Product not found for this barcode.', 404);
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return jsonError(message, message === 'Unauthorized' ? 401 : 500);
  }
}
