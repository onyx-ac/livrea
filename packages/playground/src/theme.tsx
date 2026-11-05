/** @jsxImportSource livrea */
import {
  blockSlot,
  Component,
  css,
  defineBlock,
  definePattern,
  defineSettings,
  field,
  hostComponent,
  Layout,
  on,
  Outlet,
  select,
  settingsJson,
  slot,
  type EventInfo
} from 'livrea';
import type { ThemeSource } from 'livrea/runtime';

export interface ArticleItem {
  readonly id: string;
  readonly title: string;
  readonly excerpt: string;
  readonly category: 'engineering' | 'design' | 'strategy';
  readonly readingTimeMinutes: number;
  readonly featured: boolean;
  readonly publishedAt: string;
}

export interface ServiceItem {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tier: 'core' | 'enterprise';
  readonly badge: string;
}

export interface DemoStoreState {
  readonly language: 'en' | 'it';
  readonly currentPage?: string;
  readonly siteTagline: string;
  readonly articles: readonly ArticleItem[];
  readonly services: readonly ServiceItem[];
  readonly settings: Record<string, unknown>;
}

declare module 'livrea' {
  interface EventCatalog {
    'article:publish': { readonly title?: string };
    'contact:submitted': { readonly email?: string };
  }
}

// --- Host Components (rendered by the React host app) ---

export const ContactForm = hostComponent<{
  heading?: string;
  defaultTopic?: 'project' | 'consulting' | 'general';
  submitLabel?: string;
  onSubmit?: (payload: { name: string; email: string; topic: string; message: string }) => void;
}>('ContactForm');

export const ActionButton = hostComponent<{
  label: string;
  target: string;
  variant?: 'primary' | 'ghost';
  onPress?: () => void;
}>('ActionButton');

// --- Reusable Blocks (TSX + field.* schema + inner slots) ---

export const SplitColumns = defineBlock({
  id: 'split-columns',
  label: { en: 'Split Columns', it: 'Colonne divise' },
  fields: {
    ratio: field.select({
      label: { en: 'Column Ratio', it: 'Proporzione colonne' },
      options: [
        { value: '1:1', label: { en: 'Equal (1:1)', it: 'Uguali (1:1)' } },
        { value: '1:2', label: { en: 'Sidebar Left (1:2)', it: 'Barra a sinistra (1:2)' } },
        { value: '2:1', label: { en: 'Sidebar Right (2:1)', it: 'Barra a destra (2:1)' } }
      ],
      default: '1:2'
    }),
    gap: field.range({
      label: { en: 'Column Gap', it: 'Spazio colonne' },
      min: 0.5,
      max: 2.5,
      step: 0.25,
      unit: 'rem',
      default: 1.25
    })
  },
  slots: ['Left', 'Right'],
  render({ ratio, gap }, slots) {
    const template = ratio === '1:2' ? '1fr 1.6fr' : ratio === '2:1' ? '1.6fr 1fr' : '1fr 1fr';
    const gapValue = typeof gap === 'number' && gap > 4 ? `${gap}px` : `${gap}rem`;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: template, gap: gapValue, alignItems: 'start' }}>
        <div>
          <slots.Left />
        </div>
        <div>
          <slots.Right />
        </div>
      </div>
    );
  }
});

