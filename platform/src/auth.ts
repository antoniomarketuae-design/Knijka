import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
// Deep imports are intentional here: src/auth.ts is part of the auth module's
// wiring (see src/modules/auth/index.ts). Importing the public index would
// create a cycle (index -> session -> @/auth -> index).
import { loginInputSchema } from "@/modules/auth/schemas";
import { verifyCredentials } from "@/modules/auth/service";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /**
       * The revocation counter as it stood when this token was MINTED. Compared
       * against the live User.sessionEpoch on every request by
       * modules/auth/session.ts; a mismatch means the session was revoked
       * (password reset, „Изход от всички устройства") and the request is
       * treated as signed out.
       */
      sessionEpoch?: number;
    } & DefaultSession["user"];
  }

  /** What `authorize()` returns — SessionUser plus the epoch to stamp. */
  interface User {
    sessionEpoch?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    /** Short name on purpose: this rides in every cookie, on every request. */
    epoch?: number;
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
      // On sign-in, pin the DB user id into the token (token.sub) and stamp the
      // revocation epoch the account had at that moment. Both are written ONCE,
      // at sign-in: a token that could refresh its own epoch could never be
      // revoked, which is the entire point of the counter.
      if (user?.id) {
        token.sub = user.id;
        token.epoch = typeof user.sessionEpoch === "number" ? user.sessionEpoch : 0;
      }
      return token;
    },
    session({ session, token }) {
      // Expose the user id + the token's epoch to the app (typed via the module
      // augmentation above). The COMPARISON happens server-side in
      // modules/auth/session.ts against the live DB row — nothing here is
      // trusted on its own.
      if (session.user) {
        if (token.sub) session.user.id = token.sub;
        // Absent on tokens minted before this column existed — read as 0, which
        // is every account's default, so the deploy that lands revocation does
        // not sign the entire userbase out at once.
        session.user.sessionEpoch =
          typeof token.epoch === "number" ? token.epoch : 0;
      }
      return session;
    },
  },
});
