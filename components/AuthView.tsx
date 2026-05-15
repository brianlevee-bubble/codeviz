'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import type {
  AuthAnalysis, AuthProvider, AuthFeature, AuthProviderConfig,
  DetectedAuth, AuthRecommendation, AuthRoute, AuthIssue,
} from '@/lib/auth/types';
import {
  Loader2, AlertCircle, RefreshCw, KeyRound, ShieldCheck, ShieldAlert,
  Lock, Mail, Github, Globe, Smartphone, Database, Key, Users,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, AlertTriangle,
  Info, ExternalLink, Zap, Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FEATURE_CONFIG: Record<AuthFeature, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  email_password:    { label: 'Email & Password',   icon: Mail,       color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
  magic_link:        { label: 'Magic Link',         icon: Zap,        color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  oauth_google:      { label: 'Google OAuth',       icon: Globe,      color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
  oauth_github:      { label: 'GitHub OAuth',       icon: Github,     color: 'text-slate-700',  bg: 'bg-slate-50 border-slate-200' },
  oauth_microsoft:   { label: 'Microsoft OAuth',    icon: Globe,      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200' },
  oauth_apple:       { label: 'Apple Sign-In',      icon: Globe,      color: 'text-slate-800',  bg: 'bg-slate-50 border-slate-200' },
  oauth_other:       { label: 'Other OAuth',        icon: Globe,      color: 'text-slate-600',  bg: 'bg-slate-50 border-slate-200' },
  two_factor:        { label: '2FA / MFA',          icon: Smartphone, color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  session_jwt:       { label: 'JWT Sessions',       icon: Key,        color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  session_database:  { label: 'Database Sessions',  icon: Database,   color: 'text-green-600',  bg: 'bg-green-50 border-green-200' },
  role_based:        { label: 'Role-Based Access',  icon: Users,      color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
  api_key:           { label: 'API Keys',           icon: KeyRound,   color: 'text-orange-600', bg: 'bg-orange-50 border-orange-200' },
  webhook:           { label: 'Auth Webhooks',      icon: Zap,        color: 'text-teal-600',   bg: 'bg-teal-50 border-teal-200' },
};

const PROVIDER_ICONS: Record<AuthProvider, React.ElementType> = {
  nextauth: KeyRound, clerk: ShieldCheck, supabase: Database, firebase: Zap,
  lucia: Lock, authjs: KeyRound, custom: Settings, none: ShieldAlert,
};

const SEVERITY_CONFIG = {
  error:   { icon: XCircle,        color: 'text-red-600',    bg: 'bg-red-50 border-red-200' },
  warning: { icon: AlertTriangle,  color: 'text-amber-600',  bg: 'bg-amber-50 border-amber-200' },
  info:    { icon: Info,           color: 'text-blue-600',   bg: 'bg-blue-50 border-blue-200' },
};

const ROUTE_TYPE_LABEL: Record<string, string> = {
  login: 'Login', register: 'Register', callback: 'Callback', logout: 'Logout',
  verify: 'Verify', reset: 'Reset', api: 'API', middleware: 'Middleware',
};

const EFFORT_CONFIG = {
  low:    { label: 'Low effort',    color: 'text-green-600 bg-green-50 border-green-200' },
  medium: { label: 'Medium effort', color: 'text-amber-600 bg-amber-50 border-amber-200' },
  high:   { label: 'High effort',   color: 'text-red-600 bg-red-50 border-red-200' },
};

function FeatureChip({ feature, active }: { feature: AuthFeature; active?: boolean }) {
  const cfg = FEATURE_CONFIG[feature];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border',
      active ? cfg.bg + ' ' + cfg.color : 'bg-slate-50 border-slate-200 text-slate-400'
    )}>
      <Icon className="h-2.5 w-2.5" />
      {cfg.label}
    </span>
  );
}

function IssueCard({ issue }: { issue: AuthIssue }) {
  const [open, setOpen] = useState(false);
  const cfg = SEVERITY_CONFIG[issue.severity];
  const Icon = cfg.icon;
  return (
    <div className={cn('rounded-lg border overflow-hidden', cfg.bg)}>
      <button className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => setOpen(o => !o)}>
        <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', cfg.color)} />
        <div className="flex-1 min-w-0">
          <p className={cn('text-xs font-medium', cfg.color)}>{issue.message}</p>
          {issue.file && <p className="text-[9px] font-mono text-slate-400 mt-0.5">{issue.file}</p>}
        </div>
        {issue.fix && (
          open ? <ChevronDown className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
               : <ChevronRight className="h-3 w-3 text-slate-400 shrink-0 mt-0.5" />
        )}
      </button>
      {open && issue.fix && (
        <div className="px-3 pb-3">
          <p className="text-[10px] text-slate-600 bg-white/60 rounded-lg p-2 border border-white/50 leading-relaxed">
            {issue.fix}
          </p>
        </div>
      )}
    </div>
  );
}

function RouteCard({ route }: { route: AuthRoute }) {
  return (
    <div className="bg-white border border-slate-100 rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
          {ROUTE_TYPE_LABEL[route.type] ?? route.type}
        </span>
        <span className="text-xs font-mono font-semibold text-slate-800">{route.path}</span>
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{route.description}</p>
      <p className="text-[9px] font-mono text-slate-400 mt-0.5">{route.file}</p>
    </div>
  );
}

function ProviderCard({ provider, isDetected, isSelected, onClick }: {
  provider: AuthProviderConfig;
  isDetected: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const Icon = PROVIDER_ICONS[provider.provider] ?? KeyRound;
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors border',
        isSelected
          ? 'bg-blue-50 border-blue-200 text-blue-900'
          : 'bg-white border-slate-100 hover:border-slate-200 hover:bg-slate-50'
      )}
    >
      <div className="flex items-center gap-2">
        <Icon className={cn('h-3.5 w-3.5 shrink-0', isDetected ? 'text-green-500' : 'text-slate-400')} />
        <span className="text-xs font-semibold flex-1 truncate">{provider.label}</span>
        {isDetected && (
          <span className="text-[9px] text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full font-medium">
            Active
          </span>
        )}
      </div>
      <p className="text-[10px] text-slate-500 mt-1 ml-5">{provider.description}</p>
      <div className="flex gap-1 mt-1.5 ml-5 flex-wrap">
        {provider.features.slice(0, 4).map(f => (
          <FeatureChip key={f} feature={f} active />
        ))}
        {provider.features.length > 4 && (
          <span className="text-[9px] text-slate-400">+{provider.features.length - 4}</span>
        )}
      </div>
    </button>
  );
}

function RecommendationCard({ rec }: { rec: AuthRecommendation }) {
  const featureCfg = FEATURE_CONFIG[rec.feature];
  const Icon = featureCfg?.icon ?? Zap;
  const effortCfg = EFFORT_CONFIG[rec.effort];
  return (
    <div className={cn('rounded-lg border bg-white overflow-hidden px-3 py-2.5 border-slate-100')}>
      <div className="flex items-start gap-2.5">
        <Icon className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', featureCfg?.color ?? 'text-slate-500')} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-800">{rec.label}</span>
            <span className={cn('text-[9px] px-1.5 py-0.5 rounded-full border font-medium', effortCfg.color)}>
              {effortCfg.label}
            </span>
            {rec.priority === 'recommended' && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border font-medium text-blue-600 bg-blue-50 border-blue-200">
                Recommended
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 leading-relaxed">{rec.description}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PREFIX = 'codeviz_auth_v1_';
function getCached(dirPath: string): AuthAnalysis | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + btoa(dirPath)) ?? 'null'); } catch { return null; }
}
function setCached(dirPath: string, data: AuthAnalysis) {
  try { localStorage.setItem(CACHE_PREFIX + btoa(dirPath), JSON.stringify(data)); } catch { /* quota */ }
}
export function clearAuthCache(dirPath: string) {
  try { localStorage.removeItem(CACHE_PREFIX + btoa(dirPath)); } catch { /* ignore */ }
}

