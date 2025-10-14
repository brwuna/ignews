import { NextApiRequest, NextApiResponse } from "next";
import { getSession } from "next-auth/react";
import { fauna } from "../../services/fauna";
import { query as q } from "faunadb";
import { stripe } from "../../services/stripe";
import { supabase } from "../../services/supabase";

type User = {
    id: string;
    email: string; // Adicionado para clareza
    stripe_customer_id: string;
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        try {
            const session = await getSession({ req });
            const userEmail = session?.user?.email;

            if (!userEmail) {
                return res.status(401).json({ error: 'Não autenticado.' });
            }

            // 1. Buscar o usuário no Supabase
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('id, stripe_customer_id')
                .eq('email', userEmail)
                .single(); // .single() garante que esperamos apenas um resultado

            if (userError || !user) {
                console.error("Erro ao buscar usuário no Supabase:", userError);
                return res.status(500).json({ error: 'Usuário não encontrado.' });
            }

            let customerId = user.stripe_customer_id;

            // 2. Se não tiver ID do Stripe, criar e atualizar no Supabase
            if (!customerId) {
                const stripeCustomer = await stripe.customers.create({
                    email: userEmail,
                });

                const { error: updateError } = await supabase
                    .from('users')
                    .update({ stripe_customer_id: stripeCustomer.id })
                    .eq('id', user.id);
                
                if (updateError) {
                    console.error("Erro ao atualizar usuário com ID do Stripe:", updateError);
                    // Não para a execução, pois podemos continuar com o ID recém-criado
                }

                customerId = stripeCustomer.id;
            }

            // 3. Criar a sessão de checkout (nenhuma mudança aqui)
            const stripeCheckoutSession = await stripe.checkout.sessions.create({
                customer: customerId,
                payment_method_types: ['card'],
                billing_address_collection: 'required',
                line_items: [
                    { price: 'price_1M21tQDyJmZP54crrogRItC1', quantity: 1 }
                ],
                mode: 'subscription',
                allow_promotion_codes: true,
                success_url: process.env.STRIPE_SUCCESS_URL!,
                cancel_url: process.env.STRIPE_CANCEL_URL!,
            });

            return res.status(200).json({ sessionId: stripeCheckoutSession.id });
        
        } catch(err) {
            console.error("Erro na API de subscribe:", err);
            return res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method not allowed');
    }
}

// type User = {
//     ref: {
//         id: string;
//     }
//     data: {
//         stripe_customer_id: string;
//     }
// }

// eslint-disable-next-line import/no-anonymous-default-export
// export default async (req: NextApiRequest, res: NextApiResponse) => {
//     if (req.method === 'POST') {
//         const session = await getSession({ req })

//         const user = await fauna.query<User>(
//             q.Get(
//                 q.Match(
//                     q.Index('user_by_email'),
//                     q.Casefold(session?.user?.email!)
//                 )
//             )
//         )

//         let customerId = user.data.stripe_customer_id
//         if(!customerId) {
//             const stripeCustomer = await stripe.customers.create({
//                 email: session?.user?.email!,
//                 //metadata
//             })

//             await fauna.query(
//                 q.Update(
//                     q.Ref(q.Collection('users'), user.ref.id),
//                     {
//                         data: {
//                             stripe_customer_id: stripeCustomer.id
//                         }
//                     }
//                 )
//             )

//             customerId = stripeCustomer.id
//         }

//         const stripeCheckoutSession = await stripe.checkout.sessions.create({
//             customer: customerId,
//             payment_method_types: ['card'],
//             billing_address_collection: 'required',
//             line_items: [
//                 {price: 'price_1M21tQDyJmZP54crrogRItC1', quantity: 1}
//             ],
//             mode: 'subscription',
//             allow_promotion_codes: true,
//             success_url: process.env.STRIPE_SUCCESS_URL!,
//             cancel_url: process.env.STRIPE_CANCEL_URL!,
//         })

//         return res.status(200).json({ sessionId: stripeCheckoutSession.id })
//     } else {
//         res.setHeader('Allow', 'POST')
//         res.status(405).end('Method not allowed')
//     }
// }