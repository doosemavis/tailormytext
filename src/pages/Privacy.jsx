import LegalLayout from "../components/LegalLayout";
import { useStoredTheme } from "../hooks/useStoredTheme";

const LAST_UPDATED = "May 3, 2026";

// Standalone page — doesn't share App.jsx's massive state surface. Pulls
// the user's saved theme straight from localStorage so the page matches
// their preferred chrome without spinning up the whole AuthContext flow.
export default function Privacy() {
  const { themeKey, t } = useStoredTheme();

  return (
    <LegalLayout t={t} title="Privacy Policy" lastUpdated={LAST_UPDATED}>
      <p>
        TailorMyText ("we," "us," "our") operates the website at <a href="https://tailormytext.com" style={{ color: t.accent }}>tailormytext.com</a> (the "Service"). This Privacy Policy explains what data we collect, why we collect it, who we share it with, and the rights you have over it.
      </p>
      <p>
        We've tried to write this in plain English. If anything here is unclear, email us at <a href="mailto:support@tailormytext.com" style={{ color: t.accent }}>support@tailormytext.com</a>.
      </p>

      <h2>1. What We Collect</h2>
      <h3>Account Information</h3>
      <ul>
        <li><strong>Email address</strong> — used to identify your account, send you password-reset links, and contact you about your subscription.</li>
        <li><strong>Password (encrypted)</strong> — never stored in plain text; we use Supabase Auth's hashing.</li>
        <li><strong>Profile metadata</strong> — display avatar (either premade gallery or your uploaded image), theme preference, role.</li>
      </ul>

      <h3>Documents You Upload</h3>
      <ul>
        <li>The files you upload to read are stored in our private Supabase Storage bucket. Only your account can access them; we do not browse or analyze the contents.</li>
        <li>Document metadata (filename, upload time, last access time) is stored in our database to power your "Continue Reading" library.</li>
        <li><strong>Free tier:</strong> documents auto-delete <strong>7 days</strong> after you last opened them.</li>
        <li><strong>Pro tier:</strong> documents auto-delete <strong>30 days</strong> after you last opened them.</li>
      </ul>

      <h3>Subscription + Billing</h3>
      <ul>
        <li>If you subscribe, we use <strong>Stripe</strong> as our payment processor. Stripe stores your payment method (card details, billing address) — we never see or store your card number directly.</li>
        <li>We store a Stripe Customer ID and subscription status (active, trialing, canceled, past_due) in our database to know what features you have access to.</li>
      </ul>

      <h3>Anti-Abuse History</h3>
      <ul>
        <li>We keep an event log keyed to your email address (<code>account_history</code>) recording when you signed up, started a trial, started paying, canceled, or deleted your account.</li>
        <li>This survives account deletion. We use it to enforce two rules: (1) one free trial per email address, and (2) a 6-month subscription-only period after a deletion.</li>
        <li>This log contains your <em>email address only</em> — no documents, no other personal data.</li>
      </ul>

      <h3>Analytics + Observability</h3>
      <ul>
        <li>We collect basic, non-identifying usage data (pageviews, feature usage, error rates) to understand how the product is used and detect bugs.</li>
        <li>We do not use third-party trackers (Google Analytics, Facebook Pixel, etc.) at this time.</li>
      </ul>

      <h2>2. Why We Collect It</h2>
      <ul>
        <li><strong>To run the Service</strong> — store your documents, save your settings, charge your subscription.</li>
        <li><strong>To keep you informed</strong> — transactional emails (signup confirmation, password reset, payment receipts).</li>
        <li><strong>To prevent abuse</strong> — the email-keyed history is what stops one email from getting unlimited free trials.</li>
        <li><strong>To improve the Service</strong> — aggregate, non-identifying analytics show us what features matter.</li>
      </ul>

      <h2>3. Who We Share It With</h2>
      <p>We do not sell your data. We share it only with the third-party processors required to operate the Service:</p>
      <ul>
        <li><strong>Supabase</strong> — database hosting, file storage, authentication. Their privacy policy: <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: t.accent }}>supabase.com/privacy</a></li>
        <li><strong>Stripe</strong> — payment processing. Their privacy policy: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" style={{ color: t.accent }}>stripe.com/privacy</a></li>
        <li>We may disclose data if required by law, court order, or to protect rights and safety.</li>
      </ul>

      <h2>4. Cookies + Local Storage</h2>
      <p>We use:</p>
      <ul>
        <li><strong>Authentication tokens</strong> (in browser localStorage) — required for staying signed in across page loads.</li>
        <li><strong>Theme + preference cache</strong> (in browser localStorage) — saves your theme so you don't have to re-pick it every visit.</li>
        <li>We do not use third-party cookies for advertising or cross-site tracking.</li>
      </ul>

      <h2>5. Your Rights</h2>
      <p>You can:</p>
      <ul>
        <li><strong>Access your data</strong> — your library, settings, and subscription details are visible in your account at all times.</li>
        <li><strong>Delete your account</strong> — Settings → Delete account. Documents and account data are removed after a tier-dependent grace period (Free: 7 days; Trial: until trial end; Pro: until current billing period end).</li>
        <li><strong>Export your data</strong> — open your account page and use the <em>Export your data</em> card to download everything we hold (profile, subscription, document library index) as a JSON or CSV file. No email request needed; you can do this at any time, as often as you want.</li>
        <li><strong>Object or restrict processing</strong> — if you're an EU/UK resident under GDPR or California resident under CCPA, contact us to exercise your rights.</li>
      </ul>

      <h2>6. Data Retention</h2>
      <ul>
        <li><strong>Documents:</strong> 7 days (Free) / 30 days (Pro) after last access, then auto-deleted.</li>
        <li><strong>Account data (profile, settings):</strong> kept while your account exists, deleted when you delete your account (after grace period).</li>
        <li><strong>Subscription history:</strong> Stripe retains payment records as required by financial regulations (typically 7 years for tax purposes), separately from our database.</li>
        <li><strong>Anti-abuse event log:</strong> kept for <strong>6 months</strong> after your account is deleted (only the email address + event type — no other data). Once the 6-month lockout window expires, all account_history rows for that email are permanently purged. After that point, the email behaves identically to a fresh signup with no record of the prior account.</li>
      </ul>

      <h2>7. Security</h2>
      <p>
        Data is encrypted in transit (HTTPS) and at rest (Supabase storage encryption). Authentication uses industry-standard bcrypt password hashing. Access to your data is restricted by row-level security policies. Despite these measures, no system is perfectly secure — we'll notify you within 72 hours if a breach affects your data.
      </p>

      <h2>8. Children's Privacy</h2>
      <p>
        TailorMyText is not directed at children under 13 (or 16 in the EU). We do not knowingly collect data from children in those age groups. If you believe a child has provided data to us, contact <a href="mailto:support@tailormytext.com" style={{ color: t.accent }}>support@tailormytext.com</a>.
      </p>

      <h2>9. Changes To This Policy</h2>
      <p>
        We may update this policy. Material changes will be communicated via email or an in-app notice at least 30 days before they take effect. The "Last updated" date at the top reflects the current version.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about this Privacy Policy? Email <a href="mailto:support@tailormytext.com" style={{ color: t.accent }}>support@tailormytext.com</a>.
      </p>
    </LegalLayout>
  );
}
