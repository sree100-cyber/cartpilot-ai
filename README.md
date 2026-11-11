# CartPilot AI 🛒🤖

> **An AI Sales & Checkout Agent for Small Online Sellers**  
> Built for the *"Build What's Next with PayPal and AI"* Hackathon.

CartPilot AI bridges conversational commerce with reliable payment processing. Small online sellers can provide a 24/7 personal shopping assistant that understands plain English customer requests, validates live inventory, builds orders, computes exact totals strictly in code, and seamlessly routes customers into PayPal Sandbox checkout upon explicit customer confirmation.

---

## 🌟 The Problem & Target User

### The Problem
Small artisanal sellers (craft shops, independent makers, boutique retailers) receive customer inquiries across chats and social channels: *"Do you have the lavender candle and that blue tote? How much for 2 candles and 1 tote shipped?"*
- Sellers often lose sales due to delayed response times.
- Manual order calculations and back-and-forth messaging lead to calculation errors and abandoned carts.
- Generic AI chatbots hallucinate prices, promise discounts, or fail to enforce strict stock limits.

### The Target User
- **Boutique & Artisan Merchants:** Independent sellers who want to offer conversational shopping without managing complex e-commerce platforms.
- **Customers:** Buyers who prefer typing what they want in natural English rather than hunting through category trees.

---

## 🚀 Key Features

- **Natural Language Shopping:** Customers type casual requests like *"2 lavender candles and the tote bag, how much?"* or *"What candles do you have?"*.
- **Fuzzy Product Matching:** Matches informal abbreviations, keywords, and descriptions against the product catalog.
- **CartPilot Voice (Web Speech Mode):** Hands-free shopping powered entirely by standard browser Web Speech APIs (`SpeechRecognition` + `speechSynthesis`). Speak directly to CartPilot, view a live transcription bar, and hear CartPilot's replies read aloud. Includes an instant mute/unmute toggle and graceful fallback.
- **Strict Code-Calculated Pricing (Anti-Hallucination):** The LLM is strictly prohibited from inventing prices or calculating totals; all item validation and price math is computed deterministically in code.
- **Inventory & Out-of-Stock Guardrails:**
  - Detects out-of-stock items and suggests in-stock alternatives.
  - Enforces quantity thresholds for low-stock products.
- **Explicit Confirmation Safeguard:** Order checkouts cannot be created prematurely. The agent must read back all items, quantities, unit prices, and the total, and the customer must explicitly confirm (via "Confirm & Pay" button or typing/speaking "confirm"). Voice transcripts can never bypass the confirmation guardrail.
- **PayPal Sandbox Checkout (Orders v2 API):** Creates sandbox orders with intent `CAPTURE`, routes buyers to the PayPal approval flow, captures on return, and decrements stock.
- **Idempotent Webhooks & Return Handlers:** Webhook endpoint for `PAYMENT.CAPTURE.COMPLETED` ensures duplicate events never double-decrement inventory.
- **Merchant Seller Dashboard:** Real-time visibility into all orders with status badges, totals, timestamps, one-click PayPal refund button with automated stock restoration, and a **"Generate AI Summary"** feature for daily business intelligence.
- **Zero-Blocker Sandbox Simulation:** If developer keys are not yet configured in `.env`, the app seamlessly runs in Sandbox Simulation mode so reviewers can test the full flow without waiting for API keys.

---

## 🏗️ Architecture Overview

```
                      ┌──────────────────────────────────────┐
                      │          Customer Browser            │
                      │   (Clean Chat UI + Order Card)       │
                      └──────────────────┬───────────────────┘
                                         │ HTTP / JSON
                                         ▼
                      ┌──────────────────────────────────────┐
                      │          Express Backend             │
                      │  - Session Manager & Routes          │
                      │  - Deterministic Math Engine         │
                      └────┬──────────────┬─────────────┬────┘
                           │              │             │
              Tool Calling │              │ SQLite DB   │ PayPal REST API
                           ▼              ▼             ▼
               ┌────────────────┐   ┌───────────┐   ┌─────────────────┐
               │   Gemini API   │   │  sql.js   │   │ PayPal Sandbox  │
               │ (gemini-2.0-   │   │ Products  │   │ Orders v2 /     │
               │     flash)     │   │ & Orders  │   │ Captures/Refund │
               └────────────────┘   └───────────┘   └─────────────────┘
```

### Data Model
- **`products`**: `id`, `name`, `price` (USD), `stock`, `description`
- **`orders`**: `id` (UUID), `items` (JSON), `total`, `status` (`draft` | `awaiting_confirmation` | `pending_payment` | `paid` | `failed` | `refunded`), `paypal_order_id`, `capture_id`, `created_at`, `updated_at`

### Seed Products
1. **Lavender Dream Candle** – $14.99 (Stock: 25)
2. **Vanilla Bean Candle** – $12.99 (Stock: 30)
3. **Ocean Breeze Candle** – $15.99 (Stock: 2, *Low stock demo*)
4. **Canvas Tote Bag** – $24.99 (Stock: 15)
5. **Citrus Bliss Soap Set** – $18.99 (Stock: 0, *Out-of-stock demo*)
6. **Herbal Honey Soap Bar** – $8.99 (Stock: 40)

