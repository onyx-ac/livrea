import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Card,
  Heading,
  Link,
  Selector,
  Stack,
  TextArea,
  TextInput,
  Theme
} from '@astryxdesign/core';
import { neutralTheme } from '@astryxdesign/theme-neutral/built';
import { EDITOR_HOST_NAMES, ThemeBuilder, cloneBlockTree } from '@livrea/ui';
import { withSampleData, type EventName, type SettingsJson } from 'livrea';
import { SAFE_TAGS, ThemeClient } from 'livrea/host';
import { connectInThread, hostNames, read, type HostComponentProps, type HostComponents } from 'livrea/react';
import type { ThemeSource } from 'livrea/runtime';
import { triggerThemeZipDownload, type ThemePackageMeta } from './download.js';
import {
  DEMO_EVENTS,
  DEMO_SETTINGS_JSON,
  DEMO_THEME,
  EditorialSplitPattern,
  INITIAL_STORE_STATE,
  MagazineIndexPattern,
  SplitContactPattern
} from './theme.js';
import { parseUploadedTheme } from './upload.js';

function GithubIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

const INQUIRY_TOPIC_OPTIONS = [
  { value: 'project', label: 'New Product / Architecture' },
  { value: 'consulting', label: 'Design Systems Audit' },
  { value: 'general', label: 'General Inquiry' }
];

const LOCALE_OPTIONS = [
  { value: 'en', label: 'Store Locale: EN' },
  { value: 'it', label: 'Store Locale: IT' }
];

function ContactFormPreview(props: HostComponentProps) {
  const heading = read.text(props.heading, 'Start a Conversation');
  const defaultTopic = read.oneOf(props.defaultTopic, ['project', 'consulting', 'general'] as const, 'project');
  const submitLabel = read.text(props.submitLabel, 'Send Inquiry →');
  const onSubmit = read.callback(props.onSubmit);

  const [name, setName] = useState('Elena Rossi');
  const [email, setEmail] = useState('elena@example.com');
  const [topic, setTopic] = useState<string>(defaultTopic);
  const [message, setMessage] = useState('We are looking to integrate a modular theme engine into our web platform.');

  useEffect(() => {
    setTopic(defaultTopic);
  }, [defaultTopic]);

  return (
    <Card padding={3}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ name, email, topic, message });
        }}
      >
        <Stack gap={2}>
          <Heading level={4}>{heading}</Heading>
          <Stack direction="horizontal" gap={2} wrap="wrap">
            <TextInput
              label="Your Name"
              placeholder="Your name"
              value={name}
              onChange={(val) => setName(val)}
              size="sm"
              width="100%"
            />
            <TextInput
              label="Your Email"
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(val) => setEmail(val)}
              size="sm"
              width="100%"
            />
          </Stack>
          <Selector
            label="Inquiry Topic"
            options={INQUIRY_TOPIC_OPTIONS}
            value={topic}
            onChange={(selected) => {
              if (typeof selected === 'string') {
                setTopic(selected);
              }
            }}
            size="sm"
            width="100%"
          />
          <TextArea
            label="Inquiry Message"
            rows={2}
            value={message}
            onChange={(val) => setMessage(val)}
            size="sm"
            width="100%"
          />
          <Stack direction="horizontal" hAlign="end">
            <Button type="submit" label={submitLabel} variant="primary" size="sm" />
          </Stack>
        </Stack>
      </form>
    </Card>
  );
}

function ActionButtonPreview(props: HostComponentProps) {
  const label = read.text(props.label, 'Continue');
  const variant = read.oneOf(props.variant, ['primary', 'ghost'] as const, 'primary');
  const onPress = read.callback(props.onPress);
  return (
    <Button
      label={label}
      variant={variant === 'primary' ? 'primary' : 'secondary'}
      size="sm"
      onClick={() => onPress()}
    />
  );
}

const PREVIEW_COMPONENTS: HostComponents = {
  ContactForm: ContactFormPreview,
  ActionButton: ActionButtonPreview
};

function createDefaultValues(): Record<string, unknown> {
  return {
    accent: '#38bdf8',
    surfaceRadius: 12,
    siteName: 'Meridian Studio',
    heroTitle: {
      en: 'Engineering journal, product studio & modular web systems.',
      it: 'Rivista di ingegneria, studio di prodotto e sistemi web modulari.'
    },
    showReadingCount: true,
    homeStage: cloneBlockTree(EditorialSplitPattern.tree, DEMO_SETTINGS_JSON.blocks),
    articlesStage: cloneBlockTree(MagazineIndexPattern.tree, DEMO_SETTINGS_JSON.blocks),
    contactStage: cloneBlockTree(SplitContactPattern.tree, DEMO_SETTINGS_JSON.blocks)
  };
}