// ─── Main view ────────────────────────────────────────────────────────────────

type ViewMode = 'overview' | 'providers' | 'recommendations';

export function AuthView() {
  const { directoryPath } = useGraphStore();
  const [analysis, setAnalysis] = useState<AuthAnalysis | null>(null);
  const [loadPhase, setLoadPhase] = useState<'idle' | 'reading' | 'analyzing' | 'done' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tokenBuffer, setTokenBuffer] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [stepsOpen, setStepsOpen] = useState(false);
  const loadedForPath = useRef<string | null>(null);

  const load = useCallback(async (dirPath: string, force = false) => {
    if (!force) {
      const cached = getCached(dirPath);
      if (cached) {
        setAnalysis(cached);
        setLoadPhase('done');
        return;
      }
    }
    setLoadPhase('reading');
    setLoadError(null);
    setAnalysis(null);
    setTokenBuffer('');
    setSelectedProvider(null);

    const res = await fetch(`/api/auth-config?path=${encodeURIComponent(dirPath)}`);
    if (!res.ok || !res.body) { setLoadError('Failed to connect'); setLoadPhase('error'); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          if (ev.phase === 'reading' || ev.phase === 'chunking') setLoadPhase('reading');
          else if (ev.phase === 'analyzing') setLoadPhase('analyzing');
          else if (ev.phase === 'token') setTokenBuffer(t => t + ev.token);
          else if (ev.phase === 'complete') {
            const a = ev.analysis as AuthAnalysis;
            setCached(dirPath, a);
            setAnalysis(a);
            setLoadPhase('done');
            setTokenBuffer('');
          } else if (ev.phase === 'error') {
            setLoadError(ev.error);
            setLoadPhase('error');
          }
        } catch { /* skip */ }
      }
    }
  }, []);

  useEffect(() => {
    if (directoryPath && directoryPath !== loadedForPath.current) {
      loadedForPath.current = directoryPath;
      load(directoryPath);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  if (loadPhase === 'idle' || loadPhase === 'reading') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm">Reading codebase…</span>
        </div>
      </div>
    );
  }

  if (loadPhase === 'analyzing') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 max-w-sm w-full px-8">
          <KeyRound className="h-10 w-10 text-blue-400 animate-pulse" />
          <p className="text-sm text-slate-600 font-medium">Analyzing authentication setup…</p>
          {tokenBuffer && (
            <div className="w-full bg-slate-900 rounded-xl p-3 max-h-28 overflow-hidden relative">
              <pre className="text-[9px] text-slate-300 font-mono whitespace-pre-wrap break-all leading-relaxed">
                {tokenBuffer.slice(-600)}
              </pre>
              <div className="absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-slate-900 to-transparent" />
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loadPhase === 'error') {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500 max-w-sm text-center">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-sm">{loadError}</p>
          <Button variant="outline" size="sm" onClick={() => directoryPath && load(directoryPath)}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  const detected = analysis.detected;
  const hasAuth = detected && detected.provider !== 'none';
  const selectedProviderData = analysis.availableProviders.find(p => p.provider === selectedProvider);
  const errorCount = detected?.issues.filter(i => i.severity === 'error').length ?? 0;
  const warningCount = detected?.issues.filter(i => i.severity === 'warning').length ?? 0;

  return (
    <div className="flex-1 flex overflow-hidden bg-slate-50">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-hidden">

        <div className="px-4 py-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-900">Authentication</h2>
            </div>
            <Button size="sm" variant="ghost" onClick={() => directoryPath && load(directoryPath, true)}
              className="h-6 w-6 p-0 text-slate-400">
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>

          {/* Status card */}
          <div className={cn(
            'mt-2.5 rounded-lg px-3 py-2 border',
            hasAuth ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
          )}>
            <div className="flex items-center gap-2">
              {hasAuth
                ? <ShieldCheck className="h-4 w-4 text-green-600" />
                : <ShieldAlert className="h-4 w-4 text-amber-600" />
              }
              <div>
                <p className={cn('text-xs font-semibold', hasAuth ? 'text-green-800' : 'text-amber-800')}>
                  {detected?.label ?? 'No auth detected'}
                </p>
                {detected?.configFile && (
                  <p className="text-[9px] font-mono text-slate-400 mt-0.5">{detected.configFile}</p>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {hasAuth && detected && (
            <div className="flex gap-2 mt-2">
              <div className="flex-1 bg-blue-50 rounded-lg px-2 py-1.5 text-center">
                <p className="text-sm font-bold text-blue-700">{detected.features.length}</p>
                <p className="text-[9px] text-blue-500">features</p>
              </div>
              <div className="flex-1 bg-slate-50 rounded-lg px-2 py-1.5 text-center">
                <p className="text-sm font-bold text-slate-600">{detected.routes.length}</p>
                <p className="text-[9px] text-slate-400">routes</p>
              </div>
              {(errorCount + warningCount) > 0 && (
                <div className="flex-1 bg-amber-50 rounded-lg px-2 py-1.5 text-center">
                  <p className="text-sm font-bold text-amber-600">{errorCount + warningCount}</p>
                  <p className="text-[9px] text-amber-500">issues</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* View mode toggle */}
        <div className="flex border-b border-slate-100">
          {([
            { mode: 'overview' as ViewMode, label: 'Overview', icon: '🔍' },
            { mode: 'providers' as ViewMode, label: 'Providers', icon: '🔧' },
            { mode: 'recommendations' as ViewMode, label: 'Add', icon: '➕' },
          ]).map(({ mode, label, icon }) => (
            <button key={mode} onClick={() => setViewMode(mode)}
              className={cn(
                'flex-1 py-2 text-[10px] font-medium transition-colors',
                viewMode === mode
                  ? 'text-blue-600 border-b-2 border-blue-500 bg-blue-50/50'
                  : 'text-slate-500 hover:text-slate-700'
              )}>
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Sidebar content */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {viewMode === 'overview' && hasAuth && detected && (
            <>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
                Active Features ({detected.features.length})
              </p>
              <div className="space-y-1 px-1">
                {detected.features.map(f => (
                  <div key={f} className="flex items-center gap-2 py-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                    <FeatureChip feature={f} active />
                  </div>
                ))}
              </div>
              {detected.envVars.length > 0 && (
                <>
                  <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mt-3 mb-1">
                    Environment Variables
                  </p>
                  <div className="space-y-0.5 px-1">
                    {detected.envVars.map(v => (
                      <div key={v.name} className="flex items-center gap-2 py-0.5">
                        {v.set
                          ? <CheckCircle2 className="h-2.5 w-2.5 text-green-500 shrink-0" />
                          : <XCircle className="h-2.5 w-2.5 text-red-400 shrink-0" />
                        }
                        <span className="text-[10px] font-mono text-slate-600 truncate">{v.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {viewMode === 'overview' && !hasAuth && (
            <div className="px-3 py-6 text-center">
              <ShieldAlert className="h-8 w-8 text-amber-400 mx-auto mb-2" />
              <p className="text-xs text-slate-600 font-medium">No authentication detected</p>
              <p className="text-[10px] text-slate-400 mt-1">
                Switch to the Providers tab to set up auth, or check Recommendations for suggestions.
              </p>
            </div>
          )}

          {viewMode === 'providers' && (
            <>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
                Available Providers ({analysis.availableProviders.length})
              </p>
              {analysis.availableProviders.map(p => (
                <ProviderCard
                  key={p.provider}
                  provider={p}
                  isDetected={hasAuth && detected?.provider === p.provider}
                  isSelected={selectedProvider === p.provider}
                  onClick={() => setSelectedProvider(p.provider)}
                />
              ))}
            </>
          )}

          {viewMode === 'recommendations' && (
            <>
              <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wide px-1 mb-1">
                Recommendations ({analysis.recommendations.length})
              </p>
              {analysis.recommendations.length === 0 && (
                <p className="text-[10px] text-slate-400 text-center py-4">No recommendations at this time.</p>
              )}
              {analysis.recommendations.map(rec => (
                <RecommendationCard key={rec.id} rec={rec} />
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Main panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Overview: routes + issues */}
        {viewMode === 'overview' && (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                {hasAuth
                  ? <ShieldCheck className="h-5 w-5 text-green-500" />
                  : <ShieldAlert className="h-5 w-5 text-amber-500" />
                }
                <h2 className="text-base font-semibold text-slate-900">
                  {hasAuth ? 'Auth Configuration' : 'Set Up Authentication'}
                </h2>
              </div>
              {hasAuth && detected && (
                <p className="text-sm text-slate-500 mt-1">
                  Using {detected.label} with {detected.features.length} feature{detected.features.length !== 1 ? 's' : ''} across {detected.routes.length} route{detected.routes.length !== 1 ? 's' : ''}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl space-y-6">

                {/* Issues */}
                {detected && detected.issues.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Issues ({detected.issues.length})
                    </h3>
                    <div className="space-y-1.5">
                      {detected.issues.map((issue, i) => <IssueCard key={i} issue={issue} />)}
                    </div>
                  </div>
                )}

                {/* Auth routes */}
                {detected && detected.routes.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Auth Routes ({detected.routes.length})
                    </h3>
                    <div className="space-y-1.5">
                      {detected.routes.map((route, i) => <RouteCard key={i} route={route} />)}
                    </div>
                  </div>
                )}

                {/* Active features grid */}
                {detected && detected.features.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Active Features
                    </h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {detected.features.map(f => {
                        const cfg = FEATURE_CONFIG[f];
                        if (!cfg) return null;
                        const Icon = cfg.icon;
                        return (
                          <div key={f} className={cn('rounded-xl border p-3 flex items-center gap-2.5', cfg.bg)}>
                            <Icon className={cn('h-4 w-4 shrink-0', cfg.color)} />
                            <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* No auth: show getting started */}
                {!hasAuth && (
                  <div className="text-center py-8">
                    <ShieldAlert className="h-12 w-12 text-amber-300 mx-auto mb-3" />
                    <h3 className="text-base font-semibold text-slate-800">No Authentication Found</h3>
                    <p className="text-sm text-slate-500 mt-2 max-w-md mx-auto">
                      This project doesn&apos;t have authentication set up yet.
                      Browse available providers in the Providers tab, or check the Recommendations tab for suggestions.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Providers: detail panel */}
        {viewMode === 'providers' && selectedProviderData && (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                {(() => { const Icon = PROVIDER_ICONS[selectedProviderData.provider] ?? KeyRound; return <Icon className="h-5 w-5 text-blue-600" />; })()}
                <div>
                  <h2 className="text-base font-semibold text-slate-900">{selectedProviderData.label}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">{selectedProviderData.description}</p>
                </div>
                {hasAuth && detected?.provider === selectedProviderData.provider && (
                  <span className="text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full font-medium ml-auto">
                    Currently Active
                  </span>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl space-y-6">

                {/* Features */}
                <div>
                  <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                    Supported Features
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProviderData.features.map(f => (
                      <FeatureChip key={f} feature={f} active />
                    ))}
                  </div>
                </div>

                {/* Env vars */}
                {selectedProviderData.envVars.length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Required Environment Variables
                    </h3>
                    <div className="bg-slate-900 rounded-xl p-3">
                      {selectedProviderData.envVars.map(v => {
                        const isSet = detected?.envVars.find(ev => ev.name === v)?.set;
                        return (
                          <div key={v} className="flex items-center gap-2 py-0.5">
                            {isSet
                              ? <CheckCircle2 className="h-3 w-3 text-green-400 shrink-0" />
                              : <XCircle className="h-3 w-3 text-red-400 shrink-0" />
                            }
                            <span className="text-xs font-mono text-slate-300">{v}</span>
                            {isSet && <span className="text-[9px] text-green-400">set</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Config file */}
                {selectedProviderData.configFile && (
                  <div>
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                      Config File
                    </h3>
                    <div className="bg-white border border-slate-100 rounded-lg px-3 py-2">
                      <span className="text-xs font-mono text-slate-600">{selectedProviderData.configFile}</span>
                    </div>
                  </div>
                )}

                {/* Setup steps */}
                {selectedProviderData.setupSteps.length > 0 && (
                  <div>
                    <button
                      onClick={() => setStepsOpen(o => !o)}
                      className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 hover:text-slate-700 transition-colors"
                    >
                      {stepsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                      Setup Steps ({selectedProviderData.setupSteps.length})
                    </button>
                    {stepsOpen && (
                      <div className="space-y-2">
                        {selectedProviderData.setupSteps.map((step, i) => (
                          <div key={i} className="flex items-start gap-3 bg-white border border-slate-100 rounded-lg px-3 py-2.5">
                            <span className="text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <p className="text-xs text-slate-700 leading-relaxed">{step}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {viewMode === 'providers' && !selectedProviderData && (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-slate-400">Select a provider on the left to see details.</p>
          </div>
        )}

        {/* Recommendations detail */}
        {viewMode === 'recommendations' && (
          <>
            <div className="bg-white border-b border-slate-200 px-6 py-4 shrink-0">
              <div className="flex items-center gap-2.5">
                <Zap className="h-5 w-5 text-amber-500" />
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Auth Recommendations</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Suggested improvements for your authentication setup
                  </p>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl space-y-6">
                {['recommended', 'optional', 'advanced'].map(priority => {
                  const recs = analysis.recommendations.filter(r => r.priority === priority);
                  if (recs.length === 0) return null;
                  return (
                    <div key={priority}>
                      <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                        {priority === 'recommended' ? 'Recommended' : priority === 'optional' ? 'Optional' : 'Advanced'} ({recs.length})
                      </h3>
                      <div className="space-y-1.5">
                        {recs.map(rec => <RecommendationCard key={rec.id} rec={rec} />)}
                      </div>
                    </div>
                  );
                })}
                {analysis.recommendations.length === 0 && (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-10 w-10 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-slate-600 font-medium">Looking good!</p>
                    <p className="text-xs text-slate-400 mt-1">No additional auth recommendations at this time.</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