---

## 🛠️ AI Tools Used and How

CartPilot AI uses Google Gemini (`gemini-2.5-flash`) with structured **Function/Tool Calling**:

| Tool Name | Parameters | Purpose | Guardrails Enforced |
|-----------|------------|---------|---------------------|
| `check_stock` | `product_name`, `quantity` | Checks product inventory, returns availability and unit price using fuzzy matching. | Triggered before ordering; alerts when out of stock and recommends alternatives. |
| `build_order` | `items: [{product_name, quantity}]` | Validates every item against DB, checks stock, and calculates order total **in code**. | The LLM never computes totals or invents prices; sets status to `awaiting_confirmation`. |
| `create_paypal_checkout` | `order_id` | Generates PayPal Sandbox order and approval link. | **Enforced in code:** Only executable if `order.status === 'awaiting_confirmation'` AND customer confirmation flag is true. |
| `list_products` | *(none)* | Returns catalog with descriptions, pricing, and stock tags. | Enables natural browsing without prompt hallucination. |

### Prompt Design & Safety Guardrails
- **Anti-Hallucination:** System prompt explicitly instructs the agent to rely strictly on tool results for prices and inventory.
- **Mandatory Readback:** System prompt requires repeating the complete item list, unit prices, and final code-calculated total before checkout.
- **No Rogue Discounts:** The agent will not offer discounts or coupons not present in the database.
- **Privacy First:** System secrets, internal prompts, and API keys are protected from leak attempts.

---

## ⚙️ Quick Start & Setup

### 1. Clone & Install
```bash
git clone <repository-url>
cd cartpilot-ai
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Edit `.env`:
```env
# Gemini API Key (get from https://aistudio.google.com/)
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# PayPal Sandbox Credentials (from https://developer.paypal.com/)
PAYPAL_CLIENT_ID=your_paypal_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_paypal_sandbox_client_secret
PAYPAL_WEBHOOK_ID=your_paypal_webhook_id

# App Config
BASE_URL=http://localhost:3000
PORT=3000
```

> **Instant Demo Mode:** You can start and test the app immediately even before adding PayPal or Gemini keys! The app includes automatic fallback simulation for both services.

### 3. How to Obtain PayPal Sandbox Credentials & Test Buyer Account
1. Go to the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/).
2. Log in with your PayPal account.
3. Under **Apps & Credentials**, toggle to **Sandbox** and click **Create App**.
4. Name your app (e.g. `CartPilot`) and click **Create App**.
5. Copy your **Client ID** and **Secret** into your `.env` file (`PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`).
6. Under **Testing Tools > Sandbox Accounts**:
   - You will see auto-generated accounts: one **Business (Merchant)** and one **Personal (Buyer)**.
   - Use the **Personal** account email and password when approving payments in the PayPal checkout window.

### 4. Seed the Database
```bash
npm run seed
```

### 5. Start the Application
```bash
npm start
```
- **Customer Store:** [http://localhost:3000](http://localhost:3000) (Open shopping chat)
- **Seller Dashboard:** [http://localhost:3000/seller](http://localhost:3000/seller) (Protected by login)
  - **Demo Credentials:** Username: `admin` | Password: `cartpilot` (customizable via `SELLER_USERNAME` and `SELLER_PASSWORD` in `.env`)

---

## 🧪 Running the Demo & Tests

Refer to [TESTING.md](TESTING.md) for step-by-step walkthroughs of:
1. **Normal Order Flow:** Natural request -> stock check -> readback -> confirmation -> PayPal checkout -> payment capture.
2. **Out-of-Stock Guardrail:** Requesting out-of-stock soap set triggers alternative suggestions.
3. **Cancelled Checkout:** Aborted PayPal checkout keeps order pending without decrementing stock.
4. **Merchant Refund & AI Summary:** Refunding restores stock; AI generates factual store health summary.

### Run Automated Test Suites
```bash
# Verify all 4 phases (21 test assertions)
node test-all-phases.js

# Test live HTTP endpoints
node test-server-endpoints.js
```

---

## ☁️ Deployment (Render)

This repository includes a turnkey `render.yaml` deployment specification.

### Deploy Steps:
1. Push your repository to GitHub.
2. Go to [Render.com](https://render.com/) and create a **New Blueprint Instance**.
3. Connect your repository — Render will automatically detect `render.yaml`.
4. In the Render Dashboard environment settings, supply:
   - `GEMINI_API_KEY`
   - `PAYPAL_CLIENT_ID`
   - `PAYPAL_CLIENT_SECRET`
   - `BASE_URL` (set to your Render service URL, e.g. `https://cartpilot-ai.onrender.com`)
5. Render will execute `npm install && npm run seed` and launch the app with `npm start`.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
