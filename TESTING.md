# CartPilot AI – Demo & Testing Guide

This guide walks you through the 4 live demo scenarios required for judging and verifying **CartPilot AI**.

---

## Prerequisites & Running the App

```bash
# 1. Install dependencies
npm install

# 2. Reset / seed sample products
npm run seed

# 3. Start the server
npm start
```

Visit:
- **Customer Chat:** [http://localhost:3000](http://localhost:3000)
- **Seller Dashboard:** [http://localhost:3000/seller](http://localhost:3000/seller) (Login: `admin` / `cartpilot`)

> **Note on Sandbox Mode:** If you have not entered live PayPal developer credentials in `.env`, the app automatically runs in **Sandbox Simulation mode**, letting you walk through the entire UI, order confirmation, payment approval, status transition, and refund flows without any blocker. When credentials are set in `.env`, it automatically calls the live PayPal Sandbox REST API (`api-m.sandbox.paypal.com`).

---

## Demo Script 1: Normal Order Flow

**Goal:** Customer orders items in conversational English, agent checks stock, reads back the order with exact total calculated in code, customer confirms, and pays via PayPal Sandbox.

1. Open [http://localhost:3000](http://localhost:3000) in your browser.
2. In the chat box, type:
   > *"I want 2 Lavender Dream Candles and 1 Canvas Tote Bag, please"*
3. **Observe the Agent Behavior:**
   - The agent calls `check_stock` for both items.
   - The agent calls `build_order` which calculates the total in code:
     - 2× Lavender Dream Candle ($14.99 each = $29.98)
     - 1× Canvas Tote Bag ($24.99 each = $24.99)
     - **Exact Total: $54.97**
   - The agent reads back all items, quantities, prices, and the total.
   - An **Order Summary** card appears with a **"Confirm & Pay"** button.
4. Click **"✅ Confirm & Pay"** (or type *"yes, confirm"* in chat).
5. You are redirected to the PayPal Sandbox checkout page.
6. Click **"Approve & Complete Payment"** (or log in with test buyer account).
7. You are redirected back to `/paypal/return`, which shows a clean **"Payment Successful!"** confirmation page with your order details and link back to chat.
8. Open [http://localhost:3000/seller](http://localhost:3000/seller):
   - Notice the order is marked **"Paid"** with a green badge.
   - Total revenue reflects the payment.
   - Inventory of Lavender Dream Candle decreased from 25 to 23.

---

## Demo Script 2: Out-of-Stock & Limited-Stock Requests

**Goal:** Test the strict guardrails for out-of-stock items and limited inventory.

### Out-of-Stock Request
1. In the customer chat at [http://localhost:3000](http://localhost:3000), type:
   > *"Can I get 2 Citrus Bliss Soap Sets?"*
2. **Observe Guardrail:**
   - The agent calls `check_stock("Citrus Bliss Soap Set", 2)`.
   - The database stock is 0.
   - The agent states that the Citrus Bliss Soap Set is out of stock.
   - The agent suggests available in-stock alternatives (such as the *Herbal Honey Soap Bar* at $8.99).
   - No order or checkout is created for unavailable items.

### Low-Stock Quantity Exceeded
1. In the chat, type:
   > *"How about 5 Ocean Breeze Candles?"*
2. **Observe Guardrail:**
   - The agent calls `check_stock("Ocean Breeze Candle", 5)`.
   - The database stock is only 2.
   - The agent informs the customer that only 2 units are available and asks if they would like to adjust their quantity.

---

## Demo Script 3: Cancelled Checkout

**Goal:** Verify customer abandonment and cancellation handling.

1. In the customer chat at [http://localhost:3000](http://localhost:3000), type:
   > *"I want 1 Vanilla Bean Candle"*
2. The agent reads back the order ($12.99 total) and shows the Order Summary card.
3. Click **"✅ Confirm & Pay"**.
4. When on the PayPal checkout page, click **"Cancel and return to store"**.
5. You are redirected to `/paypal/cancel`, which displays a friendly message:
   > *"Checkout Cancelled — No worries! Your order is still saved. Come back anytime to complete your purchase."*
6. In the Seller Dashboard [http://localhost:3000/seller](http://localhost:3000/seller), the order remains in pending status and no stock has been deducted.

---

## Demo Script 4: Seller Refund & AI Business Summary

**Goal:** Verify merchant refund execution, inventory restoration, and AI order analysis.

### Processing a Refund
1. Open the Seller Dashboard at [http://localhost:3000/seller](http://localhost:3000/seller).
2. Find the paid order from **Demo Script 1** ($54.97).
3. Click the red **"↩️ Refund"** button next to the order.
4. In the confirmation dialog, click **"Refund"**.
5. **Observe:**
   - The backend calls the PayPal Refund API (`/v2/payments/captures/{id}/refund`).
   - The order badge changes to purple **"↩️ Refunded"**.
   - The refunded amount is deducted from captured net revenue.
   - The 2 Lavender Dream Candles and 1 Canvas Tote Bag are automatically restored to stock in the database.

### Generating the AI Business Summary
1. On the Seller Dashboard, click **"🤖 Generate AI Summary"**.
2. **Observe:**
   - The agent aggregates the orders and product inventory.
   - A factual summary is generated detailing:
     - Total orders and breakdown by status (paid, pending, refunded)
     - Total captured net revenue
     - Pending orders requiring attention
     - Inventory warnings (out-of-stock and low-stock alerts)
     - Actionable merchant recommendation

---

## Demo Script 5: CartPilot Voice Mode (Phase 6)

**Goal:** Verify conversational speech-to-text shopping, live transcript rendering, spoken order readback via `speechSynthesis`, and strict guardrail enforcement (checkout is never created directly without explicit confirmation).

### 1. Activating CartPilot Voice
1. Open [http://localhost:3000](http://localhost:3000) in Chrome, Edge, or Safari.
2. In the input area, click the microphone button (🎙️).
3. If prompted by your browser, click **Allow** for microphone access.
4. **Observe:**
   - The mic button turns red and pulses with an animated listening indicator.
   - The yellow **CartPilot Voice** live transcript bar expands above the chat with a pulsing indicator: `CartPilot Voice: Listening for your order...`.

### 2. Speaking Your Order
1. Speak clearly:
   > *"I would like to order one Lavender Dream Candle"*
2. **Observe:**
   - The words stream into the live transcript bar in real time and are mirrored into the chat input.
   - After a brief pause in speech (or upon clicking **Done** / clicking the mic button), the transcribed message is sent automatically through the standard `POST /api/chat` endpoint.
   - The agent runs `check_stock` and `build_order` in code, returning the order summary ($14.99).
   - **Text-to-Speech:** CartPilot reads the reply aloud through your browser's speakers using `speechSynthesis`.
   - The **Order Summary** card appears with the **"✅ Confirm & Pay"** button.

### 3. Verifying Voice Guardrails
1. **Notice:** Despite the voice input, **no PayPal checkout link was created prematurely**. The order is safely in `awaiting_confirmation` status.
2. You can either:
   - Click the mic button again and speak *"Yes, confirm"*
   - Or click the **"✅ Confirm & Pay"** button on the screen.
3. Only upon this explicit confirmation is the PayPal checkout created, ensuring strict guardrail compliance.

### 4. Mute / Unmute Voice
1. Click the **"🔊 Voice On"** button in the top navigation header.
2. It toggles to **"🔇 Voice Muted"** with red accents.
3. Any current speech synthesis stops immediately, and subsequent responses remain silent until unmuted. The preference persists across page reloads in `localStorage`.

---

## Automated Verification Suite

To run all automated test suites covering all phases:

```bash
# Run unit & logic verification (21 tests)
node test-all-phases.js

# Run HTTP server & integration endpoints test
node test-server-endpoints.js
```
