import LegalLayout from "../components/LegalLayout";
import { useStoredTheme } from "../hooks/useStoredTheme";

const LAST_UPDATED = "May 3, 2026";

export default function Terms() {
  const { themeKey, t } = useStoredTheme();

  return (
    <LegalLayout t={t} title="Terms Of Service" lastUpdated={LAST_UPDATED}>
      <p>
        Welcome to TailorMyText. By using <a href="https://tailormytext.com" style={{ color: t.accent }}>tailormytext.com</a> (the "Service") you agree to these Terms of Service. If you don't agree, please don't use the Service.
      </p>
      <p>
        We've tried to write these in plain English. If anything is unclear, email <a href="mailto:support@tailormytext.com" style={{ color: t.accent }}>support@tailormytext.com</a>.
      </p>

      <h2>1. Who We Are</h2>
      <p>
        TailorMyText is operated as an independent indie SaaS. Throughout these Terms, "we," "us," and "our" refer to the operator of TailorMyText.
      </p>

      <h2>2. Your Account</h2>
      <ul>
        <li>You must be at least <strong>13 years old</strong> (16 in the EU) to use the Service.</li>
        <li>You're responsible for keeping your password secure. Don't share your account.</li>
        <li>One person, one account. Don't create accounts on behalf of others without their permission.</li>
        <li>You can delete your account at any time via Settings → Delete account.</li>
      </ul>

      <h2>3. What You Can Do</h2>
      <ul>
        <li>Upload documents you have the legal right to read (you own them, or have permission, or they're public domain).</li>
        <li>Use TailorMyText's reading aids — typography controls, themes, focus mode, reading guide, hue tracking — for your personal reading.</li>
        <li>Subscribe to Pro for additional features as described on the pricing page.</li>
      </ul>

      <h2>4. What You Can't Do</h2>
      <ul>
        <li>Upload content you don't have the legal right to use (pirated books, copyrighted material without permission, illegal content).</li>
        <li>Try to bypass payment, abuse the free trial offer (one trial per email — see our anti-abuse logic in the Privacy Policy), or otherwise game the Service.</li>
        <li>Reverse-engineer, scrape, or attempt to break into the Service or other users' accounts.</li>
        <li>Use TailorMyText to harass others, distribute malware, or for any unlawful purpose.</li>
        <li>Resell or redistribute the Service without our written permission.</li>
      </ul>

      <h2>5. Subscription, Billing, Refunds</h2>
      <h3>Pricing</h3>
      <ul>
        <li>Pro Monthly: <strong>$5/month</strong>, billed monthly.</li>
        <li>Pro Annual: <strong>$45/year</strong>, billed annually (effective $3.75/month — saves 25%).</li>
        <li>Both plans include a <strong>14-day free trial</strong> (one per email address). Card is required at signup but not charged until the trial ends.</li>
      </ul>
      <h3>Billing</h3>
      <ul>
        <li>Subscriptions auto-renew at the end of each billing period unless you cancel.</li>
        <li>Payments are processed by Stripe. By subscribing, you authorize Stripe to charge your payment method on each renewal.</li>
        <li>Failed payments will be retried per Stripe's standard schedule. After repeated failures, your subscription will be canceled.</li>
      </ul>
      <h3>Cancellation + Refunds</h3>
      <ul>
        <li>Cancel anytime via Settings → Manage subscription. Cancellation during your trial takes effect immediately and you won't be charged. Cancellation of an active Pro subscription takes effect at the end of the current billing period — you keep Pro access until then, and you won't be charged again.</li>
        <li><strong>If you forget to cancel before your 14-day trial ends, you'll be charged automatically</strong> on day 14 (Stripe sends a reminder email 7 days before this happens). The first post-trial charge is non-refundable. You can still cancel after being charged — your subscription will end at the end of that billing period and you won't be charged again — but the initial charge stands.</li>
        <li>We do <strong>not</strong> offer prorated refunds for partial billing periods, accidental renewals, or unused subscription time. If something has gone seriously wrong (a bug we caused, a duplicate charge, etc.), email <a href="mailto:support@tailormytext.com" style={{ color: t.accent }}>support@tailormytext.com</a> and we'll review case-by-case.</li>
        <li><strong>EU / UK consumers</strong> have a statutory 14-day right of withdrawal under EU consumer law. To exercise it, email us within 14 days of your first paid charge for a full refund.</li>
      </ul>

      <h2>6. Document Storage + Retention</h2>
      <ul>
        <li><strong>Free tier:</strong> uploaded documents auto-delete <strong>7 days</strong> after last access. We do this to protect your privacy and limit our storage costs.</li>
        <li><strong>Pro tier:</strong> uploaded documents auto-delete <strong>30 days</strong> after last access.</li>
        <li>Open a document at any point to reset its TTL clock.</li>
        <li>You're responsible for keeping your own backups. TailorMyText is a reading tool, not a long-term storage service.</li>
      </ul>

      <h2>7. Account Deletion + Post-Deletion Lockout</h2>
      <ul>
        <li>You can delete your account at any time. After a tier-dependent grace period, all your documents and account data are permanently removed.</li>
        <li>To prevent abuse of the free trial, your <em>email address</em> is recorded in our anti-abuse log. After deletion, the same email is subject to a <strong>6-month subscription-only period</strong> — you can sign up again, but Free tier features (3 uploads/month, free trial) won't be available until the lockout expires or you subscribe.</li>
        <li><strong>After the 6-month window passes, all data associated with that email is permanently purged</strong> — the anti-abuse log row, the account history, everything. From that point forward, the email behaves identically to a brand-new signup with no record of the prior account or lockout.</li>
        <li>This is the only data we retain about deleted accounts during the 6-month window. See the Privacy Policy for full detail.</li>
      </ul>

      <h2>8. Intellectual Property</h2>
      <h3>Yours</h3>
      <p>
        You retain all rights to documents you upload. We don't claim ownership and don't read or analyze your document contents.
      </p>
      <h3>Ours</h3>
      <p>
        The TailorMyText brand, design, and code are our intellectual property. You can't copy, redistribute, or create derivative works without permission.
      </p>

      <h2>9. Service Availability</h2>
      <ul>
        <li>We aim for high uptime but don't guarantee uninterrupted access. The Service may be unavailable for maintenance, updates, or due to issues outside our control (network outages, third-party failures).</li>
        <li>We may update or remove features at any time. For material changes affecting paid features, we'll provide reasonable notice and a refund or transition path.</li>
      </ul>

      <h2>10. Disclaimers</h2>
      <p>
        The Service is provided <strong>"as is"</strong> without warranties of any kind, express or implied. We don't guarantee the Service will meet your needs, be error-free, or be available without interruption.
      </p>
      <p>
        TailorMyText is a reading enhancement tool. It is <strong>not</strong> a substitute for professional medical, educational, or accessibility advice. If you have specific reading-related needs, please consult a qualified professional.
      </p>

      <h2>11. Limitation Of Liability</h2>
      <p>
        To the fullest extent allowed by law, our total liability to you for any claim related to the Service is limited to the amount you paid us in the 12 months before the claim. We're not liable for indirect, incidental, or consequential damages — including lost data, lost profits, or business interruption.
      </p>

      <h2>12. Termination</h2>
      <p>
        We may suspend or terminate your account if you violate these Terms (e.g., uploading illegal content, attempting to abuse the system, harassment). We'll generally notify you before doing so unless the violation is severe.
      </p>

      <h2>13. Changes To These Terms</h2>
      <p>
        We may update these Terms. Material changes will be communicated via email or an in-app notice at least 30 days before they take effect. Continued use of the Service after the effective date means you accept the new Terms.
      </p>

      <h2>14. Governing Law</h2>
      <p>
        These Terms are governed by the laws of the United States. Any disputes will be resolved in the courts of the operator's state of residence, unless local consumer protection law provides otherwise.
      </p>

      <h2>15. Contact</h2>
      <p>
        Questions about these Terms? Email <a href="mailto:support@tailormytext.com" style={{ color: t.accent }}>support@tailormytext.com</a>.
      </p>
    </LegalLayout>
  );
}