export function DemoApp() {
  const [schema, setSchema] = useState<SettingsJson>(DEMO_SETTINGS_JSON);
  const [themeSource, setThemeSource] = useState<ThemeSource>(DEMO_THEME);
  const [themeMeta, setThemeMeta] = useState<ThemePackageMeta>({
    id: 'meridian-studio',
    name: 'Meridian Studio',
    version: '1.0.0'
  });
  const [values, setValues] = useState<Record<string, unknown>>(createDefaultValues);
  const [language, setLanguage] = useState<'en' | 'it'>('en');
  const [activePage, setActivePage] = useState<string>('home');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const client = useMemo(() => {
    const instance = new ThemeClient({
      connect: connectInThread({ theme: themeSource, events: DEMO_EVENTS, editing: true }),
      state: withSampleData(schema.data, { ...INITIAL_STORE_STATE, language, currentPage: activePage, settings: values }),
      policy: {
        tags: SAFE_TAGS,
        hosts: new Set([...hostNames(PREVIEW_COMPONENTS), ...EDITOR_HOST_NAMES]),
        url: () => true
      },
      events: DEMO_EVENTS,
      onAction(name, args) {
        const rawTarget = Array.isArray(args[0]) ? args[0][0] : args[0];
        if (name === 'navigate' && typeof rawTarget === 'string') {
          setActivePage(rawTarget);
          instance.showPage(rawTarget);
        }
        if (name === 'submitContact') {
          const rawPayload = Array.isArray(args[0]) ? args[0][0] : args[0];
          const payload = (rawPayload ?? {}) as { email?: string };
          void instance.emit('contact:submitted' as EventName, { email: payload.email } as never);
        }
      }
    });
    return instance;
  }, [themeSource]);

  useEffect(() => {
    client.setState(
      withSampleData(schema.data, {
        ...INITIAL_STORE_STATE,
        language,
        currentPage: activePage,
        settings: values
      })
    );
  }, [client, schema, language, activePage, values]);

  const handleUploadFile = async (file: File) => {
    setUploadError(null);
    try {
      const buffer = await file.arrayBuffer();
      const loaded = await parseUploadedTheme(file.name, new Uint8Array(buffer), schema);
      setSchema(loaded.schema);
      setValues(loaded.values);
      setThemeMeta({ id: loaded.id, name: loaded.name, version: loaded.version });
      if (loaded.themeSource) {
        setThemeSource(loaded.themeSource);
      }
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : String(error));
    }
  };

  const resetToStarterTheme = () => {
    setUploadError(null);
    setSchema(DEMO_SETTINGS_JSON);
    setThemeSource(DEMO_THEME);
    setThemeMeta({ id: 'meridian-studio', name: 'Meridian Studio', version: '1.0.0' });
    setValues(createDefaultValues());
  };

  const pageNames = useMemo(() => Object.keys(themeSource.pages), [themeSource]);
  const currentActivePage = pageNames.includes(activePage) ? activePage : (pageNames[0] ?? 'home');

  return (
    <Theme theme={neutralTheme} mode="dark">
      <Stack gap={3} padding={4}>
        <Card padding={3}>
          <Stack as="header" direction="horizontal" hAlign="between" vAlign="center" gap={3} wrap="wrap">
            <Stack direction="horizontal" vAlign="center" gap={2} wrap="wrap">
              <Heading level={3}>Livrea Playground</Heading>
              <Badge
                variant="neutral"
                label={`${themeMeta.name} v${themeMeta.version}`}
              />
            </Stack>

            <Stack direction="horizontal" vAlign="center" gap={2} wrap="wrap">
              <Selector
                label="Preview Store Language"
                isLabelHidden
                options={LOCALE_OPTIONS}
                value={language}
                onChange={(selected) => {
                  if (selected === 'en' || selected === 'it') {
                    setLanguage(selected);
                  }
                }}
                size="sm"
                width={160}
              />

              <input
                ref={fileInputRef}
                type="file"
                accept=".livrea,.zip,.json"
                aria-label="Upload Starting Theme File"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleUploadFile(file);
                  event.target.value = '';
                }}
              />

              <Button
                label="Upload theme"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              />

              <Button
                label="Reset theme"
                variant="secondary"
                size="sm"
                onClick={resetToStarterTheme}
              />

              <Button
                label="Download theme"
                variant="primary"
                size="sm"
                onClick={() => triggerThemeZipDownload(values, schema, themeMeta)}
              />

              <Button
                label="GitHub source"
                isIconOnly
                variant="secondary"
                size="sm"
                href="https://github.com/onyx-ac/livrea/tree/develop/packages/playground"
                target="_blank"
                rel="noreferrer"
                icon={<GithubIcon size={16} />}
                tooltip="GitHub source"
              />
            </Stack>
          </Stack>
        </Card>

        {uploadError ? (
          <Banner
            status="error"
            title="Upload error"
            description={uploadError}
            isDismissable
            onDismiss={() => setUploadError(null)}
          />
        ) : null}

        <ThemeBuilder
          schema={schema}
          values={values}
          onChange={setValues}
          onDataChange={(data) => setSchema((current) => ({ ...current, data }))}
          client={client}
          components={PREVIEW_COMPONENTS}
          pages={pageNames}
          activePage={currentActivePage}
          onPageChange={setActivePage}
          locale={language}
          languages={['en', 'it']}
        />
      </Stack>
    </Theme>
  );
}

