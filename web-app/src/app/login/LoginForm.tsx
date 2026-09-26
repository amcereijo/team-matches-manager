'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import type { ClubType, Competition } from '@/types';
import { getItem, removeItem, setItem } from '@/services/storage';
import styles from './login.module.css';

type Step = 'competition' | 'team' | 'credentials';
type StepIndex = 0 | 1 | 2;

const KEY_COMPETITION = 'selectedCompetition';
const KEY_CLUB = 'selectedClub';

const STEP_META: { label: string; title: string; hint: string }[] = [
  {
    label: 'Competición',
    title: 'Selecciona la competición',
    hint: 'Cada club está ligado a una federación. Empieza por aquí.',
  },
  {
    label: 'Club',
    title: 'Selecciona tu club',
    hint: 'Solo verás los clubes de la competición elegida.',
  },
  {
    label: 'Credenciales',
    title: 'Introduce tus credenciales',
    hint: 'Tu usuario y contraseña son únicos por club.',
  },
];

function stepIndex(step: Step): StepIndex {
  return step === 'competition' ? 0 : step === 'team' ? 1 : 2;
}

function safeParseClub(raw: string | null): ClubType | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ClubType;
    if (typeof parsed.code === 'number' && typeof parsed.name === 'string') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function LoginForm({
  competitions,
  clubs,
}: {
  competitions: Competition[];
  clubs: ClubType[];
}) {
  const router = useRouter();

  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>('competition');

  const [competition, setCompetition] = useState<Competition | null>(null);
  const [club, setClub] = useState<ClubType | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  // Club combobox state
  const [clubOpen, setClubOpen] = useState(false);
  const [clubFilter, setClubFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    (async () => {
      const compId = await getItem(KEY_COMPETITION);
      const comp =
        competitions.find((c) => c.id === compId) ?? null;
      setCompetition(comp);

      const stored = safeParseClub(await getItem(KEY_CLUB));
      if (stored && comp && stored.competition === comp.id) {
        setClub(stored);
        setStep('credentials');
      } else if (comp) {
        setClub(null);
        setStep('team');
      } else {
        setClub(null);
        setStep('competition');
      }
      setHydrated(true);
    })();
  }, [competitions]);

  const availableClubs = useMemo(() => {
    if (!competition) return clubs;
    return clubs.filter((c) => c.competition === competition.id);
  }, [clubs, competition]);

  const filteredClubs = useMemo(() => {
    const q = clubFilter.trim().toLowerCase();
    if (!q) return availableClubs;
    return availableClubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || String(c.code).includes(q),
    );
  }, [availableClubs, clubFilter]);

  useEffect(() => {
    setActiveIndex(0);
  }, [clubFilter]);

  useEffect(() => {
    if (step !== 'team') {
      setClubOpen(false);
      setClubFilter('');
    }
  }, [step]);

  async function pickCompetition(next: Competition) {
    setCompetition(next);
    await setItem(KEY_COMPETITION, next.id);
    if (club && club.competition !== next.id) {
      setClub(null);
      await removeItem(KEY_CLUB);
    }
    setStep('team');
  }

  async function clearCompetition() {
    await removeItem(KEY_COMPETITION);
    setCompetition(null);
    setClub(null);
    await removeItem(KEY_CLUB);
    setStep('competition');
  }

  async function pickClub(next: ClubType) {
    setClub(next);
    await setItem(KEY_CLUB, JSON.stringify(next));
    setUsername('');
    setPassword('');
    setError('');
    setStep('credentials');
  }

  async function clearClub() {
    await removeItem(KEY_CLUB);
    setClub(null);
    setUsername('');
    setPassword('');
    setError('');
    setStep(competition ? 'team' : 'competition');
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setPending(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Invalid username or password');
        setPending(false);
        return;
      }
      router.replace('/');
      router.refresh();
    } catch (err) {
      console.error(err);
      setError('No se pudo conectar con el servidor');
      setPending(false);
    }
  }

  if (!hydrated) {
    return (
      <div className={styles.shell} aria-hidden>
        <div className={styles.skeleton} />
      </div>
    );
  }

  const current = stepIndex(step);
  const meta = STEP_META[current];

  return (
    <div className={styles.shell}>
      <div className={styles.brand}>
        <div className={styles.brandMark}>T</div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>Team Matches Manager</span>
          <span className={styles.brandTag}>Acceso de club</span>
        </div>
      </div>

      <div>
        <h1 className={styles.title}>Bienvenido</h1>
        <p className={styles.subtitle}>
          Sigue los tres pasos para entrar al panel de tu club.
        </p>
      </div>

      <Stepper current={current} />

      {(competition || club) && (
        <div className={styles.summary}>
          <span className={styles.summaryTitle}>Tu selección</span>
          <div className={styles.summaryList}>
            {competition && (
              <SummaryItem
                icon="🏆"
                label="Competición"
                value={competition.name}
                onRemove={clearCompetition}
                removeLabel="Cambiar competición"
              />
            )}
            {club && (
              <SummaryItem
                icon="🛡"
                label="Club"
                value={club.name}
                onRemove={clearClub}
                removeLabel="Cambiar club"
              />
            )}
          </div>
        </div>
      )}

      <div className={styles.stepBody}>
        <div className={styles.stepHeader}>
          <span className={styles.stepTitle}>
            {current + 1}. {meta.title}
          </span>
        </div>

        {step === 'competition' && (
          <>
            <p className={styles.stepHint}>{meta.hint}</p>
            <div className={`${styles.optionList} ${styles.optionListSingle}`}>
              {competitions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`${styles.option} ${
                    competition?.id === c.id ? styles.selected : ''
                  }`}
                  onClick={() => pickCompetition(c)}
                >
                  <span className={styles.optionRadio} aria-hidden />
                  <span className={styles.optionMain}>
                    <span className={styles.optionName}>{c.name}</span>
                    <span className={styles.optionMeta}>
                      {countClubsFor(clubs, c.id)} clubes disponibles
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 'team' && competition && (
          <>
            <p className={styles.stepHint}>{meta.hint}</p>
            <ClubCombobox
              clubs={availableClubs}
              selected={club}
              open={clubOpen}
              setOpen={setClubOpen}
              filter={clubFilter}
              setFilter={setClubFilter}
              activeIndex={activeIndex}
              setActiveIndex={setActiveIndex}
              onSelect={pickClub}
            />
          </>
        )}

        {step === 'credentials' && club && (
          <form onSubmit={submit} className={styles.credentialsForm}>
            <p className={styles.stepHint}>{meta.hint}</p>
            <input
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuario"
              autoComplete="username"
              autoFocus
            />
            <input
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Contraseña"
              type="password"
              autoComplete="current-password"
            />
            <button className={styles.button} type="submit" disabled={pending}>
              {pending ? 'Entrando…' : 'Entrar'}
            </button>
            {error && (
              <div className={styles.error} role="alert">
                {error}
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function countClubsFor(clubs: ClubType[], competitionId: string): number {
  return clubs.filter((c) => c.competition === competitionId).length;
}

function SummaryItem({
  icon,
  label,
  value,
  onRemove,
  removeLabel,
}: {
  icon: string;
  label: string;
  value: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className={styles.summaryItem}>
      <span className={styles.summaryIcon} aria-hidden>
        {icon}
      </span>
      <div className={styles.summaryMain}>
        <span className={styles.summaryLabel}>{label}</span>
        <span className={styles.summaryValue}>{value}</span>
      </div>
      <button
        type="button"
        className={styles.summaryRemove}
        onClick={onRemove}
        aria-label={removeLabel}
      >
        Cambiar
      </button>
    </div>
  );
}

function Stepper({ current }: { current: StepIndex }) {
  return (
    <div className={styles.stepper} role="list">
      {STEP_META.map((s, i) => {
        const status = i < current ? 'done' : i === current ? 'active' : 'pending';
        return (
          <div
            key={s.label}
            role="listitem"
            className={`${styles.stepperItem} ${
              status === 'active' ? styles.active : ''
            } ${status === 'done' ? styles.done : ''}`}
            aria-current={status === 'active' ? 'step' : undefined}
          >
            <span className={styles.stepperIndex} aria-hidden>
              <span>{i + 1}</span>
            </span>
            <span>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function ClubCombobox({
  clubs,
  selected,
  open,
  setOpen,
  filter,
  setFilter,
  activeIndex,
  setActiveIndex,
  onSelect,
}: {
  clubs: ClubType[];
  selected: ClubType | null;
  open: boolean;
  setOpen: (v: boolean) => void;
  filter: string;
  setFilter: (v: string) => void;
  activeIndex: number;
  setActiveIndex: (n: number) => void;
  onSelect: (c: ClubType) => void | Promise<void>;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return clubs;
    return clubs.filter(
      (c) =>
        c.name.toLowerCase().includes(q) || String(c.code).includes(q),
    );
  }, [clubs, filter]);

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 10);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!open) return;
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  const choose = useCallback(
    async (c: ClubType) => {
      await onSelect(c);
      setOpen(false);
      setFilter('');
    },
    [onSelect, setOpen, setFilter],
  );

  function onTriggerKey(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  }

  function onSearchKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(Math.min(filtered.length - 1, activeIndex + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(Math.max(0, activeIndex - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = filtered[activeIndex];
      if (c) void choose(c);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  return (
    <div className={`${styles.combobox} ${open ? styles.open : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.comboboxTrigger}
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span
          className={`${styles.comboboxTriggerValue} ${
            selected ? '' : styles.placeholder
          }`}
        >
          {selected ? selected.name : 'Selecciona tu club'}
        </span>
        {selected && (
          <span className={styles.comboboxTriggerMeta}>· {selected.code}</span>
        )}
      </button>
      <svg
        className={styles.comboboxChevron}
        viewBox="0 0 12 8"
        aria-hidden
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M1 1.5l5 5 5-5" />
      </svg>

      {open && (
        <div ref={panelRef} className={styles.comboboxPanel}>
          <div className={styles.comboboxSearch}>
            <svg
              className={styles.comboboxSearchIcon}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              ref={searchRef}
              className={styles.comboboxSearchInput}
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              onKeyDown={onSearchKey}
              placeholder={`Buscar entre ${clubs.length} clubes…`}
              aria-label="Buscar club"
              aria-controls="club-options"
              aria-activedescendant={
                filtered[activeIndex]
                  ? `club-opt-${filtered[activeIndex].code}`
                  : undefined
              }
            />
          </div>

          {filtered.length === 0 ? (
            <div className={styles.comboboxEmpty}>
              <strong>Sin coincidencias</strong>
              <span>Prueba con otro nombre o código.</span>
            </div>
          ) : (
            <div
              className={styles.comboboxOptions}
              role="listbox"
              id="club-options"
            >
              {filtered.map((c, i) => {
                const isSelected = selected?.code === c.code;
                const isActive = i === activeIndex;
                return (
                  <button
                    key={c.code}
                    id={`club-opt-${c.code}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    className={`${styles.comboboxOption} ${
                      isSelected ? styles.selected : ''
                    } ${isActive ? styles.active : ''}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => void choose(c)}
                  >
                    <span className={styles.comboboxOptionMain}>
                      <span className={styles.comboboxOptionName}>{c.name}</span>
                      <span className={styles.comboboxOptionMeta}>
                        Código {c.code}
                      </span>
                    </span>
                    {isSelected && (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.comboboxFoot}>
            <span>{filtered.length} resultados</span>
            <span>↑ ↓ para moverte · ↵ para seleccionar</span>
          </div>
        </div>
      )}
    </div>
  );
}