export const SectionCard = defineBlock({
  id: 'section-card',
  label: { en: 'Section Card', it: 'Scheda sezione' },
  fields: {
    title: field.localizedText({
      label: { en: 'Section Heading', it: 'Titolo sezione' },
      default: { en: 'Latest Dispatches', it: 'Ultimi Articoli' }
    }),
    tone: field.select({
      label: { en: 'Card Style', it: 'Stile scheda' },
      options: [
        { value: 'surface', label: { en: 'Elevated Surface', it: 'Superficie' } },
        { value: 'accent', label: { en: 'Accent Border', it: 'Bordo accentato' } },
        { value: 'minimal', label: { en: 'Minimal Outline', it: 'Minimale' } }
      ],
      default: 'accent'
    }),
    padding: field.range({
      label: { en: 'Inner Padding', it: 'Spaziatura interna' },
      min: 0.5,
      max: 2.5,
      step: 0.25,
      unit: 'rem',
      default: 1.25
    })
  },
  slots: ['Header', 'Body', 'Footer'],
  render({ title, tone, padding }, slots) {
    const lang = ((this.store as unknown as DemoStoreState).language ?? 'en') as 'en' | 'it';
    const heading = title[lang] || title.en || '';
    const padValue = typeof padding === 'number' && padding > 4 ? `${padding}px` : `${padding}rem`;
    return (
      <article className={`meridian-card meridian-card-${tone}`} style={{ padding: padValue }}>
        {heading ? <h3 className="meridian-card-title">{heading}</h3> : null}
        <slots.Header />
        <div className="meridian-card-body">
          <slots.Body />
        </div>
        <footer className="meridian-card-footer">
          <slots.Footer />
        </footer>
      </article>
    );
  }
});

export const ArticleFeed = defineBlock({
  id: 'article-feed',
  label: { en: 'Article Feed', it: 'Elenco articoli' },
  fields: {
    category: field.select({
      label: { en: 'Category Filter', it: 'Filtro categoria' },
      options: [
        { value: 'all', label: { en: 'All Categories', it: 'Tutte le categorie' } },
        { value: 'engineering', label: { en: 'Engineering', it: 'Ingegneria' } },
        { value: 'design', label: { en: 'Design Systems', it: 'Design System' } },
        { value: 'strategy', label: { en: 'Product Strategy', it: 'Strategia Prodotto' } }
      ],
      default: 'all'
    }),
    featuredOnly: field.toggle({
      label: { en: 'Featured Articles Only', it: 'Solo articoli in evidenza' },
      default: false
    }),
    limit: field.range({
      label: { en: 'Max Articles', it: 'Numero massimo articoli' },
      min: 1,
      max: 6,
      step: 1,
      default: 3
    }),
    showReadingTime: field.toggle({
      label: { en: 'Show Reading Time', it: 'Mostra tempo di lettura' },
      default: true
    })
  },
  render({ category, featuredOnly, limit, showReadingTime }) {
    const state = this.store as unknown as DemoStoreState;
    const processed = (state.articles ?? [])
      .filter((article) => (category === 'all' || article.category === category) && (!featuredOnly || article.featured))
      .slice(0, limit);

    if (!processed.length) {
      return <p className="meridian-muted">No articles match this filter.</p>;
    }

    return (
      <ul className="meridian-article-list">
        {processed.map((article) => (
          <li key={article.id} className="meridian-article-item">
            <div className="meridian-article-header">
              <span className="meridian-badge">{article.category}</span>
              {article.featured ? <span className="meridian-badge meridian-badge-featured">Featured</span> : null}
              {showReadingTime ? <span className="meridian-meta">{article.readingTimeMinutes} min read</span> : null}
            </div>
            <h4 className="meridian-article-title">{article.title}</h4>
            <p className="meridian-article-excerpt">{article.excerpt}</p>
          </li>
        ))}
      </ul>
    );
  }
});

