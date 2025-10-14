import { query as q } from 'faunadb'
import { fauna } from "../../../services/fauna";
import { stripe } from '../../../services/stripe';
import { supabase } from '../../../services/supabase';

export async function saveSubscription(
    subscriptionId: string,
    customerId: string,
) {
    // 1. Encontra o usuário no nosso banco pelo ID de cliente do Stripe
    const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id')
        .eq('stripe_customer_id', customerId)
        .single();

    // Se não encontrar o usuário, lança um erro.
    // Isso pode acontecer se um webhook chegar antes do usuário ser criado no signIn.
    if (userError || !userData) {
        throw new Error(`User not found with stripe_customer_id: ${customerId}`);
    }

    const userId = userData.id;

    // 2. Busca os dados completos da assinatura no Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // 3. Monta o objeto com os dados que queremos salvar
    const subscriptionData = {
        id: subscription.id,
        user_id: userId,
        status: subscription.status,
        price_id: subscription.items.data[0].price.id,
    };

    // 4. Usa o 'upsert' para salvar os dados no Supabase.
    // O 'upsert' faz o seguinte:
    // - Se já existe uma assinatura com esse 'id', ele a ATUALIZA.
    // - Se não existe, ele a CRIA.
    // Isso substitui perfeitamente a lógica 'if (createdAction) / else' do Fauna.
    const { error: upsertError } = await supabase
        .from('subscriptions')
        .upsert(subscriptionData);

    if (upsertError) {
        // Se houver um erro ao salvar, loga para podermos depurar
        console.error('Error saving subscription to Supabase:', upsertError);
        throw upsertError;
    }

    console.log(`Subscription ${subscription.id} saved/updated successfully for user ${userId}.`);
}


// export async function saveSubscription(
//     subscriptionId: string,
//     customerId: string,
//     createdAction = false,
// ) {
//     const userRef = await fauna.query(
//         q.Select(
//             "ref",
//             q.Get(
//                 q.Match(
//                     q.Index('user_by_stripe_customer_id'),
//                     customerId  
//                 )
//             )
//         )
//     )

//     const subscription = await stripe.subscriptions.retrieve(subscriptionId)

//     const subscriptionData = {
//         id: subscription.id,
//         userId: userRef,
//         status: subscription.status,
//         price_id: subscription.items.data[0].price.id,

//     }

//     if (createdAction) {
//         await fauna.query(
//             q.Create(
//                 q.Collection('subscriptions'),
//                 { data: subscriptionData }
//             )
//         )
//     } else {
//         await fauna.query(
//             q.Replace(
//                 q.Select(
//                     "ref",
//                     q.Get(
//                         q.Match(
//                             q.Index('subscription_by_id'),
//                             subscriptionId,
//                         )
//                     )
//                 ),
//                 { data: subscriptionData }
//             )
//         )
//     }
// }