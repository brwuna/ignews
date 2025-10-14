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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method not allowed");
  }

  const buf = await buffer(req);
  const secret = req.headers["stripe-signature"];

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      buf,
      secret!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error("❌ Erro ao validar webhook:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  const type = event.type;

  if (relevantEvents.has(type)) {
    try {
      switch (type) {
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;

          // salva/atualiza no Supabase
          await supabase.from("subscriptions").upsert({
            id: subscription.id,
            customer_id: subscription.customer as string,
            status: subscription.status,
            price_id: subscription.items.data[0].price.id,
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          });

          break;
        }

        case "checkout.session.completed": {
          const checkoutSession = event.data.object as Stripe.Checkout.Session;

          // Marca o stripe_customer_id no usuário (caso ainda não tenha)
          if (checkoutSession.customer_email) {
            await supabase
              .from("users")
              .update({
                stripe_customer_id: checkoutSession.customer?.toString(),
              })
              .eq("email", checkoutSession.customer_email);
          }

          break;
        }

        default:
          throw new Error("Unhandled event type: " + type);
      }
    } catch (err: any) {
      console.error("⚠️ Erro ao processar evento:", err.message);
      return res.json({ error: "Webhook handler failed" });
    }
  }

  res.json({ received: true });
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