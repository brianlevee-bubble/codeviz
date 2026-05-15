'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useGraphStore } from '@/lib/store/graph-store';
import { useApplyChanges } from '@/lib/hooks/use-apply-changes';
import { AnalysisProgress } from '@/components/AnalysisProgress';
import { FlowToolbar } from '@/components/canvas/FlowToolbar';
import { FlowSidebar } from '@/components/canvas/FlowSidebar';
import { SchemaView } from '@/components/SchemaView';
import { DataView } from '@/components/DataView';
import { UIFlowView } from '@/components/UIFlowView';
import { TestsView } from '@/components/TestsView';
import { FeaturesView } from '@/components/FeaturesView';
import { PreviewTab } from '@/components/PreviewTab';
import { QueriesView } from '@/components/QueriesView';
import { SecurityView } from '@/components/SecurityView';
import { ImprovementsView } from '@/components/ImprovementsView';
import { ApiContractsView } from '@/components/ApiContractsView';
import { DeadCodeView } from '@/components/DeadCodeView';
import { VisualEditorView } from '@/components/VisualEditorView';
import { AgentsView } from '@/components/AgentsView';
import { IntegrationsView } from '@/components/IntegrationsView';
import { PaymentsView } from '@/components/PaymentsView';
import { WorkflowsView } from '@/components/WorkflowsView';
import { BackendWorkflowsView } from '@/components/BackendWorkflowsView';
import WorkflowTimeline from '@/components/WorkflowTimeline';
import { RolesView } from '@/components/RolesView';
import { StateInspectorView } from '@/components/StateInspectorView';
import { PagesGalleryView } from '@/components/PagesGalleryView';
const DataFlowPrimerView = dynamic(() => import('@/components/DataFlowPrimerView'), { ssr: false });
import { getCachedAnalysis, clearCachedAnalysis } from '@/lib/analysis-cache';
import { analyzeAll, clearAllTabCaches, type AnalysisId, type AnalysisStatus } from '@/lib/analyze-all';

// React Flow must be client-side only
const FlowCanvas = dynamic(
  () => import('./canvas/FlowCanvas').then((m) => ({ default: m.FlowCanvas })),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
        Loading canvas...
      </div>
    ),
  }
);

interface Props {
  directoryPath: string;
}

export function CanvasLayout({ directoryPath }: Props) {
  const { graphData, analysisPhase, activeTab, tabProgress, setTabProgress, setGraphData, setDirectoryPath, reset } =
    useGraphStore();
  const { apply, status: applyStatus, error: applyError } = useApplyChanges();

  const [showAnalysis, setShowAnalysis] = useState<boolean | null>(null);

  useEffect(() => {
    setDirectoryPath(directoryPath);
    const cached = getCachedAnalysis(directoryPath);
    if (cached) {
      setGraphData(cached.graphData);
      setShowAnalysis(false);
      analyzeAll(directoryPath, (id: AnalysisId, status: AnalysisStatus) => {
        setTabProgress(id, status);
      });
    } else {
      setShowAnalysis(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directoryPath]);

  function handleAnalysisComplete() {
    setShowAnalysis(false);
    analyzeAll(directoryPath, (id: AnalysisId, status: AnalysisStatus) => {
      setTabProgress(id, status);
    });
  }

  function handleReanalyze() {
    clearCachedAnalysis(directoryPath);
    clearAllTabCaches(directoryPath);
    reset();
    setDirectoryPath(directoryPath);
    setShowAnalysis(true);
    analyzeAll(directoryPath, (id: AnalysisId, status: AnalysisStatus) => {
      setTabProgress(id, status);
    });
  }

  if (showAnalysis === null) return null;

  const showingProgress = showAnalysis && analysisPhase !== 'complete';
  const isDiagramTab = ['architecture', 'dataFlow', 'stateMachine', 'permissions'].includes(activeTab);

  function renderMainContent() {
    if (showingProgress) {
      return (
        <AnalysisProgress
          directoryPath={directoryPath}
          onComplete={handleAnalysisComplete}
        />
      );
    }

    if (activeTab === 'data-flow-primer') return <DataFlowPrimerView />;
    if (activeTab === 'schema') return <SchemaView />;
    if (activeTab === 'data') return <DataView />;
    if (activeTab === 'ui') return <UIFlowView />;
    if (activeTab === 'tests') return <TestsView />;
    if (activeTab === 'features') return <FeaturesView />;
    if (activeTab === 'preview') return <PreviewTab />;
    if (activeTab === 'pages-gallery') return <PagesGalleryView />;
    if (activeTab === 'queries') return <QueriesView />;
    if (activeTab === 'security') return <SecurityView />;
    if (activeTab === 'roles') return <RolesView />;
    if (activeTab === 'improvements') return <ImprovementsView />;
    if (activeTab === 'api-contracts') return <ApiContractsView />;
    if (activeTab === 'dead-code') return <DeadCodeView />;
    if (activeTab === 'visual-editor') return <VisualEditorView />;
    if (activeTab === 'state-inspector') return <StateInspectorView />;
    if (activeTab === 'agents') return <AgentsView />;
    if (activeTab === 'integrations') return <IntegrationsView />;
    if (activeTab === 'payments') return <PaymentsView />;
    if (activeTab === 'workflows') return <WorkflowsView />;
    if (activeTab === 'backend-workflows') return <BackendWorkflowsView />;
    if (activeTab === 'timeline') return <WorkflowTimeline />;

    return (
      <>
        <FlowCanvas />
        {isDiagramTab && <FlowSidebar />}
      </>
    );
  }

  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <FlowToolbar
        onApplyChanges={apply}
        onReanalyze={handleReanalyze}
        directoryPath={directoryPath}
        applyStatus={applyStatus}
        applyError={applyError}
        tabProgress={tabProgress}
      />

      <div className="flex-1 flex overflow-hidden">
        {renderMainContent()}
      </div>
    </div>
  );
}
