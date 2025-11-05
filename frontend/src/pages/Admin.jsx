import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, weightAPI, adminAPI } from '../services/api';
import { RefreshCw, Users, Database, Target, Shield } from 'lucide-react';

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

  // Users list
  const { data: usersData, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => (await adminAPI.listUsers()).data,
  });

  const setAdminMutation = useMutation({
    mutationFn: ({ userId, isAdmin }) => adminAPI.setAdmin(userId, isAdmin),
    onSuccess: () => {
      refetchUsers();
      queryClient.invalidateQueries(['dashboard']);
    },
  });

  const deleteTargetMutation = useMutation({
    mutationFn: (targetId) => adminAPI.deleteTarget(targetId),
    onSuccess: () => {
      queryClient.invalidateQueries(['dashboard']);
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Admin Tools</h1>
        <p className="text-gray-600 mt-1">Manage your data and utilities. (More controls can be added later.)</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Users management */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">Users</h2>
          </div>
          {!usersData ? (
            <p className="text-sm text-gray-500">Loading users...</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="text-left py-2 pr-2">ID</th>
                    <th className="text-left py-2 pr-2">Name</th>
                    <th className="text-left py-2 pr-2">Email</th>
                    <th className="text-left py-2 pr-2">Admin</th>
                    <th className="text-right py-2 pl-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.map(u => (
                    <tr key={u.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2">{u.id}</td>
                      <td className="py-2 pr-2">{u.name}</td>
                      <td className="py-2 pr-2">{u.email || '—'}</td>
                      <td className="py-2 pr-2">{u.is_admin ? 'Yes' : 'No'}</td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={() => setAdminMutation.mutate({ userId: u.id, isAdmin: !u.is_admin })}
                          className="btn btn-sm btn-secondary"
                          disabled={setAdminMutation.isPending}
                        >
                          {u.is_admin ? 'Revoke' : 'Make'} Admin
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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

      {/* Danger Zone: Remove target by ID */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Danger Zone</h2>
        <p className="text-sm text-gray-600 mb-3">Remove a target goal by ID.</p>
        <form onSubmit={(e)=>{e.preventDefault(); const id = e.target.targetId.value; if(id){ deleteTargetMutation.mutate(id);} }} className="flex gap-2 items-end">
          <div>
            <label className="block text-sm text-gray-700 mb-1">Target ID</label>
            <input name="targetId" className="input" placeholder="e.g., 123" />
          </div>
          <button type="submit" className="btn btn-secondary" disabled={deleteTargetMutation.isPending}>Delete Target</button>
        </form>
        {deleteTargetMutation.isError && (
          <p className="text-sm text-red-600 mt-2">{deleteTargetMutation.error?.response?.data?.detail || 'Delete failed'}</p>
        )}
      </div>
    </div>
  );
}

export default Admin;
