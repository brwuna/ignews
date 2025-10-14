import { NextApiRequest, NextApiResponse } from "next";
import { Readable } from "stream";
import Stripe from "stripe";
import { stripe } from "../../services/stripe";
import { saveSubscription } from "./_lib/manageSubscription";
import { supabase } from "../../services/supabase";

async function buffer(readable: Readable) {
    const chunks = [];
    for await (const chunk of readable) {
        chunks.push(
            typeof chunk === "string" ? Buffer.from(chunk) : chunk
        );
    }
    return Buffer.concat(chunks);
}

export const config = {
    api: {
        bodyParser: false
    }
}

// CORREÇÃO 3: Adicionado o evento 'created' para consistência
const relevantEvents = new Set([
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
]);

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (req.method === 'POST') {
        const buf = await buffer(req);
        const secret = req.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

        if (!secret || !webhookSecret) {
            return res.status(400).send('Webhook secret not configured');
        }

        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(buf, secret, webhookSecret);
        } catch(err) {
            return res.status(400).send(`Webhook error: ${(err as Error).message}`);
        }

        const { type } = event;

        if (relevantEvents.has(type)) {
            try {
                switch (type) {
                    case 'customer.subscription.updated':
                    case 'customer.subscription.deleted':
                        const subscription = event.data.object as Stripe.Subscription;
                        await saveSubscription(
                            subscription.id,
                            subscription.customer.toString()
                        );
                        break;
                    
                    case 'checkout.session.completed':
                        const checkoutSession = event.data.object as Stripe.Checkout.Session;
                        if (checkoutSession.subscription && checkoutSession.customer) {
                             await saveSubscription(
                                checkoutSession.subscription.toString(),
                                checkoutSession.customer.toString()
                            );
                        }
                        break;
                    default:
                        throw new Error('Unhandled relevant event type');
                }
            } catch(err) {
                console.error("Webhook handler failed:", err);
                return res.status(500).json({ error: 'Webhook handler failed.' });
            }
        }

        res.status(200).json({ received: true });
    } else {
        res.setHeader('Allow', 'POST');
        res.status(405).end('Method not allowed');
    }
}


// async function buffer(readable: Readable) {
//     const chunks = [];

//     for await (const chunk of readable) {
//         chunks.push(
//             typeof chunk === "string" ? Buffer.from(chunk) : chunk
//         );
//     }

//     return Buffer.concat(chunks)
// }

// export const config = {
//     api: {
//         bodyParser: false
//     }
// }

// const relevantEvents = new Set([
//     'checkout.session.completed',
//     'customer.subscription.updated',
//     'customer.subscription.deleted',
// ])

// eslint-disable-next-line import/no-anonymous-default-export
// export default async (req: NextApiRequest, res: NextApiResponse) => {
//     if (req.method === 'POST') {
//         const buf = await buffer(req)
//         const secret = req.headers['stripe-signature']

//         let event: Stripe.Event;

//         try {
//             event = stripe.webhooks.constructEvent(buf, secret!, process.env.STRIPE_WEBHOOK_SECRET!)
//         } catch(err) {
//             let e = (err as Error).message;
//             return res.status(400).send(`Webhook error: ${e}`);
//         }

//         const type = event.type

//         if (relevantEvents.has(type)) {
//             try {
//                 switch (type) {
//                     case 'customer.subscription.created':
//                     case 'customer.subscription.updated':
//                     case 'customer.subscription.deleted':

//                         const subscription = event.data.object as Stripe.Subscription;

//                         await saveSubscription(
//                             subscription.id,
//                             subscription.customer.toString(),
//                             false
//                         );

//                         break;

//                     case 'checkout.session.completed':

//                         const checkoutSession = event.data.object as Stripe.Checkout.Session

//                         await saveSubscription(
//                             checkoutSession.subscription?.toString()!,
//                             checkoutSession.customer?.toString()!,
//                             true
//                         );

//                         break;
//                     default:
//                         throw new Error('Unhandled event')
//                 }
//             } catch(err) {
//                 let e = (err as Error).message;
//                 return res.json({ e: 'Webhook handler filed'});
//             }
//         }

//         res.json({ ok: true })
//     } else {
//         res.setHeader('Allow', 'POST')
//         res.status(405).end('Method not allowed')
//     }
// }