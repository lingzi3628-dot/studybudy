/**
 * Web Design Component Library — Phase 12
 *
 * Pre-built, drag-and-drop HTML components for the visual web builder.
 * Each component is a self-contained HTML+CSS+JS snippet that can be
 * inserted into the editor with one click.
 *
 * Categories:
 *   - Layout: containers, grids, sections
 *   - Headers: nav bars, hero sections
 *   - Content: text blocks, cards, galleries
 *   - Forms: contact, newsletter, login
 *   - CTAs: buttons, banners, popups
 *   - Footer: link lists, social, copyright
 *
 * Each component uses CSS variables (--primary, --bg, --text) so the
 * design system can be changed in one place.
 */

export type ComponentCategory = "layout" | "header" | "content" | "form" | "cta" | "footer";

export type WebComponent = {
  id: string;
  name: string;
  emoji: string;
  category: ComponentCategory;
  description: string;
  html: string; // the HTML+CSS+JS to insert
};

const BASE_STYLES = `<style>
/* Auto-injected design system */
:root {
  --primary: #6366F1;
  --primary-dark: #4F46E5;
  --bg: #FFFFFF;
  --text: #1F2937;
  --text-light: #6B7280;
  --border: #E5E7EB;
  --radius: 12px;
  --shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06);
  --max-width: 1200px;
}
</style>`;

