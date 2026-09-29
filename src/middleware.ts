import { defineMiddleware } from "astro:middleware";
import { createClient } from "@/lib/supabase";

const PROTECTED_ROUTES = ["/dashboard"];

export const onRequest = defineMiddleware(async (context, next) => {
  const supabase = createClient(context.request.headers, context.cookies);

  context.locals.user = null;
  context.locals.role = null;

  if (supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    // Fail closed: a user without a known role is treated as signed out.
    const role: unknown = user?.app_metadata.role;
    if (user && (role === "operator" || role === "admin")) {
      context.locals.user = user;
      context.locals.role = role;
    }
  }

  if (PROTECTED_ROUTES.some((route) => context.url.pathname.startsWith(route))) {
    if (!context.locals.user) {
      return context.redirect("/auth/signin");
    }
  }

  return next();
});