export const ServicesGrid = defineBlock({
  id: 'services-grid',
  label: { en: 'Featured Services', it: 'Servizi in evidenza' },
  fields: {
    tierFilter: field.select({
      label: { en: 'Service Tier', it: 'Livello servizio' },
      options: [
        { value: 'all', label: { en: 'All Services', it: 'Tutti i servizi' } },
        { value: 'core', label: { en: 'Core Capabilities', it: 'Competenze Core' } },
        { value: 'enterprise', label: { en: 'Enterprise Advisory', it: 'Consulenza Enterprise' } }
      ],
      default: 'all'
    }),
    columns: field.select({
      label: { en: 'Grid Layout', it: 'Disposizione griglia' },
      options: [
        { value: '1', label: { en: 'Stacked (1 Column)', it: 'Singola colonna' } },
        { value: '2', label: { en: 'Two Columns', it: 'Due colonne' } }
      ],
      default: '1'
    }),
    showBadges: field.toggle({
      label: { en: 'Show Capability Badges', it: 'Mostra badge servizio' },
      default: true
    })
  },
  render({ tierFilter, columns, showBadges }) {
    const state = this.store as unknown as DemoStoreState;
    const services = (state.services ?? []).filter((s) => tierFilter === 'all' || s.tier === tierFilter);
    return (
      <div
        className="meridian-services-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: columns === '2' ? '1fr 1fr' : '1fr',
          gap: '12px'
        }}
      >
        {services.map((service) => (
          <div key={service.id} className="meridian-service-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{service.title}</strong>
              {showBadges ? <span className="meridian-badge">{service.badge}</span> : null}
            </div>
            <p className="meridian-article-excerpt">{service.summary}</p>
          </div>
        ))}
      </div>
    );
  }
});

export const ContactBlock = defineBlock({
  id: 'contact-block',
  label: { en: 'Contact Form', it: 'Modulo di contatto' },
  fields: {
    heading: field.localizedText({
      label: { en: 'Form Heading', it: 'Titolo modulo' },
      default: { en: 'Start a Conversation', it: 'Inizia una conversazione' }
    }),
    defaultTopic: field.select({
      label: { en: 'Default Topic', it: 'Argomento predefinito' },
      options: [
        { value: 'project', label: { en: 'New Product / Architecture', it: 'Nuovo Prodotto / Architettura' } },
        { value: 'consulting', label: { en: 'Design Systems Audit', it: 'Audit Design System' } },
        { value: 'general', label: { en: 'General Inquiry', it: 'Informazioni generali' } }
      ],
      default: 'project'
    }),
    submitLabel: field.localizedText({
      label: { en: 'Submit Button Text', it: 'Testo pulsante invio' },
      default: { en: 'Send Inquiry →', it: 'Invia richiesta →' }
    })
  },
  render({ heading, defaultTopic, submitLabel }) {
    const lang = ((this.store as unknown as DemoStoreState).language ?? 'en') as 'en' | 'it';
    return (
      <ContactForm
        heading={heading[lang] || heading.en || 'Contact Us'}
        defaultTopic={defaultTopic}
        submitLabel={submitLabel[lang] || submitLabel.en || 'Send'}
        onSubmit={(payload) => this.action('submitContact', payload)}
      />
    );
  }
});

export const CalloutBanner = defineBlock({
  id: 'callout-banner',
  label: { en: 'Callout Banner & CTA', it: 'Banner e Call-to-Action' },
  fields: {
    text: field.localizedText({
      label: { en: 'Banner Copy', it: 'Testo banner' },
      default: {
        en: '🚀 Read our new engineering report on sandboxed UI architectures and visual block editors.',
        it: '🚀 Leggi il nostro nuovo report sulle architetture UI in sandbox e gli editor visuali a blocchi.'
      }
    }),
    ctaLabel: field.localizedText({
      label: { en: 'Button Label', it: 'Testo pulsante' },
      default: { en: 'Browse Articles →', it: 'Esplora Articoli →' }
    }),
    target: field.select({
      label: { en: 'Destination Page', it: 'Pagina di destinazione' },
      options: [
        { value: 'articles', label: { en: 'Articles Index', it: 'Indice Articoli' } },
        { value: 'contact', label: { en: 'Contact Page', it: 'Pagina Contatti' } },
        { value: 'home', label: { en: 'Home Page', it: 'Pagina Home' } }
      ],
      default: 'articles'
    }),
    highlight: field.toggle({
      label: { en: 'Accent Border', it: 'Bordo accentato' },
      default: true
    })
  },
  render({ text, ctaLabel, target, highlight }) {
    const lang = ((this.store as unknown as DemoStoreState).language ?? 'en') as 'en' | 'it';
    return (
      <div className={`meridian-banner${highlight ? ' meridian-banner-accent' : ''}`}>
        <span>{text[lang] || text.en}</span>
        <ActionButton
          label={ctaLabel[lang] || ctaLabel.en || target}
          target={target}
          variant="primary"
          onPress={() => this.action('navigate', target)}
        />
      </div>
    );
  }
});