export const WEB_COMPONENTS: WebComponent[] = [
  // === LAYOUT ===
  {
    id: "container",
    name: "Container",
    emoji: "📦",
    category: "layout",
    description: "Max-width centered container",
    html: `<div style="max-width: 1200px; margin: 0 auto; padding: 0 1rem;">
  <!-- Your content here -->
</div>`,
  },
  {
    id: "grid-3",
    name: "3-Column Grid",
    emoji: "📐",
    category: "layout",
    description: "Responsive 3-column grid",
    html: `<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1.5rem; max-width: 1200px; margin: 0 auto; padding: 2rem 1rem;">
  <div style="background: #F9FAFB; border-radius: 12px; padding: 1.5rem;">Column 1</div>
  <div style="background: #F9FAFB; border-radius: 12px; padding: 1.5rem;">Column 2</div>
  <div style="background: #F9FAFB; border-radius: 12px; padding: 1.5rem;">Column 3</div>
</div>`,
  },
  {
    id: "section",
    name: "Section",
    emoji: "📏",
    category: "layout",
    description: "Full-width section with padding",
    html: `<section style="padding: 4rem 1rem; background: #F9FAFB;">
  <div style="max-width: 1200px; margin: 0 auto;">
    <h2 style="font-size: 2rem; color: #1F2937; margin-bottom: 1rem;">Section Title</h2>
    <p style="color: #6B7280; max-width: 600px;">Add your section content here.</p>
  </div>
</section>`,
  },

  // === HEADER ===
  {
    id: "navbar",
    name: "Navigation Bar",
    emoji: "🧭",
    category: "header",
    description: "Logo + links + CTA button",
    html: `<nav style="background: #FFFFFF; border-bottom: 1px solid #E5E7EB; padding: 1rem; position: sticky; top: 0; z-index: 100;">
  <div style="max-width: 1200px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center;">
    <a href="#" style="font-size: 1.5rem; font-weight: 800; color: #6366F1; text-decoration: none;">Brand</a>
    <div style="display: flex; gap: 2rem; align-items: center;">
      <a href="#" style="color: #1F2937; text-decoration: none; font-weight: 500;">Home</a>
      <a href="#" style="color: #1F2937; text-decoration: none; font-weight: 500;">About</a>
      <a href="#" style="color: #1F2937; text-decoration: none; font-weight: 500;">Services</a>
      <a href="#" style="color: #1F2937; text-decoration: none; font-weight: 500;">Contact</a>
      <a href="#" style="background: #6366F1; color: #FFFFFF; padding: 0.5rem 1.5rem; border-radius: 8px; text-decoration: none; font-weight: 600;">Get Started</a>
    </div>
  </div>
</nav>`,
  },
  {
    id: "hero",
    name: "Hero Section",
    emoji: "🚀",
    category: "header",
    description: "Big headline + subtext + CTA",
    html: `<section style="background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); color: #FFFFFF; padding: 6rem 1rem; text-align: center;">
  <div style="max-width: 800px; margin: 0 auto;">
    <h1 style="font-size: 3rem; font-weight: 800; margin-bottom: 1.5rem; line-height: 1.2;">Build Something Amazing Today</h1>
    <p style="font-size: 1.25rem; opacity: 0.9; margin-bottom: 2rem;">Your tagline goes here. Make it compelling and action-oriented.</p>
    <div style="display: flex; gap: 1rem; justify-content: center;">
      <a href="#" style="background: #FFFFFF; color: #6366F1; padding: 0.75rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 700;">Get Started Free</a>
      <a href="#" style="border: 2px solid rgba(255,255,255,0.3); color: #FFFFFF; padding: 0.75rem 2rem; border-radius: 8px; text-decoration: none; font-weight: 600;">Learn More</a>
    </div>
  </div>
</section>`,
  },

  // === CONTENT ===
  {
    id: "card-grid",
    name: "Feature Cards",
    emoji: "🃏",
    category: "content",
    description: "3 feature cards with icons",
    html: `<section style="padding: 4rem 1rem;">
  <div style="max-width: 1200px; margin: 0 auto;">
    <h2 style="text-align: center; font-size: 2rem; color: #1F2937; margin-bottom: 3rem;">Why Choose Us</h2>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem;">
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 2rem; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 1rem;">⚡</div>
        <h3 style="font-size: 1.25rem; color: #1F2937; margin-bottom: 0.5rem;">Fast</h3>
        <p style="color: #6B7280;">Lightning-fast performance optimized for speed.</p>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 2rem; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 1rem;">🔒</div>
        <h3 style="font-size: 1.25rem; color: #1F2937; margin-bottom: 0.5rem;">Secure</h3>
        <p style="color: #6B7280;">Bank-grade security with end-to-end encryption.</p>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 2rem; text-align: center;">
        <div style="font-size: 2.5rem; margin-bottom: 1rem;">🎨</div>
        <h3 style="font-size: 1.25rem; color: #1F2937; margin-bottom: 0.5rem;">Beautiful</h3>
        <p style="color: #6B7280;">Stunning designs that convert visitors to customers.</p>
      </div>
    </div>
  </div>
</section>`,
  },
  {
    id: "text-image",
    name: "Text + Image",
    emoji: "📝",
    category: "content",
    description: "Side-by-side text and image",
    html: `<section style="padding: 4rem 1rem;">
  <div style="max-width: 1200px; margin: 0 auto; display: flex; align-items: center; gap: 3rem; flex-wrap: wrap;">
    <div style="flex: 1; min-width: 300px;">
      <h2 style="font-size: 2rem; color: #1F2937; margin-bottom: 1rem;">About Our Product</h2>
      <p style="color: #6B7280; line-height: 1.8; margin-bottom: 1.5rem;">Describe your product or service here. Focus on benefits, not features. Tell a story that resonates with your audience.</p>
      <a href="#" style="color: #6366F1; font-weight: 600; text-decoration: none;">Learn more →</a>
    </div>
    <div style="flex: 1; min-width: 300px;">
      <img src="https://placehold.co/600x400/6366F1/FFFFFF?text=Your+Image" alt="Product" style="width: 100%; border-radius: 12px;">
    </div>
  </div>
</section>`,
  },
  {
    id: "pricing",
    name: "Pricing Table",
    emoji: "💰",
    category: "content",
    description: "3-tier pricing with highlighted plan",
    html: `<section style="padding: 4rem 1rem; background: #F9FAFB;">
  <div style="max-width: 1200px; margin: 0 auto;">
    <h2 style="text-align: center; font-size: 2rem; color: #1F2937; margin-bottom: 3rem;">Simple Pricing</h2>
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 2rem; max-width: 900px; margin: 0 auto;">
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 2rem; text-align: center;">
        <h3 style="color: #1F2937; margin-bottom: 0.5rem;">Starter</h3>
        <p style="font-size: 3rem; font-weight: 800; color: #1F2937;">$0<span style="font-size: 1rem; color: #6B7280;">/mo</span></p>
        <ul style="list-style: none; padding: 0; margin: 1.5rem 0; color: #6B7280;">
          <li style="padding: 0.5rem 0;">✓ 5 projects</li>
          <li style="padding: 0.5rem 0;">✓ Community support</li>
          <li style="padding: 0.5rem 0;">✓ Basic templates</li>
        </ul>
        <a href="#" style="display: block; padding: 0.75rem; background: #F3F4F6; color: #1F2937; border-radius: 8px; text-decoration: none; font-weight: 600;">Get Started</a>
      </div>
      <div style="background: #FFFFFF; border: 2px solid #6366F1; border-radius: 12px; padding: 2rem; text-align: center; transform: scale(1.05); box-shadow: 0 10px 30px rgba(99,102,241,0.15);">
        <span style="background: #6366F1; color: #FFFFFF; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">POPULAR</span>
        <h3 style="color: #1F2937; margin: 0.5rem 0;">Pro</h3>
        <p style="font-size: 3rem; font-weight: 800; color: #6366F1;">$29<span style="font-size: 1rem; color: #6B7280;">/mo</span></p>
        <ul style="list-style: none; padding: 0; margin: 1.5rem 0; color: #6B7280;">
          <li style="padding: 0.5rem 0;">✓ Unlimited projects</li>
          <li style="padding: 0.5rem 0;">✓ Priority support</li>
          <li style="padding: 0.5rem 0;">✓ Custom domain</li>
          <li style="padding: 0.5rem 0;">✓ Remove branding</li>
        </ul>
        <a href="#" style="display: block; padding: 0.75rem; background: #6366F1; color: #FFFFFF; border-radius: 8px; text-decoration: none; font-weight: 700;">Start Free Trial</a>
      </div>
      <div style="background: #FFFFFF; border: 1px solid #E5E7EB; border-radius: 12px; padding: 2rem; text-align: center;">
        <h3 style="color: #1F2937; margin-bottom: 0.5rem;">Enterprise</h3>
        <p style="font-size: 3rem; font-weight: 800; color: #1F2937;">$99<span style="font-size: 1rem; color: #6B7280;">/mo</span></p>
        <ul style="list-style: none; padding: 0; margin: 1.5rem 0; color: #6B7280;">
          <li style="padding: 0.5rem 0;">✓ Everything in Pro</li>
          <li style="padding: 0.5rem 0;">✓ White-label</li>
          <li style="padding: 0.5rem 0;">✓ Dedicated manager</li>
          <li style="padding: 0.5rem 0;">✓ SLA guarantee</li>
        </ul>
        <a href="#" style="display: block; padding: 0.75rem; background: #F3F4F6; color: #1F2937; border-radius: 8px; text-decoration: none; font-weight: 600;">Contact Sales</a>
      </div>
    </div>
  </div>
</section>`,
  },

  // === FORMS ===
  {
    id: "contact-form",
    name: "Contact Form",
    emoji: "📧",
    category: "form",
    description: "Name + email + message",
    html: `<section style="padding: 4rem 1rem;">
  <div style="max-width: 600px; margin: 0 auto;">
    <h2 style="text-align: center; font-size: 2rem; color: #1F2937; margin-bottom: 2rem;">Get In Touch</h2>
    <form style="display: flex; flex-direction: column; gap: 1rem;" onsubmit="event.preventDefault(); alert('Form submitted! Connect this to your backend.');">
      <input type="text" placeholder="Your Name" required style="padding: 0.75rem 1rem; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 1rem;">
      <input type="email" placeholder="Your Email" required style="padding: 0.75rem 1rem; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 1rem;">
      <textarea placeholder="Your Message" rows="5" required style="padding: 0.75rem 1rem; border: 1px solid #E5E7EB; border-radius: 8px; font-size: 1rem; resize: vertical;"></textarea>
      <button type="submit" style="padding: 0.75rem; background: #6366F1; color: #FFFFFF; border: none; border-radius: 8px; font-size: 1rem; font-weight: 700; cursor: pointer;">Send Message</button>
    </form>
  </div>
</section>`,
  },
  {
    id: "newsletter",
    name: "Newsletter Signup",
    emoji: "📰",
    category: "form",
    description: "Email capture with CTA",
    html: `<section style="padding: 4rem 1rem; background: #6366F1;">
  <div style="max-width: 600px; margin: 0 auto; text-align: center; color: #FFFFFF;">
    <h2 style="font-size: 2rem; margin-bottom: 0.5rem;">Stay Updated</h2>
    <p style="opacity: 0.9; margin-bottom: 1.5rem;">Subscribe to our newsletter for the latest updates.</p>
    <form style="display: flex; gap: 0.5rem; max-width: 400px; margin: 0 auto;" onsubmit="event.preventDefault(); alert('Subscribed!');">
      <input type="email" placeholder="Enter your email" required style="flex: 1; padding: 0.75rem 1rem; border: none; border-radius: 8px; font-size: 1rem;">
      <button type="submit" style="padding: 0.75rem 1.5rem; background: #1F2937; color: #FFFFFF; border: none; border-radius: 8px; font-weight: 700; cursor: pointer;">Subscribe</button>
    </form>
  </div>
</section>`,
  },

  // === CTA ===
  {
    id: "cta-banner",
    name: "CTA Banner",
    emoji: "📣",
    category: "cta",
    description: "Full-width call to action",
    html: `<section style="padding: 4rem 1rem;">
  <div style="max-width: 1200px; margin: 0 auto; background: linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%); border-radius: 20px; padding: 3rem; text-align: center; color: #FFFFFF;">
    <h2 style="font-size: 2.5rem; font-weight: 800; margin-bottom: 1rem;">Ready to Get Started?</h2>
    <p style="font-size: 1.25rem; opacity: 0.9; margin-bottom: 2rem;">Join thousands of happy customers today.</p>
    <a href="#" style="display: inline-block; background: #FFFFFF; color: #6366F1; padding: 1rem 3rem; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 1.1rem;">Start Free Trial →</a>
  </div>
</section>`,
  },
  {
    id: "stats-bar",
    name: "Stats Bar",
    emoji: "📊",
    category: "cta",
    description: "4 key metrics in a row",
    html: `<section style="padding: 3rem 1rem; background: #1F2937;">
  <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; text-align: center;">
    <div style="color: #FFFFFF;">
      <div style="font-size: 3rem; font-weight: 800; color: #818CF8;">10K+</div>
      <div style="font-size: 0.9rem; opacity: 0.7;">Active Users</div>
    </div>
    <div style="color: #FFFFFF;">
      <div style="font-size: 3rem; font-weight: 800; color: #818CF8;">99.9%</div>
      <div style="font-size: 0.9rem; opacity: 0.7;">Uptime</div>
    </div>
    <div style="color: #FFFFFF;">
      <div style="font-size: 3rem; font-weight: 800; color: #818CF8;">50+</div>
      <div style="font-size: 0.9rem; opacity: 0.7;">Countries</div>
    </div>
    <div style="color: #FFFFFF;">
      <div style="font-size: 3rem; font-weight: 800; color: #818CF8;">4.9★</div>
      <div style="font-size: 0.9rem; opacity: 0.7;">User Rating</div>
    </div>
  </div>
</section>`,
  },

  // === FOOTER ===
  {
    id: "footer",
    name: "Footer",
    emoji: "🔻",
    category: "footer",
    description: "Links + social + copyright",
    html: `<footer style="background: #111827; color: #9CA3AF; padding: 3rem 1rem 1rem;">
  <div style="max-width: 1200px; margin: 0 auto; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 2rem; margin-bottom: 2rem;">
    <div>
      <h4 style="color: #FFFFFF; margin-bottom: 1rem; font-size: 1rem;">Brand</h4>
      <p style="font-size: 0.875rem; line-height: 1.6;">Building the future of web design. Made with ❤️ in Kenya.</p>
    </div>
    <div>
      <h4 style="color: #FFFFFF; margin-bottom: 1rem; font-size: 1rem;">Product</h4>
      <a href="#" style="display: block; color: #9CA3AF; text-decoration: none; font-size: 0.875rem; padding: 0.25rem 0;">Features</a>
      <a href="#" style="display: block; color: #9CA3AF; text-decoration: none; font-size: 0.875rem; padding: 0.25rem 0;">Pricing</a>
      <a href="#" style="display: block; color: #9CA3AF; text-decoration: none; font-size: 0.875rem; padding: 0.25rem 0;">Templates</a>
    </div>
    <div>
      <h4 style="color: #FFFFFF; margin-bottom: 1rem; font-size: 1rem;">Company</h4>
      <a href="#" style="display: block; color: #9CA3AF; text-decoration: none; font-size: 0.875rem; padding: 0.25rem 0;">About</a>
      <a href="#" style="display: block; color: #9CA3AF; text-decoration: none; font-size: 0.875rem; padding: 0.25rem 0;">Blog</a>
      <a href="#" style="display: block; color: #9CA3AF; text-decoration: none; font-size: 0.875rem; padding: 0.25rem 0;">Contact</a>
    </div>
    <div>
      <h4 style="color: #FFFFFF; margin-bottom: 1rem; font-size: 1rem;">Connect</h4>
      <div style="display: flex; gap: 1rem;">
        <a href="#" style="color: #9CA3AF; text-decoration: none; font-size: 1.5rem;">📘</a>
        <a href="#" style="color: #9CA3AF; text-decoration: none; font-size: 1.5rem;">🐦</a>
        <a href="#" style="color: #9CA3AF; text-decoration: none; font-size: 1.5rem;">📷</a>
        <a href="#" style="color: #9CA3AF; text-decoration: none; font-size: 1.5rem;">💼</a>
      </div>
    </div>
  </div>
  <div style="border-top: 1px solid #374151; padding-top: 1rem; text-align: center; font-size: 0.8rem;">
    © 2026 Brand. All rights reserved.
  </div>
</footer>`,
  },
];

export const COMPONENT_CATEGORIES: { id: ComponentCategory; label: string; emoji: string }[] = [
  { id: "layout", label: "Layout", emoji: "📐" },
  { id: "header", label: "Headers", emoji: "🧭" },
  { id: "content", label: "Content", emoji: "📝" },
  { id: "form", label: "Forms", emoji: "📧" },
  { id: "cta", label: "CTA", emoji: "📣" },
  { id: "footer", label: "Footer", emoji: "🔻" },
];

export function getComponentsByCategory(category: ComponentCategory): WebComponent[] {
  return WEB_COMPONENTS.filter(c => c.category === category);
}
