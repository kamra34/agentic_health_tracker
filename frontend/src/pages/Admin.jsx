import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, weightAPI } from '../services/api';
import { RefreshCw, Users, Database, Target } from 'lucide-react';

function Admin() {
  const queryClient = useQueryClient();
  const { data: dashboard } = useQuery({
    queryKey: ['dashboard'],
    queryFn: async () => (await userAPI.getDashboard()).data,
  });

  const backfillMutation = useMutation({
    mutationFn: (overwrite) => weightAPI.backfillEstimates(overwrite),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard']);
      queryClient.invalidateQueries(['weights']);
    },
  });

  const user = dashboard?.user;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Admin Tools</h1>
        <p className="text-gray-600 mt-1">Manage your data and utilities. (More controls can be added later.)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Account</h2>
          </div>
          <p className="text-sm text-gray-600">User: <strong>{user?.name}</strong> {user?.is_admin && <span className="ml-2">(Admin)</span>}</p>
          <p className="text-sm text-gray-600">Email: <strong>{user?.email || '—'}</strong></p>
          <p className="text-sm text-gray-600">Height: <strong>{user?.height || '—'} cm</strong></p>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Database className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Data Maintenance</h2>
          </div>
          <div className="space-y-2">
            <button
              onClick={() => backfillMutation.mutate(true)}
              className="btn btn-primary flex items-center gap-2"
              disabled={backfillMutation.isPending}
            >
              <RefreshCw className="w-4 h-4" /> {backfillMutation.isPending ? 'Recomputing...' : 'Recompute estimates (current user)'}
            </button>
            <p className="text-xs text-gray-500">Recalculates body fat% and lean mass for all your entries.</p>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Target className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Shortcuts</h2>
          </div>
          <div className="flex gap-2">
            <a className="btn btn-secondary" href="/weights">Weights</a>
            <a className="btn btn-secondary" href="/targets">Targets</a>
            <a className="btn btn-secondary" href="/profile">Profile</a>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Admin;