export const DEMO_BLOCKS = [
  SplitColumns,
  SectionCard,
  ArticleFeed,
  ServicesGrid,
  ContactBlock,
  CalloutBanner
] as const;

// --- Starter Patterns (unpack into editable BlockNode[] trees) ---

export const EditorialSplitPattern = definePattern({
  id: 'editorial-split',
  label: { en: 'Services Sidebar + Latest Articles Card', it: 'Servizi + Scheda Ultimi Articoli' },
  for: 'homeStage',
  tree: [
    {
      block: 'split-columns',
      props: { ratio: '1:2', gap: 1.25 },
      slots: {
        Left: [
          {
            block: 'section-card',
            props: {
              title: { en: 'Featured Services', it: 'Servizi in Evidenza' },
              tone: 'surface',
              padding: 1
            },
            slots: {
              Body: [{ block: 'services-grid', props: { tierFilter: 'all', columns: '1', showBadges: true } }]
            }
          }
        ],
        Right: [
          {
            block: 'section-card',
            props: {
              title: { en: 'Recent Engineering & Design Articles', it: 'Articoli Recenti di Ingegneria e Design' },
              tone: 'accent',
              padding: 1.25
            },
            slots: {
              Header: [{ block: 'callout-banner', props: { target: 'articles', highlight: true } }],
              Body: [{ block: 'article-feed', props: { category: 'all', featuredOnly: false, limit: 3, showReadingTime: true } }]
            }
          }
        ]
      }
    }
  ]
});

export const AgencyLandingPattern = definePattern({
  id: 'agency-landing',
  label: { en: 'Full Services Grid + Inline Contact Form', it: 'Griglia Servizi + Modulo Contatto' },
  for: 'homeStage',
  tree: [
    { block: 'callout-banner', props: { target: 'articles', highlight: true } },
    {
      block: 'section-card',
      props: {
        title: { en: 'What We Build', it: 'Cosa Realizziamo' },
        tone: 'surface',
        padding: 1.25
      },
      slots: {
        Body: [{ block: 'services-grid', props: { tierFilter: 'all', columns: '2', showBadges: true } }],
        Footer: [{ block: 'contact-block', props: { defaultTopic: 'project' } }]
      }
    }
  ]
});

export const MagazineIndexPattern = definePattern({
  id: 'magazine-index',
  label: { en: 'Featured Spotlight + Engineering Feed', it: 'In Evidenza + Feed Ingegneria' },
  for: 'articlesStage',
  tree: [
    {
      block: 'split-columns',
      props: { ratio: '1:1', gap: 1 },
      slots: {
        Left: [
          {
            block: 'section-card',
            props: { title: { en: 'Featured Picks', it: 'Scelte della Redazione' }, tone: 'accent', padding: 1 },
            slots: {
              Body: [{ block: 'article-feed', props: { category: 'all', featuredOnly: true, limit: 3, showReadingTime: true } }]
            }
          }
        ],
        Right: [
          {
            block: 'section-card',
            props: { title: { en: 'Engineering Deep Dives', it: 'Approfondimenti di Ingegneria' }, tone: 'surface', padding: 1 },
            slots: {
              Body: [{ block: 'article-feed', props: { category: 'engineering', featuredOnly: false, limit: 4, showReadingTime: true } }]
            }
          }
        ]
      }
    }
  ]
});

