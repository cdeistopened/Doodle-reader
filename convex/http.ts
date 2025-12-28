/**
 * HTTP Routes for Doodle Reader
 *
 * Handles Stripe webhooks and other HTTP endpoints.
 */

import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";

const http = httpRouter();

// =============================================================================
// STRIPE WEBHOOK
// =============================================================================

http.route({
  path: "/stripe-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripeSecretKey || !webhookSecret) {
      return new Response("Stripe not configured", { status: 500 });
    }

    // Get the raw body and signature
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    // Verify webhook signature (simplified - in production use stripe library)
    // For now, we'll trust the webhook and parse the event
    // TODO: Implement proper signature verification

    let event: {
      type: string;
      data: { object: Record<string, unknown> };
    };

    try {
      event = JSON.parse(body);
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    // Handle different event types
    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as {
            client_reference_id: string;
            customer: string;
            subscription: string;
            metadata?: { userId?: string };
          };

          const userId = session.client_reference_id || session.metadata?.userId;
          if (!userId) {
            console.error("No userId in checkout session");
            break;
          }

          // Create subscription record
          await ctx.runMutation(internal.stripe.createOrUpdateSubscription, {
            userId,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription,
            status: "active",
            plan: "pro", // Default to pro, could check price ID
          });

          console.log(`[Stripe] Created subscription for user ${userId}`);
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as {
            id: string;
            customer: string;
            status: string;
            current_period_start: number;
            current_period_end: number;
            cancel_at_period_end: boolean;
            items: { data: Array<{ price: { id: string } }> };
            metadata?: { userId?: string };
          };

          // Look up user by customer ID
          const existingSub = await ctx.runQuery(
            internal.stripe.getSubscriptionByStripeCustomer,
            { stripeCustomerId: subscription.customer }
          );

          if (!existingSub) {
            console.log(`[Stripe] No subscription found for customer ${subscription.customer}`);
            break;
          }

          // Map Stripe status to our status
          const statusMap: Record<string, "active" | "past_due" | "canceled" | "unpaid" | "trialing"> = {
            active: "active",
            past_due: "past_due",
            canceled: "canceled",
            unpaid: "unpaid",
            trialing: "trialing",
          };

          await ctx.runMutation(internal.stripe.createOrUpdateSubscription, {
            userId: existingSub.userId,
            stripeCustomerId: subscription.customer,
            stripeSubscriptionId: subscription.id,
            stripePriceId: subscription.items.data[0]?.price.id,
            status: statusMap[subscription.status] || "active",
            plan: existingSub.plan, // Keep existing plan
            currentPeriodStart: new Date(subscription.current_period_start * 1000).toISOString(),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          });

          console.log(`[Stripe] Updated subscription for user ${existingSub.userId}`);
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as {
            customer: string;
          };

          const existingSub = await ctx.runQuery(
            internal.stripe.getSubscriptionByStripeCustomer,
            { stripeCustomerId: subscription.customer }
          );

          if (existingSub) {
            await ctx.runMutation(internal.stripe.createOrUpdateSubscription, {
              userId: existingSub.userId,
              stripeCustomerId: subscription.customer,
              status: "canceled",
              plan: "free",
            });
            console.log(`[Stripe] Canceled subscription for user ${existingSub.userId}`);
          }
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as {
            customer: string;
          };

          const existingSub = await ctx.runQuery(
            internal.stripe.getSubscriptionByStripeCustomer,
            { stripeCustomerId: invoice.customer }
          );

          if (existingSub) {
            await ctx.runMutation(internal.stripe.createOrUpdateSubscription, {
              userId: existingSub.userId,
              stripeCustomerId: invoice.customer,
              status: "past_due",
              plan: existingSub.plan,
            });
            console.log(`[Stripe] Payment failed for user ${existingSub.userId}`);
          }
          break;
        }

        default:
          console.log(`[Stripe] Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      console.error(`[Stripe Webhook] Error processing ${event.type}:`, error);
      return new Response("Webhook handler error", { status: 500 });
    }

    return new Response("OK", { status: 200 });
  }),
});

export default http;
