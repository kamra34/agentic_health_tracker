import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userAPI, adminAPI } from '../services/api';
import { Users, Shield, Target, Trash2, KeyRound } from 'lucide-react';
import { useState } from 'react';

function Admin() {
  const queryClient = useQueryClient();

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
      if (selectedUser) {
        queryClient.invalidateQueries(['admin-user-targets', selectedUser.id]);
      }
    },
  });

  const [selectedUser, setSelectedUser] = useState(null);
  const { data: selectedUserInfo } = useQuery({
    queryKey: ['admin-user-info', selectedUser?.id],
    enabled: !!selectedUser,
    queryFn: async () => (await adminAPI.getUser(selectedUser.id)).data,
  });
  const { data: selectedUserTargets } = useQuery({
    queryKey: ['admin-user-targets', selectedUser?.id],
    enabled: !!selectedUser,
    queryFn: async () => (await adminAPI.getUserTargets(selectedUser.id)).data,
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId) => adminAPI.deleteUser(userId),
    onSuccess: () => {
      setSelectedUser(null);
      refetchUsers();
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: ({ userId, password }) => adminAPI.setUserPassword(userId, password),
    onSuccess: () => {
      // no-op
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-800">Admin Tools</h1>
        <p className="text-gray-600 mt-1">Manage your data and utilities. (More controls can be added later.)</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 pr-2 text-gray-700">ID</th>
                    <th className="text-left py-2 pr-2 text-gray-700">Name</th>
                    <th className="text-left py-2 pr-2 text-gray-700">Email</th>
                    <th className="text-left py-2 pr-2 text-gray-700">Admin</th>
                    <th className="text-right py-2 pl-2 text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.map(u => (
                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedUser(u)}>
                      <td className="py-2 pr-2 text-gray-800">{u.id}</td>
                      <td className="py-2 pr-2 text-gray-800">{u.name}</td>
                      <td className="py-2 pr-2 text-gray-800">{u.email || '—'}</td>
                      <td className="py-2 pr-2 text-gray-800">{u.is_admin ? 'Yes' : 'No'}</td>
                      <td className="py-2 pl-2 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); setAdminMutation.mutate({ userId: u.id, isAdmin: !u.is_admin }); }}
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
        
        {/* User details + targets */}
        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-5 h-5 text-primary-600" />
            <h2 className="text-lg font-semibold">User Details</h2>
          </div>
          {!selectedUser ? (
            <p className="text-sm text-gray-500">Select a user from the table to view details and targets.</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-gray-500">ID:</span> <span className="text-gray-800">{selectedUserInfo?.id}</span></div>
                <div><span className="text-gray-500">Name:</span> <span className="text-gray-800">{selectedUserInfo?.name}</span></div>
                <div><span className="text-gray-500">Email:</span> <span className="text-gray-800">{selectedUserInfo?.email || '—'}</span></div>
                <div><span className="text-gray-500">Sex:</span> <span className="text-gray-800">{selectedUserInfo?.sex || '—'}</span></div>
                <div><span className="text-gray-500">Height:</span> <span className="text-gray-800">{selectedUserInfo?.height || '—'} cm</span></div>
                <div><span className="text-gray-500">DOB:</span> <span className="text-gray-800">{selectedUserInfo?.date_of_birth || '—'}</span></div>
              </div>
              {/* Admin actions for user */}
              <div className="flex items-end gap-3">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const pwd = e.target.newPwd.value;
                    if (pwd && selectedUserInfo?.id) {
                      setPasswordMutation.mutate({ userId: selectedUserInfo.id, password: pwd });
                      e.target.reset();
                    }
                  }}
                  className="flex items-end gap-2"
                >
                  <div>
                    <label className="block text-sm text-gray-700 mb-1">Set New Password</label>
                    <input name="newPwd" type="password" className="input" placeholder="Min 8 chars" />
                  </div>
                  <button type="submit" className="btn btn-secondary flex items-center gap-1" disabled={setPasswordMutation.isPending}>
                    <KeyRound className="w-4 h-4" /> Set
                  </button>
                </form>
                <button
                  onClick={() => selectedUserInfo?.id && deleteUserMutation.mutate(selectedUserInfo.id)}
                  className="btn btn-secondary flex items-center gap-1"
                  disabled={deleteUserMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" /> Delete User
                </button>
              </div>
              <div>
                <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2"><Target className="w-4 h-4 text-primary-600"/> Targets</h3>
                {!selectedUserTargets ? (
                  <p className="text-sm text-gray-500">Loading...</p>
                ) : selectedUserTargets.length === 0 ? (
                  <p className="text-sm text-gray-500">No targets.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50">
                          <th className="text-left py-2 pr-2 text-gray-700">ID</th>
                          <th className="text-left py-2 pr-2 text-gray-700">Target</th>
                          <th className="text-left py-2 pr-2 text-gray-700">Date</th>
                          <th className="text-left py-2 pr-2 text-gray-700">Status</th>
                          <th className="text-right py-2 pl-2 text-gray-700">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUserTargets.map(t => (
                          <tr key={t.id} className="border-b border-gray-100">
                            <td className="py-2 pr-2 text-gray-800">{t.id}</td>
                            <td className="py-2 pr-2 text-gray-800">{t.target_weight} kg</td>
                            <td className="py-2 pr-2 text-gray-800">{new Date(t.date_of_target).toLocaleDateString()}</td>
                            <td className="py-2 pr-2 text-gray-800">{t.status}</td>
                            <td className="py-2 pl-2 text-right">
                              <button
                                onClick={() => deleteTargetMutation.mutate(t.id)}
                                className="btn btn-sm btn-secondary"
                                disabled={deleteTargetMutation.isPending}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Admin;