export const SplitContactPattern = definePattern({
  id: 'split-contact',
  label: { en: 'Advisory Services + Contact Inquiry Form', it: 'Servizi di Consulenza + Modulo Contatto' },
  for: 'contactStage',
  tree: [
    {
      block: 'split-columns',
      props: { ratio: '1:1', gap: 1.25 },
      slots: {
        Left: [
          {
            block: 'section-card',
            props: { title: { en: 'How We Partner', it: 'Come Collaboriamo' }, tone: 'surface', padding: 1.25 },
            slots: {
              Body: [{ block: 'services-grid', props: { tierFilter: 'all', columns: '1', showBadges: true } }]
            }
          }
        ],
        Right: [
          {
            block: 'section-card',
            props: { title: { en: 'Get in Touch', it: 'Contattaci' }, tone: 'accent', padding: 1.25 },
            slots: {
              Body: [{ block: 'contact-block', props: { defaultTopic: 'project' } }]
            }
          }
        ]
      }
    }
  ]
});

export const DEMO_PATTERNS = [
  EditorialSplitPattern,
  AgencyLandingPattern,
  MagazineIndexPattern,
  SplitContactPattern
] as const;

// --- Theme Settings ---

export const demoSettings = defineSettings({
  accent: field.color({
    label: { en: 'Accent Colour', it: 'Colore accento' },
    help: { en: 'Exposed as CSS variable --setting-accent', it: 'Variabile CSS --setting-accent' },
    default: '#38bdf8'
  }),
  surfaceRadius: field.range({
    label: { en: 'Card Corner Radius', it: 'Raggio bordi schede' },
    min: 0,
    max: 24,
    step: 2,
    unit: 'px',
    default: 12
  }),
  siteName: field.text({
    label: { en: 'Site Title', it: 'Titolo del sito' },
    default: 'Meridian Studio'
  }),
  heroTitle: field.localizedText({
    label: { en: 'Hero Headline', it: 'Titolo principale' },
    default: {
      en: 'Engineering journal, product studio & modular web systems.',
      it: 'Rivista di ingegneria, studio di prodotto e sistemi web modulari.'
    }
  }),
  showReadingCount: field.toggle({
    label: { en: 'Show Article Count in Header', it: 'Mostra conteggio articoli nella testata' },
    default: true
  }),
  homeStage: field.blocks({
    label: { en: 'Home Page — Main Stage', it: 'Pagina Home — Area Principale' },
    allowed: ['split-columns', 'section-card', 'article-feed', 'services-grid', 'contact-block', 'callout-banner'],
    default: EditorialSplitPattern.tree
  }),
  articlesStage: field.blocks({
    label: { en: 'Articles Page — Stage', it: 'Pagina Articoli — Area Principale' },
    allowed: ['split-columns', 'section-card', 'article-feed', 'callout-banner'],
    default: MagazineIndexPattern.tree
  }),
  contactStage: field.blocks({
    label: { en: 'Contact Page — Stage', it: 'Pagina Contatti — Area Principale' },
    allowed: ['split-columns', 'section-card', 'services-grid', 'contact-block', 'callout-banner'],
    default: SplitContactPattern.tree
  })
});

export const DEMO_SETTINGS_JSON = settingsJson(demoSettings, {
  blocks: DEMO_BLOCKS,
  patterns: DEMO_PATTERNS
});

// --- Theme Layout & Pages ---

export class SiteLayout extends Layout {
  state: { notice?: string | null } = { notice: null };

  data = {
    articleCount: select((s) => ((s as unknown as DemoStoreState).articles ?? []).length),
    currentPage: select((s) => (s as unknown as DemoStoreState).currentPage ?? 'home')
  };

  listeners = {
    onArticlePublish: on('article:publish', (e) => {
      this.set({ notice: `📰 New article published: "${e.title || 'Modular Theme Engines in Practice'}"` });
    }),
    onContactSubmitted: on('contact:submitted', (e) => {
      this.set({ notice: `✅ Thanks! Inquiry received from ${e.email || 'visitor@example.com'}.` });
    })
  };

