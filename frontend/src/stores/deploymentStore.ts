/**
 * Store for managing deployment state.
 * Persists deployment progress across modal opens/closes.
 */
import { create } from 'zustand';

export interface DeploymentStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
}

export interface DeploymentStatus {
  id: string;
  status: 'starting' | 'creating_agent' | 'deploying' | 'completed' | 'failed' | 'cancelled' | 'cancelling';
  type: 'quick' | 'full';
  started_at: string;
  completed_at?: string;
  steps: DeploymentStep[];
  current_step: number;
  error?: string;
  error_trace?: string;
  result?: {
    endpoint_name: string;
    model_name: string;
    message: string;
  };
}

interface DeploymentState {
  // Deployment tracking
  deploymentId: string | null;
  deploymentStatus: DeploymentStatus | null;
  isDeploying: boolean;
  isCancelling: boolean;
  selectedOption: 'quick' | 'full';
  
  // Error state
  error: string | null;
  
  // Actions
  startDeployment: (type: 'quick' | 'full') => DeploymentStatus;
  setDeploymentId: (id: string) => void;
  setDeploymentStatus: (status: DeploymentStatus) => void;
  setError: (error: string) => void;
  completeDeployment: () => void;
  failDeployment: (error: string, errorTrace?: string) => void;
  setCancelling: () => void;
  cancelDeployment: () => void;
  reset: () => void;
  canStartNewDeployment: () => boolean;
}

