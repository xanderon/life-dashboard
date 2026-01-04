import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/auth/hash'];

function isAsset(pathname: string) {
  return (
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname.startsWith('/favicon') ||
    pathname.match(/\.(.*)$/) // .css .js .png .svg etc.
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Nu intercepta assets
  if (isAsset(pathname)) return NextResponse.next();

  // Debug minimal (nu spam assets)
  console.log('[MW] path:', pathname);

  let res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p));

  // Log cookies only for non-assets
  console.log('[MW] cookies:', req.cookies.getAll().map((c) => c.name));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log('[MW] user:', user ? user.email : null);

  // Dacă nu e user și nu e public => redirect la login
  if (!user && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Dacă e user și intră pe /login => redirect la home
  if (user && pathname === '/login') {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return res;
}

export const config = {
  matcher: ['/((?!api).*)'],
};