  styles = css`
    .meridian-shell {
      min-height: 460px;
      padding: 20px;
      background: radial-gradient(circle at top right, rgba(56, 189, 248, 0.1), transparent 55%), #0f131a;
      color: #f3f4f6;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .meridian-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .meridian-brand {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--setting-accent, #38bdf8);
    }
    .meridian-nav {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .meridian-meta {
      font-size: 11px;
      color: #9ca3af;
    }
    .meridian-muted {
      font-size: 12px;
      color: #9ca3af;
      margin: 0;
    }
    .meridian-notice {
      padding: 8px 12px;
      border-radius: 8px;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid var(--setting-accent, #38bdf8);
      font-size: 12px;
    }
    .meridian-hero-title {
      margin: 0 0 14px 0;
      font-size: 21px;
      font-weight: 600;
      line-height: 1.35;
    }
    .meridian-card {
      border-radius: var(--setting-surface-radius, 12px);
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.09);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .meridian-card-accent {
      border-color: var(--setting-accent, #38bdf8);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
    }
    .meridian-card-minimal {
      background: transparent;
      border-style: dashed;
    }
    .meridian-card-title {
      margin: 0;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--setting-accent, #38bdf8);
    }
    .meridian-banner {
      padding: 10px 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      font-size: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .meridian-banner-accent {
      border-left: 3px solid var(--setting-accent, #38bdf8);
    }
    .meridian-article-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .meridian-article-item {
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .meridian-article-header {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .meridian-article-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #f9fafb;
    }
    .meridian-article-excerpt {
      margin: 0;
      font-size: 12px;
      color: #9ca3af;
      line-height: 1.45;
    }
    .meridian-badge {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.08);
      color: #e5e7eb;
    }
    .meridian-badge-featured {
      background: rgba(56, 189, 248, 0.18);
      color: var(--setting-accent, #38bdf8);
    }
    .meridian-service-item {
      padding: 12px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.07);
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
  `;

  override render() {
    const state = this.store as unknown as DemoStoreState;
    const settings = this.settings as unknown as {
      siteName: string;
      showReadingCount: boolean;
    };
    return (
      <div className="meridian-shell">
        <header className="meridian-header">
          <div>
            <span className="meridian-brand">{settings.siteName}</span>
            <span className="meridian-meta" style={{ marginLeft: 10 }}>
              {state.siteTagline}
            </span>
          </div>
          <nav className="meridian-nav">
            {settings.showReadingCount ? (
              <span className="meridian-badge">{this.data.articleCount} articles</span>
            ) : null}
            <ActionButton
              label="Home"
              target="home"
              variant={this.data.currentPage === 'home' ? 'primary' : 'ghost'}
              onPress={() => this.action('navigate', 'home')}
            />
            <ActionButton
              label="Articles"
              target="articles"
              variant={this.data.currentPage === 'articles' ? 'primary' : 'ghost'}
              onPress={() => this.action('navigate', 'articles')}
            />
            <ActionButton
              label="Contact"
              target="contact"
              variant={this.data.currentPage === 'contact' ? 'primary' : 'ghost'}
              onPress={() => this.action('navigate', 'contact')}
            />
          </nav>
        </header>
        {this.state.notice ? <div className="meridian-notice">{this.state.notice}</div> : null}
        <main>
          <Outlet />
        </main>
      </div>
    );
  }
}

export class HomePage extends Component {
  data = {
    lang: select((s) => (s as unknown as DemoStoreState).language ?? 'en')
  };

  Hero = slot(() => {
    const heroTitle = (this.settings as unknown as { heroTitle: Record<string, string> }).heroTitle;
    return <h1 className="meridian-hero-title">{heroTitle[this.data.lang] || heroTitle.en}</h1>;
  });

  Stage = blockSlot('homeStage');

  override render() {
    return (
      <section>
        <this.Hero />
        <this.Stage />
      </section>
    );
  }
}