export const useDeploymentStore = create<DeploymentState>((set, get) => ({
  deploymentId: null,
  deploymentStatus: null,
  isDeploying: false,
  isCancelling: false,
  selectedOption: 'quick',
  error: null,

  startDeployment: (type) => {
    console.log('[DeploymentStore] startDeployment called:', type);
    
    const initialStatus: DeploymentStatus = {
      id: 'pending',
      status: 'starting',
      type,
      started_at: new Date().toISOString(),
      steps: [
        { name: 'validate', status: 'running' },
        { name: 'create_agent', status: 'pending' },
        { name: 'deploy_agent', status: 'pending' },
      ],
      current_step: 0,
    };
    
    // Ensure we're starting fresh - clear any stale cancelling state
    set({
      isDeploying: true,
      isCancelling: false,  // Clear any stale cancelling state
      selectedOption: type,
      deploymentStatus: initialStatus,
      deploymentId: null,   // Clear old deployment ID until we get the new one
      error: null,
    });
    
    console.log('[DeploymentStore] startDeployment complete, waiting for deployment ID');
    
    return initialStatus;
  },

  setDeploymentId: (id) => {
    console.log('[DeploymentStore] setDeploymentId:', id);
    set({ deploymentId: id });
  },

  setDeploymentStatus: (status) => {
    const currentState = get();
    
    console.log('[DeploymentStore] setDeploymentStatus called:', {
      incomingStatus: status.status,
      incomingId: status.id,
      currentIsCancelling: currentState.isCancelling,
      currentIsDeploying: currentState.isDeploying,
      currentDeploymentId: currentState.deploymentId,
      currentStatus: currentState.deploymentStatus?.status,
    });
    
    // IMPORTANT: Only process status updates for the CURRENT deployment
    // If we don't have a current deployment, ignore all updates (prevents stale updates after reset)
    if (!currentState.deploymentId) {
      console.log('[DeploymentStore] Ignoring status update - no current deployment');
      return;
    }
    
    // Ignore stale status updates from old deployments
    if (status.id !== currentState.deploymentId) {
      console.log('[DeploymentStore] Ignoring stale status update for old deployment:', status.id);
      return;
    }
    
    // Determine the new state atomically based on the incoming status
    const isTerminalStatus = status.status === 'completed' || status.status === 'failed' || status.status === 'cancelled';
    const isActiveStatus = status.status === 'starting' || status.status === 'creating_agent' || status.status === 'deploying';
    
    // If we're cancelling and the backend returns an active status, 
    // keep showing 'cancelling' in the UI but update the steps
    if (currentState.isCancelling && isActiveStatus) {
      console.log('[DeploymentStore] Keeping cancelling status, backend still active');
      // Keep cancelling status but update steps so we can see progress
      // Use a single atomic set() to avoid any race conditions
      set({ 
        deploymentStatus: {
          ...status,
          status: 'cancelling', // Keep showing cancelling
        },
        isDeploying: true,
        // isCancelling remains true
      });
      return;
    }
    
    // For terminal statuses, update everything atomically
    if (isTerminalStatus) {
      console.log('[DeploymentStore] Deployment ended, resetting flags');
      set({ 
        deploymentStatus: status,
        isDeploying: false, 
        isCancelling: false 
      });
      return;
    }
    
    // For active statuses (when not cancelling)
    if (isActiveStatus) {
      console.log('[DeploymentStore] Active deployment, setting isDeploying: true');
      set({ 
        deploymentStatus: status,
        isDeploying: true 
      });
      return;
    }
    
    // Fallback for any other status
    console.log('[DeploymentStore] Unknown status, just updating deploymentStatus');
    set({ deploymentStatus: status });
  },

  setError: (error) => {
    set({ error, isDeploying: false });
  },

  completeDeployment: () => {
    set({ isDeploying: false });
  },

  failDeployment: (error, errorTrace) => {
    set((state) => ({
      isDeploying: false,
      error,
      deploymentStatus: state.deploymentStatus ? {
        ...state.deploymentStatus,
        status: 'failed',
        error,
        error_trace: errorTrace,
        steps: state.deploymentStatus.steps.map((step, idx) => 
          idx === state.deploymentStatus!.current_step 
            ? { ...step, status: 'failed', error } 
            : step
        ),
      } : null,
    }));
  },

  setCancelling: () => {
    const currentState = get();
    console.log('[DeploymentStore] setCancelling called:', {
      deploymentId: currentState.deploymentId,
      currentStatus: currentState.deploymentStatus?.status,
    });
    set((state) => ({
      isCancelling: true,
      deploymentStatus: state.deploymentStatus ? {
        ...state.deploymentStatus,
        status: 'cancelling',
      } : null,
    }));
  },

  cancelDeployment: () => {
    const currentState = get();
    console.log('[DeploymentStore] cancelDeployment called:', {
      deploymentId: currentState.deploymentId,
      currentStatus: currentState.deploymentStatus?.status,
    });
    set((state) => ({
      isDeploying: false,
      isCancelling: false,
      deploymentStatus: state.deploymentStatus ? {
        ...state.deploymentStatus,
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        steps: state.deploymentStatus.steps.map((step, idx) => 
          idx === state.deploymentStatus!.current_step 
            ? { ...step, status: 'failed', error: 'Cancelled by user' } 
            : step
        ),
      } : null,
    }));
  },

  reset: () => {
    const currentState = get();
    console.log('[DeploymentStore] reset called:', {
      isDeploying: currentState.isDeploying,
      isCancelling: currentState.isCancelling,
      deploymentId: currentState.deploymentId,
      status: currentState.deploymentStatus?.status,
    });
    
    // Only block reset if actively deploying (not in a terminal state)
    // Allow reset if:
    // - not deploying at all
    // - deployment is in a terminal state (completed/failed/cancelled)
    const isTerminal = currentState.deploymentStatus?.status === 'completed' || 
                       currentState.deploymentStatus?.status === 'failed' || 
                       currentState.deploymentStatus?.status === 'cancelled';
    
    if (currentState.isDeploying && !isTerminal) {
      console.log('[DeploymentStore] reset blocked - still actively deploying');
      return;
    }
    
    console.log('[DeploymentStore] reset proceeding');
    set({
      deploymentId: null,
      deploymentStatus: null,
      isDeploying: false,
      isCancelling: false,
      error: null,
    });
  },

  canStartNewDeployment: () => {
    const state = get();
    // Can start new deployment if:
    // 1. Not currently deploying or cancelling
    // 2. No existing deployment OR existing deployment is complete/failed/cancelled
    if (state.isDeploying || state.isCancelling) return false;
    if (!state.deploymentStatus) return true;
    return state.deploymentStatus.status === 'completed' || state.deploymentStatus.status === 'failed' || state.deploymentStatus.status === 'cancelled';
  },
}));

