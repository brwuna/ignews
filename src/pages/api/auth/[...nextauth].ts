import { query as q } from "faunadb"

import NextAuth from "next-auth"
import GithubProvider from "next-auth/providers/github"

import { fauna } from "../../../services/fauna"
import { supabase } from "../../../services/supabase"

export default NextAuth({
  providers: [
    GithubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user',
        },
      },
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  debug: true,
  // callbacks: {
  //   async session({ session }: any) {
  //     try {
  //       const userActiveSubscription = await fauna.query<string>(
  //         q.Get(
  //           q.Intersection([
  //             q.Match(
  //               q.Index('subscription_by_user_ref'),
  //               q.Select(
  //                 "ref",
  //                 q.Get(
  //                   q.Match(
  //                     q.Index('user_by_email'),
  //                     q.Casefold(session.user.email)
  //                   )
  //                 )
  //               )
  //             ),
  //             q.Match(
  //               q.Index('subscription_by_status'),
  //               'active'
  //             )
  //           ])
  //         )
  //       )
        
  //       return {
  //         ...session,
  //         activeSubscription: userActiveSubscription
  //       }
  //     } catch {
  //       return {
  //         ...session,
  //         activeSubscription: null,
  //       }
  //     } 
  //   },
  //   async signIn({ user, account, profile }) {
  //     const { email } = user;
  //     return true;
  //    try {
  //     await fauna.query(
  //       q.If(
  //         q.Not(
  //           q.Exists(
  //             q.Match(
  //               q.Index('user_by_email'),
  //               q.Casefold(user.email!)
  //             )
  //           )
  //         ),
  //         q.Create(
  //           q.Collection('users'),
  //           { data: { email }}
  //         ),
  //         q.Get(
  //           q.Match(
  //             q.Index('user_by_email'),
  //             q.Casefold(user.email!)
  //           )
  //         )
  //       )
  //     )
      
  //     return true

  //    } catch(e) {
  //     console.error("ERRO NO SIGNIN DO FAUNADB:", e);
  //      return false
  //    }
  //   },
  // }
  callbacks: {
      async session({ session }) {
        // Busca o user pelo email
        const { data: user } = await supabase
          .from("users")
          .select("id, stripe_customer_id")
          .eq("email", session.user!.email)
          .single();

        if (!user) {
          return { ...session, activeSubscription: null };
        }

        // Busca a assinatura ativa do usuário
        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("*")
          .eq("customer_id", user.stripe_customer_id)
          .eq("status", "active")
          .single();

        return {
          ...session,
          activeSubscription: subscription ?? null,
        };
      },

    async signIn({ user }) {
      const { email } = user

      try {
        // Tenta inserir o usuário. Se já existir um com o mesmo email,
        // não faz nada (graças ao 'onConflict' e 'ignoreDuplicates').
        const { error } = await supabase
          .from('users')
          .upsert(
            { email: email },
            { onConflict: 'email', ignoreDuplicates: true }
          );

        if (error) {
          console.error("Erro ao salvar usuário no Supabase:", error);
          return false;
        }

        return true
      } catch (err) {
        console.error("Erro inesperado no signIn:", err);
        return false
      }
    },
  }
  
})