export class ArticlesPage extends Component {
  data = {
    categories: select((s) => {
      const list = (s as unknown as DemoStoreState).articles ?? [];
      return Array.from(new Set(list.map((a) => a.category)));
    }),
    totalMinutes: select((s) => {
      const list = (s as unknown as DemoStoreState).articles ?? [];
      return list.reduce((sum, item) => sum + item.readingTimeMinutes, 0);
    })
  };

  Stage = blockSlot('articlesStage');

  override render() {
    return (
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 className="meridian-hero-title" style={{ margin: 0 }}>
            Articles &amp; Research ({this.data.totalMinutes} min total reading)
          </h1>
          <span className="meridian-meta">Topics: {this.data.categories.join(' · ')}</span>
        </div>
        <this.Stage />
      </section>
    );
  }
}

export class ContactPage extends Component {
  Stage = blockSlot('contactStage');

  override render() {
    return (
      <section>
        <h1 className="meridian-hero-title">Work With Us</h1>
        <this.Stage />
      </section>
    );
  }
}

export const DEMO_EVENTS: Readonly<Record<string, EventInfo>> = {
  'article:publish': { source: 'app', bubbles: true, cancellable: false },
  'contact:submitted': { source: 'app', bubbles: true, cancellable: false }
};

export const DEMO_THEME: ThemeSource = {
  layout: SiteLayout,
  pages: {
    home: HomePage,
    articles: ArticlesPage,
    contact: ContactPage
  },
  settings: demoSettings,
  blocks: DEMO_BLOCKS
};

export const INITIAL_STORE_STATE: DemoStoreState = {
  language: 'en',
  currentPage: 'home',
  siteTagline: 'Digital Product & Architecture Journal',
  articles: [
    {
      id: 'a1',
      title: 'Why Sandboxed Class Inheritance Beats Static Templates',
      excerpt: 'How object-oriented slots and path-tracked selectors let customers customize workflows without forking your app.',
      category: 'engineering',
      readingTimeMinutes: 7,
      featured: true,
      publishedAt: '2026-10-28'
    },
    {
      id: 'a2',
      title: 'Designing Recursive Block Trees for Non-Technical Editors',
      excerpt: 'Bridging developer-authored TSX blocks with Gutenberg-style starter patterns in a single settings.json schema.',
      category: 'design',
      readingTimeMinutes: 5,
      featured: true,
      publishedAt: '2026-10-21'
    },
    {
      id: 'a3',
      title: 'Zero-Trust CSS & DOM Sanitization Across Worker Boundaries',
      excerpt: 'Keeping third-party theme styles and host component callbacks fast, deterministic, and isolated.',
      category: 'engineering',
      readingTimeMinutes: 9,
      featured: false,
      publishedAt: '2026-10-14'
    },
    {
      id: 'a4',
      title: 'Multi-Brand Product Strategy Without Per-Customer Forks',
      excerpt: 'Scaling enterprise deployments when every client demands bespoke layouts and localized copy.',
      category: 'strategy',
      readingTimeMinutes: 6,
      featured: false,
      publishedAt: '2026-10-02'
    }
  ],
  services: [
    {
      id: 's1',
      title: 'Design System & Block Library Engineering',
      summary: 'Reusable TSX blocks with typed field schemas and nested drop zones for visual editors.',
      tier: 'core',
      badge: 'Core'
    },
    {
      id: 's2',
      title: 'Sandboxed Multi-Tenant Frontend Architecture',
      summary: 'Worker-isolated rendering pipelines with automatic slot and page error recovery.',
      tier: 'enterprise',
      badge: 'Enterprise'
    },
    {
      id: 's3',
      title: 'Interactive Editorial & Content Workflows',
      summary: 'High-velocity publishing experiences powered by fine-grained reactive stores.',
      tier: 'core',
      badge: 'Core'
    }
  ],
  settings: {}
};
