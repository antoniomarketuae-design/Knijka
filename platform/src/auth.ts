import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
// Deep imports are intentional here: src/auth.ts is part of the auth module's
// wiring (see src/modules/auth/index.ts). Importing the public index would
// create a cycle (index -> session -> @/auth -> index).
import { loginInputSchema } from "@/modules/auth/schemas";
import { verifyCredentials } from "@/modules/auth/service";

declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET, // required in production (see .env.example)
  trustHost: true, // self-hosted deploys; host is validated by the platform/reverse proxy
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Имейл", type: "email" },
        password: { label: "Парола", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginInputSchema.safeParse(credentials);
        // null (never a thrown error) for any bad credentials — next-auth turns
        // it into a generic CredentialsSignin, so responses can't leak whether
        // the e-mail exists.
        if (!parsed.success) return null;
        return verifyCredentials(parsed.data.email, parsed.data.password);
      },
    }),
    // Google OAuth later: add `Google` here + AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET
    // env vars, and add Account/Session models + PrismaAdapter for account
    // linking. JWT strategy and the callbacks below keep working unchanged.
  ],
  callbacks: {
    jwt({ token, user }) {
      // On sign-in, pin the DB user id into the token (token.sub).
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      // Expose the user id to the app (typed via the module augmentation above).
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
});
